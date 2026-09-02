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
  realizedPnlEth: number;
  /** fraction of trades that were profitable, 0..1 */
  winRate: number;
  /** total traded volume over the window, in SOL */
  volumeEth: number;
  /** number of closed trades over the window */
  trades: number;
  /**
   * Biggest winning / losing closed positions, largest magnitude first.
   * Display only — deliberately NOT an input to the score, which stays a
   * pure function of the four aggregate measures above. Optional because
   * not every provider reconstructs individual closes.
   */
  topWins?: ClosedTradeSummary[];
  topLosses?: ClosedTradeSummary[];
};

/** One closed position, for showing the evidence behind a score. */
export type ClosedTradeSummary = {
  symbol: string;
  pnl: number;
  proceeds: number;
  ts: number;
  multiple: number | null;
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
  /**
   * 0..1 — how much of the raw percentile blend actually landed in `score`,
   * vs. being shrunk toward the neutral midpoint. Low for small trade
   * counts, approaching 1 as trades grows. See `sampleConfidence`.
   */
  confidence: number;
};

/** Equal opening price for every listing. All divergence is earned. */
export const BASE_PRICE = 0.001; // in SOL, matches the frontend's stated base

/** How the four sub-metrics are weighted into the composite score. */
export const WEIGHTS = {
  pnl: 0.5, // realized PnL is the strongest signal of skill
  win: 0.2, // consistency
  vol: 0.15, // conviction / activity, but capped so whales don't dominate
  trades: 0.15, // rewards activity, but is NOT the sample-size safeguard —
  // see SAMPLE_SIZE_PRIOR/sampleConfidence below for that. A wallet with 1
  // trade could still get a high tradesPct percentile if the rest of the
  // cohort is also thin; this weight alone can't protect against a single
  // lucky trade dominating a score, which is why confidence-shrinkage below
  // exists as a separate mechanism.
} as const;

/**
 * Confidence weight for a wallet's raw percentile blend, based on trade
 * count: trades / (trades + SAMPLE_SIZE_PRIOR). 0 at trades=0 (moot — the
 * fresh-start rule below already pins those to 50), ~0.05 at 1 trade, 0.5 at
 * SAMPLE_SIZE_PRIOR trades, asymptotically -> 1 as trades grows. Used to
 * shrink `composite` toward the neutral midpoint (0.5) for low-sample-size
 * wallets, so a single lucky (or unlucky) trade can only nudge a score, not
 * swing it — only a sustained track record earns the full percentile.
 */
export const SAMPLE_SIZE_PRIOR = 20;

function sampleConfidence(trades: number): number {
  return trades / (trades + SAMPLE_SIZE_PRIOR);
}

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
  const pnl = cohort.map((c) => c.realizedPnlEth);
  const win = cohort.map((c) => c.winRate);
  // log-compress volume so a single mega-whale doesn't flatten everyone else
  const vol = cohort.map((c) => Math.log1p(Math.max(0, c.volumeEth)));
  const trd = cohort.map((c) => Math.log1p(Math.max(0, c.trades)));

  return cohort.map((c, i) => {
    // FRESH START: a trader with no post-launch trades yet sits at the neutral
    // opening score (50 -> $0.01). Only once they trade do they diverge. This
    // makes day-one a true equal start instead of ranking noise on all-zeros.
    if (c.trades === 0 && c.volumeEth === 0 && c.realizedPnlEth === 0) {
      return {
        ...c,
        score: 50,
        breakdown: { pnlPct: 0.5, winPct: 0.5, volPct: 0.5, tradesPct: 0.5 },
        confidence: 0,
      };
    }

    // pnl/win/vol/trd are each built by mapping over this same cohort, so
    // index i is always present in all four. Defaulting to 0 rather than
    // asserting keeps a malformed cohort from throwing mid-scoring run: a
    // wallet would score low, which is visible, instead of taking down the
    // whole cycle and leaving every price stale.
    const pnlPct = percentile(pnl[i] ?? 0, pnl);
    const winPct = percentile(win[i] ?? 0, win);
    const volPct = percentile(vol[i] ?? 0, vol);
    const tradesPct = percentile(trd[i] ?? 0, trd);

    const composite =
      WEIGHTS.pnl * pnlPct +
      WEIGHTS.win * winPct +
      WEIGHTS.vol * volPct +
      WEIGHTS.trades * tradesPct;

    // Shrink toward the neutral midpoint (0.5) for low-sample-size wallets —
    // see sampleConfidence's doc comment. A wallet with 1 trade lands very
    // close to 50 regardless of how extreme that single trade was; a wallet
    // with dozens of trades gets close to their raw percentile.
    const confidence = sampleConfidence(c.trades);
    const shrunkComposite = 0.5 + (composite - 0.5) * confidence;

    return {
      ...c,
      score: Math.round(shrunkComposite * 100),
      breakdown: { pnlPct, winPct, volPct, tradesPct },
      confidence,
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
  const mult = centered >= 0 ? 1 + centered * gain : 1 / (1 + -centered * gain);
  return BASE_PRICE * mult;
}

/**
 * Move `current` toward `target` by at most RATE_CAP of the gap.
 * Call this each update cycle. Returns the new effective anchor.
 */
export function applyRateCap(current: number, target: number, cap = RATE_CAP): number {
  return current + (target - current) * cap;
}
