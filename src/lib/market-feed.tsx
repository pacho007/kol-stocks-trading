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

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase, isSupabaseConfigured, type ListingRow } from "./supabase";

export type FeedPricePoint = { t: number; p: number };

type FeedCtx = {
  /** Current authoritative listing state, keyed by kol id. */
  listings: Record<string, ListingRow>;
  /** Shared price history per kol id, oldest first. */
  history: Record<string, FeedPricePoint[]>;
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

export function MarketFeedProvider({ children }: { children: ReactNode }) {
  const [listings, setListings] = useState<Record<string, ListingRow>>({});
  const [history, setHistory] = useState<Record<string, FeedPricePoint[]>>({});
  const [loaded, setLoaded] = useState(!isSupabaseConfigured);
  const [live, setLive] = useState(false);

  // Initial load: current state for every listing + recent shared history.
  useEffect(() => {
    if (!supabase) return;
    let alive = true;

    (async () => {
      const [{ data: listingRows }, { data: historyRows }] = await Promise.all([
        supabase.from("listings").select("*"),
        supabase
          .from("price_history")
          .select("kol_id, price_wei, block_timestamp")
          .order("block_timestamp", { ascending: false })
          .limit(HISTORY_LIMIT * 20),
      ]);
      if (!alive) return;

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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "listings" },
        (payload) => {
          const row = payload.new as ListingRow | null;
          if (!row?.kol_id) return;
          setListings((prev) => ({ ...prev, [row.kol_id]: row }));
        },
      )
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
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });

    return () => {
      void client.removeChannel(channel);
      setLive(false);
    };
  }, []);

  const value = useMemo<FeedCtx>(
    () => ({ listings, history, loaded, live, configured: isSupabaseConfigured }),
    [listings, history, loaded, live],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMarketFeed(): FeedCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Unmounted provider is a programming error, but returning an inert feed
    // keeps a missing provider from white-screening the whole app.
    return { listings: {}, history: {}, loaded: true, live: false, configured: false };
  }
  return ctx;
}
