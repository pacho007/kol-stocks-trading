import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { ExplorerLink } from "@/components/explorer-link";
import { fmtUsd } from "@/lib/kols";
import { useMarket } from "@/lib/market-store";

type Holder = {
  trader: string;
  shares: number;
  cost: number;
};

/**
 * Who actually holds this listing, and what they paid.
 *
 * WHERE THIS COMES FROM, AND WHAT THAT COSTS
 *
 * The contract stores balances in `shareBalances[kolWallet][holder]`, a
 * mapping — there is no way to enumerate it from chain state, so the holder
 * list has to be rebuilt from events. public.fills has every Bought and Sold,
 * so replaying them in block order reconstructs both the balance and, with
 * average-cost accounting, what each wallet paid for what it still holds.
 *
 * The gap: the indexer records Bought and Sold but NOT SharesTransferred, so a
 * wallet-to-wallet transfer would leave the sender listed and the receiver
 * missing. Rather than present that as fact, the derived total is reconciled
 * against the contract's own sharesOutstanding and any discrepancy is shown.
 * A holder table that is quietly wrong is worse than one that admits its
 * blind spot, because people size positions off it.
 *
 * Percentages use the on-chain supply as the denominator, not the sum of the
 * rows, so a missing holder shows up as percentages that do not reach 100
 * instead of being silently normalised away.
 */
export function HoldersPanel({ kolId, limit = 12 }: { kolId: string; limit?: number }) {
  const { onChainListings } = useMarket();
  const [holders, setHolders] = useState<Holder[] | null>(null);
  const [loading, setLoading] = useState(true);

  const outstanding = Number(onChainListings[kolId]?.sharesOutstanding ?? 0n);

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      // Every fill for this listing, oldest first — average cost cannot be
      // walked from a truncated or reversed history.
      const { data } = await supabase
        .from("fills")
        .select("side, trader, shares, wei")
        .eq("kol_id", kolId)
        .order("block_timestamp", { ascending: true })
        .limit(5000);
      if (!alive) return;

      const acc: Record<string, { shares: number; cost: number }> = {};
      for (const f of data ?? []) {
        const who = String(f.trader).toLowerCase();
        const a = (acc[who] ??= { shares: 0, cost: 0 });
        const n = Number(f.shares);
        const wei = Number(f.wei);
        if (f.side === "buy") {
          a.shares += n;
          a.cost += wei;
        } else {
          // Selling removes shares at the running average, so what remains
          // keeps the entry price it had. Same rule as the portfolio.
          const avg = a.shares > 0 ? a.cost / a.shares : 0;
          const sold = Math.min(n, a.shares);
          a.shares -= sold;
          a.cost = Math.max(0, a.cost - avg * sold);
        }
      }

      setHolders(
        Object.entries(acc)
          .filter(([, a]) => a.shares > 0.000001)
          .map(([trader, a]) => ({ trader, shares: a.shares, cost: a.cost }))
          .sort((x, y) => y.shares - x.shares),
      );
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [kolId]);

  const { nativePriceUsd } = useMarket();

  if (loading) {
    return <p className="px-4 py-6 text-center text-xs text-muted-foreground">Loading holders…</p>;
  }

  if (!isSupabaseConfigured) {
    return (
      <p className="px-4 py-6 text-center text-xs text-muted-foreground">
        Holder list unavailable — the shared feed isn&apos;t connected.
      </p>
    );
  }

  if (!holders || holders.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-xs text-muted-foreground">
        No holders yet. Nobody has bought this listing.
      </p>
    );
  }

  const counted = holders.reduce((s, h) => s + h.shares, 0);
  // Anything above rounding means shares moved by a route the indexer does not
  // watch — currently transferShares.
  const unaccounted = outstanding > 0 ? outstanding - counted : 0;
  const drifted = outstanding > 0 && unaccounted / outstanding > 0.005;

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-border px-4 py-2 text-[10px] tracking-[0.16em] uppercase text-muted-foreground">
        <span>Wallet</span>
        <span className="text-right">Shares</span>
        <span className="text-right">Share</span>
        <span className="text-right">Cost basis</span>
      </div>

      {holders.slice(0, limit).map((h) => {
        const pct = outstanding > 0 ? (h.shares / outstanding) * 100 : null;
        return (
          <div
            key={h.trader}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 border-b border-border/60 px-4 py-2.5 text-xs last:border-0"
          >
            <ExplorerLink address={h.trader} className="text-foreground" />
            <span className="num text-right tabular-nums">
              {h.shares.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span className="num text-right tabular-nums text-muted-foreground">
              {pct != null ? `${pct.toFixed(1)}%` : "—"}
            </span>
            <span className="num text-right tabular-nums text-muted-foreground">
              {fmtUsd((h.cost / 1e18) * nativePriceUsd)}
            </span>
          </div>
        );
      })}

      <div className="space-y-1 px-4 py-3 text-[11px] text-muted-foreground">
        <p>
          {holders.length.toLocaleString()} holder{holders.length === 1 ? "" : "s"}
          {holders.length > limit && ` · showing the largest ${limit}`}
        </p>
        {drifted && (
          <p className="text-down">
            {((unaccounted / outstanding) * 100).toFixed(1)}% of supply isn&apos;t accounted for
            here. Shares moved by direct transfer aren&apos;t indexed, so this list can miss a
            holder.
          </p>
        )}
      </div>
    </div>
  );
}
