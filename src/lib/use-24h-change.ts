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
      // Anchor the 24h window to the newest price event, not to the clock.
      //
      // Anchored to now, the window empties the moment the oracle stops for a
      // day — every chip shows a dash and the board looks broken rather than
      // stale. Anchored to the data, it always frames the last 24 hours in
      // which anything actually happened. While the oracle runs on its 20
      // minute cycle the newest event IS a few minutes old, so the two
      // definitions agree; they only diverge during an outage, which is
      // exactly when the anchored one is more useful.
      //
      // What it means is therefore "the last 24 hours of trading we have", not
      // "the last 24 hours". The header carries the age of the feed, so the
      // staleness is stated there rather than by blanking every number.
      const { data: newestRow } = await supabase
        .from("price_history")
        .select("block_timestamp")
        .order("block_timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive) return;

      const anchorMs = newestRow?.block_timestamp
        ? new Date(newestRow.block_timestamp).getTime()
        : Date.now();
      const cutoff = new Date(anchorMs - 24 * 60 * 60 * 1000).toISOString();

      // Every event for these listings, not just the ones inside the window.
      //
      // A price is knowable at any instant: it is whatever the most recent
      // event set it to, and it stays there until the next one. So the price
      // 24h ago is the last event at or before the cutoff, whether that event
      // is an hour older than the cutoff or a week older.
      //
      // Reading only the window could not express that. A listing whose price
      // held still emits nothing, and so does a listing nobody has ever
      // scored — both arrive as an empty window, and whichever answer that
      // case is given is wrong for the other one. Twelve listings is a couple
      // of hundred rows, so fetching the lot removes the ambiguity rather than
      // guessing at it.
      const history = await supabase
        .from("price_history")
        .select("kol_id, price_wei, block_timestamp")
        .in("kol_id", wanted)
        .order("block_timestamp", { ascending: true })
        .limit(4000);
      if (!alive) return;

      const cutoffMs = anchorMs - 24 * 60 * 60 * 1000;
      // Price as of the cutoff, and price as of the anchor. Walking in
      // ascending order, each event overwrites the later of the two it
      // qualifies for.
      const base = new Map<string, number>();
      const latest = new Map<string, number>();
      for (const r of history.data ?? []) {
        const id = String(r.kol_id);
        const wei = Number(r.price_wei);
        if (!Number.isFinite(wei) || wei <= 0) continue;
        const t = new Date(String(r.block_timestamp)).getTime();
        if (t <= cutoffMs) base.set(id, wei);
        // A listing first scored INSIDE the window has no price before it;
        // its earliest event is the only sensible baseline.
        else if (!base.has(id)) base.set(id, wei);
        latest.set(id, wei);
      }
      const byId = new Map(KOLS.map((k) => [k.id, k]));
      const rows: Mover[] = [];
      for (const id of wanted) {
        const kol = byId.get(id);
        if (!kol) continue;
        const then = base.get(id);
        const now = latest.get(id);
        rows.push({
          kol,
          // A dash now means one thing only: this listing has never had a price
          // recorded, so there is nothing to compare. Everything that has ever
          // been scored gets a number, and 0.0% means the price genuinely sat
          // still across the window rather than "we did not look".
          changePct:
            then !== undefined && now !== undefined && then > 0
              ? ((now - then) / then) * 100
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
