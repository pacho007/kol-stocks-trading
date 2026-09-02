/**
 * indexer.ts — Helius on-chain indexer
 * ------------------------------------
 * Reads PUBLIC on-chain swap history for a set of wallets, reconstructs
 * per-token positions to derive realized PnL / win-rate / volume / trades,
 * and feeds the result into the existing scoreCohort() from score.ts.
 *
 * This is READ-ONLY. It fetches transaction history. It never signs, never
 * moves funds, never needs a private key. The Helius API key is read from
 * the environment — NEVER hardcode it, never ship it to the frontend.
 *
 * Run:
 *   HELIUS_API_KEY=xxxxx npx tsx oracle/indexer.ts
 *
 * Accuracy note: realized PnL from raw history is approximate on the first
 * pass. It handles the common case (buy token with SOL, later sell token for
 * SOL) well. Airdrops, LP actions, and exotic routes are ignored or logged.
 * The `PnlProvider` seam lets you swap in a dedicated PnL API later without
 * touching the scorer.
 */

import {
  scoreCohort,
  scoreToAnchor,
  applyRateCap,
  BASE_PRICE,
  type RawMetrics,
} from "./score.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Helius is SOLANA-ONLY and is now just one possible PnL provider — the app
 * runs on Robinhood Chain, where oracle/blockscout-provider.ts supplies
 * metrics instead. So a missing key is NOT fatal at import time any more:
 * this module also exports the chain-agnostic scoring orchestration
 * (runOracle/scoreCohort) that the EVM path depends on, and hard-exiting here
 * would take the whole EVM pipeline down over a credential it never uses.
 * HeliusPnlProvider itself throws if actually called without a key.
 */
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

function requireHeliusKey(): string {
  if (!HELIUS_API_KEY) {
    throw new Error(
      "HeliusPnlProvider needs HELIUS_API_KEY (Solana only). On Robinhood Chain " +
        "use EvmPnlProvider (oracle/evm-pnl-provider.ts) instead.",
    );
  }
  return HELIUS_API_KEY;
}

const HELIUS_BASE = "https://api.helius.xyz/v0";
const WRAPPED_SOL = "So11111111111111111111111111111111111111112";
const LAMPORTS = 1e9;

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
// Helius enhanced transactions
// ---------------------------------------------------------------------------

type HeliusTokenTransfer = {
  fromUserAccount: string;
  toUserAccount: string;
  mint: string;
  tokenAmount: number;
};

type HeliusNativeTransfer = {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number; // lamports
};

/**
 * Helius pre-parses swaps into `events.swap`. This is the reliable path — it
 * normalizes Pump.fun, Jupiter, Raydium etc. into one shape, so we don't have
 * to reverse-engineer raw transfers per-DEX. Shapes per Helius docs:
 *   nativeInput/nativeOutput: { account, amount }  (amount = lamports string)
 *   tokenInputs/tokenOutputs: [{ mint, tokenAmount, userAccount, ... }]
 *   innerSwaps: nested legs for aggregator routes (Jupiter)
 */
type HeliusSwapAmount = { account?: string; amount?: string | number };
type HeliusSwapToken = {
  mint?: string;
  tokenAmount?: string | number;
  userAccount?: string;
  rawTokenAmount?: { tokenAmount?: string; decimals?: number };
};
type HeliusSwapEvent = {
  nativeInput?: HeliusSwapAmount | null;
  nativeOutput?: HeliusSwapAmount | null;
  tokenInputs?: HeliusSwapToken[];
  tokenOutputs?: HeliusSwapToken[];
  innerSwaps?: HeliusSwapEvent[];
};

type HeliusTx = {
  timestamp: number;
  type: string;
  feePayer?: string;
  tokenTransfers?: HeliusTokenTransfer[];
  nativeTransfers?: HeliusNativeTransfer[];
  events?: { swap?: HeliusSwapEvent };
};

/**
 * Page through a wallet's enhanced transaction history until we pass the
 * window cutoff or run out. Helius paginates via `before` (a signature).
 */
async function fetchWalletTxs(wallet: string): Promise<HeliusTx[]> {
  const out: HeliusTx[] = [];
  let before: string | undefined;

  for (let page = 0; page < 20; page++) {
    const url =
      `${HELIUS_BASE}/addresses/${wallet}/transactions` +
      `?api-key=${requireHeliusKey()}&limit=100` +
      (before ? `&before=${before}` : "");

    const res = await fetch(url);
    if (!res.ok) {
      // 429 = rate limited; back off and retry once
      if (res.status === 429) {
        await sleep(1200);
        continue;
      }
      console.warn(`  ${short(wallet)}: HTTP ${res.status}, stopping paging`);
      break;
    }

    const batch = (await res.json()) as (HeliusTx & { signature?: string })[];
    if (!Array.isArray(batch) || batch.length === 0) break;

    out.push(...batch);
    const last = batch[batch.length - 1];
    before = (last as { signature?: string }).signature;

    // stop once we've paged past the scoring window
    if (last.timestamp && last.timestamp < LAUNCH_TS) break;
    await sleep(250); // be gentle on rate limits
  }

  return out.filter((t) => (t.timestamp ?? 0) >= LAUNCH_TS);
}

// ---------------------------------------------------------------------------
// Position reconstruction  ->  RawMetrics
// ---------------------------------------------------------------------------

type Lot = { costSol: number }; // simple average-cost accounting

/**
 * Walk a wallet's swaps, matching SOL-in/token-out (buys) and
 * token-in/SOL-out (sells) to compute realized PnL with average cost basis.
 */
function metricsForWallet(wallet: string, txs: HeliusTx[]): RawMetrics {
  // per-mint running position: total tokens held and total SOL cost
  const book = new Map<string, { qty: number; cost: number }>();

  let realizedPnlSol = 0;
  let volumeSol = 0;
  let closedTrades = 0;
  let wins = 0;

  // process oldest -> newest so cost basis builds correctly
  const ordered = [...txs].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  for (const tx of ordered) {
    // Prefer Helius's PARSED swap event — reliable across Pump.fun / Jupiter /
    // Raydium. Fall back to raw-transfer reconstruction only if absent.
    const parsed = swapFromEvent(wallet, tx) ?? swapFromTransfers(wallet, tx);
    if (!parsed) continue;

    const { mint, amount, solDelta } = parsed;
    if (mint === WRAPPED_SOL) continue;

    const pos = book.get(mint) ?? { qty: 0, cost: 0 };

    if (amount > 0 && solDelta < 0) {
      // BUY: received `amount` tokens, paid ~`-solDelta` SOL
      const spent = -solDelta;
      pos.qty += amount;
      pos.cost += spent;
      volumeSol += spent;
      book.set(mint, pos);
    } else if (amount < 0 && solDelta > 0) {
      // SELL: gave up `-amount` tokens, received `solDelta` SOL
      const soldQty = -amount;
      const proceeds = solDelta;
      volumeSol += proceeds;

      const avgCost = pos.qty > 0 ? pos.cost / pos.qty : 0;
      const costOfSold = avgCost * Math.min(soldQty, pos.qty);
      const pnl = proceeds - costOfSold;

      realizedPnlSol += pnl;
      closedTrades += 1;
      if (pnl > 0) wins += 1;

      pos.qty = Math.max(0, pos.qty - soldQty);
      pos.cost = pos.qty > 0 ? avgCost * pos.qty : 0;
      book.set(mint, pos);
    }
    // other shapes (token->token, transfers, airdrops) are intentionally
    // ignored in this first pass.
  }

  return {
    id: wallet, // caller remaps to the listing id
    realizedPnlSol,
    winRate: closedTrades > 0 ? wins / closedTrades : 0,
    volumeSol,
    trades: closedTrades,
  };
}

/** Normalized swap for one tx: +amount = tokens received, +solDelta = SOL received. */
type ParsedSwap = { mint: string; amount: number; solDelta: number };

const toNum = (v: string | number | undefined | null): number =>
  v == null ? 0 : typeof v === "number" ? v : Number(v) || 0;

/**
 * Extract a swap from Helius's PARSED `events.swap`, flattening Jupiter's
 * `innerSwaps`. This is the reliable path — Helius already normalized the DEX.
 * Returns the wallet's net SOL movement and the dominant non-SOL token moved.
 */
function swapFromEvent(wallet: string, tx: HeliusTx): ParsedSwap | null {
  const sw = tx.events?.swap;
  if (!sw) return null;

  // collect this level + all nested legs (aggregator routes)
  const legs: HeliusSwapEvent[] = [];
  const walk = (e: HeliusSwapEvent) => {
    legs.push(e);
    for (const inner of e.innerSwaps ?? []) walk(inner);
  };
  walk(sw);

  let solLamports = 0; // + = wallet received SOL
  const byMint = new Map<string, number>(); // + = wallet received token

  for (const leg of legs) {
    // native SOL in = wallet SPENT sol (paid in); native out = wallet RECEIVED
    if (leg.nativeInput && (leg.nativeInput.account === wallet || !leg.nativeInput.account)) {
      solLamports -= toNum(leg.nativeInput.amount);
    }
    if (leg.nativeOutput && (leg.nativeOutput.account === wallet || !leg.nativeOutput.account)) {
      solLamports += toNum(leg.nativeOutput.amount);
    }
    // tokenInputs = tokens the wallet PUT IN (sold); tokenOutputs = RECEIVED
    for (const t of leg.tokenInputs ?? []) {
      if (t.userAccount && t.userAccount !== wallet) continue;
      if (!t.mint || t.mint === WRAPPED_SOL) continue;
      byMint.set(t.mint, (byMint.get(t.mint) ?? 0) - tokenAmt(t));
    }
    for (const t of leg.tokenOutputs ?? []) {
      if (t.userAccount && t.userAccount !== wallet) continue;
      if (!t.mint || t.mint === WRAPPED_SOL) continue;
      byMint.set(t.mint, (byMint.get(t.mint) ?? 0) + tokenAmt(t));
    }
  }

  // dominant token moved
  let best: { mint: string; amount: number } | null = null;
  for (const [mint, amount] of byMint) {
    if (amount !== 0 && (!best || Math.abs(amount) > Math.abs(best.amount))) best = { mint, amount };
  }
  if (!best) return null;
  return { mint: best.mint, amount: best.amount, solDelta: solLamports / LAMPORTS };
}

function tokenAmt(t: HeliusSwapToken): number {
  if (t.rawTokenAmount?.tokenAmount != null && t.rawTokenAmount.decimals != null) {
    return Number(t.rawTokenAmount.tokenAmount) / 10 ** t.rawTokenAmount.decimals;
  }
  return toNum(t.tokenAmount);
}

/**
 * Fallback: reconstruct from raw native + token transfers when there's no
 * parsed swap event. Less reliable but covers simple/older transactions.
 */
function swapFromTransfers(wallet: string, tx: HeliusTx): ParsedSwap | null {
  let lamports = 0;
  for (const n of tx.nativeTransfers ?? []) {
    if (n.toUserAccount === wallet) lamports += n.amount;
    if (n.fromUserAccount === wallet) lamports -= n.amount;
  }
  const byMint = new Map<string, number>();
  for (const t of tx.tokenTransfers ?? []) {
    if (t.mint === WRAPPED_SOL) continue;
    let d = 0;
    if (t.toUserAccount === wallet) d += t.tokenAmount;
    if (t.fromUserAccount === wallet) d -= t.tokenAmount;
    if (d !== 0) byMint.set(t.mint, (byMint.get(t.mint) ?? 0) + d);
  }
  let best: { mint: string; amount: number } | null = null;
  for (const [mint, amount] of byMint) {
    if (!best || Math.abs(amount) > Math.abs(best.amount)) best = { mint, amount };
  }
  if (!best) return null;
  return { mint: best.mint, amount: best.amount, solDelta: lamports / LAMPORTS };
}

// ---------------------------------------------------------------------------
// PnL provider seam — swap this for a dedicated PnL API later if you want
// ---------------------------------------------------------------------------

export interface PnlProvider {
  metrics(wallet: string): Promise<RawMetrics>;
}

export const HeliusPnlProvider: PnlProvider = {
  async metrics(wallet: string) {
    const txs = await fetchWalletTxs(wallet);
    return metricsForWallet(wallet, txs);
  },
};

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
  provider: PnlProvider = HeliusPnlProvider,
  prevAnchors: Record<string, number> = {},
): Promise<OracleRow[]> {
  console.log(`Indexing ${listings.length} wallets since launch ${new Date(LAUNCH_TS * 1000).toISOString()}...`);

  // Concurrency-limited batching so hundreds of wallets don't hammer Helius.
  // CONCURRENCY simultaneous requests; tune down if you hit rate limits.
  const CONCURRENCY = Number(process.env.INDEXER_CONCURRENCY ?? 4);
  const raw: RawMetrics[] = new Array(listings.length);
  let done = 0;

  async function worker(startIdx: number) {
    for (let i = startIdx; i < listings.length; i += CONCURRENCY) {
      const { id, wallet } = listings[i];
      try {
        const m = await provider.metrics(wallet);
        raw[i] = { ...m, id };
      } catch (e) {
        console.warn(`  ${id} ${short(wallet)} failed: ${(e as Error).message}`);
        raw[i] = { id, realizedPnlSol: 0, winRate: 0, volumeSol: 0, trades: 0 };
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

  const scored = scoreCohort(raw);

  return scored.map((s) => {
    const target = scoreToAnchor(s.score);
    const prev = prevAnchors[s.id] ?? BASE_PRICE; // everyone starts equal
    const capped = applyRateCap(prev, target);
    return {
      id: s.id,
      wallet: listings.find((l) => l.id === s.id)!.wallet,
      score: s.score,
      metrics: { id: s.id, realizedPnlSol: s.realizedPnlSol, winRate: s.winRate, volumeSol: s.volumeSol, trades: s.trades },
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
  // Small real sample. Replace with your full KOLS list when ready:
  //   import { KOLS } from "../src/lib/kols.js";
  //   const listings = KOLS.map(k => ({ id: k.id, wallet: k.wallet }));
  const sample: ListingInput[] = [
    { id: "cented", wallet: "CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o" },
    { id: "cupsey", wallet: "2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f" },
    { id: "orangie", wallet: "DuQabFqdC9eeBULVa7TTdZYxe8vK8ct5DZr4Xcf7docy" },
  ];

  const rows = await runOracle(sample);

  console.log("\n=== Oracle output (opens equal, price earned by score) ===\n");
  console.log(["id", "score", "targetAnchor(SOL)"].join("\t"));
  for (const r of rows.sort((a, b) => b.score - a.score)) {
    console.log([r.id, r.score, r.targetAnchor.toFixed(6)].join("\t"));
  }
  console.log(
    "\nThis is real on-chain data feeding the exact same scorer the demo used.",
  );
}

// run only if invoked directly (not when imported, e.g. by publish.ts)
if (process.argv[1] && toPath(import.meta.url) === resolvePath(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
