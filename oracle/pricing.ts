/**
 * pricing.ts — Machine B: oracle-priced shares, fixed pool, session-gated
 * -----------------------------------------------------------------------
 * REPLACES the bonding curve. Key differences:
 *   - Buying does NOT move the price. Only the KOL's on-chain performance
 *     (the oracle score) moves it.
 *   - Every listing opens at $0.01/share.
 *   - Each listing has a FIXED pool of shares. Buying draws from the pool at
 *     the current (performance-driven) price; selling returns shares to it.
 *   - Price floats continuously as the oracle updates the score.
 *
 * Solvency model: shares are a finite pool, not minted on demand. The SOL a
 * buyer pays is held against the shares they hold; selling returns shares and
 * pays out at the *current* price. Because price is set by performance (not by
 * a reserve curve), the treasury takes the other side — so the pool size and
 * the price bounds below are what keep it sane. See notes at the bottom.
 *
 *   npx tsx oracle/pricing.ts
 */

import { fileURLToPath } from "node:url";
import { resolve as resolvePath } from "node:path";
import { scoreCohort, type RawMetrics } from "./score.js";

// ---------------------------------------------------------------------------
// Chosen constants (the "do the math" answer)
// ---------------------------------------------------------------------------

/** Opening price for EVERY listing, in USD. Equal start. */
export const OPEN_PRICE_USD = 0.01;

/**
 * Fixed shares per listing.
 * 10,000,000 shares * $0.01 = $100,000 opening market cap per KOL.
 * Rationale:
 *   - Finite pool => solvent & easy to reason about (no infinite mint).
 *   - $100k open cap feels like a real small-cap listing and has room to grow
 *     as performance lifts price (e.g. 10x price => $1M cap).
 *   - 10M shares gives fine granularity: at $0.01, 1 share = 1 cent, so even
 *     tiny SOL buys get whole-ish share counts, and price can move in small
 *     increments without rounding pain.
 */
export const SHARES_PER_LISTING = 10_000_000;

/**
 * Price bounds as a multiple of the open price. Performance can lift or cut
 * price within these rails. Rails exist so a score swing can't send price to
 * zero or infinity, and so treasury exposure is bounded.
 *   floor = 0.1x open  = $0.001
 *   cap   = 25x open    = $0.25   (=> up to $2.5M cap at full pool)
 */
export const PRICE_FLOOR_MULT = 0.1;
export const PRICE_CAP_MULT = 25;

// ---------------------------------------------------------------------------
// Score -> price (USD). This is the ONLY thing that moves price.
// ---------------------------------------------------------------------------

/**
 * Map a 0..100 performance score to a USD price.
 * score 50 (median) -> ~open price. Above lifts, below cuts, within rails.
 * Smooth, monotonic, and bounded.
 */
export function scoreToPriceUsd(score: number): number {
  const s = Math.max(0, Math.min(100, score)) / 100; // 0..1
  const centered = (s - 0.5) * 2; // -1..1
  // exponential feel so top scores stretch toward the cap, low scores toward floor
  const mult =
    centered >= 0
      ? 1 + centered * (PRICE_CAP_MULT - 1) * easeUp(centered)
      : PRICE_FLOOR_MULT + (1 - PRICE_FLOOR_MULT) * (1 + centered); // centered is negative
  const price = OPEN_PRICE_USD * mult;
  return clamp(price, OPEN_PRICE_USD * PRICE_FLOOR_MULT, OPEN_PRICE_USD * PRICE_CAP_MULT);
}

function easeUp(x: number) {
  // gentle acceleration toward the top of the range
  return 0.4 + 0.6 * x;
}

// ---------------------------------------------------------------------------
// Buy / sell — transact at the current price, draw from the fixed pool.
// Buying does NOT change the price.
// ---------------------------------------------------------------------------

export type Listing = {
  id: string;
  priceUsd: number; // current, oracle-driven
  poolRemaining: number; // shares still available to buy
  poolTotal: number;
};

export function newListing(id: string): Listing {
  return {
    id,
    priceUsd: OPEN_PRICE_USD,
    poolRemaining: SHARES_PER_LISTING,
    poolTotal: SHARES_PER_LISTING,
  };
}

/**
 * Buy with `solIn` SOL at the current price. Returns whole shares bought and
 * the USD spent. Price is UNCHANGED by this (Machine B).
 */
export function buyWithSol(
  listing: Listing,
  solIn: number,
  solPriceUsd: number,
): { shares: number; usdSpent: number; solSpent: number } {
  const usdIn = solIn * solPriceUsd;
  const wanted = Math.floor(usdIn / listing.priceUsd);
  const shares = Math.min(wanted, listing.poolRemaining);
  const usdSpent = shares * listing.priceUsd;
  listing.poolRemaining -= shares;
  return { shares, usdSpent, solSpent: usdSpent / solPriceUsd };
}

/** Sell `shares` at the current price. Returns shares to the pool. */
export function sellShares(
  listing: Listing,
  shares: number,
  solPriceUsd: number,
): { usdOut: number; solOut: number } {
  const s = Math.min(shares, listing.poolTotal - listing.poolRemaining);
  const usdOut = s * listing.priceUsd;
  listing.poolRemaining += s;
  return { usdOut, solOut: usdOut / solPriceUsd };
}

/** Oracle tick: set price purely from the latest score. */
export function applyScore(listing: Listing, score: number): void {
  listing.priceUsd = scoreToPriceUsd(score);
}

export function marketCapUsd(listing: Listing): number {
  return listing.priceUsd * listing.poolTotal;
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

function main() {
  const SOL_USD = 150; // example SOL price for the demo

  console.log("=== Machine B: $0.01 open, price moves ONLY on performance ===\n");
  console.log(`Pool per listing: ${SHARES_PER_LISTING.toLocaleString()} shares`);
  console.log(`Open price: $${OPEN_PRICE_USD} => opening cap $${(OPEN_PRICE_USD * SHARES_PER_LISTING).toLocaleString()}`);
  console.log(`Price rails: $${(OPEN_PRICE_USD * PRICE_FLOOR_MULT).toFixed(4)} .. $${(OPEN_PRICE_USD * PRICE_CAP_MULT).toFixed(4)}\n`);

  // score -> price table
  console.log("score -> price -> market cap");
  for (const sc of [0, 10, 25, 50, 60, 75, 90, 100]) {
    const p = scoreToPriceUsd(sc);
    console.log(`  ${String(sc).padStart(3)}  ->  $${p.toFixed(4)}  ->  $${(p * SHARES_PER_LISTING).toLocaleString(undefined,{maximumFractionDigits:0})}`);
  }

  // a real cohort -> prices
  const raw: RawMetrics[] = [
    { id: "cented", realizedPnlSol: 820, winRate: 0.68, volumeSol: 41000, trades: 1310 },
    { id: "cupsey", realizedPnlSol: 410, winRate: 0.71, volumeSol: 22000, trades: 980 },
    { id: "orangie", realizedPnlSol: -95, winRate: 0.44, volumeSol: 8000, trades: 260 },
  ];
  const scored = scoreCohort(raw);

  console.log("\n=== buying draws from pool at current price; price UNCHANGED ===\n");
  const l = newListing("cented");
  const centedScore = scored.find((s) => s.id === "cented")!.score;
  applyScore(l, centedScore);
  console.log(`cented score ${centedScore} -> price $${l.priceUsd.toFixed(4)}, cap $${marketCapUsd(l).toLocaleString(undefined,{maximumFractionDigits:0})}`);

  const b1 = buyWithSol(l, 1, SOL_USD); // buy with 1 SOL
  console.log(`  buy 1 SOL ($${SOL_USD}) -> ${b1.shares.toLocaleString()} shares, price still $${l.priceUsd.toFixed(4)}`);
  const b2 = buyWithSol(l, 5, SOL_USD); // buy with 5 SOL
  console.log(`  buy 5 SOL ($${(5*SOL_USD)}) -> ${b2.shares.toLocaleString()} shares, price still $${l.priceUsd.toFixed(4)}`);
  console.log(`  pool remaining: ${l.poolRemaining.toLocaleString()} / ${l.poolTotal.toLocaleString()}`);

  console.log("\n=== now the trader performs better: oracle lifts price ===\n");
  applyScore(l, 90);
  console.log(`  score -> 90, price now $${l.priceUsd.toFixed(4)} (holders gained, no trade needed)`);
  const s1 = sellShares(l, b1.shares, SOL_USD);
  console.log(`  sell ${b1.shares.toLocaleString()} shares -> $${s1.usdOut.toFixed(2)} (${s1.solOut.toFixed(3)} SOL) at the higher price`);

  console.log("\nPrice moved ONLY when performance changed — never from buying.\n");
}

// run only if invoked directly (not when imported, e.g. by publish.ts)
if (process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])) {
  main();
}
