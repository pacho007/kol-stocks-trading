/**
 * push-onchain.ts — the ONLY thing that moves the tradable on-chain score.
 * -------------------------------------------------------------------------
 * Signs batch_update_price on the sharps program (anchor/programs/sharps).
 * publish.ts's scores.json / listing_metrics are the display snapshot; this is
 * what actually reprices listings.
 *
 * Key custody: the oracle authority can ONLY call update_price /
 * batch_update_price, which never touch a reserve, escrow or position. A
 * compromised key can at most nudge scores within the rate cap and the
 * reserve-backed multiplier bound, never move funds. Keep it separate from
 * the admin key.
 *
 * Deadband: a listing is only re-pushed when its score moved by at least
 * ONCHAIN_MIN_SCORE_DELTA, so a quiet cycle costs nothing. The program also
 * rejects updates closer than 30s apart; those entries are skipped, not failed.
 *
 * Run once against public/scores.json (no indexing):
 *   ORACLE_KEYPAIR_PATH=~/.config/sharps-devnet/oracle.json \
 *   SOLANA_CLUSTER=devnet npx tsx oracle/push-onchain.ts --from-scores
 *
 * Env:
 *   ORACLE_KEYPAIR           the oracle key as a JSON byte array (for hosts with
 *                            secrets but no files), or
 *   ORACLE_KEYPAIR_PATH      path to a solana-keygen JSON file
 *   SOLANA_CLUSTER           devnet | mainnet-beta | localnet (default devnet)
 *   SOLANA_RPC_URL           the MARKET's cluster RPC (not the trader RPC)
 *   ONCHAIN_CHUNK_SIZE       listings per transaction, default 20
 *   ONCHAIN_MIN_SCORE_DELTA  deadband, default 2
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
  type Connection,
} from "@solana/web3.js";
import { CLUSTER_NAME, PROGRAM_ID, RPC_URL, getConnection } from "../src/lib/solana/chain.js";
import { batchUpdatePriceIx, fetchConfig, fetchListings } from "../src/lib/solana/market.js";
import type { ListingInput } from "./indexer.js";

const CHUNK_SIZE = Number(process.env["ONCHAIN_CHUNK_SIZE"] ?? 20);
const MIN_SCORE_DELTA = Number(process.env["ONCHAIN_MIN_SCORE_DELTA"] ?? 2);
/** The program's MIN_UPDATE_INTERVAL_SECS — pushing sooner is a guaranteed skip. */
const MIN_UPDATE_INTERVAL_SECS = 30;

export function loadKeypair(inlineVar: string, pathVar: string): Keypair {
  const inline = process.env[inlineVar];
  const path = process.env[pathVar];
  let bytes: number[];
  if (inline) bytes = JSON.parse(inline) as number[];
  else if (path)
    bytes = JSON.parse(readFileSync(path.replace(/^~/, homedir()), "utf8")) as number[];
  else throw new Error(`Set ${inlineVar} (JSON byte array) or ${pathVar} (keypair file).`);
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

export type OracleCtx = { connection: Connection; oracle: Keypair };

/**
 * Preflight once at boot: the program exists on this cluster and the key we
 * hold really is its oracle authority. Better one clear error at startup than
 * every batch failing Unauthorized.
 */
export async function connectOracle(): Promise<OracleCtx> {
  const connection = getConnection();
  const oracle = loadKeypair("ORACLE_KEYPAIR", "ORACLE_KEYPAIR_PATH");

  const program = await connection.getAccountInfo(PROGRAM_ID);
  if (!program?.executable) {
    throw new Error(`No program at ${PROGRAM_ID.toBase58()} on ${CLUSTER_NAME} (${RPC_URL}).`);
  }
  const config = await fetchConfig(connection);
  if (!config) throw new Error("Program config is not initialized — run the admin init first.");
  if (config.oracleAuthority !== oracle.publicKey.toBase58()) {
    throw new Error(
      `ORACLE key ${oracle.publicKey.toBase58()} is not the program's oracle authority ` +
        `(${config.oracleAuthority}).`,
    );
  }
  const balance = await connection.getBalance(oracle.publicKey);
  console.log(
    `Oracle ${oracle.publicKey.toBase58()} on ${CLUSTER_NAME} · ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
  );
  return { connection, oracle };
}

/**
 * Push scores that moved past the deadband. Listings not yet created on-chain
 * are skipped (and counted), never treated as an error.
 */
export async function pushScoresOnChain(
  ctx: OracleCtx,
  listings: ListingInput[],
  rows: { id: string; wallet: string; score: number }[],
): Promise<{ sent: number; skipped: number; txs: string[] }> {
  const { connection, oracle } = ctx;
  const onChain = await fetchListings(connection, listings);
  const now = Math.floor(Date.now() / 1000);

  let notListed = 0;
  const due = rows.filter((r) => {
    const l = onChain[r.id];
    if (!l) {
      notListed++;
      return false;
    }
    const fresh = l.lastUpdateTs !== 0n && now - Number(l.lastUpdateTs) < MIN_UPDATE_INTERVAL_SECS;
    // First update always goes through so the listing leaves its seed state.
    const firstUpdate = l.lastUpdateTs === 0n;
    return !fresh && (firstUpdate || Math.abs(r.score - l.score) >= MIN_SCORE_DELTA);
  });

  if (notListed > 0) console.log(`  ${notListed} scored wallets have no on-chain listing yet.`);
  if (due.length === 0) {
    console.log("  No on-chain score moved past the deadband — nothing to push.");
    return { sent: 0, skipped: rows.length, txs: [] };
  }

  const balance = await connection.getBalance(oracle.publicKey);
  const txCount = Math.ceil(due.length / CHUNK_SIZE);
  if (balance < txCount * 10_000) {
    console.warn(
      `  Oracle balance ${balance} lamports may not cover ${txCount} transactions — top it up.`,
    );
  }

  const txs: string[] = [];
  for (let i = 0; i < due.length; i += CHUNK_SIZE) {
    const chunk = due.slice(i, i + CHUNK_SIZE);
    const tx = new Transaction()
      .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 60_000 + chunk.length * 25_000 }))
      .add(
        batchUpdatePriceIx(
          oracle.publicKey,
          chunk.map((r) => ({ kolWallet: r.wallet, score: Math.max(0, Math.min(100, r.score)) })),
        ),
      );
    try {
      const sig = await sendAndConfirmTransaction(connection, tx, [oracle], {
        commitment: "confirmed",
      });
      txs.push(sig);
      console.log(`  pushed ${chunk.length} scores · ${sig}`);
    } catch (e) {
      // One failed chunk shouldn't block the rest; the next cycle retries it.
      console.error(`  chunk ${i / CHUNK_SIZE + 1}/${txCount} failed: ${(e as Error).message}`);
    }
  }
  return { sent: due.length, skipped: rows.length - due.length, txs };
}

// ----------------------------------------------------------------- CLI

async function main() {
  if (!process.argv.includes("--from-scores")) {
    throw new Error(
      "Usage: npx tsx oracle/push-onchain.ts --from-scores   (the live loop is oracle/run.ts)",
    );
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const scores = JSON.parse(readFileSync(resolve(here, "../public/scores.json"), "utf8")) as {
    rows: { id: string; score: number }[];
  };
  const { KOLS } = await import("../src/lib/kols.js");
  const listings: ListingInput[] = KOLS.map((k) => ({ id: k.id, wallet: k.wallet }));
  const walletOf = new Map(listings.map((l) => [l.id, l.wallet]));
  const rows = scores.rows
    .filter((r) => walletOf.has(r.id))
    .map((r) => ({ id: r.id, wallet: walletOf.get(r.id)!, score: r.score }));

  const ctx = await connectOracle();
  const res = await pushScoresOnChain(ctx, listings, rows);
  console.log(`Done: ${res.sent} pushed in ${res.txs.length} tx, ${res.skipped} skipped.`);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
