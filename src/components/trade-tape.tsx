import { Link } from "@tanstack/react-router";
import { ExplorerLink } from "@/components/explorer-link";
import { useEffect, useRef, useState } from "react";
import { AvatarMark } from "@/components/avatar-mark";
import { getKol } from "@/lib/kols";
import { useMarketFeed } from "@/lib/market-feed";
import { useMarket } from "@/lib/market-store";
import { supabase, isSupabaseConfigured, type FillRow } from "@/lib/supabase";

/**
 * The live trade tape — every buy and sell as it lands.
 *
 * The board could already tell you what a trader is worth, but nothing showed
 * that anyone was actually trading. A market with no visible activity reads as
 * abandoned even when it is not, which is why every exchange puts a tape
 * somewhere in view.
 *
 * Fed by public.fills over Realtime, so a trade made by anyone appears here
 * for everyone at the same moment.
 */

/** "12s", "4m", "2h" — compact enough to sit in a dense row. */
function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function TradeTape({ kolId, limit = 12 }: { kolId?: string; limit?: number }) {
  const feed = useMarketFeed();
  const { nativePriceUsd } = useMarket();

  // Re-render on a timer so the relative times stay honest without needing a
  // new fill to arrive.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  // Per-listing tapes query their own listing; the global tape uses the feed.
  //
  // Filtering the shared feed client-side looked equivalent and was not. That
  // feed is capped at FILL_LIMIT across ALL listings, so a listing's tape only
  // ever showed trades that happened to be among the most recent few dozen
  // platform-wide. One busy listing could push every other listing's trades
  // out of the window, and a listing with hundreds of trades would render
  // "no trades yet" on its own page — the page where somebody is deciding
  // whether to buy it.
  //
  // Every trade on a listing is public by design: RLS on public.fills is a
  // plain `using (true)`, so this needs no wallet and no session.
  const [own, setOwn] = useState<FillRow[] | null>(null);

  useEffect(() => {
    if (!kolId || !supabase || !isSupabaseConfigured) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("fills")
        .select("id, kol_id, side, trader, shares, wei, block_timestamp, tx_hash")
        .eq("kol_id", kolId)
        .order("block_timestamp", { ascending: false })
        .limit(Math.max(limit, 50));
      if (alive && data) setOwn(data as unknown as FillRow[]);
    })();
    return () => {
      alive = false;
    };
  }, [kolId, limit]);

  // Live arrivals still come from the shared Realtime subscription, so a trade
  // shows the instant it lands rather than on the next mount. Deduped by id,
  // because a fill can be in both the query and the feed.
  const rows = (() => {
    if (!kolId) return feed.fills.slice(0, limit);
    const live = feed.fills.filter((f) => f.kol_id === kolId);
    const seen = new Set(live.map((f) => f.id));
    const merged = [...live, ...(own ?? []).filter((f) => !seen.has(f.id))];
    merged.sort((a, b) => +new Date(b.block_timestamp) - +new Date(a.block_timestamp));
    return merged.slice(0, limit);
  })();

  // Track which ids have been rendered before, so an arriving trade announces
  // itself once instead of the whole list animating on every re-render.
  //
  // Keyed on the newest id rather than the rows array: rows is rebuilt every
  // render, so depending on it directly would re-run this forever. Ids are
  // monotonic, so a change in the newest one is exactly "something arrived".
  const seen = useRef<Set<number>>(new Set());
  const [flash, setFlash] = useState<Set<number>>(new Set());
  const newestId = rows[0]?.id ?? null;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    const current = rowsRef.current;
    const fresh = current.filter((r) => !seen.current.has(r.id)).map((r) => r.id);
    current.forEach((r) => seen.current.add(r.id));
    if (fresh.length === 0) return;
    setFlash(new Set(fresh));
    const t = setTimeout(() => setFlash(new Set()), 1200);
    return () => clearTimeout(t);
  }, [newestId]);

  if (!feed.configured) {
    return (
      <Empty
        title="Trade tape unavailable"
        body="The shared feed isn't configured in this environment, so trades can't be shown here."
      />
    );
  }

  if (rows.length === 0) {
    return (
      <Empty
        title="No trades yet"
        body={
          kolId
            ? "Nobody has traded this listing. The first buy will appear here the moment it confirms."
            : "The market is open and nothing has traded yet. Every buy and sell lands here as it confirms."
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-border/60">
      {rows.map((f) => {
        const kol = getKol(f.kol_id);
        const usd = (Number(f.wei) / 1e18) * nativePriceUsd;
        const buy = f.side === "buy";
        const isNew = flash.has(f.id);
        return (
          <li
            key={f.id}
            className={`flex items-center gap-3 px-3 py-2.5 transition-colors duration-700 ${
              isNew ? (buy ? "bg-up/10" : "bg-down/10") : ""
            }`}
          >
            <span
              className={`num shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-[0.14em] uppercase ${
                buy ? "bg-up/15 text-up" : "bg-down/15 text-down"
              }`}
            >
              {buy ? "Buy" : "Sell"}
            </span>

            {!kolId && kol && (
              <Link
                to="/kol/$id"
                params={{ id: f.kol_id }}
                className="flex min-w-0 items-center gap-2 hover:opacity-80"
              >
                <AvatarMark gradient={kol.avatar} label={kol.ticker} src={kol.image} size={20} />
                <span className="num truncate text-[11px] font-bold tracking-widest">
                  ${kol.ticker}
                </span>
              </Link>
            )}

            <span className="num text-[11px] text-muted-foreground">
              {Number(f.shares).toLocaleString()} sh
              {f.tx_hash && (
                <ExplorerLink
                  tx={f.tx_hash}
                  label=""
                  className="ml-1.5 align-middle text-muted-foreground/70"
                />
              )}
            </span>

            <span className="num ml-auto text-[11px] font-semibold tabular-nums">
              ${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}
            </span>

            <span
              className="num hidden w-[5.5rem] shrink-0 text-right text-[10px] text-muted-foreground sm:block"
              title={f.trader}
            >
              {shortAddr(f.trader)}
            </span>

            <span className="num w-8 shrink-0 text-right text-[10px] text-muted-foreground">
              {ago(f.block_timestamp, now)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Empty states say what will happen, not just that nothing has. "No trades
 * yet" alone reads as broken; naming what would fill it reads as ready.
 */
function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-[28ch] text-[11px] leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
