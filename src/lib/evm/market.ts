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
  /** Marginal price of the NEXT share on the curve, already score-scaled. */
  priceWei: bigint;
  /** Multiplier actually in effect, 10_000 = 1.0x. */
  scoreMult: bigint;
  /** Multiplier the score says it deserves; > scoreMult means price lags. */
  targetMult: bigint;
  sharesOutstanding: bigint;
  sharesCap: bigint;
  lastUpdateTs: bigint;
  createdAt: bigint;
  paused: boolean;
  exists: boolean;
};

/** The tuple shape viem returns for the `listings` mapping getter. */
type ListingTuple = readonly [
  number,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  boolean,
  boolean,
];

function toListing(t: ListingTuple): OnChainListing {
  return {
    score: Number(t[0]),
    priceWei: t[1],
    scoreMult: t[2],
    targetMult: t[3],
    sharesOutstanding: t[4],
    sharesCap: t[5],
    lastUpdateTs: t[6],
    createdAt: t[7],
    paused: t[8],
    exists: t[9],
  };
}

/** True when the score wants a higher price than the reserve can back yet. */
export function priceLagsScore(l: OnChainListing): boolean {
  return l.targetMult > l.scoreMult;
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

/**
 * Every listing's share balance for one holder, in a single multicall.
 *
 * Returns the failure count alongside the balances, and that is the point. It
 * used to swallow both kinds of failure: an individual read that came back
 * unsuccessful was skipped, and a multicall that threw returned {}. Both
 * render identically to holding nothing — so an RPC hiccup showed a wallet
 * with real shares "No positions yet", which is the most alarming thing a
 * market can tell somebody who is holding.
 *
 * A zero balance and an unanswered question are different facts, and the
 * caller has to be able to tell them apart: a throw means ask again, a failure
 * count means this picture is incomplete.
 */
export async function fetchShareBalances(
  client: PublicClient,
  kolWallets: { id: string; wallet: Address }[],
  holder: Address,
): Promise<{ balances: Record<string, bigint>; failedIds: string[] }> {
  const market = MARKET_ADDRESS;
  if (!market || kolWallets.length === 0) return { balances: {}, failedIds: [] };

  // Deliberately not wrapped in try/catch. A multicall that throws is the RPC
  // failing to answer, not a wallet holding nothing, so it propagates and the
  // caller keeps what it already had instead of replacing it with an empty book.
  const results = await client.multicall({
    contracts: kolWallets.map((k) => ({
      address: market,
      abi: MARKET_ABI as never,
      functionName: "shareBalances",
      args: [k.wallet, holder],
    })),
    allowFailure: true,
  });

  const balances: Record<string, bigint> = {};
  const failedIds: string[] = [];
  results.forEach((r, i) => {
    const id = kolWallets[i]!.id;
    if (r.status !== "success") {
      // Named, not counted. The caller has to keep the previous value for
      // exactly these and no others: a listing that answered zero really is
      // zero and must be dropped, or selling out would never clear.
      failedIds.push(id);
      return;
    }
    const bal = r.result as bigint;
    if (bal > 0n) balances[id] = bal;
  });
  return { balances, failedIds };
}

/** Fees accrued to a listed trader, claimable only by that wallet. */
export async function fetchTraderEscrow(client: PublicClient, kolWallet: Address): Promise<bigint> {
  if (!MARKET_ADDRESS) return 0n;
  try {
    return (await client.readContract({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "traderEscrow",
      args: [kolWallet],
    })) as bigint;
  } catch {
    return 0n;
  }
}

/**
 * Claim your own listing's accrued fees. Only the listed wallet can call this
 * for itself — identity is the signature, so there's nothing to verify.
 */
export async function claimTraderFees(
  wallet: WalletClient,
  account: Address,
): Promise<`0x${string}`> {
  if (!MARKET_ADDRESS) throw new Error("Market contract is not configured");
  return wallet.writeContract({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "claimTraderFees",
    args: [],
    account,
    chain: ACTIVE_CHAIN,
  });
}

/** Itemised buy quote — curve cost plus where each slice of the fee goes. */
export async function quoteBuyBreakdown(
  client: PublicClient,
  kolWallet: Address,
  shares: bigint,
): Promise<{
  curveCost: bigint;
  reserveCut: bigint;
  traderCut: bigint;
  protocolCut: bigint;
  total: bigint;
} | null> {
  if (!MARKET_ADDRESS || shares <= 0n) return null;
  try {
    const r = (await client.readContract({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "quoteBuyBreakdown",
      args: [kolWallet, shares],
    })) as readonly [bigint, bigint, bigint, bigint, bigint];
    return {
      curveCost: r[0],
      reserveCut: r[1],
      traderCut: r[2],
      protocolCut: r[3],
      total: r[4],
    };
  } catch {
    return null;
  }
}

/**
 * How many whole shares `budgetWei` buys right now, fee included. Must come
 * from the contract: on a curve each share costs more than the last, so
 * budget / price always overestimates and would trip the slippage guard.
 */
export async function sharesForBudget(
  client: PublicClient,
  kolWallet: Address,
  budgetWei: bigint,
): Promise<bigint> {
  if (!MARKET_ADDRESS || budgetWei <= 0n) return 0n;
  try {
    return (await client.readContract({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "sharesForBudget",
      args: [kolWallet, budgetWei],
    })) as bigint;
  } catch {
    return 0n;
  }
}

/**
 * Exact cost of buying `shares` right now, fee included — what the buyer must
 * send. Ask the contract rather than multiplying price × shares: the curve
 * makes each successive share dearer, so the naive product is always wrong
 * (and under-sends, which the contract rejects as slippage).
 */
export async function quoteBuy(
  client: PublicClient,
  kolWallet: Address,
  shares: bigint,
): Promise<bigint> {
  if (!MARKET_ADDRESS || shares <= 0n) return 0n;
  try {
    return (await client.readContract({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "quoteBuy",
      args: [kolWallet, shares],
    })) as bigint;
  } catch {
    return 0n;
  }
}

/**
 * Exact proceeds from selling `shares` right now, after fee. Unlike the old
 * design this is what the seller genuinely receives — the curve reserve always
 * covers it, so there is no "quoted price vs. actual payout" gap to warn about.
 */
export async function quoteSell(
  client: PublicClient,
  kolWallet: Address,
  shares: bigint,
): Promise<bigint> {
  if (!MARKET_ADDRESS || shares <= 0n) return 0n;
  try {
    return (await client.readContract({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "quoteSell",
      args: [kolWallet, shares],
    })) as bigint;
  } catch {
    return 0n;
  }
}

/**
 * Live backing per share, WAD-scaled (1e18), straight from the contract.
 * Kept for display: with the curve design the reserve always covers a sell at
 * full price, so this is now a solvency read-out rather than a warning signal.
 * Returns 0 when nothing is outstanding.
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

/**
 * sell() — burns `sharesIn` and pays the FULL curve price, minus the sell fee.
 * There is no NAV haircut path any more: the reserve is maintained at the
 * curve integral, so quoteSell() is what actually lands.
 */
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
