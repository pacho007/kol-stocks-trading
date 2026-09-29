/**
 * solana-provider.ts — reads a trader wallet's Solana history into Movement[].
 *
 * Source: plain Solana JSON-RPC (getSignaturesForAddress + getTransaction),
 * so any RPC works. The public endpoint is heavily rate-limited; set
 * TRADER_RPC_URL to a dedicated one (Helius, Triton, QuickNode…) for a cohort
 * of any size.
 *
 * NOTE THE CLUSTER. Traders are scored on where they actually trade — Solana
 * MAINNET — regardless of which cluster the market program runs on. So this
 * reads TRADER_RPC_URL (mainnet by default), never the market's
 * SOLANA_RPC_URL, which may be devnet.
 *
 * How a transaction becomes a Movement:
 *   - SOL leg: the wallet's lamport change, with the network fee added back
 *     when the wallet paid it (a fee is not a trade), plus any change in its
 *     wrapped-SOL token balance — swaps routinely go through WSOL.
 *   - Token leg: the wallet's change in each SPL token it owns in that tx
 *     (pre/postTokenBalances filtered by owner). The dominant token — largest
 *     absolute change — is the one being traded.
 * Swaps quoted in USDC/USDT rather than SOL have no SOL leg and are skipped
 * by metrics.ts, the same way token->token swaps are.
 *
 * Incremental: each wallet remembers the newest signature it has read, so a
 * warm cycle fetches only what is new. The cache is per process.
 *
 * Env:
 *   TRADER_RPC_URL           default https://api.mainnet-beta.solana.com
 *   TRADER_RPC_CONCURRENCY   max in-flight requests, default 4
 *   TRADER_RPC_GAP_MS        min spacing between request starts, default 120
 *   TRADER_MAX_SIGNATURES    per-wallet cap per read, default 20000. A wallet
 *                            over it FAILS rather than being scored on a
 *                            silently truncated history.
 */
import {
  Connection,
  PublicKey,
  type ConfirmedSignatureInfo,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import type { PnlProvider } from "./indexer.js";
import type { RawMetrics } from "./score.js";
import { LAUNCH_TS } from "./launch.js";
import { metricsFromMovements, type Movement } from "./metrics.js";

const WSOL_MINT = "So11111111111111111111111111111111111111112";

const RPC_URL = process.env["TRADER_RPC_URL"] || "https://api.mainnet-beta.solana.com";
const MAX_INFLIGHT = Number(process.env["TRADER_RPC_CONCURRENCY"] ?? 4);
const MIN_GAP_MS = Number(process.env["TRADER_RPC_GAP_MS"] ?? 120);
const MAX_SIGNATURES = Number(process.env["TRADER_MAX_SIGNATURES"] ?? 20_000);

export const traderRpcHost = () => new URL(RPC_URL).host;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ rate limiting

let inflight = 0;
let lastStart = 0;
const queue: (() => void)[] = [];

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (inflight >= MAX_INFLIGHT) await new Promise<void>((r) => queue.push(r));
  inflight++;
  try {
    const wait = lastStart + MIN_GAP_MS - Date.now();
    lastStart = Math.max(Date.now(), lastStart + MIN_GAP_MS);
    if (wait > 0) await sleep(wait);
    return await fn();
  } finally {
    inflight--;
    queue.shift()?.();
  }
}

/** Retries 429s and transient network errors with exponential backoff. */
async function rpc<T>(fn: () => Promise<T>, what: string): Promise<T> {
  let delay = 500;
  for (let attempt = 1; ; attempt++) {
    try {
      return await slot(fn);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      const transient = /429|Too Many|timeout|ECONNRESET|fetch failed|502|503|504/i.test(msg);
      if (!transient || attempt >= 6) throw new Error(`${what}: ${msg}`);
      await sleep(delay);
      delay = Math.min(delay * 2, 15_000);
    }
  }
}

let _connection: Connection | null = null;
function connection(): Connection {
  // disableRetryOnRateLimit: our own backoff above handles 429s, and the
  // built-in one would stack underneath it.
  _connection ??= new Connection(RPC_URL, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
  });
  return _connection;
}

// ------------------------------------------------------------ history

/** New signatures for `wallet` since `until`, newest first, launch-bounded. */
async function newSignatures(wallet: PublicKey, until?: string): Promise<ConfirmedSignatureInfo[]> {
  const out: ConfirmedSignatureInfo[] = [];
  let before: string | undefined;
  for (;;) {
    const page = await rpc(
      () =>
        connection().getSignaturesForAddress(wallet, {
          limit: 1000,
          ...(before ? { before } : {}),
          ...(until ? { until } : {}),
        }),
      "getSignaturesForAddress",
    );
    for (const s of page) {
      if (s.blockTime != null && s.blockTime < LAUNCH_TS) return out;
      out.push(s);
    }
    if (out.length > MAX_SIGNATURES) {
      throw new Error(
        `more than ${MAX_SIGNATURES} transactions since launch — refusing to score a truncated history`,
      );
    }
    if (page.length < 1000) return out;
    before = page[page.length - 1]!.signature;
  }
}

function toMovement(tx: ParsedTransactionWithMeta, wallet: string): Movement | null {
  const meta = tx.meta;
  if (!meta || meta.err || tx.blockTime == null) return null;

  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  const idx = keys.indexOf(wallet);
  if (idx < 0) return null;

  let lamports = (meta.postBalances[idx] ?? 0) - (meta.preBalances[idx] ?? 0);
  if (idx === 0) lamports += meta.fee; // the wallet paid the fee; that isn't a trade
  let nativeDelta = lamports / 1e9;

  // Signed change per mint owned by this wallet, in UI units.
  const byMint = new Map<string, number>();
  const add = (mint: string, v: number) => byMint.set(mint, (byMint.get(mint) ?? 0) + v);
  for (const b of meta.preTokenBalances ?? []) {
    if (b.owner === wallet) add(b.mint, -Number(b.uiTokenAmount.uiAmountString ?? 0));
  }
  for (const b of meta.postTokenBalances ?? []) {
    if (b.owner === wallet) add(b.mint, Number(b.uiTokenAmount.uiAmountString ?? 0));
  }

  const wsol = byMint.get(WSOL_MINT);
  if (wsol) nativeDelta += wsol;
  byMint.delete(WSOL_MINT);

  let best: { token: string; amount: number } | null = null;
  for (const [token, amount] of byMint) {
    if (amount !== 0 && (!best || Math.abs(amount) > Math.abs(best.amount))) {
      best = { token, amount };
    }
  }
  if (!best) return null;
  return { ts: tx.blockTime, token: best.token, amount: best.amount, nativeDelta };
}

type WalletCache = { newest?: string; movements: Movement[] };

async function readWallet(wallet: string, cache: WalletCache): Promise<Movement[]> {
  const pk = new PublicKey(wallet);
  const sigs = (await newSignatures(pk, cache.newest)).filter((s) => !s.err);
  const txs = await Promise.all(
    sigs.map((s) =>
      rpc(
        () =>
          connection().getParsedTransaction(s.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          }),
        "getParsedTransaction",
      ),
    ),
  );
  const fresh: Movement[] = [];
  for (const tx of txs) {
    const m = tx && toMovement(tx, wallet);
    if (m) fresh.push(m);
  }
  // Only advance the cursor once everything up to it has been read, so a
  // failed cycle re-reads rather than skips.
  if (sigs[0]) cache.newest = sigs[0].signature;
  cache.movements.push(...fresh);
  return cache.movements;
}

/**
 * A provider that remembers what it has read. The first cycle reads every
 * wallet's history since launch; every cycle after reads only new signatures.
 */
export function createSolanaProvider(): PnlProvider {
  const byWallet = new Map<string, WalletCache>();
  return {
    async metrics(wallet: string): Promise<RawMetrics> {
      let cache = byWallet.get(wallet);
      if (!cache) {
        cache = { movements: [] };
        byWallet.set(wallet, cache);
      }
      // Work on a copy so a mid-read failure leaves the cache as it was.
      const draft: WalletCache = {
        movements: [...cache.movements],
        ...(cache.newest ? { newest: cache.newest } : {}),
      };
      const movements = await readWallet(wallet, draft);
      byWallet.set(wallet, draft);
      return metricsFromMovements(wallet, movements);
    },
  };
}
