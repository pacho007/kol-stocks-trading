/**
 * publish.ts — the bridge between the indexer and the frontend.
 * ------------------------------------------------------------
 * Runs the oracle (indexer -> score) over your listings and writes a plain
 * JSON file the frontend fetches. This is the seam that turns the app from
 * "simulated scores" into "real performance-driven prices".
 *
 * One-shot:
 *   HELIUS_API_KEY=xxxx npx tsx oracle/publish.ts
 *
 * Refresh on a schedule (every REFRESH_MIN minutes):
 *   HELIUS_API_KEY=xxxx npx tsx oracle/publish.ts --watch
 *
 * Output: writes `public/scores.json` so the frontend can fetch it at
 * `/scores.json` with no extra server. (For production you'd serve this from
 * a tiny API or object storage instead, but a static file works to go live.)
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runOracle, type ListingInput } from "./indexer.js";
import { RpcPnlProvider } from "./rpc-provider.js";
import { scoreToPriceUsd, SHARES_PER_LISTING } from "./pricing.js";

/**
 * Load the full KOL list from the app source if it's alongside the oracle
 * (i.e. oracle/ lives inside the project). If the oracle folder is standalone
 * (e.g. downloaded on its own), this import won't resolve — we catch that and
 * fall back to the sample, so the publisher never crashes.
 */
async function loadFullListings(): Promise<ListingInput[] | null> {
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
const REFRESH_MIN = Number(process.env.REFRESH_MIN ?? 20); // 20 min default — sane for ~558 wallets; override with REFRESH_MIN=n

/**
 * Listings. Full list by default; set SAMPLE=1 to test on 3 wallets first:
 *   SAMPLE=1 npx tsx oracle/publish.ts
 */
const SAMPLE_LISTINGS: ListingInput[] = [
  { id: "cented", wallet: "CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o" },
  { id: "cupsey", wallet: "2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f" },
  { id: "orangie", wallet: "DuQabFqdC9eeBULVa7TTdZYxe8vK8ct5DZr4Xcf7docy" },
];

let listings: ListingInput[] = SAMPLE_LISTINGS; // resolved in main()

/** Live SOL/USD price, trying several public feeds before falling back. */
async function fetchSolPriceUsd(): Promise<number> {
  const FALLBACK = 150;
  const sources: Array<() => Promise<number | null>> = [
    // Coinbase spot
    async () => {
      const r = await fetch("https://api.coinbase.com/v2/prices/SOL-USD/spot");
      if (!r.ok) return null;
      const j = (await r.json()) as { data?: { amount?: string } };
      const p = Number(j.data?.amount);
      return p > 0 ? p : null;
    },
    // Jupiter lite
    async () => {
      const r = await fetch("https://lite-api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112");
      if (!r.ok) return null;
      const j = (await r.json()) as { data?: Record<string, { price?: string | number }> };
      const p = Number(j.data?.["So11111111111111111111111111111111111111112"]?.price);
      return p > 0 ? p : null;
    },
    // Coingecko
    async () => {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
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

type PublishedRow = {
  id: string;
  score: number;
  priceUsd: number;
  marketCapUsd: number;
  metrics: { realizedPnlSol: number; winRate: number; volumeSol: number; trades: number };
};

type Published = {
  updatedAt: string;
  solPriceUsd: number;
  sharesPerListing: number;
  rows: PublishedRow[];
};

/** carry anchors across runs so the rate-cap smooths score->price over time */
let prevAnchors: Record<string, number> = {};

async function once(): Promise<void> {
  const solPriceUsd = await fetchSolPriceUsd();
  const rows = await runOracle(listings, RpcPnlProvider, prevAnchors);
  prevAnchors = Object.fromEntries(rows.map((r) => [r.id, r.targetAnchor]));

  const published: Published = {
    updatedAt: new Date().toISOString(),
    solPriceUsd,
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
        },
      };
    }),
  };

  const json = JSON.stringify(published, null, 2);
  for (const target of OUT_TARGETS) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, json, "utf8");
  }
  const top = published.rows.filter((r) => r.score !== 50).sort((a, b) => b.score - a.score).slice(0, 8);
  console.log(
    `\nSOL $${solPriceUsd.toFixed(2)} · wrote ${published.rows.length} scores -> ${OUT_TARGETS.join(", ")}` +
      (top.length
        ? `\n  movers:\n` +
          top.map((r) => `    ${r.id.padEnd(10)} score ${String(r.score).padStart(3)}  $${r.priceUsd.toFixed(4)}`).join("\n")
        : `\n  (all at neutral 50 — no post-launch trades counted yet)`),
  );
}

async function main() {
  const watch = process.argv.includes("--watch");

  // Resolve which wallets to index.
  if (process.env.SAMPLE === "1") {
    listings = SAMPLE_LISTINGS;
    console.log(`Using SAMPLE list (${listings.length} wallets).`);
  } else {
    const full = await loadFullListings();
    if (full) {
      listings = full;
      console.log(`Using FULL list from app source (${listings.length} wallets).`);
    } else {
      listings = SAMPLE_LISTINGS;
      console.log(
        `App source (src/lib/kols) not found next to oracle/. Falling back to ` +
          `SAMPLE (${listings.length} wallets). To index all wallets, run this ` +
          `from inside the project so ../src/lib/kols.ts resolves, or set SAMPLE=1 to silence this.`,
      );
    }
  }

  await once();
  if (watch) {
    console.log(`\nWatching — refreshing every ${REFRESH_MIN} min. Ctrl-C to stop.`);
    setInterval(() => {
      once().catch((e) => console.error("refresh failed:", e.message));
    }, REFRESH_MIN * 60_000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
