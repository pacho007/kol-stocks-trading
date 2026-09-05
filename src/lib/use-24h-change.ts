import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";
import { KOLS, type Kol } from "./kols";

export type Mover = {
  kol: Kol;
  /**
   * Percent change across the trailing 24h, or null when the listing is not in
   * the shared feed at all. Null is not the same as 0: 0 means measured and
   * flat, null means there is nothing to measure yet.
   */
  changePct: number | null;
};

/**
 * The trailing-24h move for a named set of listings, in the order given.
 *
 * WHY THIS READS price_history AND NOT listings
 *
 * public.listings looks like the right source — it is the "current state"
 * table and it has a price_wei column. It was not usable: every row held its
 * seed values (score 50, opening price, last_update_ts null) because the
 * indexer's write to it was guarded by `last_update_ts <= block_timestamp`,
 * which is NULL rather than TRUE on a seeded row, so a listing's first update
 * never applied. Reading it showed the opening price as "now" and inverted the
 * sign of every move.
 *
 * That guard is fixed, but this still reads price_history, because the event
 * log is the thing the indexer cannot get wrong: append-only, one row per
 * PriceUpdated, and correct throughout the period listings was frozen. Taking
 * both ends of the comparison from one source also means the two numbers can
 * never disagree about which listing or which instant they describe.
 *
 * listings is still queried, for one thing only: to tell "this listing exists
 * and did not move" apart from "this listing was never seeded". Both produce
 * no rows in the window, and they are very different claims to put on screen.
 *
 * WHY kol.change24h IS NOT USED
 *
 * It exists on the type and is hardcoded to 0 for all 126 listings in kols.ts —
 * seed scaffolding that was never wired up. Rendering it would print "+0.0%" on
 * every chip in the confident styling of a real measurement.
 *
 * THE APPROXIMATION
 *
 * The baseline is the earliest event inside the window rather than the last one
 * before it, so a listing whose first step happened early in the window has
 * that step excluded. The error is bounded by one oracle interval against a 24h
 * span and always understates, which is the right direction to be wrong in.
 */
export function use24hChange(ids: readonly string[]): Mover[] | null {
  const [movers, setMovers] = useState<Mover[] | null>(null);
  const key = ids.join(",");

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) {
      setMovers([]);
      return;
    }
    let alive = true;
    const wanted = key.split(",").filter(Boolean);

    (async () => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [history, seeded] = await Promise.all([
        supabase
          .from("price_history")
          .select("kol_id, price_wei")
          .in("kol_id", wanted)
          .gte("block_timestamp", cutoff)
          // Ascending, so the first row seen for a listing is the oldest in the
          // window and the last is the newest. Any other order silently changes
          // which two numbers are being compared.
          .order("block_timestamp", { ascending: true })
          .limit(2000),
        supabase.from("listings").select("kol_id").in("kol_id", wanted),
      ]);
      if (!alive) return;

      const known = new Set((seeded.data ?? []).map((r) => String(r.kol_id)));
      const first = new Map<string, number>();
      const last = new Map<string, number>();
      for (const r of history.data ?? []) {
        const id = String(r.kol_id);
        const wei = Number(r.price_wei);
        if (!Number.isFinite(wei) || wei <= 0) continue;
        if (!first.has(id)) first.set(id, wei);
        last.set(id, wei);
      }

      // Did the window contain any price movement at all, for any listing?
      const feedIsLive = first.size > 0;

      const byId = new Map(KOLS.map((k) => [k.id, k]));
      const rows: Mover[] = [];
      for (const id of wanted) {
        const kol = byId.get(id);
        if (!kol) continue;
        const base = first.get(id);
        const now = last.get(id);
        rows.push({
          kol,
          changePct:
            base !== undefined && now !== undefined && base > 0
              ? ((now - base) / base) * 100
              : // No events for this listing in the window. That means "flat"
                // only if the feed was producing events at all — a listing
                // whose price genuinely held still emits nothing, and so does
                // every listing when the oracle is not running.
                //
                // feedIsLive separates them. If something moved somewhere in
                // the window then the feed was live and this listing really was
                // flat. If nothing moved anywhere, there is no measurement to
                // report, and 0.0% claims one — which is exactly what every
                // chip did for a day once the last oracle push aged out of the
                // window.
                known.has(id) && feedIsLive
                ? 0
                : null,
        });
      }
      setMovers(rows);
    })();

    return () => {
      alive = false;
    };
  }, [key]);

  return movers;
}
