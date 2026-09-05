/**
 * indexer.ts — scoring orchestration
 * ----------------------------------
 * Turns a list of listings into scored rows: fetch each wallet's metrics
 * through a PnlProvider, rank the cohort with scoreCohort() from score.ts,
 * and derive each listing's price anchor.
 *
 * This is READ-ONLY. It never signs, never moves funds, never needs a
 * private key. Publishing is oracle/publish.ts; signing is
 * oracle/push-onchain-evm.ts.
 *
 * THE PROVIDER IS AN ARGUMENT, NOT A DEFAULT
 *
 * This file used to carry a complete second implementation: a Helius client
 * that read Solana swap history, roughly 280 lines of it, plus a
 * HeliusPnlProvider that runOracle took as its DEFAULT provider. The app has
 * run on Robinhood Chain for a long time and nothing reached that code except
 * this file's own CLI, which printed three hardcoded Solana wallets scoring
 * 50 and a missing-credential error — while looking exactly like the way to
 * test the oracle.
 *
 * The default was the real hazard. Any caller that forgot the second argument
 * silently got a Solana provider on an EVM chain. runOracle now requires one,
 * so that mistake is a compile error rather than a runtime surprise.
 *
 * Run (exercises the production path against real chain data):
 *   npx tsx oracle/indexer.ts
 */

import { scoreCohort, scoreToAnchor, applyRateCap, BASE_PRICE, type RawMetrics } from "./score.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * LAUNCH GATE — everyone starts fresh.
 * No historical trades count. Scores reflect ONLY trades made after the
 * moment the product went live. The launch time is persisted to a file so
 * restarting the watcher does NOT reset everyone's clock — go-live happens
 * once, the first time this runs.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve as resolvePath, dirname as pathDirname } from "node:path";
import { fileURLToPath as toPath } from "node:url";

const LAUNCH_FILE = resolvePath(pathDirname(toPath(import.meta.url)), ".launch");

/** Unix seconds of go-live. Set once, then reused on every subsequent run. */
export const LAUNCH_TS: number = (() => {
  // An explicit value wins over the file, and is what production should use.
  // The file is written next to this source, which inside a container means it
  // is part of the image: fine while it ships with a committed value, but a
  // deploy that ever loses it would silently re-stamp "now" and reset every
  // listing's history to nothing — scores would collapse to 50 and prices
  // would unwind. Pinning LAUNCH_TS in the environment removes that failure
  // mode entirely, which is why fly.toml sets it.
  const fromEnv = Number(process.env["LAUNCH_TS"] ?? "");
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;

  if (existsSync(LAUNCH_FILE)) {
    const v = Number(readFileSync(LAUNCH_FILE, "utf8").trim());
    if (Number.isFinite(v) && v > 0) return v;
  }
  const now = Math.floor(Date.now() / 1000);
  writeFileSync(LAUNCH_FILE, String(now), "utf8");
  console.log(`\n*** GO-LIVE: launch time set to ${new Date(now * 1000).toISOString()} ***`);
  console.log(`*** Everyone starts fresh. Only trades AFTER this count. ***\n`);
  return now;
})();

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

  // How many wallets are worked on at once.
  //
  // This is the real ceiling on request parallelism, and it took a while to
  // see. Each wallet walks its pages sequentially, so at most CONCURRENCY
  // requests can ever be open — raising the provider's own MAX_INFLIGHT above
  // this number does nothing at all, because there is nobody to fill the extra
  // slots. Both had to move together.
  //
  // 16 when a key is present, matching the provider's in-flight cap, measured
  // against the endpoint rather than guessed: ramps at 6, 12 and 20 concurrent
  // returned no 429 at any level. 4 stays the default without a key, where the
  // limit is real and was actually hit.
  const CONCURRENCY = Number(
    process.env["INDEXER_CONCURRENCY"] ?? (process.env["BLOCKSCOUT_API_KEY"] ? 16 : 4),
  );
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
        realizedPnlEth: s.realizedPnlEth,
        winRate: s.winRate,
        volumeEth: s.volumeEth,
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const short = (w: string) => `${w.slice(0, 4)}..${w.slice(-4)}`;

// ---------------------------------------------------------------------------
// CLI entry — indexes a small sample so you can verify it against real chain
// data without burning your whole rate limit. Point it at your full list
// (import { KOLS } from "../src/lib/kols") when you're ready.
// ---------------------------------------------------------------------------

async function main() {
  // A small real sample through the PRODUCTION path, so running this file
  // verifies what actually ships. It used to run three hardcoded Solana
  // wallets through a Solana provider that could never work on this chain,
  // printed three scores of 50 and a credential error, and looked for all
  // the world like the way to test the oracle.
  const { KOLS } = await import("../src/lib/kols.js");
  const { EvmPnlProvider } = await import("./evm-pnl-provider.js");
  const sample: ListingInput[] = KOLS.slice(0, 4).map((k) => ({ id: k.id, wallet: k.wallet }));

  const rows = await runOracle(sample, EvmPnlProvider);

  console.log("\n=== Oracle output (opens equal, price earned by score) ===\n");
  console.log(["id", "score", "confidence", "targetAnchor"].join("\t"));
  for (const r of rows.sort((x, y) => y.score - x.score)) {
    console.log([r.id, r.score, r.confidence.toFixed(2), r.targetAnchor.toFixed(6)].join("\t"));
  }
  console.log("\nReal Robinhood Chain data through the same scorer the service uses.");
}
// run only if invoked directly (not when imported, e.g. by publish.ts)
if (process.argv[1] && toPath(import.meta.url) === resolvePath(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
