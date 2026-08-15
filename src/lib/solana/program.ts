/**
 * program.ts — typed access to the sharps Anchor program from the browser.
 *
 * idl.json is a hand-generated placeholder (correct instruction/account
 * discriminators, computed the same way `anchor build` would) until a real
 * `anchor build` produces the authoritative one at
 * anchor/target/idl/sharps.json — copy that over this file once it exists.
 * `VITE_PROGRAM_ID` must then be set to the real deployed program's address.
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, type Connection } from "@solana/web3.js";
import idl from "./idl.json";
import { PROGRAM_ID_STR } from "./connection";

export const PROGRAM_ID = new PublicKey(PROGRAM_ID_STR ?? (idl as { address: string }).address);

/** The wallet shape AnchorProvider actually accepts — publicKey + signing
 * methods, no `payer` keypair required. `anchor.Wallet` is the wrong type to
 * use here: it names the Node-only NodeWallet subclass (needs a raw Keypair),
 * not this structural interface, so it's derived from the provider's own
 * constructor instead of guessed at. `useAnchorWallet()` from
 * @solana/wallet-adapter-react satisfies this shape directly. */
export type AnchorWalletLike = ConstructorParameters<typeof anchor.AnchorProvider>[1];

/** A wallet good enough to construct a read-only Program — signing methods
 * throw if actually called, which should never happen on the read path. */
const READ_ONLY_WALLET: AnchorWalletLike = {
  publicKey: PublicKey.default,
  signTransaction: async () => {
    throw new Error("read-only wallet cannot sign — connect a real wallet first");
  },
  signAllTransactions: async () => {
    throw new Error("read-only wallet cannot sign — connect a real wallet first");
  },
};

export function getProgram(
  connection: Connection,
  wallet?: AnchorWalletLike | null,
): anchor.Program {
  const provider = new anchor.AnchorProvider(connection, wallet ?? READ_ONLY_WALLET, {
    commitment: "confirmed",
  });
  return new anchor.Program(idl as anchor.Idl, provider);
}

export function deriveConfigPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];
}
export function deriveListingPda(kolWallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("listing"), kolWallet.toBuffer()],
    PROGRAM_ID,
  )[0];
}
export function deriveVaultPda(listing: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), listing.toBuffer()],
    PROGRAM_ID,
  )[0];
}
export function deriveMintPda(listing: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("mint"), listing.toBuffer()], PROGRAM_ID)[0];
}

export type OnChainListing = {
  kolWallet: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  score: number;
  /** Quoted price, in lamports — NOT a guaranteed redemption price. See sell(). */
  priceLamports: anchor.BN;
  sharesOutstanding: anchor.BN;
  sharesCap: anchor.BN;
  lastUpdateTs: anchor.BN;
  createdAt: anchor.BN;
  paused: boolean;
};

/** Returns null if the listing hasn't been created on-chain yet. */
export async function fetchListing(
  program: anchor.Program,
  kolWallet: PublicKey,
): Promise<OnChainListing | null> {
  const listingPda = deriveListingPda(kolWallet);
  // idl.json is typed as the generic `anchor.Idl`, so account/method names
  // aren't known statically — same reason getProgram()'s callers below index
  // into `program.methods` by string.
  const accounts = program.account as unknown as Record<
    string,
    { fetch: (pda: PublicKey) => Promise<unknown> }
  >;
  try {
    return (await accounts["listing"]!.fetch(listingPda)) as unknown as OnChainListing;
  } catch {
    return null;
  }
}

/** Live spendable backing per share (excludes the vault's rent-exempt reserve — see
 * anchor/programs/sharps/src/instructions/sell.rs). This, not priceLamports, is what
 * a seller actually receives once a listing is undercollateralized. */
export async function fetchBackingPerShareLamports(
  connection: Connection,
  listing: OnChainListing,
  rentExemptMinLamports: number,
): Promise<number> {
  if (listing.sharesOutstanding.isZero()) return 0;
  const vaultPda = deriveVaultPda(deriveListingPda(listing.kolWallet));
  const balance = await connection.getBalance(vaultPda);
  const spendable = Math.max(0, balance - rentExemptMinLamports);
  return spendable / listing.sharesOutstanding.toNumber();
}

export async function buildBuyIx(
  program: anchor.Program,
  buyer: PublicKey,
  kolWallet: PublicKey,
  solInLamports: number,
  minSharesOut: number,
) {
  const { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } =
    await import("@solana/spl-token");
  const listingPda = deriveListingPda(kolWallet);
  const vaultPda = deriveVaultPda(listingPda);
  const mintPda = deriveMintPda(listingPda);
  const buyerAta = getAssociatedTokenAddressSync(mintPda, buyer);

  return program.methods["buy"]!(
    kolWallet,
    new anchor.BN(solInLamports),
    new anchor.BN(minSharesOut),
  )
    .accounts({
      buyer,
      config: deriveConfigPda(),
      listing: listingPda,
      vault: vaultPda,
      mint: mintPda,
      buyerTokenAccount: buyerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .instruction();
}

export async function buildSellIx(
  program: anchor.Program,
  seller: PublicKey,
  kolWallet: PublicKey,
  sharesIn: number,
  minSolOut: number,
) {
  const { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } = await import("@solana/spl-token");
  const listingPda = deriveListingPda(kolWallet);
  const vaultPda = deriveVaultPda(listingPda);
  const mintPda = deriveMintPda(listingPda);
  const sellerAta = getAssociatedTokenAddressSync(mintPda, seller);

  return program.methods["sell"]!(kolWallet, new anchor.BN(sharesIn), new anchor.BN(minSolOut))
    .accounts({
      seller,
      config: deriveConfigPda(),
      listing: listingPda,
      vault: vaultPda,
      mint: mintPda,
      sellerTokenAccount: sellerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .instruction();
}
