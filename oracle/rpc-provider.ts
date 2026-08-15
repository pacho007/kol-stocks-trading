/**
 * rpc-provider.ts — reliable trade reader via Solana RPC pre/post balances.
 * Reads real trades from getTransaction pre/post token + SOL balances, so it
 * works for Pump.fun and any DEX (reads the OUTCOME, not the instruction).
 *
 * RELIABILITY FIXES (why scores were shuffling between runs):
 *   - Failed RPC calls are RETRIED with backoff, never silently dropped.
 *   - A per-wallet cap (MAX_TXS) bounds work so heavy wallets don't get
 *     throttled into partial data.
 *   - A shared rate limiter paces ALL calls to stay under Helius limits.
 *   - Newest-first up to the cap => every run reads the SAME window =>
 *     consistent scores.
 */

import type { RawMetrics } from "./score.js";
import type { PnlProvider } from "./indexer.js";
import { LAUNCH_TS } from "./indexer.js";

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const WRAPPED_SOL = "So11111111111111111111111111111111111111112";
const LAMPORTS = 1e9;

const MAX_TXS = Number(process.env.MAX_TXS ?? 200);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MIN_GAP_MS = Number(process.env.RPC_GAP_MS ?? 55);
let lastCall = 0;
let chain: Promise<void> = Promise.resolve();

// Failure here must never look like a legitimate empty/null RPC result to
// callers — getSignatures() and tradeFromTx() rely on `null` meaning "the
// chain genuinely has nothing here", not "we gave up". Silently returning
// null after exhausting retries is what caused scores to shuffle between
// runs: a persistent rate limit would get read as "end of history" and
// quietly truncate a wallet's trade data.
async function rpc(body, tries = 8) {
  const run = chain.then(async () => {
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastCall));
    if (wait) await sleep(wait);
    lastCall = Date.now();
  });
  chain = run.catch(() => {});
  await run;

  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 429) { lastErr = new Error("429 rate limited"); await sleep(600 * (attempt + 1)); continue; }
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); await sleep(300 * (attempt + 1)); continue; }
      const j = await res.json();
      if (j.error) { lastErr = new Error(j.error.message ?? "RPC error"); await sleep(300 * (attempt + 1)); continue; }
      return j.result ?? null; // legitimate null result from a successful call
    } catch (e) {
      lastErr = e;
      await sleep(300 * (attempt + 1));
    }
  }
  throw new Error(`RPC ${body.method} failed after ${tries} attempts: ${lastErr?.message ?? "unknown error"}`);
}

async function getSignatures(wallet) {
  const out = [];
  let before;
  for (let page = 0; page < 20 && out.length < MAX_TXS; page++) {
    const sigs = await rpc({
      jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress",
      params: [wallet, { limit: 100, ...(before ? { before } : {}) }],
    });
    if (!sigs || sigs.length === 0) break;
    let passedLaunch = false;
    for (const s of sigs) {
      if (s.err) continue;
      if (s.blockTime && s.blockTime < LAUNCH_TS) { passedLaunch = true; break; }
      out.push(s.signature);
      if (out.length >= MAX_TXS) break;
    }
    if (passedLaunch) break;
    before = sigs[sigs.length - 1].signature;
  }
  return out;
}

async function tradeFromTx(wallet, sig) {
  const r = await rpc({
    jsonrpc: "2.0", id: 1, method: "getTransaction",
    params: [sig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }],
  });
  const meta = r?.meta;
  if (!meta || meta.err) return null;

  const keysRaw = r?.transaction?.message?.accountKeys ?? [];
  const keys = keysRaw.map((k) => (typeof k === "string" ? k : k.pubkey));
  const walletIdx = keys.indexOf(wallet);

  let solDelta = 0;
  if (walletIdx >= 0 && meta.preBalances && meta.postBalances) {
    solDelta = (meta.postBalances[walletIdx] - meta.preBalances[walletIdx]) / LAMPORTS;
  }

  const pre = new Map();
  const post = new Map();
  for (const b of meta.preTokenBalances ?? []) {
    if (b.owner && b.owner !== wallet) continue;
    if (b.mint === WRAPPED_SOL) continue;
    pre.set(b.mint, Number(b.uiTokenAmount.amount) / 10 ** b.uiTokenAmount.decimals);
  }
  for (const b of meta.postTokenBalances ?? []) {
    if (b.owner && b.owner !== wallet) continue;
    if (b.mint === WRAPPED_SOL) continue;
    post.set(b.mint, Number(b.uiTokenAmount.amount) / 10 ** b.uiTokenAmount.decimals);
  }
  const mints = new Set([...pre.keys(), ...post.keys()]);
  let best = null;
  for (const mint of mints) {
    const d = (post.get(mint) ?? 0) - (pre.get(mint) ?? 0);
    if (d !== 0 && (!best || Math.abs(d) > Math.abs(best.delta))) best = { mint, delta: d };
  }
  if (!best) return null;
  return { mint: best.mint, tokenDelta: best.delta, solDelta };
}

// Retries the whole wallet on failure (not just the failing call) so a
// mid-stream rate-limit doesn't discard trade data already reconstructed
// for that wallet in this pass — see rpc()'s comment for why silent partial
// data is what we're avoiding.
async function metricsForWallet(wallet, attempts = 3) {
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await metricsForWalletOnce(wallet);
    } catch (e) {
      lastErr = e;
      if (attempt < attempts - 1) await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr;
}

async function metricsForWalletOnce(wallet) {
  const sigs = await getSignatures(wallet);
  const book = new Map();
  let realizedPnlSol = 0, volumeSol = 0, closedTrades = 0, wins = 0;

  for (const sig of sigs.reverse()) {
    const t = await tradeFromTx(wallet, sig);
    if (!t) continue;
    const { mint, tokenDelta, solDelta } = t;
    if (mint === WRAPPED_SOL) continue;
    const pos = book.get(mint) ?? { qty: 0, cost: 0 };
    if (tokenDelta > 0 && solDelta < 0) {
      const spent = -solDelta;
      pos.qty += tokenDelta; pos.cost += spent; volumeSol += spent;
      book.set(mint, pos);
    } else if (tokenDelta < 0 && solDelta > 0) {
      const soldQty = -tokenDelta, proceeds = solDelta;
      volumeSol += proceeds;
      const avgCost = pos.qty > 0 ? pos.cost / pos.qty : 0;
      const costOfSold = avgCost * Math.min(soldQty, pos.qty);
      realizedPnlSol += proceeds - costOfSold;
      closedTrades += 1;
      if (proceeds - costOfSold > 0) wins += 1;
      pos.qty = Math.max(0, pos.qty - soldQty);
      pos.cost = pos.qty > 0 ? avgCost * pos.qty : 0;
      book.set(mint, pos);
    }
  }
  return {
    id: wallet,
    realizedPnlSol,
    winRate: closedTrades > 0 ? wins / closedTrades : 0,
    volumeSol,
    trades: closedTrades,
  };
}

export const RpcPnlProvider: PnlProvider = {
  metrics: (wallet) => metricsForWallet(wallet),
};
