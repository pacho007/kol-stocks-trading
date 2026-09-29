/**
 * metrics.ts — the one place a wallet's history becomes RawMetrics.
 *
 * Every history source (oracle/solana-provider.ts today) reduces a wallet to
 * Movement[] — one entry per transaction: the dominant token moved and the
 * SOL moved alongside it — and this file does the accounting. Keeping that
 * split means a new source can only change WHERE history comes from, never
 * HOW it is scored.
 */
import type { RawMetrics } from "./score.js";
import { LAUNCH_TS } from "./launch.js";

/** A single closed position, kept for the biggest wins/losses display. */
export type ClosedTrade = {
  symbol: string;
  /** Realized PnL for this close, in SOL. */
  pnl: number;
  /** SOL received on the close. */
  proceeds: number;
  ts: number;
  /** proceeds / cost basis. Null when there was no recorded basis. */
  multiple: number | null;
};

/** Per-transaction net movement for one wallet: dominant token + SOL delta. */
export type Movement = {
  ts: number;
  /** Token mint address. */
  token: string;
  /** Signed change in the wallet's balance of `token`, in UI units. */
  amount: number;
  /** Signed change in the wallet's SOL (native + wrapped), excluding the network fee. */
  nativeDelta: number;
  /** Ticker for display, when known. */
  symbol?: string;
};

/** Fall back to a shortened mint address when a token has no symbol. */
function shortToken(mint: string): string {
  return mint.length > 10 ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : mint;
}

/**
 * Average-cost book, oldest -> newest.
 *
 * BUY  = token in, SOL out.  SELL = token out, SOL in.
 * Token->token swaps, transfers and airdrops are deliberately skipped: there
 * is no SOL leg to price them against, and a guessed price is worse than none.
 */
export function metricsFromMovements(wallet: string, movements: Movement[]): RawMetrics {
  const book = new Map<string, { qty: number; cost: number }>();
  let realizedPnlSol = 0;
  let volumeSol = 0;
  let closedTrades = 0;
  let wins = 0;

  const ordered = [...movements].filter((m) => m.ts >= LAUNCH_TS).sort((a, b) => a.ts - b.ts);
  const closes: ClosedTrade[] = [];

  for (const { ts, token, amount, nativeDelta, symbol } of ordered) {
    const pos = book.get(token) ?? { qty: 0, cost: 0 };

    if (amount > 0 && nativeDelta < 0) {
      const spent = -nativeDelta;
      pos.qty += amount;
      pos.cost += spent;
      volumeSol += spent;
      book.set(token, pos);
    } else if (amount < 0 && nativeDelta > 0) {
      const soldQty = -amount;
      const proceeds = nativeDelta;
      volumeSol += proceeds;

      const avgCost = pos.qty > 0 ? pos.cost / pos.qty : 0;
      const costOfSold = avgCost * Math.min(soldQty, pos.qty);
      const pnl = proceeds - costOfSold;

      realizedPnlSol += pnl;
      closedTrades += 1;
      if (pnl > 0) wins += 1;

      closes.push({
        symbol: symbol ?? shortToken(token),
        pnl,
        proceeds,
        ts,
        // Guarded: a close with no recorded basis (a transferred-in token sold
        // for the first time) would otherwise report an infinite return.
        multiple: costOfSold > 0 ? proceeds / costOfSold : null,
      });

      pos.qty = Math.max(0, pos.qty - soldQty);
      pos.cost = pos.qty > 0 ? avgCost * pos.qty : 0;
      book.set(token, pos);
    }
  }

  const byPnl = [...closes].sort((a, b) => b.pnl - a.pnl);
  const topWins = byPnl.filter((c) => c.pnl > 0).slice(0, 3);
  const topLosses = byPnl
    .filter((c) => c.pnl < 0)
    .slice(-3)
    .reverse();

  return {
    id: wallet, // caller remaps to the listing id
    realizedPnlSol,
    winRate: closedTrades > 0 ? wins / closedTrades : 0,
    volumeSol,
    trades: closedTrades,
    topWins,
    topLosses,
  };
}
