/**
 * push-onchain.ts — signs and submits update_price to the sharps program.
 * -------------------------------------------------------------------------
 * Sibling to publish.ts, not a replacement for it: publish.ts still writes
 * public/scores.json for the frontend's display/breakdown fields; this
 * script is the ONLY thing that moves the actual tradable on-chain price.
 *
 * NOTE: this currently runs its own indexer pass (like publish.ts does),
 * rather than sharing one runOracle() call between the two — the ideal
 * consolidation (one pass feeding both sinks, so Helius load is halved and
 * the JSON display can never drift from the on-chain price) is a worthwhile
 * follow-up, deliberately not forced into this change so as not to risk
 * publish.ts's already-verified behavior under time pressure.
 *
 * Key custody: loads a dedicated oracle-authority keypair from
 * ORACLE_AUTHORITY_KEYPAIR_PATH. That key can ONLY call update_price — the
 * instruction's account context never includes a vault or mint (see
 * anchor/programs/sharps/src/instructions/update_price.rs) — so even a
 * fully compromised key can at most nudge quoted prices within the
 * program's existing rate-cap/rails, never move a single lamport. This is
 * why it's a separate key from the program's admin/fund-custody authority,
 * and why it only needs enough SOL for transaction fees.
 *
 * "Never silently drop" — the same lesson already applied in
 * oracle/rpc-provider.ts: a listing that doesn't get a confirmed update
 * this cycle is logged loudly (console + oracle/.last-onchain-run.json),
 * never just assumed complete. Transient failures (network, blockhash
 * expiry, rate limit) are retried with backoff; real program rejections are
 * logged and NOT blindly retried. UpdateTooSoon is treated as an expected,
 * non-error outcome (a retry landing after a prior attempt already
 * succeeded), not a dropped update.
 *
 * Requires `anchor build` to have run at least once (reads the generated
 * IDL from anchor/target/idl/sharps.json) and a deployed program.
 *
 * Run:
 *   ORACLE_AUTHORITY_KEYPAIR_PATH=~/.config/solana/oracle-authority.json \
 *   SOLANA_RPC_URL=https://api.devnet.solana.com \
 *   PROGRAM_ID=... \
 *   HELIUS_API_KEY=xxxx npx tsx oracle/push-onchain.ts [--watch] [SAMPLE=1]
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, ComputeBudgetProgram, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { runOracle, type ListingInput } from "./indexer.js";
import { RpcPnlProvider } from "./rpc-provider.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SAMPLE_LISTINGS: ListingInput[] = [
  { id: "cented", wallet: "CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o" },
  { id: "cupsey", wallet: "2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f" },
  { id: "orangie", wallet: "DuQabFqdC9eeBULVa7TTdZYxe8vK8ct5DZr4Xcf7docy" },
];

async function loadFullListings(): Promise<ListingInput[] | null> {
  const candidates = ["../src/lib/kols.js", "../src/lib/kols.ts", "../../src/lib/kols.js", "../../src/lib/kols.ts"];
  for (const path of candidates) {
    try {
      const mod = await import(path);
      const kols = (mod as { KOLS?: { id: string; wallet: string }[] }).KOLS;
      if (Array.isArray(kols) && kols.length) {
        const seen = new Set<string>();
        const unique: ListingInput[] = [];
        for (const k of kols) {
          if (seen.has(k.wallet)) continue;
          seen.add(k.wallet);
          unique.push({ id: k.id, wallet: k.wallet });
        }
        return unique;
      }
    } catch {
      /* try next path */
    }
  }
  return null;
}

// 15 update_price instructions per tx measured at 1383 bytes on a real
// devnet run — over Solana's 1232-byte legacy tx limit, so every chunk
// failed outright. 10 is a conservative reduction pending a re-measurement.
const CHUNK_SIZE = Number(process.env.ONCHAIN_CHUNK_SIZE ?? 10);
const SEND_GAP_MS = Number(process.env.ONCHAIN_SEND_GAP_MS ?? 400);
const MAX_TX_RETRIES = Number(process.env.ONCHAIN_TX_RETRIES ?? 5);
const PRIORITY_FEE_MICROLAMPORTS = process.env.PRIORITY_FEE_MICROLAMPORTS
  ? Number(process.env.PRIORITY_FEE_MICROLAMPORTS)
  : undefined;
const REFRESH_MIN = Number(process.env.REFRESH_MIN ?? 20);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadOracleAuthority(): Keypair {
  const path = process.env.ORACLE_AUTHORITY_KEYPAIR_PATH;
  if (!path) {
    console.error(
      "Missing ORACLE_AUTHORITY_KEYPAIR_PATH. Point it at a keyfile for a key that\n" +
        "is ONLY ever used to sign update_price — never the program admin key, never\n" +
        "a key that holds real funds. Fund it with a small amount of SOL for tx fees.",
    );
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(path.replace(/^~/, process.env.HOME ?? process.env.USERPROFILE ?? "~"), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadIdl(): anchor.Idl {
  const idlPath = resolve(__dirname, "../anchor/target/idl/sharps.json");
  if (!existsSync(idlPath)) {
    console.error(
      `Missing ${idlPath}.\n` +
        "Run `anchor build` inside anchor/ at least once first (this generates the\n" +
        "IDL this script needs to construct update_price instructions).",
    );
    process.exit(1);
  }
  return JSON.parse(readFileSync(idlPath, "utf8"));
}

function deriveConfigPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId)[0];
}
function deriveListingPda(programId: PublicKey, kolWallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("listing"), kolWallet.toBuffer()], programId)[0];
}

type ListingStatus = "confirmed" | "failed" | "update_too_soon" | "unknown_error";

type Manifest = {
  cycleStartedAt: string;
  cycleFinishedAt: string | null;
  chunkSize: number;
  results: Record<string, { status: ListingStatus; error?: string; signature?: string }>;
};

const MANIFEST_PATH = resolve(__dirname, ".last-onchain-run.json");

/** Distinguishes "already current" (a benign retry-race outcome) from a real failure. */
function classifyError(e: unknown): { status: ListingStatus; message: string } {
  const message = e instanceof Error ? e.message : String(e);
  if (/UpdateTooSoon/i.test(message)) return { status: "update_too_soon", message };
  return { status: "unknown_error", message };
}

async function sendChunkWithRetry(
  connection: Connection,
  authority: Keypair,
  ixs: anchor.web3.TransactionInstruction[],
): Promise<{ signature?: string; error?: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_TX_RETRIES; attempt++) {
    try {
      const tx = new Transaction();
      if (PRIORITY_FEE_MICROLAMPORTS) {
        tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE_MICROLAMPORTS }));
      }
      for (const ix of ixs) tx.add(ix);
      const signature = await sendAndConfirmTransaction(connection, tx, [authority], {
        commitment: "confirmed",
        maxRetries: 0, // we handle retry/backoff ourselves, at the whole-chunk level
      });
      return { signature };
    } catch (e) {
      lastErr = e;
      await sleep(500 * (attempt + 1));
    }
  }
  return { error: lastErr instanceof Error ? lastErr.message : String(lastErr) };
}

async function once(program: anchor.Program, connection: Connection, authority: Keypair, listings: ListingInput[]) {
  console.log(`Indexing ${listings.length} wallets for on-chain price push...`);
  const rows = await runOracle(listings, RpcPnlProvider, {});

  const configPda = deriveConfigPda(program.programId);
  const manifest: Manifest = {
    cycleStartedAt: new Date().toISOString(),
    cycleFinishedAt: null,
    chunkSize: CHUNK_SIZE,
    results: {},
  };

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const ixs = await Promise.all(
      chunk.map((r) => {
        const kolWallet = new PublicKey(r.wallet);
        const listingPda = deriveListingPda(program.programId, kolWallet);
        return program.methods
          .updatePrice(kolWallet, r.score)
          .accounts({
            config: configPda,
            oracleAuthority: authority.publicKey,
            listing: listingPda,
          })
          .instruction();
      }),
    );

    const { signature, error } = await sendChunkWithRetry(connection, authority, ixs);

    if (signature) {
      for (const r of chunk) manifest.results[r.id] = { status: "confirmed", signature };
      console.log(`  chunk ${i / CHUNK_SIZE + 1}: confirmed ${chunk.length} listings (${signature})`);
    } else {
      const { status, message } = classifyError(error);
      for (const r of chunk) manifest.results[r.id] = { status, error: message };
      if (status === "update_too_soon") {
        console.log(`  chunk ${i / CHUNK_SIZE + 1}: already current (update_too_soon) for ${chunk.length} listings`);
      } else {
        console.warn(`  chunk ${i / CHUNK_SIZE + 1}: FAILED for ${chunk.map((r) => r.id).join(", ")}: ${message}`);
      }
    }

    await sleep(SEND_GAP_MS);
  }

  manifest.cycleFinishedAt = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");

  const failed = Object.entries(manifest.results).filter(([, v]) => v.status === "unknown_error");
  const confirmed = Object.values(manifest.results).filter((v) => v.status === "confirmed").length;
  console.log(
    `\nCycle done: ${confirmed}/${rows.length} confirmed on-chain, ${failed.length} failed.` +
      (failed.length ? ` See ${MANIFEST_PATH} for details — these listings' on-chain price is stale.` : ""),
  );
}

async function main() {
  const watch = process.argv.includes("--watch");
  const authority = loadOracleAuthority();
  const idl = loadIdl();

  const programIdStr = process.env.PROGRAM_ID ?? (idl as { address?: string }).address;
  if (!programIdStr) {
    console.error("Missing PROGRAM_ID (and the IDL has no embedded address). Set PROGRAM_ID explicitly.");
    process.exit(1);
  }
  const programId = new PublicKey(programIdStr);

  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new anchor.Program(idl, provider) as anchor.Program;
  // `new anchor.Program(idl, provider)` reads the program ID from the IDL
  // itself in Anchor 0.30+; if PROGRAM_ID was set explicitly and disagrees,
  // that's very likely a misconfiguration — fail loudly rather than push
  // updates to the wrong program.
  if (!program.programId.equals(programId)) {
    console.error(
      `PROGRAM_ID (${programId.toBase58()}) does not match the IDL's embedded address ` +
        `(${program.programId.toBase58()}). Refusing to proceed.`,
    );
    process.exit(1);
  }

  let listings: ListingInput[];
  if (process.env.SAMPLE === "1") {
    listings = SAMPLE_LISTINGS;
    console.log(`Using SAMPLE list (${listings.length} wallets).`);
  } else {
    const full = await loadFullListings();
    listings = full ?? SAMPLE_LISTINGS;
    console.log(
      full
        ? `Using FULL list from app source (${listings.length} wallets).`
        : `App source not found; falling back to SAMPLE (${listings.length} wallets).`,
    );
  }

  // Optional slice for running the full list in smaller, resumable batches
  // (e.g. a shell/host that kills long-running processes) — BATCH_START is
  // an index into `listings`, BATCH_COUNT how many to take from there.
  if (process.env.BATCH_START != null || process.env.BATCH_COUNT != null) {
    const start = Number(process.env.BATCH_START ?? 0);
    const count = Number(process.env.BATCH_COUNT ?? listings.length - start);
    listings = listings.slice(start, start + count);
    console.log(`Batch slice: [${start}, ${start + count}) — ${listings.length} wallets this run.`);
  }

  await once(program, connection, authority, listings);
  if (watch) {
    console.log(`\nWatching — pushing on-chain updates every ${REFRESH_MIN} min. Ctrl-C to stop.`);
    setInterval(() => {
      once(program, connection, authority, listings).catch((e) => console.error("push cycle failed:", e));
    }, REFRESH_MIN * 60_000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
