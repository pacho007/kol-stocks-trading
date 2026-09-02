/**
 * pricing.ts (frontend) — display-only price estimate, browser-safe.
 * --------------------------------------------------------------------
 * Once a listing exists on-chain (evm/src/SharpsMarket.sol), its real price
 * lives in that listing's `priceWei` and is what
 * src/lib/market-store.tsx actually trades against — this file is no
 * longer in that path. It exists only to show a reasonable estimated price
 * for listings that haven't been created on-chain yet (mid-rollout), so the
 * UI isn't blank before every KOL has a listing. Never used to execute a
 * trade — buy()/sell() always read/write the real on-chain price.
 */

export const OPEN_PRICE_USD = 0.01;
export const SHARES_PER_LISTING = 10_000_000;
export const PRICE_FLOOR_MULT = 0.1;
export const PRICE_CAP_MULT = 25;

/** score (0..100) -> USD price, bounded to the rails. Only mover of price. */
export function scoreToPriceUsd(score: number): number {
  const s = Math.max(0, Math.min(100, score)) / 100;
  const centered = (s - 0.5) * 2;
  const mult =
    centered >= 0
      ? 1 + centered * (PRICE_CAP_MULT - 1) * (0.4 + 0.6 * centered)
      : PRICE_FLOOR_MULT + (1 - PRICE_FLOOR_MULT) * (1 + centered);
  const price = OPEN_PRICE_USD * mult;
  return Math.max(
    OPEN_PRICE_USD * PRICE_FLOOR_MULT,
    Math.min(OPEN_PRICE_USD * PRICE_CAP_MULT, price),
  );
}

export function marketCapUsd(priceUsd: number): number {
  return priceUsd * SHARES_PER_LISTING;
}
