/**
 * curve.ts — exact TypeScript mirror of the program's pricing math
 * (anchor/programs/sharps/src/curve.rs and market.rs).
 *
 * Quotes are computed here from the listing's on-chain state rather than by a
 * round-trip to the program, so they have to match it to the lamport: a buy
 * quoted one lamport high trips the slippage guard. Every function uses
 * bigint and the same floor divisions in the same order as the Rust.
 */

export const MULT_ONE = 10_000n;
export const SHARES_PER_LISTING = 10_000_000n;

export const BUY_FEE_BPS = 200n;
export const SELL_FEE_BPS = 200n;
export const RESERVE_FEE_BPS = 100n;
export const TRADER_FEE_BPS = 50n;
export const PROTOCOL_FEE_BPS = 50n;

const SCALE = 10n;
const BASE_SUB = 1_000_000n;
const SLOPE_SUB = 4n;

/** Price of a fresh listing's first share: 0.0001 SOL. */
export const OPEN_PRICE_LAMPORTS = BASE_SUB / SCALE;

/** Base (pre-multiplier) reserve backing a supply of `s`, in lamports. */
export function reserveAt(s: bigint): bigint {
  if (s === 0n) return 0n;
  return (BASE_SUB * s + SLOPE_SUB * ((s * (s - 1n)) / 2n)) / SCALE;
}

/** Base cost of buying `n` shares at supply `s`. */
export function curveCost(s: bigint, n: bigint): bigint {
  return reserveAt(s + n) - reserveAt(s);
}

/** Base marginal price of the next share at supply `s`. */
export function spotPrice(s: bigint): bigint {
  return (BASE_SUB + SLOPE_SUB * s) / SCALE;
}

type CurveState = { sharesOutstanding: bigint; sharesCap: bigint; scoreMult: bigint };

const scaled = (l: CurveState, base: bigint) => (base * l.scoreMult) / MULT_ONE;

/** Itemised cost of buying `n` shares now: curve cost, the three fee slices, and the total to pay. */
export function quoteBuyBreakdown(l: CurveState, n: bigint) {
  const curve = scaled(l, curveCost(l.sharesOutstanding, n));
  return {
    curveCost: curve,
    reserveCut: (curve * RESERVE_FEE_BPS) / 10_000n,
    traderCut: (curve * TRADER_FEE_BPS) / 10_000n,
    protocolCut: (curve * PROTOCOL_FEE_BPS) / 10_000n,
    total: curve + (curve * BUY_FEE_BPS) / 10_000n,
  };
}

export function quoteBuy(l: CurveState, n: bigint): bigint {
  return quoteBuyBreakdown(l, n).total;
}

/**
 * Largest whole share count whose full cost (fee included) fits `budget`.
 * Binary search, not budget/price: each share on the curve costs more than
 * the last, so that division always overestimates.
 */
export function sharesForBudget(l: CurveState, budget: bigint): bigint {
  let lo = 0n;
  let hi = l.sharesCap - l.sharesOutstanding;
  if (hi < 0n) hi = 0n;
  while (lo < hi) {
    const mid = lo + (hi - lo + 1n) / 2n;
    if (quoteBuy(l, mid) <= budget) lo = mid;
    else hi = mid - 1n;
  }
  return lo;
}

/** Lamports received for selling `n` shares now, after the sell fee. */
export function quoteSell(l: CurveState, n: bigint): bigint {
  if (n <= 0n || n > l.sharesOutstanding) return 0n;
  const s = scaled(l, curveCost(l.sharesOutstanding - n, n));
  return s - (s * SELL_FEE_BPS) / 10_000n;
}
