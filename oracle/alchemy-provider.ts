/**
 * alchemy-provider.ts — wallet history from Alchemy's Transfers API.
 *
 * WHY THIS EXISTS
 *
 * The Blockscout provider reads three public endpoints per wallet and walks
 * them backwards page by page until it passes the launch gate. That works, but
 * it inherits two problems from the shape of the API. The first is reliability:
 * the public instance returned HTTP 500 for the majority of wallets for hours
 * at a time, and at an 87% failure rate the cohort guard correctly refuses to
 * publish a ranking at all, so the board simply stops updating. The second is
 * that "walk backwards until you have enough" has to be bounded by something,
 * and whatever that bound is, exceeding it silently produces a partial history
 * scored as a complete one. That bug shipped: a wallet with 6,426 transactions
 * had roughly its last two days read and scored as three weeks, and ranked
 * last on the board while profitable across the whole window.
 *
 * alchemy_getAssetTransfers removes both. It takes `fromBlock`, so the window
 * is *requested* rather than approached — there is no walk to truncate and no
 * cap to exceed. It returns external, internal and ERC-20 transfers from one
 * call instead of three endpoints, pages 1,000 rows at a time instead of 50,
 * and is a paid service rather than a public one.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * No scoring. It produces Movement[] and hands them to metricsFromMovements in
 * blockscout-provider.ts, which stays the single implementation of the cost
 * book. Two providers with two accountings would be two different products.
 *
 * CONFIGURE
 *
 *   ALCHEMY_RPC_URL=https://robinhood-mainnet.g.alchemy.com/v2/<key>
 *
 * The URL carries the key, so it is a secret and is never logged — only its
 * host appears in output. Absent, run.ts falls back to Blockscout.
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { LAUNCH_TS } from "./indexer.js";
import type { PnlProvider } from "./indexer.js";
import type { RawMetrics } from "./score.js";
import { metricsFromMovements, type Movement } from "./blockscout-provider.js";

const RPC_URL = process.env["ALCHEMY_RPC_URL"] ?? "";

/** Rows per page. Alchemy caps this at 1000; Blockscout's equivalent was 50. */
const PAGE_SIZE = "0x3e8";

/**
 * Concurrent wallets in flight.
 *
 * Was 8, on the assumption that a paid endpoint would not throttle. It does:
 * Alchemy bills compute units per second, and getAssetTransfers is expensive
 * enough that eight wallets in parallel — each issuing two paginated queries —
 * put 118 of 126 wallets into HTTP 429 on the first cycle.
 *
 * 4 with backoff underneath, rather than a larger number that relies on retry
 * to clean up. A cohort pass now takes seconds either way; there is nothing to
 * buy with the extra concurrency.
 */
const MAX_INFLIGHT = Number(process.env["ALCHEMY_CONCURRENCY"] ?? 4);

/** Attempts per request before giving up on a wallet. */
const MAX_RETRIES = Number(process.env["ALCHEMY_RETRIES"] ?? 6);

/** First backoff step; doubles each attempt, with jitter. */
const BACKOFF_BASE_MS = Number(process.env["ALCHEMY_BACKOFF_MS"] ?? 400);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Traces per second, paced to the plan's compute-unit budget.
 *
 * THE MISTAKE THIS REPLACES
 *
 * Throughput was previously bounded by concurrency alone, on the assumption
 * that N in flight against a fast endpoint is N/latency requests per second
 * and that the ceiling was somewhere far above. It is not. Alchemy bills
 * compute units per second, debug_traceTransaction costs ~309 CU, and a Pay
 * As You Go plan allows 10,000 CU/s — so the real ceiling is about 32 traces
 * per second no matter how many sockets are open.
 *
 * Measured latency is ~77ms, so 32 concurrent was attempting roughly 415
 * traces/second: thirteen times the budget. Nearly every request came back
 * 429 and the run's time went into exponential backoff rather than work. A
 * cold pass that should take half an hour was on course for six.
 *
 * Pacing to the budget is what makes it fast. At 77ms latency, ~32/s needs
 * only about three requests in flight; the limiter below spaces starts rather
 * than trusting concurrency to imply a rate.
 *
 * Left below the theoretical 32 because the transfer queries share the same
 * budget, and because a limit hit is far more expensive than a slot left idle.
 */
const TRACES_PER_SEC = Number(process.env["ALCHEMY_TRACES_PER_SEC"] ?? 28);

/** In-flight cap. Only has to be enough to keep the pacer saturated. */
const TRACE_CONCURRENCY = Number(process.env["ALCHEMY_TRACE_CONCURRENCY"] ?? 6);

/** Spaces request starts so the sustained rate cannot exceed the budget. */
let nextTraceSlot = 0;
async function paceTrace(): Promise<void> {
  const gap = 1000 / TRACES_PER_SEC;
  const now = Date.now();
  const at = Math.max(now, nextTraceSlot);
  nextTraceSlot = at + gap;
  if (at > now) await sleep(at - now);
}

/**
 * Net native value a transaction moved to this wallet, keyed by tx hash.
 *
 * The one piece of state this provider keeps, and it is safe to keep forever:
 * a mined transaction's trace never changes. Without it every cycle would
 * re-trace the same history, which is the difference between a few hundred
 * traces a cycle and tens of thousands.
 *
 * Keyed by hash alone rather than by wallet+hash because a trace is resolved
 * for the wallet it was fetched for, and two listed wallets trading with each
 * other in one transaction would need separate entries. That does not happen
 * with a cohort of independent traders, and the key is scoped per wallet in
 * resolveNativeDeltas below to make it impossible rather than unlikely.
 */
const traceCache = new Map<string, number>();

/**
 * Where the trace cache survives a restart.
 *
 * Without this the cache is process-local, so every deploy, scale change or
 * crash discards it and repeats the entire cold pass — hours of work and real
 * money, re-spent to learn what was already known. A mined trace never
 * changes, so there is no staleness to reason about and no invalidation to get
 * wrong: the file is append-only and always correct.
 *
 * A Fly volume rather than a table in Supabase, for the plain reason that the
 * oracle has no service-role key and this is not data anything else reads. A
 * gigabyte costs cents and holds far more entries than this will ever have.
 *
 * NDJSON rather than one JSON document, so a write is an append and a process
 * killed mid-write loses at most the last line instead of the whole cache.
 */
const CACHE_PATH = process.env["TRACE_CACHE_PATH"] ?? "/data/trace-cache.ndjson";
let cacheAppendFailed = false;

function loadTraceCache(): void {
  try {
    if (!existsSync(CACHE_PATH)) return;
    let kept = 0;
    let skipped = 0;
    for (const line of readFileSync(CACHE_PATH, "utf8").split("\n")) {
      if (!line) continue;
      try {
        const [key, delta] = JSON.parse(line) as [string, number];
        if (typeof key === "string" && typeof delta === "number" && Number.isFinite(delta)) {
          traceCache.set(key, delta);
          kept++;
        } else skipped++;
      } catch {
        // A torn final line from a process killed mid-append. Skipping it is
        // the whole reason this file is line-oriented.
        skipped++;
      }
    }
    console.log(
      `Trace cache: ${kept} entries restored from ${CACHE_PATH}` +
        (skipped ? ` (${skipped} unreadable line(s) skipped)` : ""),
    );
  } catch (e) {
    console.warn(`Trace cache: could not read ${CACHE_PATH} — starting cold. ${String(e)}`);
  }
}

function appendTraceCache(key: string, delta: number): void {
  if (cacheAppendFailed) return;
  try {
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    appendFileSync(CACHE_PATH, JSON.stringify([key, delta]) + "\n", "utf8");
  } catch (e) {
    // Warn once. A missing volume must not turn every trace into a failed
    // write; the in-memory cache still works for the life of the process.
    cacheAppendFailed = true;
    console.warn(
      `Trace cache: cannot write ${CACHE_PATH}, continuing in memory only. ` +
        `Restarts will re-trace. ${String(e)}`,
    );
  }
}

loadTraceCache();

/**
 * Transfer categories requested per wallet.
 *
 * "internal" is deliberately absent. Alchemy rejects it outright on this
 * network — `The 'internal' category is not supported for this network` — so
 * including it fails the whole request rather than degrading.
 *
 * That would be a serious loss on most EVM chains, where a DEX sell returns
 * ETH through an internal call and dropping the category would make every sell
 * invisible: positions would open and never close, and the cost book would
 * fill with buys that never realise. Checked against a live wallet before
 * relying on it, and Robinhood Chain does not behave that way — incoming ETH
 * from sells arrives as top-level `external` transfers. A sample of one
 * wallet's ten most recent incoming transfers held three ETH/external rows
 * alongside the token legs.
 *
 * Overridable, because that is an observation about how this chain's routers
 * currently settle rather than a guarantee. If sells ever stop showing up,
 * this is the first thing to revisit.
 */
const CATEGORIES = (process.env["ALCHEMY_CATEGORIES"] ?? "external,erc20")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function hasAlchemy(): boolean {
  return RPC_URL.length > 0;
}

/** Host only — the path carries the API key. */
export function alchemyHost(): string {
  try {
    return new URL(RPC_URL).host;
  } catch {
    return "(invalid ALCHEMY_RPC_URL)";
  }
}

type Transfer = {
  blockNum: string;
  hash: string;
  from: string | null;
  to: string | null;
  /** Decimal-adjusted amount. Null when Alchemy cannot decode the token. */
  value: number | null;
  asset: string | null;
  category: string;
  rawContract: { address: string | null; decimal: string | null } | null;
  metadata?: { blockTimestamp?: string };
};

type JsonRpcError = { code: number; message: string };

/**
 * One JSON-RPC call, retrying the failures that are worth retrying.
 *
 * 429 and 5xx are transient and get exponential backoff with jitter; anything
 * else fails immediately, because retrying a malformed request or a rejected
 * key just burns the wallet's whole retry budget before failing anyway.
 *
 * Jitter matters more than usual here. Requests are issued by a cohort pass
 * that starts many wallets at once, so a fixed backoff would re-synchronise
 * every throttled caller onto the same instant and reproduce the burst that
 * caused the throttling.
 *
 * Alchemy's own Retry-After is honoured when present — it knows better than
 * the doubling schedule does.
 */
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let lastError = "";

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = BACKOFF_BASE_MS * 2 ** (attempt - 1);
      await sleep(backoff + Math.random() * backoff);
    }

    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });

    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get("retry-after"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) await sleep(retryAfter * 1000);
      lastError = `HTTP ${res.status}`;
      continue;
    }

    if (!res.ok) {
      // Status only, never the body. A rejected request can be echoed back,
      // and the request URL carries the key.
      throw new Error(`Alchemy ${method} failed: HTTP ${res.status}`);
    }

    const body = (await res.json()) as { result?: T; error?: JsonRpcError };
    if (body.error) throw new Error(`Alchemy ${method} failed: ${body.error.message}`);
    if (body.result === undefined) throw new Error(`Alchemy ${method} returned no result`);
    return body.result;
  }

  throw new Error(`Alchemy ${method} failed after ${MAX_RETRIES} attempts: ${lastError}`);
}

/**
 * Block number at (or just before) the launch gate, found once and reused.
 *
 * Binary search rather than dividing by an average block time: Robinhood Chain
 * produces a block roughly every 0.2s, so a 1% error in that assumption is
 * ~100,000 blocks, and being wrong on the early side silently widens the
 * scoring window while being wrong on the late side silently narrows it. The
 * search costs about 25 eth_getBlockByNumber calls, once per process.
 *
 * Deliberately lands on the last block at or before the gate, never after:
 * metricsFromMovements filters by timestamp anyway, so a few extra blocks are
 * free while missing blocks would lose real trades.
 */
let launchBlockPromise: Promise<bigint> | null = null;

function resolveLaunchBlock(): Promise<bigint> {
  launchBlockPromise ??= (async () => {
    const tsOf = async (n: bigint): Promise<number> => {
      const b = await rpc<{ timestamp: string } | null>("eth_getBlockByNumber", [
        "0x" + n.toString(16),
        false,
      ]);
      if (!b) throw new Error(`block ${n} not found while locating the launch gate`);
      return Number(BigInt(b.timestamp));
    };

    const head = BigInt(await rpc<string>("eth_blockNumber", []));
    if ((await tsOf(head)) <= LAUNCH_TS) return head;

    let lo = 0n;
    let hi = head;
    while (lo < hi) {
      const mid = (lo + hi + 1n) / 2n;
      if ((await tsOf(mid)) <= LAUNCH_TS) lo = mid;
      else hi = mid - 1n;
    }
    return lo;
  })();
  return launchBlockPromise;
}

/** One direction of transfers for a wallet, following pageKey to the end. */
async function transfersFor(
  wallet: string,
  direction: "fromAddress" | "toAddress",
  fromBlock: string,
): Promise<Transfer[]> {
  const out: Transfer[] = [];
  let pageKey: string | undefined;

  // No page cap. The window is bounded by fromBlock, which is the whole point
  // of this provider — an unbounded loop here reads exactly the scoring window
  // and nothing more, so there is no truncation to detect or warn about.
  for (;;) {
    const params: Record<string, unknown> = {
      fromBlock,
      toBlock: "latest",
      [direction]: wallet,
      category: CATEGORIES,
      withMetadata: true,
      excludeZeroValue: true,
      maxCount: PAGE_SIZE,
      order: "asc",
    };
    if (pageKey) params["pageKey"] = pageKey;

    const page = await rpc<{ transfers?: Transfer[]; pageKey?: string }>(
      "alchemy_getAssetTransfers",
      [params],
    );
    out.push(...(page.transfers ?? []));
    if (!page.pageKey) return out;
    pageKey = page.pageKey;
  }
}

const eq = (a: string | null | undefined, b: string) => (a ?? "").toLowerCase() === b;

/** Native coin and its wrapper are the quote asset, never a position. */
function isNativeAsset(t: Transfer): boolean {
  if (t.category === "external" || t.category === "internal") return true;
  const sym = (t.asset ?? "").toUpperCase();
  return sym === "ETH" || sym === "WETH";
}

/**
 * Collapse a wallet's transfers into one Movement per transaction.
 *
 * Same rules as the Blockscout path, so the two providers cannot disagree
 * about what a trade was: native legs (including the wrapper) net into
 * nativeDelta, and the token that moved the most in a transaction is taken as
 * the position that transaction was about.
 */
function toMovements(
  wallet: string,
  transfers: Transfer[],
): { movements: Movement[]; hashes: string[] } {
  const addr = wallet.toLowerCase();
  const nativeByTx = new Map<string, number>();
  const tokensByTx = new Map<string, Map<string, number>>();
  const symbolByToken = new Map<string, string>();
  const tsByTx = new Map<string, number>();

  for (const t of transfers) {
    const v = t.value;
    if (v === null || !Number.isFinite(v) || v === 0) continue;

    const hash = t.hash;
    const stamp = t.metadata?.blockTimestamp;
    if (stamp) {
      const ms = new Date(stamp).getTime();
      if (Number.isFinite(ms)) tsByTx.set(hash, Math.floor(ms / 1000));
    }

    // Alchemy reports each transfer once, with its own from/to. A self-send
    // would net to zero, which is correct.
    let delta = 0;
    if (eq(t.to, addr)) delta += v;
    if (eq(t.from, addr)) delta -= v;
    if (!delta) continue;

    if (isNativeAsset(t)) {
      nativeByTx.set(hash, (nativeByTx.get(hash) ?? 0) + delta);
      continue;
    }

    const key = (t.rawContract?.address ?? t.asset ?? "?").toLowerCase();
    if (t.asset) symbolByToken.set(key, t.asset);
    const inner = tokensByTx.get(hash) ?? new Map<string, number>();
    inner.set(key, (inner.get(key) ?? 0) + delta);
    tokensByTx.set(hash, inner);
  }

  const movements: Movement[] = [];
  // Parallel to `movements`, so a movement can be traced back to the
  // transaction it came from without widening the Movement type that the
  // Blockscout path also produces.
  const hashes: string[] = [];

  for (const [hash, byToken] of tokensByTx) {
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
    hashes.push(hash);
  }
  return { movements, hashes };
}

type CallFrame = {
  from?: string;
  to?: string;
  value?: string;
  calls?: CallFrame[];
};

/**
 * Native value a transaction moved to a wallet, read from its execution trace.
 *
 * WHY A TRACE AND NOT SOMETHING CHEAPER
 *
 * On this chain a DEX sell pays out through an internal call, and internal
 * calls are exactly what the Transfers API does not return here — Alchemy
 * rejects the "internal" category outright for this network. A wallet's sells
 * are therefore invisible to getAssetTransfers: tokens leave, nothing comes
 * back, and the cost book fills with buys that never close. One listed wallet
 * had 1,165 buys and 0 sells read that way, and scored last on the board while
 * profitable over the same window.
 *
 * Two cheaper routes were tried against real transactions and both failed:
 *
 *   Decoding the DEX Swap event. Fine on a single-hop V3 trade, useless on the
 *   real ones — a sampled sell routed through two pools, and neither Swap's
 *   amounts matched what left the wallet. Multi-hop routes and unrecognised
 *   pool types would each need bespoke handling.
 *
 *   Differencing the native balance across the transaction's block. Correct to
 *   within 0.0000172 ETH on the sampled trade, and wrong for the reason that
 *   matters: the wallet had two transactions in that block, so the delta
 *   blends them and cannot be split per trade. Active traders do that
 *   constantly.
 *
 * The trace is exact. On the sampled sell it returned the 0.15798 ETH that
 * actually reached the wallet — 1% under what the Swap event advertised,
 * because the router kept a fee, and the wallet's number is the one the cost
 * book needs.
 */
async function tracedNativeDelta(hash: string, wallet: string): Promise<number> {
  await paceTrace();
  const root = await rpc<CallFrame>("debug_traceTransaction", [hash, { tracer: "callTracer" }]);
  const addr = wallet.toLowerCase();
  let net = 0n;

  // Iterative rather than recursive: a routed swap's tree ran 69 frames deep
  // in places, and a hostile or merely elaborate contract should not be able
  // to overflow the stack of the process that scores the board.
  const stack: CallFrame[] = [root];
  while (stack.length) {
    const frame = stack.pop();
    if (!frame) continue;
    if (frame.value && frame.value !== "0x0") {
      const v = BigInt(frame.value);
      if (v > 0n) {
        if ((frame.to ?? "").toLowerCase() === addr) net += v;
        if ((frame.from ?? "").toLowerCase() === addr) net -= v;
      }
    }
    if (frame.calls) stack.push(...frame.calls);
  }
  return Number(net) / 1e18;
}

/**
 * Fill in nativeDelta for movements the Transfers API could not price.
 *
 * A movement with a token amount and a nativeDelta of exactly zero is the
 * signature of value having moved internally. Those are traced; everything
 * else is already priced and costs nothing.
 */
async function resolveNativeDeltas(
  wallet: string,
  movements: Movement[],
  hashByIndex: (string | undefined)[],
): Promise<void> {
  const pending: number[] = [];
  for (let i = 0; i < movements.length; i++) {
    const m = movements[i];
    if (!m || m.amount === 0 || m.nativeDelta !== 0) continue;
    if (!hashByIndex[i]) continue;
    pending.push(i);
  }
  if (pending.length === 0) return;

  let cursor = 0;
  const workers = Array.from({ length: Math.min(TRACE_CONCURRENCY, pending.length) }, async () => {
    for (;;) {
      const slot = cursor++;
      if (slot >= pending.length) return;
      const idx = pending[slot];
      if (idx === undefined) return;
      const m = movements[idx];
      const hash = hashByIndex[idx];
      if (!m || !hash) continue;

      const key = `${wallet.toLowerCase()}:${hash}`;
      const cached = traceCache.get(key);
      if (cached !== undefined) {
        m.nativeDelta = cached;
        continue;
      }
      try {
        const delta = await tracedNativeDelta(hash, wallet);
        traceCache.set(key, delta);
        appendTraceCache(key, delta);
        m.nativeDelta = delta;
      } catch {
        // A trace that will not load leaves the movement unpriced, which the
        // cost book already ignores. Not cached: a transient failure should
        // not permanently blind this wallet to one of its own trades.
      }
    }
  });
  await Promise.all(workers);
}

/** Cap concurrent wallets so a cohort pass cannot open 126 sockets at once. */
let inFlight = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_INFLIGHT) await new Promise<void>((r) => waiting.push(r));
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}

/**
 * Holds one cache, and a much smaller one than the Blockscout provider's.
 *
 * That one keeps every row of merged history per wallet, because re-walking
 * three paginated endpoints each cycle took ten minutes — and that cache is
 * why the service needed 2GB and OOM-looped at 512MB. Transfers here are a
 * ranged query per direction and are not cached at all.
 *
 * What is cached is traceCache: one number per traced transaction, because a
 * mined trace is immutable and re-fetching history's worth of them every
 * twenty minutes would be the single largest cost this oracle has. A number
 * per transaction is a rounding error against the row cache that caused the
 * memory trouble.
 */
export function createAlchemyProvider(): PnlProvider {
  if (!hasAlchemy()) {
    throw new Error("ALCHEMY_RPC_URL is not set — cannot create the Alchemy provider.");
  }
  return {
    async metrics(wallet: string): Promise<RawMetrics> {
      return withSlot(async () => {
        const launchBlock = await resolveLaunchBlock();
        const fromBlock = "0x" + launchBlock.toString(16);
        const [sent, received] = await Promise.all([
          transfersFor(wallet, "fromAddress", fromBlock),
          transfersFor(wallet, "toAddress", fromBlock),
        ]);
        const { movements, hashes } = toMovements(wallet, [...sent, ...received]);
        // Prices the trades whose native leg moved internally — on this chain,
        // that is every sell. Without this the cost book sees buys only.
        await resolveNativeDeltas(wallet, movements, hashes);
        return metricsFromMovements(wallet, movements);
      });
    },
  };
}
