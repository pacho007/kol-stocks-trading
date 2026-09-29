/**
 * admin.ts — one-off admin actions against the sharps program.
 *
 *   npx tsx scripts/admin.ts init <ORACLE_PUBKEY>   initialize the config
 *   npx tsx scripts/admin.ts list                    create a listing for every
 *                                                    trader in src/lib/kols.ts
 *                                                    (skips existing ones)
 *   npx tsx scripts/admin.ts status                  config + listing coverage
 *   npx tsx scripts/admin.ts pause | unpause         market-wide trading stop
 *
 * Env:
 *   ADMIN_KEYPAIR_PATH   solana-keygen JSON file (or ADMIN_KEYPAIR, JSON array)
 *   SOLANA_CLUSTER       devnet | mainnet-beta | localnet (default devnet)
 *   SOLANA_RPC_URL       optional override for that cluster's RPC
 */
import {
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { CLUSTER_NAME, PROGRAM_ID, getConnection } from "../src/lib/solana/chain.js";
import {
  createListingIx,
  fetchConfig,
  fetchListings,
  initializeConfigIx,
  setPausedIx,
} from "../src/lib/solana/market.js";
import { KOLS } from "../src/lib/kols.js";
import { loadKeypair } from "../oracle/push-onchain.js";

/** create_listing is ~20k CU; eight fit comfortably in one transaction. */
const LISTINGS_PER_TX = 8;

const connection = getConnection();

async function send(ixs: TransactionInstruction[], label: string) {
  const admin = loadKeypair("ADMIN_KEYPAIR", "ADMIN_KEYPAIR_PATH");
  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 40_000 * ixs.length + 20_000 }))
    .add(...ixs);
  const sig = await sendAndConfirmTransaction(connection, tx, [admin], { commitment: "confirmed" });
  console.log(`  ${label} · ${sig}`);
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  console.log(`${CLUSTER_NAME} · program ${PROGRAM_ID.toBase58()}`);

  if (cmd === "init") {
    if (!arg) throw new Error("usage: admin.ts init <ORACLE_PUBKEY>");
    const admin = loadKeypair("ADMIN_KEYPAIR", "ADMIN_KEYPAIR_PATH");
    if (await fetchConfig(connection)) throw new Error("config is already initialized");
    await send([initializeConfigIx(admin.publicKey, new PublicKey(arg))], "initialize_config");
    return;
  }

  if (cmd === "list") {
    const admin = loadKeypair("ADMIN_KEYPAIR", "ADMIN_KEYPAIR_PATH");
    const config = await fetchConfig(connection);
    if (!config) throw new Error("config not initialized — run `init` first");
    if (config.admin !== admin.publicKey.toBase58()) {
      throw new Error(
        `ADMIN key ${admin.publicKey.toBase58()} is not the program admin (${config.admin})`,
      );
    }
    const kols = KOLS.map((k) => ({ id: k.id, wallet: k.wallet }));
    const existing = await fetchListings(connection, kols);
    const todo = kols.filter((k) => !existing[k.id]);
    console.log(`${Object.keys(existing).length} listed, ${todo.length} to create.`);
    for (let i = 0; i < todo.length; i += LISTINGS_PER_TX) {
      const chunk = todo.slice(i, i + LISTINGS_PER_TX);
      await send(
        chunk.map((k) => createListingIx(admin.publicKey, k.wallet)),
        `listed ${chunk.map((k) => k.id).join(", ")}`,
      );
    }
    return;
  }

  if (cmd === "pause" || cmd === "unpause") {
    const admin = loadKeypair("ADMIN_KEYPAIR", "ADMIN_KEYPAIR_PATH");
    await send([setPausedIx(admin.publicKey, cmd === "pause")], cmd);
    return;
  }

  if (cmd === "status") {
    const config = await fetchConfig(connection);
    console.log(
      config
        ? { ...config, protocolTreasury: config.protocolTreasury.toString() }
        : "config: not initialized",
    );
    const existing = await fetchListings(
      connection,
      KOLS.map((k) => ({ id: k.id, wallet: k.wallet })),
    );
    console.log(`listings: ${Object.keys(existing).length}/${KOLS.length} created`);
    return;
  }

  throw new Error("usage: admin.ts init <ORACLE_PUBKEY> | list | status | pause | unpause");
}

main().catch((e) => {
  console.error((e as Error).message ?? e);
  process.exit(1);
});
