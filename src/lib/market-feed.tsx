/**
 * market-feed.tsx — the shared, real-time market feed.
 * ---------------------------------------------------------------------------
 * Replaces two things that made the old UI unfair:
 *   1. A per-browser localStorage price recorder, which meant two people
 *      looking at the same KOL saw different charts, and a new visitor saw a
 *      flat line until their own session had been open long enough.
 *   2. Every client independently polling the chain on its own timer, so what
 *      you saw depended on when your poll happened to land.
 *
 * Both are replaced by one shared Postgres feed (written only by the indexer,
 * see supabase/functions/index-price-history) plus Supabase Realtime, which
 * pushes each change to every connected client at the same moment. Everyone
 * trading the same listing reads the same row.
 *
 * Degrades rather than breaks: with Supabase unconfigured this provider stays
 * empty and callers fall back to their existing behaviour, so the app still
 * renders before the backend is wired up.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  supabase,
  isSupabaseConfigured,
  type ListingRow,
  type ListingMetricsRow,
  type ListingVolumeRow,
  type FillRow,
} from "./supabase";

export type FeedPricePoint = { t: number; p: number };

type FeedCtx = {
  /** Current authoritative listing state, keyed by kol id. */
  listings: Record<string, ListingRow>;
  /** Shared price history per kol id, oldest first. */
  history: Record<string, FeedPricePoint[]>;
  /** Oracle measurements per kol id — win rate, PnL, biggest wins/losses. */
  metrics: Record<string, ListingMetricsRow>;
  /** Rolling 24h share volume per kol id, from the fills view. */
  volume: Record<string, ListingVolumeRow>;
  /** Most recent executed trades across the whole market, newest first. */
  fills: FillRow[];
  /** True once the initial load has completed (success or failure). */
  loaded: boolean;
  /** True while a live Realtime subscription is established. */
  live: boolean;
  /** Null when Supabase isn't configured — callers should fall back. */
  configured: boolean;
};

const Ctx = createContext<FeedCtx | null>(null);

/** How many history points to load per listing for the chart. */
const HISTORY_LIMIT = 500;

/** How many recent trades to keep for the live tape. */
const FILL_LIMIT = 40;

export function MarketFeedProvider({ children }: { children: ReactNode }) {
  const [listings, setListings] = useState<Record<string, ListingRow>>({});
  const [history, setHistory] = useState<Record<string, FeedPricePoint[]>>({});
  const [metrics, setMetrics] = useState<Record<string, ListingMetricsRow>>({});
  const [volume, setVolume] = useState<Record<string, ListingVolumeRow>>({});
  const [fills, setFills] = useState<FillRow[]>([]);
  const [loaded, setLoaded] = useState(!isSupabaseConfigured);
  const [live, setLive] = useState(false);

  // Initial load: current state for every listing + recent shared history.
  useEffect(() => {
    if (!supabase) return;
    let alive = true;

    (async () => {
      const [
        { data: listingRows },
        { data: historyRows },
        { data: metricRows },
        { data: volumeRows },
        { data: fillRows },
      ] = await Promise.all([
        supabase.from("listings").select("*"),
        supabase
          .from("price_history")
          .select("kol_id, price_wei, block_timestamp")
          .order("block_timestamp", { ascending: false })
          .limit(HISTORY_LIMIT * 20),
        // Fetched with the rest rather than lazily per listing: the market
        // table and leaderboard need win rate for every row at once, and 108
        // separate requests to render one page would be worse than one.
        supabase.from("listing_metrics").select("*"),
        supabase.from("listing_volume_24h").select("*"),
        // Recent trades for the live tape. Capped hard: this is a "what is
        // happening right now" view, not a history, and an unbounded fetch
        // would grow without limit as the market gets busier.
        supabase
          .from("fills")
          .select("id, kol_id, side, trader, shares, wei, block_timestamp, tx_hash")
          .order("block_timestamp", { ascending: false })
          .limit(FILL_LIMIT),
      ]);
      if (!alive) return;

      if (fillRows) setFills(fillRows as unknown as FillRow[]);

      if (volumeRows) {
        setVolume(
          Object.fromEntries(volumeRows.map((r) => [r.kol_id, r as unknown as ListingVolumeRow])),
        );
      }

      if (metricRows) {
        setMetrics(
          Object.fromEntries(metricRows.map((r) => [r.kol_id, r as unknown as ListingMetricsRow])),
        );
      }

      if (listingRows) {
        setListings(Object.fromEntries(listingRows.map((r) => [r.kol_id, r as ListingRow])));
      }

      if (historyRows) {
        const next: Record<string, FeedPricePoint[]> = {};
        // Query returns newest-first (so the LIMIT keeps recent data); the
        // chart wants oldest-first, hence the reverse per series below.
        for (const row of historyRows) {
          const id = String(row.kol_id);
          const series = (next[id] ??= []);
          series.push({
            t: new Date(row.block_timestamp as string).getTime(),
            p: Number(row.price_wei) / 1e18,
          });
        }
        for (const [id, series] of Object.entries(next)) {
          series.reverse();
          next[id] = series.length > HISTORY_LIMIT ? series.slice(-HISTORY_LIMIT) : series;
        }
        setHistory(next);
      }

      setLoaded(true);
    })().catch(() => {
      if (alive) setLoaded(true);
    });

    return () => {
      alive = false;
    };
  }, []);

  // Live updates: one subscription for the whole market, pushed to every
  // connected client simultaneously.
  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const channel = client
      .channel("market-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "listings" }, (payload) => {
        const row = payload.new as ListingRow | null;
        if (!row?.kol_id) return;
        setListings((prev) => ({ ...prev, [row.kol_id]: row }));
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "price_history" },
        (payload) => {
          const row = payload.new as {
            kol_id?: string;
            price_wei?: string;
            block_timestamp?: string;
          } | null;
          if (!row?.kol_id || !row.price_wei || !row.block_timestamp) return;
          const kolId = row.kol_id;
          const point: FeedPricePoint = {
            t: new Date(row.block_timestamp).getTime(),
            p: Number(row.price_wei) / 1e18,
          };
          setHistory((prev) => {
            const arr = prev[kolId]?.slice() ?? [];
            arr.push(point);
            if (arr.length > HISTORY_LIMIT) arr.splice(0, arr.length - HISTORY_LIMIT);
            return { ...prev, [kolId]: arr };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "listing_metrics" },
        (payload) => {
          // Upserted wholesale once per oracle cycle, so the new row is the
          // complete current state for that listing — no merge needed.
          const row = payload.new as ListingMetricsRow | null;
          if (!row?.kol_id) return;
          setMetrics((prev) => ({ ...prev, [row.kol_id]: row }));
        },
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "fills" }, (payload) => {
        // listing_volume_24h is a view, so it cannot broadcast. Rather than
        // re-query on every trade, apply the fill locally — the numbers agree
        // because the view sums exactly these rows, and the next full load
        // re-derives them and drops anything that has aged out of the window.
        const row = payload.new as { kol_id?: string; wei?: string; trader?: string } | null;
        if (!row?.kol_id || !row.wei) return;
        const kolId = row.kol_id;
        // Prepend to the tape immediately. This is the one place the product can
        // show that somebody else is trading right now, so it should not wait
        // for a refetch.
        setFills((prev) => [payload.new as FillRow, ...prev].slice(0, FILL_LIMIT));
        setVolume((prev) => {
          const cur = prev[kolId];
          const base = cur ?? {
            kol_id: kolId,
            volume_wei: "0",
            fill_count: 0,
            trader_count: 0,
          };
          return {
            ...prev,
            [kolId]: {
              ...base,
              volume_wei: (BigInt(base.volume_wei || "0") + BigInt(row.wei!)).toString(),
              fill_count: base.fill_count + 1,
            },
          };
        });
      })
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });

    return () => {
      void client.removeChannel(channel);
      setLive(false);
    };
  }, []);

  const value = useMemo<FeedCtx>(
    () => ({
      listings,
      history,
      metrics,
      volume,
      fills,
      loaded,
      live,
      configured: isSupabaseConfigured,
    }),
    [listings, history, metrics, volume, fills, loaded, live],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMarketFeed(): FeedCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Unmounted provider is a programming error, but returning an inert feed
    // keeps a missing provider from white-screening the whole app.
    return {
      listings: {},
      history: {},
      metrics: {},
      volume: {},
      fills: [],
      loaded: true,
      live: false,
      configured: false,
    };
  }
  return ctx;
}
