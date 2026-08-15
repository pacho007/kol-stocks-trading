/**
 * Integration tests for the sharps Anchor program, run against a local
 * validator (`anchor test`). Priorities per the migration plan:
 *   1. access control (every privileged ix rejects the wrong signer)
 *   2. update_price's rate-cap + time-gate behavior
 *   3. buy's exact share/lamport math
 *   4. sell's solvency guarantee — the highest-priority coverage, since
 *      that's the instruction that must never let the vault be overdrawn.
 *
 * Exhaustive LUT-vs-oracle/score.ts parity is covered separately as a fast
 * Rust unit test (`cargo test -p sharps`, see lib.rs's `lut_tests` module) —
 * cycling all 101 scores through update_price here would take ~50 minutes
 * because of the deliberate MIN_UPDATE_INTERVAL_SECS gate.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

// `Sharps` type comes from `target/types/sharps` after `anchor build` — not
// checked in, since it's generated from the IDL. Cast through `any` so this
// file is readable/reviewable before that first build exists.
type SharpsProgram = Program<any>;

const OPEN_PRICE_LAMPORTS = 1_000_000; // 0.001 SOL, matches oracle/score.ts BASE_PRICE
const MIN_UPDATE_INTERVAL_SECS = 30;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deriveConfigPda(programId: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId)[0];
}
function deriveListingPda(programId: PublicKey, kolWallet: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("listing"), kolWallet.toBuffer()],
    programId,
  )[0];
}
function deriveVaultPda(programId: PublicKey, listing: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), listing.toBuffer()], programId)[0];
}
function deriveMintPda(programId: PublicKey, listing: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("mint"), listing.toBuffer()], programId)[0];
}

async function airdrop(connection: anchor.web3.Connection, pubkey: PublicKey, sol: number) {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

describe("sharps", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Sharps as SharpsProgram;
  const connection = provider.connection;

  const admin = (provider.wallet as anchor.Wallet).payer;
  const oracleAuthority = Keypair.generate();
  const rando = Keypair.generate(); // funded, but never authorized for anything

  const configPda = deriveConfigPda(program.programId);

  before(async () => {
    await airdrop(connection, oracleAuthority.publicKey, 2);
    await airdrop(connection, rando.publicKey, 2);
  });

  it("initialize_config sets admin + oracle authority", async () => {
    await program.methods
      .initializeConfig(oracleAuthority.publicKey)
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const config = await program.account.config.fetch(configPda);
    assert.isTrue(config.admin.equals(admin.publicKey));
    assert.isTrue(config.oracleAuthority.equals(oracleAuthority.publicKey));
    assert.isFalse(config.paused);
  });

  it("rejects re-initializing config", async () => {
    let threw = false;
    try {
      await program.methods
        .initializeConfig(oracleAuthority.publicKey)
        .accounts({ admin: admin.publicKey, config: configPda, systemProgram: SystemProgram.programId })
        .rpc();
    } catch (e) {
      threw = true;
    }
    assert.isTrue(threw, "expected re-init to fail (account already in use)");
  });

  describe("create_listing", () => {
    const kolWallet = Keypair.generate().publicKey;
    const listingPda = deriveListingPda(program.programId, kolWallet);
    const vaultPda = deriveVaultPda(program.programId, listingPda);
    const mintPda = deriveMintPda(program.programId, listingPda);

    it("rejects a non-admin caller", async () => {
      let threw = false;
      try {
        await program.methods
          .createListing(kolWallet)
          .accounts({
            config: configPda,
            admin: rando.publicKey,
            listing: listingPda,
            vault: vaultPda,
            mint: mintPda,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([rando])
          .rpc();
      } catch (e) {
        threw = true;
      }
      assert.isTrue(threw, "expected non-admin create_listing to fail");
    });

    it("admin creates a listing at the open price, score 50", async () => {
      await program.methods
        .createListing(kolWallet)
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
        .rpc();

      const listing = await program.account.listing.fetch(listingPda);
      assert.isTrue(listing.kolWallet.equals(kolWallet));
      assert.equal(listing.score, 50);
      assert.equal(listing.priceLamports.toNumber(), OPEN_PRICE_LAMPORTS);
      assert.equal(listing.sharesOutstanding.toNumber(), 0);
      assert.isFalse(listing.paused);

      const vaultBalance = await connection.getBalance(vaultPda);
      assert.isAbove(vaultBalance, 0, "vault should be funded to rent-exempt minimum");
    });
  });

  describe("update_price", () => {
    const kolWallet = Keypair.generate().publicKey;
    const listingPda = deriveListingPda(program.programId, kolWallet);
    const vaultPda = deriveVaultPda(program.programId, listingPda);
    const mintPda = deriveMintPda(program.programId, listingPda);

    before(async () => {
      await program.methods
        .createListing(kolWallet)
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
        .rpc();
    });

    it("rejects a non-oracle-authority caller", async () => {
      let threw = false;
      try {
        await program.methods
          .updatePrice(kolWallet, 100)
          .accounts({ config: configPda, oracleAuthority: rando.publicKey, listing: listingPda })
          .signers([rando])
          .rpc();
      } catch (e) {
        threw = true;
      }
      assert.isTrue(threw, "expected non-oracle-authority update_price to fail");
    });

    it("rejects an out-of-range score", async () => {
      let threw = false;
      try {
        await program.methods
          .updatePrice(kolWallet, 101)
          .accounts({ config: configPda, oracleAuthority: oracleAuthority.publicKey, listing: listingPda })
          .signers([oracleAuthority])
          .rpc();
      } catch (e) {
        threw = true;
      }
      assert.isTrue(threw, "expected score=101 to fail");
    });

    it("applies the 25% rate cap on the first update (bypasses the time gate)", async () => {
      // target for score=100 is 3,000,000 lamports (ANCHOR_LUT[100]); from
      // the open price of 1,000,000, one update should land at exactly
      // 1,000,000 + (3,000,000 - 1,000,000) * 25 / 100 = 1,500,000.
      await program.methods
        .updatePrice(kolWallet, 100)
        .accounts({ config: configPda, oracleAuthority: oracleAuthority.publicKey, listing: listingPda })
        .signers([oracleAuthority])
        .rpc();

      const listing = await program.account.listing.fetch(listingPda);
      assert.equal(listing.priceLamports.toNumber(), 1_500_000);
      assert.equal(listing.score, 100);
    });

    it("rejects a second update before MIN_UPDATE_INTERVAL_SECS has passed", async () => {
      let threw = false;
      try {
        await program.methods
          .updatePrice(kolWallet, 100)
          .accounts({ config: configPda, oracleAuthority: oracleAuthority.publicKey, listing: listingPda })
          .signers([oracleAuthority])
          .rpc();
      } catch (e) {
        threw = true;
      }
      assert.isTrue(threw, "expected immediate second update to fail with UpdateTooSoon");
    });

    it("converges further toward target after waiting out the interval", async function () {
      this.timeout(45_000);
      await sleep((MIN_UPDATE_INTERVAL_SECS + 2) * 1000);

      await program.methods
        .updatePrice(kolWallet, 100)
        .accounts({ config: configPda, oracleAuthority: oracleAuthority.publicKey, listing: listingPda })
        .signers([oracleAuthority])
        .rpc();

      // from 1,500,000: + (3,000,000 - 1,500,000) * 25 / 100 = 1,875,000
      const listing = await program.account.listing.fetch(listingPda);
      assert.equal(listing.priceLamports.toNumber(), 1_875_000);
    });
  });

  describe("buy", () => {
    const kolWallet = Keypair.generate().publicKey;
    const listingPda = deriveListingPda(program.programId, kolWallet);
    const vaultPda = deriveVaultPda(program.programId, listingPda);
    const mintPda = deriveMintPda(program.programId, listingPda);
    const buyer = Keypair.generate();
    const buyerAta = getAssociatedTokenAddressSync(mintPda, buyer.publicKey);

    before(async () => {
      await airdrop(connection, buyer.publicKey, 5);
      await program.methods
        .createListing(kolWallet)
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
        .rpc();
    });

    it("mints exact whole shares and leaves sub-share dust with the buyer", async () => {
      // price = 1,000,000 lamports/share; buying with 3,500,000 lamports
      // should yield exactly 3 shares (floor), costing 3,000,000, leaving
      // 500,000 lamports of "dust" never taken from the buyer at all.
      const solIn = new anchor.BN(3_500_000);
      const buyerBalanceBefore = await connection.getBalance(buyer.publicKey);

      await program.methods
        .buy(kolWallet, solIn, new anchor.BN(0))
        .accounts({
          buyer: buyer.publicKey,
          config: configPda,
          listing: listingPda,
          vault: vaultPda,
          mint: mintPda,
          buyerTokenAccount: buyerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([buyer])
        .rpc();

      const tokenAccount = await getAccount(connection, buyerAta);
      assert.equal(tokenAccount.amount.toString(), "3");

      const buyerBalanceAfter = await connection.getBalance(buyer.publicKey);
      const spent = buyerBalanceBefore - buyerBalanceAfter;
      // spent should be ~3,000,000 (+ tx fee + ATA rent), well under
      // 3,500,000 — proving the 500,000 dust was never taken.
      assert.isBelow(spent, 3_500_000);

      const listing = await program.account.listing.fetch(listingPda);
      assert.equal(listing.sharesOutstanding.toNumber(), 3);
    });

    it("rejects slippage beyond min_shares_out", async () => {
      let threw = false;
      try {
        await program.methods
          .buy(kolWallet, new anchor.BN(1_000_000), new anchor.BN(2)) // 1,000,000 lamports -> 1 share, but min asks for 2
          .accounts({
            buyer: buyer.publicKey,
            config: configPda,
            listing: listingPda,
            vault: vaultPda,
            mint: mintPda,
            buyerTokenAccount: buyerAta,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([buyer])
          .rpc();
      } catch (e) {
        threw = true;
      }
      assert.isTrue(threw, "expected slippage-guarded buy to fail");
    });

    it("rejects a zero sol_in", async () => {
      let threw = false;
      try {
        await program.methods
          .buy(kolWallet, new anchor.BN(0), new anchor.BN(0))
          .accounts({
            buyer: buyer.publicKey,
            config: configPda,
            listing: listingPda,
            vault: vaultPda,
            mint: mintPda,
            buyerTokenAccount: buyerAta,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([buyer])
          .rpc();
      } catch (e) {
        threw = true;
      }
      assert.isTrue(threw, "expected zero-amount buy to fail");
    });
  });

  describe("sell — solvency guarantee", () => {
    const kolWallet = Keypair.generate().publicKey;
    const listingPda = deriveListingPda(program.programId, kolWallet);
    const vaultPda = deriveVaultPda(program.programId, listingPda);
    const mintPda = deriveMintPda(program.programId, listingPda);
    const holder = Keypair.generate();
    const holderAta = getAssociatedTokenAddressSync(mintPda, holder.publicKey);

    const buyAccounts = () => ({
      buyer: holder.publicKey,
      config: configPda,
      listing: listingPda,
      vault: vaultPda,
      mint: mintPda,
      buyerTokenAccount: holderAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    });
    const sellAccounts = () => ({
      seller: holder.publicKey,
      config: configPda,
      listing: listingPda,
      vault: vaultPda,
      mint: mintPda,
      sellerTokenAccount: holderAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    });

    before(async () => {
      await airdrop(connection, holder.publicKey, 5);
      await program.methods
        .createListing(kolWallet)
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
        .rpc();

      // buy 10 shares at the open price (1,000,000 lamports each) = 10,000,000
      // lamports deposited into the vault.
      await program.methods
        .buy(kolWallet, new anchor.BN(10_000_000), new anchor.BN(0))
        .accounts(buyAccounts())
        .signers([holder])
        .rpc();
    });

    it("pays the full quoted price while the listing is fully collateralized", async () => {
      // sell 4 of the 10 shares at the still-unchanged 1,000,000 price;
      // vault has exactly enough (10,000,000 spendable for 10 shares).
      const sellerBalanceBefore = await connection.getBalance(holder.publicKey);

      await program.methods
        .sell(kolWallet, new anchor.BN(4), new anchor.BN(0))
        .accounts(sellAccounts())
        .signers([holder])
        .rpc();

      const sellerBalanceAfter = await connection.getBalance(holder.publicKey);
      // received ~4,000,000 lamports (minus tx fee) — i.e. the full quote,
      // not a haircut, since the listing is fully backed at this point.
      assert.isAbove(sellerBalanceAfter - sellerBalanceBefore, 3_995_000);

      const listing = await program.account.listing.fetch(listingPda);
      assert.equal(listing.sharesOutstanding.toNumber(), 6);
    });

    it("never overdraws the vault once the listing is pushed undercollateralized", async function () {
      this.timeout(10_000);

      // force the quoted price up via a first-ever update_price call on this
      // listing (bypasses the time gate): 1,000,000 -> 1,500,000 (25% of the
      // way to the 3,000,000 target for score=100). The vault, however, still
      // only holds what backed the ORIGINAL 10-share buy, minus the 4 already
      // redeemed at the old price — nowhere near enough to pay everyone out
      // at the new, higher quote.
      await program.methods
        .updatePrice(kolWallet, 100)
        .accounts({ config: configPda, oracleAuthority: oracleAuthority.publicKey, listing: listingPda })
        .signers([oracleAuthority])
        .rpc();

      const listingBefore = await program.account.listing.fetch(listingPda);
      assert.equal(listingBefore.priceLamports.toNumber(), 1_500_000);
      assert.equal(listingBefore.sharesOutstanding.toNumber(), 6);

      const vaultBalanceBefore = await connection.getBalance(vaultPda);
      const requestedForAll = 6 * 1_500_000; // = 9,000,000 at the new quote

      const sellerBalanceBefore = await connection.getBalance(holder.publicKey);
      await program.methods
        .sell(kolWallet, new anchor.BN(6), new anchor.BN(0)) // sell everything left, no slippage floor
        .accounts(sellAccounts())
        .signers([holder])
        .rpc();
      const sellerBalanceAfter = await connection.getBalance(holder.publicKey);

      const actualPayout = sellerBalanceAfter - sellerBalanceBefore;

      // the vault can never pay out more than it had available — this is
      // the core invariant. It's also strictly less than the quoted-price
      // request, proving the haircut actually engaged rather than the test
      // accidentally exercising the solvent path.
      assert.isBelow(actualPayout, requestedForAll, "expected a haircut vs. the full quote");
      assert.isAtMost(actualPayout, vaultBalanceBefore, "payout must never exceed the vault's pre-sell balance");

      const vaultBalanceAfter = await connection.getBalance(vaultPda);
      assert.isAtLeast(vaultBalanceAfter, 0);

      const listingAfter = await program.account.listing.fetch(listingPda);
      assert.equal(listingAfter.sharesOutstanding.toNumber(), 0);
    });
  });

  describe("pause", () => {
    const kolWallet = Keypair.generate().publicKey;
    const listingPda = deriveListingPda(program.programId, kolWallet);
    const vaultPda = deriveVaultPda(program.programId, listingPda);
    const mintPda = deriveMintPda(program.programId, listingPda);
    const buyer = Keypair.generate();
    const buyerAta = getAssociatedTokenAddressSync(mintPda, buyer.publicKey);

    before(async () => {
      await airdrop(connection, buyer.publicKey, 2);
      await program.methods
        .createListing(kolWallet)
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
        .rpc();
    });

    it("blocks buy() market-wide once set_paused(true) is called", async () => {
      await program.methods
        .setPaused(true)
        .accounts({ config: configPda, admin: admin.publicKey })
        .rpc();

      let threw = false;
      try {
        await program.methods
          .buy(kolWallet, new anchor.BN(1_000_000), new anchor.BN(0))
          .accounts({
            buyer: buyer.publicKey,
            config: configPda,
            listing: listingPda,
            vault: vaultPda,
            mint: mintPda,
            buyerTokenAccount: buyerAta,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([buyer])
          .rpc();
      } catch (e) {
        threw = true;
      }
      assert.isTrue(threw, "expected buy() to fail while market-paused");

      // unpause so it doesn't leak into any later test file run in the same suite
      await program.methods.setPaused(false).accounts({ config: configPda, admin: admin.publicKey }).rpc();
    });

    it("rejects set_paused from a non-admin", async () => {
      let threw = false;
      try {
        await program.methods
          .setPaused(true)
          .accounts({ config: configPda, admin: rando.publicKey })
          .signers([rando])
          .rpc();
      } catch (e) {
        threw = true;
      }
      assert.isTrue(threw, "expected non-admin set_paused to fail");
    });
  });
});
