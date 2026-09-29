/**
 * indexer.ts — scoring orchestration
 * ----------------------------------
 * Turns a list of listings into scored rows: fetch each wallet's metrics
 * through a PnlProvider, rank the cohort with scoreCohort() from score.ts,
 * and derive each listing's price anchor.
 *
 * This is READ-ONLY. It never signs, never moves funds, never needs a
 * private key. Publishing is oracle/publish.ts; signing is
 * oracle/push-onchain.ts.
 *
 * The provider is a required argument, not a default, so a caller can never
 * silently score against the wrong source.
 *
 * Run (exercises the production path against real chain data):
 *   npx tsx oracle/indexer.ts
 */

import { scoreCohort, scoreToAnchor, applyRateCap, BASE_PRICE, type RawMetrics } from "./score.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

import { resolve as resolvePath } from "node:path";
import { fileURLToPath as toPath } from "node:url";
import { LAUNCH_TS } from "./launch.js";

export { LAUNCH_TS };

// ---------------------------------------------------------------------------
// PnL provider seam — swap this for a dedicated PnL API later if you want
// ---------------------------------------------------------------------------

export interface PnlProvider {
  metrics(wallet: string): Promise<RawMetrics>;
}

// ---------------------------------------------------------------------------
// Orchestration: wallets -> metrics -> scores -> price anchors
// ---------------------------------------------------------------------------

export type ListingInput = { id: string; wallet: string };

export type OracleRow = {
  id: string;
  wallet: string;
  score: number;
  metrics: RawMetrics;
  targetAnchor: number;
  breakdown: {
    pnlPct: number;
    winPct: number;
    volPct: number;
    tradesPct: number;
  };
  /** 0..1 — how much of the raw percentile blend survived sample-size
   *  shrinkage. Low for wallets with few trades. See score.ts. */
  confidence: number;
};

/**
 * Full oracle pass. Given listings (id + wallet), returns scored rows with
 * price anchors ready for the frontend / on-chain program to consume.
 * `prevAnchors` lets you apply the rate cap across runs (pass {} on first run).
 */
export async function runOracle(
  listings: ListingInput[],
  provider: PnlProvider,
  prevAnchors: Record<string, number> = {},
): Promise<OracleRow[]> {
  console.log(
    `Indexing ${listings.length} wallets since launch ${new Date(LAUNCH_TS * 1000).toISOString()}...`,
  );

  // How many wallets are worked on at once. The provider has its own
  // request limiter; this only bounds how many wallets are in progress.
  const CONCURRENCY = Number(process.env["INDEXER_CONCURRENCY"] ?? 4);
  const raw: (RawMetrics | undefined)[] = new Array(listings.length);
  const failed: string[] = [];
  let done = 0;

  async function worker(startIdx: number) {
    for (let i = startIdx; i < listings.length; i += CONCURRENCY) {
      // Bounded by the loop condition; the guard is for the type checker,
      // which cannot tie i < listings.length to the element being present.
      const listing = listings[i];
      if (!listing) continue;
      const { id, wallet } = listing;
      try {
        const m = await provider.metrics(wallet);
        raw[i] = { ...m, id };
      } catch (e) {
        // Leave a hole. This used to substitute zeroed metrics, which are not
        // missing data — they are a claim that the wallet traded nothing and
        // made nothing, and the scorer has no way to tell the difference.
        //
        // Two things went wrong with that. The wallet itself scored ~50 and
        // that neutral score was published, so an upstream outage walked every
        // listing back to the opening score and erased what they had earned.
        // And because scoreCohort ranks by percentile, the fabricated zeroes
        // dragged the distribution — so a PARTIAL outage silently corrupted
        // the scores of every wallet that had succeeded.
        console.warn(`  ${id} ${short(wallet)} failed: ${(e as Error).message}`);
        failed.push(id);
      }
      done++;
      if (done % 25 === 0 || done === listings.length) {
        console.log(`  ...${done}/${listings.length} wallets indexed`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, listings.length) }, (_, w) => worker(w)),
  );

  // Rank only what was actually measured.
  const measured = raw.filter((m): m is RawMetrics => m !== undefined);

  if (failed.length > 0) {
    console.warn(
      `  ${failed.length}/${listings.length} wallets could not be read and are excluded ` +
        `from this cycle. They keep their existing on-chain score.`,
    );
  }

  // A percentile ranking is only meaningful against the cohort it was
  // designed for. Once a large share of it is missing, the survivors are
  // being ranked against a different, smaller field — a wallet unchanged
  // since yesterday can jump or crater purely because its peers dropped out.
  // Publishing nothing leaves yesterday's scores in place, which is a far
  // better answer than publishing confident numbers derived from a third of
  // the data.
  const MAX_FAILURE_RATIO = Number(process.env["INDEXER_MAX_FAILURE_RATIO"] ?? 0.25);
  if (listings.length > 0 && failed.length / listings.length > MAX_FAILURE_RATIO) {
    throw new Error(
      `Aborting cycle: ${failed.length}/${listings.length} wallets failed to index ` +
        `(over ${(MAX_FAILURE_RATIO * 100).toFixed(0)}%). Scores are ranked against the ` +
        `cohort, so a partial read produces wrong numbers for the wallets that did ` +
        `succeed. Leaving the existing scores untouched.`,
    );
  }

  const scored = scoreCohort(measured);

  return scored.map((s) => {
    const target = scoreToAnchor(s.score);
    const prev = prevAnchors[s.id] ?? BASE_PRICE; // everyone starts equal
    const capped = applyRateCap(prev, target);
    return {
      id: s.id,
      wallet: listings.find((l) => l.id === s.id)!.wallet,
      score: s.score,
      metrics: {
        id: s.id,
        realizedPnlSol: s.realizedPnlSol,
        winRate: s.winRate,
        volumeSol: s.volumeSol,
        trades: s.trades,
        // Carried through for display; not an input to the score.
        ...(s.topWins ? { topWins: s.topWins } : {}),
        ...(s.topLosses ? { topLosses: s.topLosses } : {}),
      },
      targetAnchor: capped,
      breakdown: s.breakdown,
      confidence: s.confidence,
    };
  });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const short = (w: string) => `${w.slice(0, 4)}..${w.slice(-4)}`;

// ---------------------------------------------------------------------------
// CLI entry — indexes a small sample so you can verify it against real chain
// data without burning your whole rate limit. Point it at your full list
// (import { KOLS } from "../src/lib/kols") when you're ready.
// ---------------------------------------------------------------------------

async function main() {
  // A small real sample through the PRODUCTION path, so running this file
  // verifies what actually ships.
  const { KOLS } = await import("../src/lib/kols.js");
  const { createSolanaProvider } = await import("./solana-provider.js");
  const sample: ListingInput[] = KOLS.slice(0, 4).map((k) => ({ id: k.id, wallet: k.wallet }));

  const rows = await runOracle(sample, createSolanaProvider());

  console.log("\n=== Oracle output (opens equal, price earned by score) ===\n");
  console.log(["id", "score", "confidence", "targetAnchor"].join("\t"));
  for (const r of rows.sort((x, y) => y.score - x.score)) {
    console.log([r.id, r.score, r.confidence.toFixed(2), r.targetAnchor.toFixed(6)].join("\t"));
  }
  console.log("\nReal Solana mainnet data through the same scorer the service uses.");
}
// run only if invoked directly (not when imported, e.g. by publish.ts)
if (process.argv[1] && toPath(import.meta.url) === resolvePath(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
