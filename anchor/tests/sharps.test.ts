/**
 * End-to-end tests for the sharps program against a local validator.
 *
 *   solana-test-validator --reset --bpf-program <PROGRAM_ID> target/deploy/sharps.so
 *   npm test
 *
 * RPC_URL overrides the default http://127.0.0.1:8899.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Connection } from "@solana/web3.js";
import idl from "../../src/lib/solana/sharps-idl.json" with { type: "json" };

const { BN } = anchor;
const connection = new Connection(process.env.RPC_URL ?? "http://127.0.0.1:8899", "confirmed");
const programId = new PublicKey(idl.address);

const admin = Keypair.generate();
const oracle = Keypair.generate();
const alice = Keypair.generate();
const bob = Keypair.generate();
const kol = Keypair.generate();
const kol2 = Keypair.generate();

const pda = (...seeds: (Buffer | Uint8Array)[]) =>
  PublicKey.findProgramAddressSync(seeds, programId)[0];
const configPda = pda(Buffer.from("config"));
const listingPda = (w: PublicKey) => pda(Buffer.from("listing"), w.toBuffer());
const positionPda = (l: PublicKey, o: PublicKey) =>
  pda(Buffer.from("position"), l.toBuffer(), o.toBuffer());

function programFor(kp: Keypair) {
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(kp), {
    commitment: "confirmed",
  });
  return new anchor.Program(idl as anchor.Idl, provider);
}

async function airdrop(pk: PublicKey, sol: number) {
  const sig = await connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
  const bh = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
}

async function expectError(p: Promise<unknown>, code: string) {
  await assert.rejects(p, (e: Error) => {
    assert.match(String(e), new RegExp(code));
    return true;
  });
}

const asAdmin = () => programFor(admin);
const asOracle = () => programFor(oracle);
const asAlice = () => programFor(alice);
const asBob = () => programFor(bob);

const fetchListing = (w: PublicKey) =>
  (asAdmin().account as any).listing.fetch(listingPda(w));
const fetchConfig = () => (asAdmin().account as any).config.fetch(configPda);
const fetchPosition = (w: PublicKey, o: PublicKey) =>
  (asAdmin().account as any).position.fetch(positionPda(listingPda(w), o));

const rentFor = (space: number) => connection.getMinimumBalanceForRentExemption(space);

before(async () => {
  await Promise.all([admin, oracle, alice, bob, kol].map((k) => airdrop(k.publicKey, 100)));
});

test("initialize config", async () => {
  await asAdmin()
    .methods.initializeConfig(oracle.publicKey)
    .accountsPartial({ admin: admin.publicKey, config: configPda })
    .rpc();
  const c = await fetchConfig();
  assert.ok(c.admin.equals(admin.publicKey));
  assert.ok(c.oracleAuthority.equals(oracle.publicKey));
  assert.equal(c.paused, false);
});

test("create listing is admin-only and opens at 0.0001 SOL", async () => {
  await expectError(
    asAlice()
      .methods.createListing(kol.publicKey)
      .accountsPartial({ admin: alice.publicKey, config: configPda, listing: listingPda(kol.publicKey) })
      .rpc(),
    "Unauthorized",
  );
  for (const w of [kol.publicKey, kol2.publicKey]) {
    await asAdmin()
      .methods.createListing(w)
      .accountsPartial({ admin: admin.publicKey, config: configPda, listing: listingPda(w) })
      .rpc();
  }
  const l = await fetchListing(kol.publicKey);
  assert.equal(l.score, 50);
  assert.equal(l.priceLamports.toNumber(), 100_000);
  assert.equal(l.scoreMult.toNumber(), 10_000);
  assert.equal(l.sharesOutstanding.toNumber(), 0);
});

// Mirrors curve.rs, for checking what the program charged.
const reserveAt = (s: bigint) => (s === 0n ? 0n : (1_000_000n * s + 4n * ((s * (s - 1n)) / 2n)) / 10n);
const cost = (s: bigint, n: bigint) => reserveAt(s + n) - reserveAt(s);

test("buy takes exact cost, splits fees, never overspends", async () => {
  const listing = listingPda(kol.publicKey);
  const before = await connection.getBalance(alice.publicKey);
  const listingBefore = await connection.getBalance(listing);
  const configBefore = await connection.getBalance(configPda);

  const budget = 0.5 * LAMPORTS_PER_SOL;
  await asAlice()
    .methods.buy(new BN(budget), new BN(1))
    .accountsPartial({
      buyer: alice.publicKey,
      config: configPda,
      listing,
      position: positionPda(listing, alice.publicKey),
    })
    .rpc();

  const l = await fetchListing(kol.publicKey);
  const shares = BigInt(l.sharesOutstanding.toString());
  const scaled = cost(0n, shares); // mult = 1.0x
  const total = scaled + (scaled * 200n) / 10_000n;
  const trader = (scaled * 50n) / 10_000n;
  const protocol = (scaled * 50n) / 10_000n;

  assert.ok(shares > 0n);
  assert.ok(total <= BigInt(budget));
  assert.ok(cost(0n, shares + 1n) + (cost(0n, shares + 1n) * 200n) / 10_000n > BigInt(budget));
  assert.equal(BigInt(l.vaultBalance.toString()), total - trader - protocol);
  assert.equal(BigInt(l.traderEscrow.toString()), trader);
  assert.equal(BigInt((await fetchConfig()).protocolTreasury.toString()), protocol);

  const posRent = await rentFor(8 + 32 + 32 + 8 + 1);
  const spent = before - (await connection.getBalance(alice.publicKey));
  // total + position rent + tx fee (5000 lamports, one signature)
  assert.equal(BigInt(spent), total + BigInt(posRent) + 5000n);
  assert.equal(
    BigInt((await connection.getBalance(listing)) - listingBefore),
    total - protocol,
  );
  assert.equal(BigInt((await connection.getBalance(configPda)) - configBefore), protocol);

  const pos = await fetchPosition(kol.publicKey, alice.publicKey);
  assert.equal(BigInt(pos.shares.toString()), shares);
  assert.ok(l.priceLamports.toNumber() > 100_000, "spot price moved up the curve");
});

test("slippage guard on buy", async () => {
  const listing = listingPda(kol.publicKey);
  await expectError(
    asBob()
      .methods.buy(new BN(1_000_000), new BN(1_000_000))
      .accountsPartial({ buyer: bob.publicKey, config: configPda, listing, position: positionPda(listing, bob.publicKey) })
      .rpc(),
    "SlippageExceeded",
  );
});

test("oracle update: auth, rate cap, too-soon guard", async () => {
  const listing = listingPda(kol.publicKey);
  await expectError(
    asAlice()
      .methods.updatePrice(100)
      .accountsPartial({ oracleAuthority: alice.publicKey, config: configPda, listing })
      .rpc(),
    "Unauthorized",
  );
  await expectError(
    asOracle()
      .methods.updatePrice(101)
      .accountsPartial({ oracleAuthority: oracle.publicKey, config: configPda, listing })
      .rpc(),
    "InvalidScore",
  );
  await asOracle()
    .methods.updatePrice(100)
    .accountsPartial({ oracleAuthority: oracle.publicKey, config: configPda, listing })
    .rpc();
  const l = await fetchListing(kol.publicKey);
  assert.equal(l.score, 62, "moved 25% of the way from 50 toward 100");
  // Target for 62 is 1.48x but only fee surplus backs growth, so the live
  // multiplier sits between 1.0x and the target.
  assert.ok(l.targetMult.toNumber() > 10_000);
  assert.ok(l.scoreMult.toNumber() >= 10_000 && l.scoreMult.toNumber() <= l.targetMult.toNumber());
  const reserve = reserveAt(BigInt(l.sharesOutstanding.toString()));
  assert.ok(
    BigInt(l.vaultBalance.toString()) * 10_000n >= reserve * BigInt(l.scoreMult.toString()),
    "multiplier stays backed by the reserve",
  );

  await expectError(
    asOracle()
      .methods.updatePrice(100)
      .accountsPartial({ oracleAuthority: oracle.publicKey, config: configPda, listing })
      .rpc(),
    "UpdateTooSoon",
  );
});

test("batch update skips stale entries instead of failing", async () => {
  const stale = listingPda(kol.publicKey); // updated in the previous test
  const fresh = listingPda(kol2.publicKey);
  await asOracle()
    .methods.batchUpdatePrice(Buffer.from([90, 10]))
    .accountsPartial({ oracleAuthority: oracle.publicKey, config: configPda })
    .remainingAccounts([
      { pubkey: stale, isSigner: false, isWritable: true },
      { pubkey: fresh, isSigner: false, isWritable: true },
    ])
    .rpc();
  assert.equal((await fetchListing(kol.publicKey)).score, 62, "stale listing untouched");
  const l2 = await fetchListing(kol2.publicKey);
  assert.equal(l2.score, 40, "fresh listing moved 25% toward 10");
  assert.ok(l2.priceLamports.toNumber() < 100_000, "empty listing takes its multiplier directly");
});

test("transfer shares, then both holders sell at full curve price", async () => {
  const listing = listingPda(kol.publicKey);
  const alicePos = await fetchPosition(kol.publicKey, alice.publicKey);
  const half = new BN(alicePos.shares.toString()).divn(2);

  await asAlice()
    .methods.transferShares(half)
    .accountsPartial({
      sender: alice.publicKey,
      recipient: bob.publicKey,
      listing,
      fromPosition: positionPda(listing, alice.publicKey),
      toPosition: positionPda(listing, bob.publicKey),
    })
    .rpc();
  const bobShares = (await fetchPosition(kol.publicKey, bob.publicKey)).shares;
  assert.equal(bobShares.toString(), half.toString());

  await expectError(
    asBob()
      .methods.sell(bobShares.addn(1), new BN(0))
      .accountsPartial({ seller: bob.publicKey, config: configPda, listing, position: positionPda(listing, bob.publicKey) })
      .rpc(),
    "InsufficientShares",
  );

  for (const [who, prog] of [
    [bob, asBob()],
    [alice, asAlice()],
  ] as const) {
    const pos = await fetchPosition(kol.publicKey, who.publicKey);
    const l = await fetchListing(kol.publicKey);
    const s = BigInt(l.sharesOutstanding.toString());
    const n = BigInt(pos.shares.toString());
    const scaled = (cost(s - n, n) * BigInt(l.scoreMult.toString())) / 10_000n;
    const payout = scaled - (scaled * 200n) / 10_000n;
    const before = await connection.getBalance(who.publicKey);

    await expectError(
      prog.methods
        .sell(pos.shares, new BN((payout + 1n).toString()))
        .accountsPartial({ seller: who.publicKey, config: configPda, listing, position: positionPda(listing, who.publicKey) })
        .rpc(),
      "SlippageExceeded",
    );
    await prog.methods
      .sell(pos.shares, new BN(payout.toString()))
      .accountsPartial({ seller: who.publicKey, config: configPda, listing, position: positionPda(listing, who.publicKey) })
      .rpc();
    const got = BigInt((await connection.getBalance(who.publicKey)) - before) + 5000n;
    assert.equal(got, payout);
  }

  const l = await fetchListing(kol.publicKey);
  assert.equal(l.sharesOutstanding.toNumber(), 0);
  assert.ok(l.vaultBalance.toNumber() > 0, "fee surplus left behind in the reserve");
  // Listing account holds exactly rent + reserve + escrow.
  const info = await connection.getAccountInfo(listing);
  const rent = await rentFor(info!.data.length);
  assert.equal(
    info!.lamports,
    rent + l.vaultBalance.toNumber() + l.traderEscrow.toNumber(),
  );
});

test("only the listed wallet can claim its fees", async () => {
  const listing = listingPda(kol.publicKey);
  await expectError(
    asAlice()
      .methods.claimTraderFees()
      .accountsPartial({ kolWallet: alice.publicKey, listing })
      .rpc(),
    // alice's own listing PDA doesn't exist / has_one fails
    "AccountNotInitialized|ConstraintSeeds|Unauthorized",
  );
  const escrow = (await fetchListing(kol.publicKey)).traderEscrow.toNumber();
  assert.ok(escrow > 0);
  const before = await connection.getBalance(kol.publicKey);
  await programFor(kol)
    .methods.claimTraderFees()
    .accountsPartial({ kolWallet: kol.publicKey, listing })
    .rpc();
  assert.equal((await connection.getBalance(kol.publicKey)) - before + 5000, escrow);
  assert.equal((await fetchListing(kol.publicKey)).traderEscrow.toNumber(), 0);
});

test("admin withdraws protocol fees, but no more than accrued", async () => {
  const c = await fetchConfig();
  const amount = c.protocolTreasury;
  const to = Keypair.generate().publicKey;
  await expectError(
    asAdmin()
      .methods.withdrawProtocol(amount.addn(1))
      .accountsPartial({ admin: admin.publicKey, config: configPda, to })
      .rpc(),
    "ZeroAmount",
  );
  await asAdmin()
    .methods.withdrawProtocol(amount)
    .accountsPartial({ admin: admin.publicKey, config: configPda, to })
    .rpc();
  assert.equal(await connection.getBalance(to), amount.toNumber());
  assert.equal((await fetchConfig()).protocolTreasury.toNumber(), 0);
});

test("pause blocks trading; listing pause too", async () => {
  const listing = listingPda(kol.publicKey);
  const buy = () =>
    asBob()
      .methods.buy(new BN(10_000_000), new BN(1))
      .accountsPartial({ buyer: bob.publicKey, config: configPda, listing, position: positionPda(listing, bob.publicKey) })
      .rpc();

  await asAdmin().methods.setPaused(true).accountsPartial({ admin: admin.publicKey, config: configPda }).rpc();
  await expectError(buy(), "MarketPaused");
  await asAdmin().methods.setPaused(false).accountsPartial({ admin: admin.publicKey, config: configPda }).rpc();

  await asAdmin()
    .methods.setListingPaused(true)
    .accountsPartial({ admin: admin.publicKey, config: configPda, listing })
    .rpc();
  await expectError(buy(), "ListingPaused");
  await asAdmin()
    .methods.setListingPaused(false)
    .accountsPartial({ admin: admin.publicKey, config: configPda, listing })
    .rpc();
  await buy();
});

test("two-step admin handover", async () => {
  await asAdmin()
    .methods.transferAdmin(bob.publicKey)
    .accountsPartial({ admin: admin.publicKey, config: configPda })
    .rpc();
  await expectError(
    asAlice().methods.acceptAdmin().accountsPartial({ newAdmin: alice.publicKey, config: configPda }).rpc(),
    "Unauthorized",
  );
  await asBob().methods.acceptAdmin().accountsPartial({ newAdmin: bob.publicKey, config: configPda }).rpc();
  assert.ok((await fetchConfig()).admin.equals(bob.publicKey));
  await expectError(
    asAdmin().methods.setPaused(true).accountsPartial({ admin: admin.publicKey, config: configPda }).rpc(),
    "Unauthorized",
  );
});

void SystemProgram;
