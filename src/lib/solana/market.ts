/**
 * market.ts — typed access to the sharps program (anchor/programs/sharps) from
 * the browser.
 *
 * Deliberately does not pull in @coral-xyz/anchor: the app needs three
 * instructions and two account layouts, which is a few dozen lines against
 * the IDL's discriminators, versus a large dependency with Node polyfill
 * needs in the bundle.
 *
 * Addresses: one listing PDA per KOL wallet (["listing", kol]) holding that
 * listing's reserve and escrow; one position PDA per holder per listing
 * (["position", listing, holder]); one config PDA (["config"]) holding the
 * protocol treasury.
 */
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import idl from "./sharps-idl.json";
import { PROGRAM_ID } from "./chain";
import { reserveAt } from "./curve";

/** Mirrors state::Listing. All integer fields are exact on-chain values. */
export type OnChainListing = {
  kolWallet: string;
  score: number;
  /** Marginal price of the NEXT share on the curve, already score-scaled. */
  priceLamports: bigint;
  /** Multiplier actually in effect, 10_000 = 1.0x. */
  scoreMult: bigint;
  /** Multiplier the score says it deserves; > scoreMult means price lags. */
  targetMult: bigint;
  sharesOutstanding: bigint;
  sharesCap: bigint;
  /** Reserve backing outstanding shares (curve integral + fee surplus). */
  vaultBalance: bigint;
  /** Fees accrued to the listed trader. */
  traderEscrow: bigint;
  lastUpdateTs: bigint;
  createdAt: bigint;
  paused: boolean;
};

// ------------------------------------------------------------------ PDAs

const enc = new TextEncoder();

export const configPda = (): PublicKey =>
  PublicKey.findProgramAddressSync([enc.encode("config")], PROGRAM_ID)[0];

export const listingPda = (kolWallet: PublicKey | string): PublicKey =>
  PublicKey.findProgramAddressSync(
    [enc.encode("listing"), new PublicKey(kolWallet).toBytes()],
    PROGRAM_ID,
  )[0];

export const positionPda = (listing: PublicKey, holder: PublicKey | string): PublicKey =>
  PublicKey.findProgramAddressSync(
    [enc.encode("position"), listing.toBytes(), new PublicKey(holder).toBytes()],
    PROGRAM_ID,
  )[0];

// -------------------------------------------------------------- decoding

function discriminator(kind: "accounts" | "instructions", name: string): Uint8Array {
  const entry = (idl[kind] as { name: string; discriminator: number[] }[]).find(
    (e) => e.name === name,
  );
  if (!entry) throw new Error(`IDL has no ${kind} entry "${name}"`);
  return Uint8Array.from(entry.discriminator);
}

const LISTING_DISC = discriminator("accounts", "Listing");
const POSITION_DISC = discriminator("accounts", "Position");

function hasDisc(data: Uint8Array, disc: Uint8Array): boolean {
  if (data.length < 8) return false;
  for (let i = 0; i < 8; i++) if (data[i] !== disc[i]) return false;
  return true;
}

/** Borsh reader over a byte array, little-endian like the program. */
class Reader {
  private view: DataView;
  private o = 8; // skip discriminator
  constructor(private data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }
  pubkey() {
    const k = new PublicKey(this.data.subarray(this.o, this.o + 32));
    this.o += 32;
    return k.toBase58();
  }
  u8() {
    return this.view.getUint8(this.o++);
  }
  bool() {
    return this.u8() !== 0;
  }
  u64() {
    const v = this.view.getBigUint64(this.o, true);
    this.o += 8;
    return v;
  }
  i64() {
    const v = this.view.getBigInt64(this.o, true);
    this.o += 8;
    return v;
  }
}

export function decodeListing(data: Uint8Array): OnChainListing | null {
  if (!hasDisc(data, LISTING_DISC)) return null;
  const r = new Reader(data);
  return {
    kolWallet: r.pubkey(),
    score: r.u8(),
    priceLamports: r.u64(),
    scoreMult: r.u64(),
    targetMult: r.u64(),
    sharesOutstanding: r.u64(),
    sharesCap: r.u64(),
    vaultBalance: r.u64(),
    traderEscrow: r.u64(),
    lastUpdateTs: r.i64(),
    createdAt: r.i64(),
    paused: r.bool(),
  };
}

function decodePositionShares(data: Uint8Array): bigint | null {
  if (!hasDisc(data, POSITION_DISC)) return null;
  const r = new Reader(data);
  r.pubkey(); // owner
  r.pubkey(); // listing
  return r.u64();
}

// ----------------------------------------------------------------- reads

/** True when the score wants a higher price than the reserve can back yet. */
export function priceLagsScore(l: OnChainListing): boolean {
  return l.targetMult > l.scoreMult;
}

/** getMultipleAccountsInfo caps at 100 keys per call. */
async function fetchMany(connection: Connection, keys: PublicKey[]) {
  const out: (Uint8Array | null)[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    const infos = await connection.getMultipleAccountsInfo(keys.slice(i, i + 100));
    for (const info of infos) {
      out.push(info && info.owner.equals(PROGRAM_ID) ? new Uint8Array(info.data) : null);
    }
  }
  return out;
}

/** Every listing that exists on-chain, keyed by KOL id. Missing = not listed yet. */
export async function fetchListings(
  connection: Connection,
  kols: { id: string; wallet: string }[],
): Promise<Record<string, OnChainListing>> {
  if (kols.length === 0) return {};
  const data = await fetchMany(
    connection,
    kols.map((k) => listingPda(k.wallet)),
  );
  const out: Record<string, OnChainListing> = {};
  data.forEach((d, i) => {
    const listing = d && decodeListing(d);
    if (listing) out[kols[i]!.id] = listing;
  });
  return out;
}

export async function fetchListing(
  connection: Connection,
  kolWallet: string,
): Promise<OnChainListing | null> {
  const info = await connection.getAccountInfo(listingPda(kolWallet));
  if (!info || !info.owner.equals(PROGRAM_ID)) return null;
  return decodeListing(new Uint8Array(info.data));
}

/**
 * Every listing's share balance for one holder.
 *
 * Throws on RPC failure rather than returning an empty book: a failed read
 * and a wallet holding nothing are different facts, and the caller keeps what
 * it already had instead of telling a holder they own nothing. `failedIds` is
 * kept for interface parity; a batch read either answers for every key or throws.
 */
export async function fetchShareBalances(
  connection: Connection,
  kols: { id: string; wallet: string }[],
  holder: string,
): Promise<{ balances: Record<string, bigint>; failedIds: string[] }> {
  if (kols.length === 0) return { balances: {}, failedIds: [] };
  const data = await fetchMany(
    connection,
    kols.map((k) => positionPda(listingPda(k.wallet), holder)),
  );
  const balances: Record<string, bigint> = {};
  data.forEach((d, i) => {
    const shares = d && decodePositionShares(d);
    if (shares && shares > 0n) balances[kols[i]!.id] = shares;
  });
  return { balances, failedIds: [] };
}

/**
 * Reserve per outstanding share, in lamports, for display. With the curve
 * design the reserve always covers a sell at full curve price, so this is a
 * solvency read-out rather than a warning. 0 when nothing is outstanding.
 */
export function backingPerShareLamports(l: OnChainListing): number {
  if (l.sharesOutstanding === 0n) return 0;
  return Number(l.vaultBalance) / Number(l.sharesOutstanding);
}

/** Fraction of the reserve that is surplus above the bare curve integral. */
export function reserveCoverage(l: OnChainListing): number | null {
  const base = (reserveAt(l.sharesOutstanding) * l.scoreMult) / 10_000n;
  if (base === 0n) return null;
  return Number(l.vaultBalance) / Number(base);
}

// ---------------------------------------------------------- instructions

type IdlIx = { name: string; accounts: { name: string; writable?: boolean; signer?: boolean }[] };

function u64(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * Build an instruction from the IDL: account order, writability and signer
 * flags come from the IDL itself, so this can't silently drift from the
 * program the way a hand-maintained key list would.
 */
function instruction(
  name: string,
  accounts: Record<string, PublicKey>,
  args: Uint8Array[] = [],
): TransactionInstruction {
  const ix = (idl.instructions as IdlIx[]).find((i) => i.name === name);
  if (!ix) throw new Error(`IDL has no instruction "${name}"`);
  const keys: AccountMeta[] = ix.accounts.map((a) => {
    const pubkey = accounts[a.name];
    if (!pubkey) throw new Error(`${name}: missing account "${a.name}"`);
    return { pubkey, isSigner: !!a.signer, isWritable: !!a.writable };
  });
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data: Buffer.from(concat([discriminator("instructions", name), ...args])),
  });
}

/**
 * buy — pays at most `lamportsIn` and receives as many whole shares as that
 * covers. Only the exact cost leaves the wallet. `minSharesOut` fails the
 * trade instead of filling it if the curve moved between quote and confirm.
 */
export function buyTx(
  buyer: PublicKey,
  kolWallet: string,
  lamportsIn: bigint,
  minSharesOut: bigint,
): Transaction {
  const listing = listingPda(kolWallet);
  return new Transaction().add(
    instruction(
      "buy",
      {
        buyer,
        config: configPda(),
        listing,
        position: positionPda(listing, buyer),
        system_program: SystemProgram.programId,
      },
      [u64(lamportsIn), u64(minSharesOut)],
    ),
  );
}

/** sell — pays the full curve price minus the sell fee. */
export function sellTx(
  seller: PublicKey,
  kolWallet: string,
  sharesIn: bigint,
  minLamportsOut: bigint,
): Transaction {
  const listing = listingPda(kolWallet);
  return new Transaction().add(
    instruction(
      "sell",
      {
        seller,
        config: configPda(),
        listing,
        position: positionPda(listing, seller),
      },
      [u64(sharesIn), u64(minLamportsOut)],
    ),
  );
}

/** Claim your own listing's fees. Only the listed wallet can sign this. */
export function claimTraderFeesTx(kolWallet: PublicKey): Transaction {
  return new Transaction().add(
    instruction("claim_trader_fees", {
      kol_wallet: kolWallet,
      listing: listingPda(kolWallet),
    }),
  );
}

// ------------------------------------------------ oracle / admin (Node side)

/**
 * batch_update_price — scores for up to ~20 listings in one transaction.
 * Stale or invalid entries are skipped by the program rather than failing
 * the batch. Used by oracle/push-onchain.ts.
 */
export function batchUpdatePriceIx(
  oracleAuthority: PublicKey,
  entries: { kolWallet: string; score: number }[],
): TransactionInstruction {
  const scores = Uint8Array.from(entries.map((e) => e.score));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, scores.length, true);
  const ix = instruction(
    "batch_update_price",
    { config: configPda(), oracle_authority: oracleAuthority },
    [len, scores],
  );
  ix.keys.push(
    ...entries.map((e) => ({ pubkey: listingPda(e.kolWallet), isSigner: false, isWritable: true })),
  );
  return ix;
}

/** One-time setup: `admin` signs and pays; `oracleAuthority` may push scores. */
export function initializeConfigIx(
  admin: PublicKey,
  oracleAuthority: PublicKey,
): TransactionInstruction {
  return instruction(
    "initialize_config",
    { admin, config: configPda(), system_program: SystemProgram.programId },
    [oracleAuthority.toBytes()],
  );
}

/** Opens a listing for `kolWallet` at score 50. Admin-only. */
export function createListingIx(admin: PublicKey, kolWallet: string): TransactionInstruction {
  const kol = new PublicKey(kolWallet);
  return instruction(
    "create_listing",
    {
      config: configPda(),
      admin,
      listing: listingPda(kol),
      system_program: SystemProgram.programId,
    },
    [kol.toBytes()],
  );
}

/** Market-wide trading pause. Admin-only. */
export function setPausedIx(admin: PublicKey, paused: boolean): TransactionInstruction {
  return instruction("set_paused", { config: configPda(), admin }, [Uint8Array.of(paused ? 1 : 0)]);
}

/** Decoded global config. */
export type OnChainConfig = {
  admin: string;
  pendingAdmin: string;
  oracleAuthority: string;
  paused: boolean;
  protocolTreasury: bigint;
};

const CONFIG_DISC = discriminator("accounts", "Config");

export async function fetchConfig(connection: Connection): Promise<OnChainConfig | null> {
  const info = await connection.getAccountInfo(configPda());
  if (!info || !info.owner.equals(PROGRAM_ID)) return null;
  const data = new Uint8Array(info.data);
  if (!hasDisc(data, CONFIG_DISC)) return null;
  const r = new Reader(data);
  return {
    admin: r.pubkey(),
    pendingAdmin: r.pubkey(),
    oracleAuthority: r.pubkey(),
    paused: r.bool(),
    protocolTreasury: r.u64(),
  };
}
