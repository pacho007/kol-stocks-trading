/**
 * publish.ts — the bridge between the indexer and the frontend.
 * ------------------------------------------------------------
 * Runs the oracle (indexer -> score) over your listings and writes a plain
 * JSON file the frontend fetches. This is the seam that turns the app from
 * "simulated scores" into "real performance-driven prices".
 *
 * One-shot:
 *   npx tsx oracle/publish.ts
 *
 * Refresh on a schedule (every REFRESH_MIN minutes):
 *   npx tsx oracle/publish.ts --watch
 *
 * Wallet history comes from Solana mainnet JSON-RPC; set TRADER_RPC_URL to a
 * dedicated endpoint for anything beyond a handful of wallets (see
 * oracle/solana-provider.ts).
 *
 * Output: writes `public/scores.json` so the frontend can fetch it at
 * `/scores.json` with no extra server. (For production you'd serve this from
 * a tiny API or object storage instead, but a static file works to go live.)
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runOracle, type ListingInput } from "./indexer.js";
import { createSolanaProvider } from "./solana-provider.js";
import { scoreToPriceUsd, SHARES_PER_LISTING } from "./pricing.js";

/**
 * Load the full KOL list from the app source if it's alongside the oracle
 * (i.e. oracle/ lives inside the project). If the oracle folder is standalone
 * (e.g. downloaded on its own), this import won't resolve — we catch that and
 * fall back to the sample, so the publisher never crashes.
 */
export async function loadFullListings(): Promise<ListingInput[] | null> {
  const candidates = [
    "../src/lib/kols.js",
    "../src/lib/kols.ts",
    "../../src/lib/kols.js",
    "../../src/lib/kols.ts",
  ];
  for (const path of candidates) {
    try {
      const mod = await import(path);
      const kols = (mod as { KOLS?: { id: string; wallet: string }[] }).KOLS;
      if (Array.isArray(kols) && kols.length) {
        // dedupe by wallet so duplicate listings don't double-count
        const seen = new Set<string>();
        const unique: ListingInput[] = [];
        for (const k of kols) {
          if (seen.has(k.wallet)) continue;
          seen.add(k.wallet);
          unique.push({ id: k.id, wallet: k.wallet });
        }
        return unique;
      }
    } catch {
      /* try next path */
    }
  }
  return null;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Write scores.json to the app's public dir so the frontend can fetch it at
 * `/scores.json`. Adjust APP_PUBLIC if your app lives elsewhere. We also write
 * a copy next to the oracle as a fallback.
 */
const APP_PUBLIC = resolve(__dirname, "../public/scores.json");
const OUT_TARGETS = [APP_PUBLIC];
const REFRESH_MIN = Number(process.env["REFRESH_MIN"] ?? 20); // 20 min default — sane for ~558 wallets; override with REFRESH_MIN=n

/**
 * Listings. Full list by default; set SAMPLE=1 to test on 3 wallets first:
 *   SAMPLE=1 npx tsx oracle/publish.ts
 */
const SAMPLE_LISTINGS: ListingInput[] = [];

let listings: ListingInput[] = SAMPLE_LISTINGS; // resolved in main()

/**
 * Live SOL/USD, trying several public feeds before falling back. Display-only
 * — every trade is priced and settled in lamports by the program — but a
 * stale number here still misprices every USD figure in the UI.
 */
export async function fetchNativePriceUsd(): Promise<number> {
  const FALLBACK = 200;
  const sources: Array<() => Promise<number | null>> = [
    async () => {
      const r = await fetch("https://api.coinbase.com/v2/prices/SOL-USD/spot");
      if (!r.ok) return null;
      const j = (await r.json()) as { data?: { amount?: string } };
      const p = Number(j.data?.amount);
      return p > 0 ? p : null;
    },
    async () => {
      const r = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      );
      if (!r.ok) return null;
      const j = (await r.json()) as { solana?: { usd?: number } };
      const p = Number(j.solana?.usd);
      return p > 0 ? p : null;
    },
  ];
  for (const src of sources) {
    try {
      const p = await src();
      if (p && p > 0) return p;
    } catch {
      /* try next */
    }
  }
  return FALLBACK;
}

/** One closed position — evidence behind a score, not an input to it. */
type PublishedClose = {
  symbol: string;
  pnl: number;
  proceeds: number;
  ts: number;
  multiple: number | null;
};

/**
 * The shape of one row in scores.json, and therefore the contract the frontend
 * and listing_metrics both read.
 *
 * topWins/topLosses/breakdown/confidence were being written here but were
 * missing from this type, so nothing checked that the writer and the readers
 * agreed. They only surfaced once oracle/ was added to tsconfig — until then
 * the type quietly described a smaller object than the code actually emitted.
 */
type PublishedRow = {
  id: string;
  score: number;
  priceUsd: number;
  marketCapUsd: number;
  metrics: {
    realizedPnlSol: number;
    winRate: number;
    volumeSol: number;
    trades: number;
    topWins: PublishedClose[];
    topLosses: PublishedClose[];
  };
  breakdown: { pnlPct: number; winPct: number; volPct: number; tradesPct: number };
  confidence: number;
};

export type Published = {
  updatedAt: string;
  nativePriceUsd: number;
  sharesPerListing: number;
  rows: PublishedRow[];
};

/** carry anchors across runs so the rate-cap smooths score->price over time */
let prevAnchors: Record<string, number> = {};
const provider = createSolanaProvider();

async function once(): Promise<void> {
  const nativePriceUsd = await fetchNativePriceUsd();
  const rows = await runOracle(listings, provider, prevAnchors);
  prevAnchors = Object.fromEntries(rows.map((r) => [r.id, r.targetAnchor]));
  await publishScores(rows, nativePriceUsd);
}

/**
 * Turn scored rows into the published snapshot: public/scores.json for the
 * app, and public.listing_metrics for everyone connected to the shared feed.
 *
 * Split out of `once` so a caller that has already indexed — oracle/run.ts,
 * which then pushes the same numbers on chain — can publish without indexing
 * the whole cohort a second time.
 */
export async function publishScores(
  rows: Awaited<ReturnType<typeof runOracle>>,
  nativePriceUsd: number,
): Promise<Published> {
  const published: Published = {
    updatedAt: new Date().toISOString(),
    nativePriceUsd,
    sharesPerListing: SHARES_PER_LISTING,
    rows: rows.map((r) => {
      const priceUsd = scoreToPriceUsd(r.score);
      return {
        id: r.id,
        score: r.score,
        priceUsd,
        marketCapUsd: priceUsd * SHARES_PER_LISTING,
        metrics: {
          realizedPnlSol: r.metrics.realizedPnlSol,
          winRate: r.metrics.winRate,
          volumeSol: r.metrics.volumeSol,
          trades: r.metrics.trades,
          // The individual closes behind those aggregates — the evidence a
          // score is asserted from, rather than just the conclusion.
          topWins: r.metrics.topWins ?? [],
          topLosses: r.metrics.topLosses ?? [],
        },
        // The four percentile components behind the score, plus how much of
        // the raw blend actually landed after sample-size shrinkage. These
        // were computed all along and thrown away here, which left the
        // "transparent why panel" score.ts documents with nothing to render.
        breakdown: r.breakdown,
        confidence: r.confidence,
      };
    }),
  };

  const json = JSON.stringify(published, null, 2);
  for (const target of OUT_TARGETS) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, json, "utf8");
  }

  await publishMetricsToSupabase(published);
  const top = published.rows
    .filter((r) => r.score !== 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  console.log(
    `\nSOL ${nativePriceUsd.toFixed(2)} · wrote ${published.rows.length} scores -> ${OUT_TARGETS.join(", ")}` +
      (top.length
        ? `\n  movers:\n` +
          top
            .map(
              (r) =>
                `    ${r.id.padEnd(10)} score ${String(r.score).padStart(3)}  $${r.priceUsd.toFixed(4)}`,
            )
            .join("\n")
        : `\n  (all at neutral 50 — no post-launch trades counted yet)`),
  );
  return published;
}

/**
 * Mirror the run's measurements into public.listing_metrics.
 *
 * scores.json alone cannot reach production: it is generated, so it is
 * gitignored, so it never ships, so the deployed app fetches /scores.json and
 * gets a 404. Everything under the price — win rate, PnL, biggest wins and
 * losses, the score breakdown — silently renders empty even though the oracle
 * computed all of it. This gives that data the same path price and score
 * already take.
 *
 * Optional by design: with no Supabase credentials this is a no-op and the
 * local scores.json still works, so `npm run oracle:publish` stays useful for
 * development with no backend at all.
 *
 * Uses the SERVICE ROLE key, the only writer RLS permits. That key bypasses
 * RLS entirely — server-side only, never in a VITE_ var.
 */
export async function publishMetricsToSupabase(published: Published): Promise<void> {
  const rows = published.rows.map((r) => ({
    kol_id: r.id,
    realized_pnl_sol: r.metrics.realizedPnlSol,
    volume_sol: r.metrics.volumeSol,
    win_rate: r.metrics.winRate,
    trades: r.metrics.trades,
    top_wins: r.metrics.topWins ?? [],
    top_losses: r.metrics.topLosses ?? [],
    breakdown: r.breakdown ?? {},
    confidence: r.confidence ?? 0,
  }));

  // PREFERRED PATH: post to the app's own sync endpoint, which performs the
  // write with the service role it already holds server-side.
  //
  // The point is that this process never holds that key. Lovable Cloud does
  // not expose it at all, and even where it can be obtained, an unattended
  // scheduled job is a poor place to keep the one credential that bypasses
  // every RLS policy in the database. What the oracle carries instead is a
  // secret whose entire authority is "may write listing metrics" — a far
  // smaller thing to lose, and one that cannot touch any other table.
  const syncUrl = process.env["ORACLE_SYNC_URL"];
  const syncSecret = process.env["ORACLE_SYNC_SECRET"];
  if (syncUrl && syncSecret) {
    try {
      const res = await fetch(syncUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "x-cron-secret": syncSecret },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) {
        // Status only, never the body: a 401 from this endpoint is bare by
        // design, and echoing any other response risks putting request detail
        // into CI logs.
        console.error(`Metrics sync failed: HTTP ${res.status}`);
        console.error("  scores.json was still written; the UI falls back to it locally.");
        return;
      }
      const body = (await res.json()) as { written?: number };
      console.log(`Synced ${body.written ?? rows.length} metric rows via the app endpoint.`);
      return;
    } catch (e) {
      console.error(`Metrics sync request failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
  }

  // FALLBACK: write straight to Postgres. Only usable when running against a
  // Supabase project whose service role key is actually obtainable.
  const url = process.env["SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceKey) {
    console.log(
      "No metrics destination configured — wrote scores.json only.\n" +
        "  Set ORACLE_SYNC_URL + ORACLE_SYNC_SECRET (preferred), or\n" +
        "  SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to write directly.\n" +
        "  Prices and scores are unaffected either way; only win rate, PnL and\n" +
        "  biggest wins/losses stay blank on the deployed site.",
    );
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error } = await db.from("listing_metrics").upsert(
    rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
    { onConflict: "kol_id" },
  );
  if (error) {
    // Not fatal: the scores are already written and may already be on their
    // way on-chain. Failing a whole cycle over a stale metrics panel is the
    // worse outcome.
    console.error(`Supabase metrics write failed: ${error.message}`);
    return;
  }
  console.log(`Mirrored ${rows.length} metric rows into public.listing_metrics.`);
}

async function main() {
  const watch = process.argv.includes("--watch");

  const full = await loadFullListings();
  if (!full || full.length === 0) {
    throw new Error("Could not load KOLS from src/lib/kols.ts — run this from inside the project.");
  }
  listings = full;
  if (process.env["SAMPLE"] === "1") listings = full.slice(0, 3);
  console.log(`Indexing ${listings.length} wallets.`);

  await once();
  if (watch) {
    console.log(`\nWatching — refreshing every ${REFRESH_MIN} min. Ctrl-C to stop.`);
    setInterval(() => {
      once().catch((e) => console.error("refresh failed:", e.message));
    }, REFRESH_MIN * 60_000);
  }
}

/**
 * CLI only when this file is the program. oracle/run.ts imports publishScores
 * and loadFullListings from here; without this guard that import would also
 * kick off a full indexing run as a side effect.
 */
const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
