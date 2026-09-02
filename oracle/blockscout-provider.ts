/**
 * blockscout-provider.ts — real PnL metrics for Robinhood Chain wallets.
 * ---------------------------------------------------------------------------
 * Reads a wallet's PUBLIC trade history from Blockscout (the official
 * Robinhood Chain explorer, see docs.robinhood.com/chain/connecting) and
 * reconstructs realized PnL, win rate, volume and trade count using the same
 * average-cost accounting oracle/indexer.ts applies, so a score means the
 * same thing regardless of which provider produced the metrics.
 *
 * WHY BLOCKSCOUT AND NOT GMGN: GMGN's site shows native Robinhood Chain
 * wallet data, but their documented Agent API still supports only SOL / BSC /
 * Base (re-verified against docs.gmgn.ai — "Integration for ETH and other new
 * chains is currently in progress"). Using GMGN today would mean scraping
 * their site on a live cadence. Blockscout is an officially documented API for
 * this exact chain, so it's the one thing here that isn't built on a scrape.
 *
 * READ-ONLY. Never signs, never moves funds, needs no private key.
 *
 * ACCURACY NOTE (same caveat as the Solana original): realized PnL from raw
 * history is approximate. It handles the common case — buy a token with the
 * native coin, later sell it back — well. Token->token swaps, LP actions and
 * airdrops are deliberately ignored rather than guessed at.
 */

import type { RawMetrics } from "./score.js";
import type { PnlProvider } from "./indexer.js";

const BASE_URL = process.env["BLOCKSCOUT_URL"] ?? "https://robinhoodchain.blockscout.com";

/**
 * Blockscout sits behind Cloudflare and returns an interstitial challenge to
 * requests without a browser-shaped User-Agent. This is not an attempt to
 * evade a bot policy — the API is public and documented — it's the minimum
 * needed for a plain server-side fetch to reach it at all.
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

/** Bound work per wallet so one hyperactive address can't stall a whole cycle. */
const MAX_PAGES = Number(process.env["BLOCKSCOUT_MAX_PAGES"] ?? 6);
/**
 * Blockscout's public API rate-limits aggressively. This gap is applied
 * before EVERY request including retries (see `pace()`), and the whole
 * module shares one queue, so raising oracle/indexer.ts's INDEXER_CONCURRENCY
 * does not increase the request rate here — it only adds wallets waiting on
 * the same queue.
 *
 * Raised from 400ms after a full 108-wallet run: at 400ms (2.5 req/s) the
 * limiter did not merely delay requests, it exhausted all six retries on
 * individual wallets — 1.5s through 48s of backoff was not enough to get back
 * under the limit. An exhausted wallet yields all-zero metrics, which
 * scoreCohort's fresh-start branch reads as "has not traded yet" and scores at
 * a neutral 50 with confidence 0. So no false ranking is invented; the cost is
 * that a rate-limited trader is indistinguishable from an inactive one, and
 * quietly stops being priced on their actual record until a later cycle
 * happens to fetch them.
 *
 * A full cycle is roughly 108 wallets x up to MAX_PAGES requests, so at 1s
 * that is ~11 minutes: still inside the oracle's default 20 minute refresh,
 * with room to spare.
 *
 * For production this wants an authenticated endpoint rather than a slower
 * crawl of a free public one. Blockscout issues API keys, and Alchemy supports
 * Robinhood Chain; either raises the ceiling far above what pacing alone can
 * buy, and neither leaves score correctness dependent on someone else's
 * unmetered goodwill.
 */
const MIN_GAP_MS = Number(process.env["BLOCKSCOUT_GAP_MS"] ?? (hasApiKey() ? 250 : 1000));

/**
 * An API key raises the ceiling that pacing can only ration. Blockscout issues
 * them free; with one the crawl can run roughly 4x faster, which is the
 * difference between an 11 minute cycle and under 3.
 *
 * Read through a function rather than a const so MIN_GAP_MS above can consult
 * it during module init without depending on declaration order.
 */
function hasApiKey(): boolean {
  return Boolean(process.env["BLOCKSCOUT_API_KEY"]);
}

/** Only trades AFTER this point count — mirrors indexer.ts's LAUNCH GATE. */
const LAUNCH_TS = Number(process.env["LAUNCH_TS"] ?? 0);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastCall = 0;
let chain: Promise<void> = Promise.resolve();

/**
 * Take a slot in the global request queue. Every attempt goes through this —
 * including retries. Acquiring it only once per api() call was the original
 * bug: a 429 would then retry immediately and unpaced, so a rate limit turned
 * into a burst that guaranteed more rate limiting.
 */
async function pace(): Promise<void> {
  const run = chain.then(async () => {
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastCall));
    if (wait) await sleep(wait);
    lastCall = Date.now();
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  await run;
}

/**
 * Paced fetch with retry. A failure here must NEVER look like a legitimate
 * empty result to the caller — that's the exact bug that made Solana scores
 * shuffle between runs (a rate limit read as "end of history" silently
 * truncated a wallet's trades). Exhausted retries throw.
 */
async function api<T>(path: string, tries = 6): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    await pace();
    try {
      // The key goes in the query string, which is where Blockscout reads it.
      // Appended rather than substituted so callers building paths stay
      // unaware of it; `path` always already carries a `?` or an `&`.
      const key = process.env["BLOCKSCOUT_API_KEY"];
      const url = key
        ? `${BASE_URL}${path}${path.includes("?") ? "&" : "?"}apikey=${encodeURIComponent(key)}`
        : `${BASE_URL}${path}`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
      if (res.status === 429 || res.status >= 500) {
        // Back off hard and, crucially, push the shared queue's next slot out
        // too — otherwise every other in-flight wallet keeps hammering while
        // this one waits, and the limiter never gets a chance to recover.
        const backoff = 1500 * 2 ** attempt;
        lastCall = Date.now() + backoff;
        throw new Error(`Blockscout ${res.status}`);
      }
      if (!res.ok) throw new Error(`Blockscout ${res.status} for ${path}`);
      const text = await res.text();
      if (text.startsWith("<")) throw new Error("Blockscout returned HTML (challenge page)");
      return JSON.parse(text) as T;
    } catch (e) {
      lastErr = e;
      await sleep(600 * (attempt + 1));
    }
  }
  throw new Error(
    `Blockscout request failed after ${tries} tries: ${path} — ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

type NextPageParams = Record<string, string | number> | null;

type TokenTransfer = {
  transaction_hash: string;
  timestamp: string;
  from: { hash: string } | null;
  to: { hash: string } | null;
  token: { address?: string; address_hash?: string; symbol?: string; decimals?: string } | null;
  total: { value: string; decimals: string } | null;
};

type Tx = {
  hash: string;
  timestamp: string;
  value: string;
  from: { hash: string } | null;
  to: { hash: string } | null;
};

type InternalTx = {
  transaction_hash: string;
  value: string;
  from: { hash: string } | null;
  to: { hash: string } | null;
};

type Paged<T> = { items?: T[]; next_page_params?: NextPageParams };

function qs(params: NextPageParams): string {
  if (!params) return "";
  return (
    "&" +
    Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&")
  );
}

async function fetchAllPages<T>(basePath: string): Promise<T[]> {
  const out: T[] = [];
  let next: NextPageParams = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const sep = basePath.includes("?") ? "" : "?";
    const data: Paged<T> = await api<Paged<T>>(`${basePath}${sep}${qs(next)}`);
    const items = data.items ?? [];
    out.push(...items);
    if (!data.next_page_params || items.length === 0) break;
    next = data.next_page_params;
  }
  return out;
}

const eq = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

function tokenAmount(t: TokenTransfer): number {
  if (!t.total) return 0;
  const decimals = Number(t.total.decimals ?? t.token?.decimals ?? 18);
  return Number(t.total.value) / 10 ** decimals;
}

/** Native-coin wrapper is treated as the quote asset, never as a position. */
function isWrappedNative(t: TokenTransfer): boolean {
  const sym = t.token?.symbol?.toUpperCase();
  return sym === "WETH" || sym === "ETH";
}

/** A single closed position, kept for the biggest wins/losses display. */
export type ClosedTrade = {
  symbol: string;
  /** Realized PnL for this close, in the native coin. */
  pnl: number;
  /** Native received on the close. */
  proceeds: number;
  ts: number;
  /** proceeds / cost basis. Null when there was no recorded basis. */
  multiple: number | null;
};

/** Fall back to a shortened contract address when a token has no symbol. */
function shortToken(addr: string): string {
  return addr.startsWith("0x") && addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/** Per-transaction net movement for this wallet: dominant token + native delta. */
type Movement = {
  ts: number;
  token: string;
  amount: number;
  nativeDelta: number;
  /** Ticker for display; the `token` key itself is a contract address. */
  symbol?: string;
};

async function movementsForWallet(wallet: string): Promise<Movement[]> {
  const addr = wallet.toLowerCase();

  const [transfers, txs, internals] = await Promise.all([
    fetchAllPages<TokenTransfer>(`/api/v2/addresses/${addr}/token-transfers?type=ERC-20`),
    fetchAllPages<Tx>(`/api/v2/addresses/${addr}/transactions`),
    fetchAllPages<InternalTx>(`/api/v2/addresses/${addr}/internal-transactions`),
  ]);

  // native delta per tx: direct value + internal transfers + WETH legs
  const nativeByTx = new Map<string, number>();
  const bump = (hash: string, delta: number) =>
    nativeByTx.set(hash, (nativeByTx.get(hash) ?? 0) + delta);

  for (const tx of txs) {
    const v = Number(tx.value) / 1e18;
    if (!v) continue;
    if (eq(tx.from?.hash, addr)) bump(tx.hash, -v);
    if (eq(tx.to?.hash, addr)) bump(tx.hash, v);
  }
  for (const it of internals) {
    const v = Number(it.value) / 1e18;
    if (!v) continue;
    if (eq(it.from?.hash, addr)) bump(it.transaction_hash, -v);
    if (eq(it.to?.hash, addr)) bump(it.transaction_hash, v);
  }

  // token deltas per tx, with WETH folded into the native side instead
  const tokensByTx = new Map<string, Map<string, number>>();
  const symbolByToken = new Map<string, string>();
  const tsByTx = new Map<string, number>();

  for (const t of transfers) {
    const hash = t.transaction_hash;
    const ts = Math.floor(new Date(t.timestamp).getTime() / 1000);
    if (Number.isFinite(ts)) tsByTx.set(hash, ts);

    const amt = tokenAmount(t);
    if (!amt) continue;
    let delta = 0;
    if (eq(t.to?.hash, addr)) delta += amt;
    if (eq(t.from?.hash, addr)) delta -= amt;
    if (!delta) continue;

    if (isWrappedNative(t)) {
      bump(hash, delta);
      continue;
    }
    const key = (t.token?.address ?? t.token?.address_hash ?? t.token?.symbol ?? "?").toLowerCase();
    if (t.token?.symbol) symbolByToken.set(key, t.token.symbol);
    const inner = tokensByTx.get(hash) ?? new Map<string, number>();
    inner.set(key, (inner.get(key) ?? 0) + delta);
    tokensByTx.set(hash, inner);
  }
  for (const tx of txs) {
    const ts = Math.floor(new Date(tx.timestamp).getTime() / 1000);
    if (Number.isFinite(ts) && !tsByTx.has(tx.hash)) tsByTx.set(tx.hash, ts);
  }

  const movements: Movement[] = [];
  for (const [hash, byToken] of tokensByTx) {
    // dominant token moved in this tx — same rule the Solana path uses
    let best: { token: string; amount: number } | null = null;
    for (const [token, amount] of byToken) {
      if (amount !== 0 && (!best || Math.abs(amount) > Math.abs(best.amount))) {
        best = { token, amount };
      }
    }
    if (!best) continue;
    const sym = symbolByToken.get(best.token);
    movements.push({
      ts: tsByTx.get(hash) ?? 0,
      token: best.token,
      amount: best.amount,
      nativeDelta: nativeByTx.get(hash) ?? 0,
      ...(sym ? { symbol: sym } : {}),
    });
  }
  return movements;
}

/**
 * Average-cost book, oldest -> newest. Intentionally identical in shape to
 * oracle/indexer.ts::metricsForWallet so the two chains score the same way.
 */
export function metricsFromMovements(wallet: string, movements: Movement[]): RawMetrics {
  const book = new Map<string, { qty: number; cost: number }>();
  let realizedPnlEth = 0;
  let volumeEth = 0;
  let closedTrades = 0;
  let wins = 0;

  const ordered = [...movements].filter((m) => m.ts >= LAUNCH_TS).sort((a, b) => a.ts - b.ts);

  // Every closed position, kept so the biggest winners/losers can be shown
  // next to the score. The PnL per close is already computed below; it used
  // to be folded into the running total and thrown away.
  const closes: ClosedTrade[] = [];

  for (const { ts, token, amount, nativeDelta, symbol } of ordered) {
    const pos = book.get(token) ?? { qty: 0, cost: 0 };

    if (amount > 0 && nativeDelta < 0) {
      // BUY: received tokens, paid native
      const spent = -nativeDelta;
      pos.qty += amount;
      pos.cost += spent;
      volumeEth += spent;
      book.set(token, pos);
    } else if (amount < 0 && nativeDelta > 0) {
      // SELL: gave up tokens, received native
      const soldQty = -amount;
      const proceeds = nativeDelta;
      volumeEth += proceeds;

      const avgCost = pos.qty > 0 ? pos.cost / pos.qty : 0;
      const costOfSold = avgCost * Math.min(soldQty, pos.qty);
      const pnl = proceeds - costOfSold;

      realizedPnlEth += pnl;
      closedTrades += 1;
      if (pnl > 0) wins += 1;

      closes.push({
        symbol: symbol ?? shortToken(token),
        pnl,
        proceeds,
        ts,
        // Return multiple on the capital actually at risk in this close.
        // Guarded: a close with no recorded cost basis (an airdropped or
        // transferred-in token sold for the first time) would otherwise
        // divide by zero and report an infinite return.
        multiple: costOfSold > 0 ? proceeds / costOfSold : null,
      });

      pos.qty = Math.max(0, pos.qty - soldQty);
      pos.cost = pos.qty > 0 ? avgCost * pos.qty : 0;
      book.set(token, pos);
    }
    // token->token swaps, transfers and airdrops are deliberately skipped
  }

  // Biggest winners and losers, largest magnitude first. Kept small — this
  // is evidence for the score, not a full trade log.
  const byPnl = [...closes].sort((a, b) => b.pnl - a.pnl);
  const topWins = byPnl.filter((c) => c.pnl > 0).slice(0, 3);
  const topLosses = byPnl
    .filter((c) => c.pnl < 0)
    .slice(-3)
    .reverse();

  return {
    id: wallet, // caller remaps to the listing id
    realizedPnlEth,
    winRate: closedTrades > 0 ? wins / closedTrades : 0,
    volumeEth,
    trades: closedTrades,
    topWins,
    topLosses,
  };
}

export const BlockscoutPnlProvider: PnlProvider = {
  async metrics(wallet: string): Promise<RawMetrics> {
    const movements = await movementsForWallet(wallet);
    return metricsFromMovements(wallet, movements);
  },
};
