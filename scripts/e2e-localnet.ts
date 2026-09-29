/**
 * e2e-localnet.ts — drives the APP's own transaction builders and decoders
 * (src/lib/solana/market.ts, curve.ts) against a local validator, so the
 * code the website ships is proven against the real program — not just the
 * program against Anchor's client (that's anchor/tests).
 *
 *   solana-test-validator --reset --bpf-program <PROGRAM_ID> anchor/target/deploy/sharps.so
 *   SOLANA_CLUSTER=localnet npx tsx scripts/e2e-localnet.ts
 */
import assert from "node:assert/strict";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { CLUSTER, getConnection } from "../src/lib/solana/chain.js";
import {
  batchUpdatePriceIx,
  buyTx,
  claimTraderFeesTx,
  createListingIx,
  fetchConfig,
  fetchListing,
  fetchListings,
  fetchShareBalances,
  initializeConfigIx,
  sellTx,
} from "../src/lib/solana/market.js";
import {
  OPEN_PRICE_LAMPORTS,
  quoteBuy,
  quoteSell,
  sharesForBudget,
} from "../src/lib/solana/curve.js";

if (CLUSTER !== "localnet") throw new Error("Refusing to run outside SOLANA_CLUSTER=localnet.");

const connection = getConnection();
const admin = Keypair.generate();
const oracle = Keypair.generate();
const trader = Keypair.generate();
const kol = Keypair.generate();

async function airdrop(kp: Keypair, sol: number) {
  const sig = await connection.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
  const bh = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
}
const send = (tx: Transaction | TransactionInstruction, ...signers: Keypair[]) =>
  sendAndConfirmTransaction(
    connection,
    tx instanceof Transaction ? tx : new Transaction().add(tx),
    signers,
    { commitment: "confirmed" },
  );

await Promise.all([airdrop(admin, 10), airdrop(oracle, 2), airdrop(trader, 20), airdrop(kol, 1)]);

await send(initializeConfigIx(admin.publicKey, oracle.publicKey), admin);
const config = await fetchConfig(connection);
assert.equal(config?.oracleAuthority, oracle.publicKey.toBase58());
console.log("ok  initialize_config (app builder) + fetchConfig decode");

await send(createListingIx(admin.publicKey, kol.publicKey.toBase58()), admin);
const kols = [{ id: "k1", wallet: kol.publicKey.toBase58() }];
let listing = (await fetchListings(connection, kols))["k1"]!;
assert.equal(listing.priceLamports, OPEN_PRICE_LAMPORTS);
assert.equal(listing.kolWallet, kol.publicKey.toBase58());
console.log("ok  create_listing + fetchListings decode (opens at 0.0001 SOL)");

// Buy exactly as the store does: quote from live state, 1% slippage floor.
const budget = 2n * BigInt(LAMPORTS_PER_SOL);
const expected = sharesForBudget(listing, budget);
const cost = quoteBuy(listing, expected);
const before = await connection.getBalance(trader.publicKey);
await send(
  buyTx(trader.publicKey, kol.publicKey.toBase58(), budget, (expected * 99n) / 100n),
  trader,
);
const after = await connection.getBalance(trader.publicKey);
const { balances } = await fetchShareBalances(connection, kols, trader.publicKey.toBase58());
assert.equal(balances["k1"], expected, "program filled exactly the app's quoted share count");
const positionRent = await connection.getMinimumBalanceForRentExemption(8 + 32 + 32 + 8 + 1);
assert.equal(
  BigInt(before - after),
  cost + BigInt(positionRent) + 5000n,
  "charged exactly the app's quote",
);
console.log(
  `ok  buy: ${expected} shares for ${Number(cost) / 1e9} SOL — matches the app's quote to the lamport`,
);

listing = (await fetchListing(connection, kol.publicKey.toBase58()))!;
const half = expected / 2n;
const quotedOut = quoteSell(listing, half);
const b2 = await connection.getBalance(trader.publicKey);
await send(
  sellTx(trader.publicKey, kol.publicKey.toBase58(), half, (quotedOut * 99n) / 100n),
  trader,
);
const a2 = await connection.getBalance(trader.publicKey);
assert.equal(BigInt(a2 - b2) + 5000n, quotedOut, "paid exactly the app's sell quote");
console.log(
  `ok  sell: ${half} shares for ${Number(quotedOut) / 1e9} SOL — matches the app's quote`,
);

await send(
  batchUpdatePriceIx(oracle.publicKey, [{ kolWallet: kol.publicKey.toBase58(), score: 90 }]),
  oracle,
);
listing = (await fetchListing(connection, kol.publicKey.toBase58()))!;
assert.equal(listing.score, 60);
console.log(`ok  batch_update_price (oracle builder): score 50 -> ${listing.score}`);

const escrow = listing.traderEscrow;
assert.ok(escrow > 0n);
const b3 = await connection.getBalance(kol.publicKey);
await send(claimTraderFeesTx(kol.publicKey), kol);
const a3 = await connection.getBalance(kol.publicKey);
assert.equal(BigInt(a3 - b3) + 5000n, escrow);
console.log(`ok  claim_trader_fees: ${Number(escrow) / 1e9} SOL to the listed wallet`);

console.log("\nAll app-side builders and decoders agree with the program.");
