/**
 * create-listings.ts — the admin script program.ts's own doc comment
 * references ("the admin create_listing script") but that never existed
 * until now. One-time (or resumable) batch that calls create_listing for
 * every KOL in src/lib/kols.ts that doesn't already have an on-chain
 * listing — without this, a KOL only ever shows a display-only estimated
 * price and can never actually be bought or sold.
 *
 * "Never silently drop" — same lesson as push-onchain.ts. Every KOL's
 * outcome is logged loudly (console + oracle/.last-create-listings-run.json)
 * and the run is safe to re-launch: existing listings are detected and
 * skipped, so an interrupted run just picks up where it left off.
 *
 * Run:
 *   ADMIN_KEYPAIR_PATH=~/.config/solana/id.json \
 *   SOLANA_RPC_URL=https://api.devnet.solana.com \
 *   npx tsx oracle/create-listings.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { KOLS } from "../src/lib/kols.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CHUNK_DELAY_MS = Number(process.env.CREATE_LISTING_DELAY_MS ?? 600);
const MAX_TX_RETRIES = Number(process.env.CREATE_LISTING_RETRIES ?? 5);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadAdmin(): Keypair {
  const path = process.env.ADMIN_KEYPAIR_PATH;
  if (!path) {
    console.error("Missing ADMIN_KEYPAIR_PATH — point it at the program admin's keyfile.");
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(path.replace(/^~/, process.env.HOME ?? process.env.USERPROFILE ?? "~"), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadIdl(): anchor.Idl {
  const idlPath = resolve(__dirname, "../anchor/target/idl/sharps.json");
  const raw = JSON.parse(readFileSync(idlPath, "utf8"));
  return raw as anchor.Idl;
}

function deriveConfigPda(programId: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId)[0];
}
function deriveListingPda(programId: PublicKey, kolWallet: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("listing"), kolWallet.toBuffer()], programId)[0];
}
function deriveVaultPda(programId: PublicKey, listing: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), listing.toBuffer()], programId)[0];
}
function deriveMintPda(programId: PublicKey, listing: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("mint"), listing.toBuffer()], programId)[0];
}

type Status = "created" | "already_exists" | "failed";
type Manifest = {
  startedAt: string;
  finishedAt: string | null;
  results: Record<string, { status: Status; signature?: string; error?: string }>;
};

const MANIFEST_PATH = resolve(__dirname, ".last-create-listings-run.json");

async function createOne(
  program: anchor.Program,
  connection: Connection,
  admin: Keypair,
  configPda: PublicKey,
  kolWallet: PublicKey,
): Promise<{ signature?: string; error?: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_TX_RETRIES; attempt++) {
    try {
      const listingPda = deriveListingPda(program.programId, kolWallet);
      const vaultPda = deriveVaultPda(program.programId, listingPda);
      const mintPda = deriveMintPda(program.programId, listingPda);
      const signature = await program.methods["createListing"]!(kolWallet)
        .accounts({
          config: configPda,
          admin: admin.publicKey,
          listing: listingPda,
          vault: vaultPda,
          mint: mintPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc({ commitment: "confirmed" });
      return { signature };
    } catch (e) {
      lastErr = e;
      await sleep(500 * (attempt + 1));
    }
  }
  return { error: lastErr instanceof Error ? lastErr.message : String(lastErr) };
}

async function main() {
  const admin = loadAdmin();
  const idl = loadIdl();
  const programId = new PublicKey((idl as unknown as { address: string }).address);

  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new anchor.Program(idl, provider);

  const configPda = deriveConfigPda(programId);
  const configInfo = await connection.getAccountInfo(configPda);
  if (!configInfo) {
    console.error(`Config not initialized at ${configPda.toBase58()}. Run initialize_config first.`);
    process.exit(1);
  }

  // De-dupe by wallet — a small number of KOL entries share a wallet
  // (e.g. an alt account for the same trader), and create_listing is keyed
  // on wallet, so a second create for the same wallet would just fail as
  // "already exists" — cheaper to skip it up front.
  const seen = new Set<string>();
  const unique = KOLS.filter((k) => {
    if (seen.has(k.wallet)) return false;
    seen.add(k.wallet);
    return true;
  });

  console.log(`${unique.length} unique wallets (${KOLS.length} total KOL entries).`);
  const balance = await connection.getBalance(admin.publicKey);
  console.log(`Admin ${admin.publicKey.toBase58()}: ${(balance / anchor.web3.LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  const manifest: Manifest = { startedAt: new Date().toISOString(), finishedAt: null, results: {} };
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < unique.length; i++) {
    const kol = unique[i]!;
    const kolWallet = new PublicKey(kol.wallet);
    const listingPda = deriveListingPda(programId, kolWallet);

    const existing = await connection.getAccountInfo(listingPda);
    if (existing) {
      manifest.results[kol.id] = { status: "already_exists" };
      skipped++;
      continue;
    }

    const { signature, error } = await createOne(program, connection, admin, configPda, kolWallet);
    if (signature) {
      manifest.results[kol.id] = { status: "created", signature };
      created++;
      console.log(`[${i + 1}/${unique.length}] ${kol.ticker} (${kol.id}): created — ${signature}`);
    } else {
      manifest.results[kol.id] = { status: "failed", error };
      failed++;
      console.warn(`[${i + 1}/${unique.length}] ${kol.ticker} (${kol.id}): FAILED — ${error}`);
    }

    if ((i + 1) % 20 === 0) {
      writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
      const bal = await connection.getBalance(admin.publicKey);
      console.log(
        `  progress: ${created} created, ${skipped} skipped, ${failed} failed — ${(bal / anchor.web3.LAMPORTS_PER_SOL).toFixed(4)} SOL left`,
      );
      if (bal < 0.01 * anchor.web3.LAMPORTS_PER_SOL) {
        console.error("Balance nearly exhausted — stopping early. Top up and re-run to resume.");
        break;
      }
    }

    await sleep(CHUNK_DELAY_MS);
  }

  manifest.finishedAt = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
  console.log(
    `\nDone: ${created} created, ${skipped} already existed, ${failed} failed.` +
      (failed ? ` See ${MANIFEST_PATH} for details — re-run this script to retry failures.` : ""),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
