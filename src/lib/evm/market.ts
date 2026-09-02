/**
 * market.ts — typed access to SharpsMarket (evm/src/SharpsMarket.sol) from the
 * browser. Replaces the old Anchor/PDA layer: on EVM there are no PDAs, no
 * per-listing mints and no vault accounts — one contract holds every listing
 * keyed by the KOL's own wallet address, and share balances live in its
 * internal ledger.
 *
 * IMPORTANT: sell() pays min(quoted price, pro-rata vault NAV) — see
 * SharpsMarket.sol's sell() doc comment. `priceWei` is the QUOTED price, not a
 * guaranteed redemption price. Compare it against backingPerShare before
 * assuming a sell fills at the quote.
 */
import type { Address, PublicClient, WalletClient } from "viem";
import abi from "./abi.json";
import { ACTIVE_CHAIN, MARKET_ADDRESS } from "./chain";

export const MARKET_ABI = abi;

/** Mirrors SharpsMarket.Listing (the public `listings` mapping getter). */
export type OnChainListing = {
  score: number;
  priceWei: bigint;
  sharesOutstanding: bigint;
  sharesCap: bigint;
  lastUpdateTs: bigint;
  createdAt: bigint;
  paused: boolean;
  exists: boolean;
};

/** The tuple shape viem returns for the `listings` mapping getter. */
type ListingTuple = readonly [number, bigint, bigint, bigint, bigint, bigint, boolean, boolean];

function toListing(t: ListingTuple): OnChainListing {
  return {
    score: Number(t[0]),
    priceWei: t[1],
    sharesOutstanding: t[2],
    sharesCap: t[3],
    lastUpdateTs: t[4],
    createdAt: t[5],
    paused: t[6],
    exists: t[7],
  };
}

/** Returns null if the contract isn't deployed/configured or has no listing. */
export async function fetchListing(
  client: PublicClient,
  kolWallet: Address,
): Promise<OnChainListing | null> {
  if (!MARKET_ADDRESS) return null;
  try {
    const result = (await client.readContract({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "listings",
      args: [kolWallet],
    })) as ListingTuple;
    const listing = toListing(result);
    return listing.exists ? listing : null;
  } catch {
    return null;
  }
}

/**
 * Batch-read every listing in one multicall round-trip. The Solana build had
 * to chunk getMultipleAccountsInfo by 100 accounts; viem's multicall batches
 * these into a single eth_call, so ~100 listings is one request.
 */
export async function fetchListings(
  client: PublicClient,
  kolWallets: { id: string; wallet: Address }[],
): Promise<Record<string, OnChainListing>> {
  const market = MARKET_ADDRESS;
  if (!market || kolWallets.length === 0) return {};
  try {
    const results = await client.multicall({
      contracts: kolWallets.map((k) => ({
        address: market,
        abi: MARKET_ABI as never,
        functionName: "listings",
        args: [k.wallet],
      })),
      allowFailure: true,
    });
    const out: Record<string, OnChainListing> = {};
    results.forEach((r, i) => {
      if (r.status !== "success") return;
      const listing = toListing(r.result as ListingTuple);
      // A listing that was never created reads back as all-zero/exists=false —
      // treat that as "not listed yet", same as a null account on Solana.
      if (listing.exists) out[kolWallets[i]!.id] = listing;
    });
    return out;
  } catch {
    return {};
  }
}

/** This wallet's share balance for one listing (contract's internal ledger). */
export async function fetchShareBalance(
  client: PublicClient,
  kolWallet: Address,
  holder: Address,
): Promise<bigint> {
  if (!MARKET_ADDRESS) return 0n;
  try {
    return (await client.readContract({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "shareBalances",
      args: [kolWallet, holder],
    })) as bigint;
  } catch {
    return 0n;
  }
}

/** Every listing's share balance for one holder, in a single multicall. */
export async function fetchShareBalances(
  client: PublicClient,
  kolWallets: { id: string; wallet: Address }[],
  holder: Address,
): Promise<Record<string, bigint>> {
  const market = MARKET_ADDRESS;
  if (!market || kolWallets.length === 0) return {};
  try {
    const results = await client.multicall({
      contracts: kolWallets.map((k) => ({
        address: market,
        abi: MARKET_ABI as never,
        functionName: "shareBalances",
        args: [k.wallet, holder],
      })),
      allowFailure: true,
    });
    const out: Record<string, bigint> = {};
    results.forEach((r, i) => {
      if (r.status !== "success") return;
      const bal = r.result as bigint;
      if (bal > 0n) out[kolWallets[i]!.id] = bal;
    });
    return out;
  } catch {
    return {};
  }
}

/**
 * Live backing per share, WAD-scaled (1e18), straight from the contract.
 * This — not priceWei — is what a seller actually receives once a listing is
 * undercollateralized. Returns 0 when nothing is outstanding.
 */
export async function fetchBackingPerShareWad(
  client: PublicClient,
  kolWallet: Address,
): Promise<bigint> {
  if (!MARKET_ADDRESS) return 0n;
  try {
    return (await client.readContract({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "backingPerShareWad",
      args: [kolWallet],
    })) as bigint;
  } catch {
    return 0n;
  }
}

/**
 * buy() — sends `valueWei` of the native token and mints whole shares at the
 * listing's current price. `minSharesOut` reverts the trade rather than
 * filling it if price moved adversely between quote and confirm. Any
 * sub-share remainder of the value sent is refunded by the contract.
 */
export async function buy(
  wallet: WalletClient,
  account: Address,
  kolWallet: Address,
  valueWei: bigint,
  minSharesOut: bigint,
): Promise<`0x${string}`> {
  if (!MARKET_ADDRESS) throw new Error("Market contract is not configured");
  return wallet.writeContract({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "buy",
    args: [kolWallet, minSharesOut],
    value: valueWei,
    account,
    chain: ACTIVE_CHAIN,
  });
}

/** sell() — burns `sharesIn` and pays min(quote, pro-rata NAV). */
export async function sell(
  wallet: WalletClient,
  account: Address,
  kolWallet: Address,
  sharesIn: bigint,
  minWeiOut: bigint,
): Promise<`0x${string}`> {
  if (!MARKET_ADDRESS) throw new Error("Market contract is not configured");
  return wallet.writeContract({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "sell",
    args: [kolWallet, sharesIn, minWeiOut],
    account,
    chain: ACTIVE_CHAIN,
  });
}
