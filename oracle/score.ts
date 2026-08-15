/**
 * score.ts — Performance scoring + score→price coupling
 * ------------------------------------------------------
 * This is the core mechanic of the whole product. It is intentionally
 * self-contained and has NO dependency on how you deploy (devnet, mainnet,
 * or play-money sim). It takes raw per-wallet trading metrics and produces:
 *
 *   1. a normalized, cohort-relative Performance Score (0..100), and
 *   2. a price derived from that score via a transparent, auditable curve.
 *
 * Design principles:
 *  - FAIRNESS: everyone is scored against the same cohort using percentile
 *    ranks, so "score" means "how you rank vs peers", not raw magnitude.
 *    A trader doing $10M volume and one doing $10k are comparable.
 *  - EQUAL START: every listing opens at the same BASE_PRICE. All divergence
 *    is earned by performance. (Your "fair for all" promise, mechanically.)
 *  - TAMPER-RESISTANCE: score can only move so far per update (RATE_CAP),
 *    so a single manufactured metric spike can't rocket a price.
 *  - TRANSPARENCY: the formula is plain arithmetic you can publish next to
 *    each listing as its "earnings report".
 */

export type RawMetrics = {
  id: string;
  /** realized PnL over the trailing window, in SOL (can be negative) */
  realizedPnlSol: number;
  /** fraction of trades that were profitable, 0..1 */
  winRate: number;
  /** total traded volume over the window, in SOL */
  volumeSol: number;
  /** number of closed trades over the window */
  trades: number;
};

export type ScoredMetrics = RawMetrics & {
  /** 0..100, cohort-relative */
  score: number;
  /** per-sub-metric percentiles, for the transparent "why" panel */
  breakdown: {
    pnlPct: number;
    winPct: number;
    volPct: number;
    tradesPct: number;
  };
};

/** Equal opening price for every listing. All divergence is earned. */
export const BASE_PRICE = 0.001; // in SOL, matches the frontend's stated base

/** How the four sub-metrics are weighted into the composite score. */
export const WEIGHTS = {
  pnl: 0.5, // realized PnL is the strongest signal of skill
  win: 0.2, // consistency
  vol: 0.15, // conviction / activity, but capped so whales don't dominate
  trades: 0.15, // sample size — protects against 1-lucky-trade listings
} as const;

/**
 * Max fraction the *effective* score is allowed to move toward its new
 * target per update. Prevents a manufactured spike from repricing instantly.
 * 0.25 => it takes several update cycles for a genuine move to fully land.
 */
export const RATE_CAP = 0.25;

/** Percentile rank of `value` within `all` (0..1). Ties share midrank. */
function percentile(value: number, all: number[]): number {
  if (all.length <= 1) return 0.5;
  let below = 0;
  let equal = 0;
  for (const x of all) {
    if (x < value) below++;
    else if (x === value) equal++;
  }
  // midrank for ties, so identical inputs map to identical percentiles
  return (below + equal / 2) / all.length;
}

/**
 * Turn a cohort of raw metrics into scored metrics.
 * Percentile-normalizes each sub-metric across the cohort, then blends.
 */
export function scoreCohort(cohort: RawMetrics[]): ScoredMetrics[] {
  const pnl = cohort.map((c) => c.realizedPnlSol);
  const win = cohort.map((c) => c.winRate);
  // log-compress volume so a single mega-whale doesn't flatten everyone else
  const vol = cohort.map((c) => Math.log1p(Math.max(0, c.volumeSol)));
  const trd = cohort.map((c) => Math.log1p(Math.max(0, c.trades)));

  return cohort.map((c, i) => {
    // FRESH START: a trader with no post-launch trades yet sits at the neutral
    // opening score (50 -> $0.01). Only once they trade do they diverge. This
    // makes day-one a true equal start instead of ranking noise on all-zeros.
    if (c.trades === 0 && c.volumeSol === 0 && c.realizedPnlSol === 0) {
      return {
        ...c,
        score: 50,
        breakdown: { pnlPct: 0.5, winPct: 0.5, volPct: 0.5, tradesPct: 0.5 },
      };
    }

    const pnlPct = percentile(pnl[i], pnl);
    const winPct = percentile(win[i], win);
    const volPct = percentile(vol[i], vol);
    const tradesPct = percentile(trd[i], trd);

    const composite =
      WEIGHTS.pnl * pnlPct +
      WEIGHTS.win * winPct +
      WEIGHTS.vol * volPct +
      WEIGHTS.trades * tradesPct;

    return {
      ...c,
      score: Math.round(composite * 100),
      breakdown: { pnlPct, winPct, volPct, tradesPct },
    };
  });
}

/**
 * Score → price coupling.
 *
 * The score sets a "fair value" multiplier on BASE_PRICE. A score of 50
 * (median) sits near BASE_PRICE; higher scores lift the anchor, lower ones
 * cut it. `GAIN` controls how aggressively price responds to score.
 *
 * This returns the *target anchor* price. In a live curve you don't snap to
 * it — you let the bonding curve trade around it and let this anchor drift
 * in via applyRateCap(), so manufactured spikes can't teleport the price.
 */
export function scoreToAnchor(score: number, gain = 2.0): number {
  // map score 0..100 -> multiplier. score 50 -> ~1x, 100 -> ~ (1+gain)x, 0 -> ~1/(1+gain)x
  const s = Math.max(0, Math.min(100, score)) / 100; // 0..1
  const centered = (s - 0.5) * 2; // -1..1
  const mult =
    centered >= 0 ? 1 + centered * gain : 1 / (1 + -centered * gain);
  return BASE_PRICE * mult;
}

/**
 * Move `current` toward `target` by at most RATE_CAP of the gap.
 * Call this each update cycle. Returns the new effective anchor.
 */
export function applyRateCap(current: number, target: number, cap = RATE_CAP): number {
  return current + (target - current) * cap;
}
