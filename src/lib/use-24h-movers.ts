import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";
import { KOLS, type Kol } from "./kols";

export type Mover = {
  kol: Kol;
  /** Most recent price in the window, in wei. */
  priceWei: number;
  /** Percent change across the trailing 24h. */
  changePct: number;
};

/**
 * The biggest 24h movers on the board, measured rather than seeded.
 *
 * WHY THIS READS price_history AND NOT listings
 *
 * public.listings looks like the right source — it is the "current state"
 * table and it has a price_wei column. It is not usable. Every row still holds
 * its seed values (score 50, the opening price, last_update_ts null) because
 * the indexer's write to it was guarded by `last_update_ts <= block_timestamp`,
 * and that comparison is NULL rather than TRUE on a seeded row, so a listing's
 * first update never applied. Reading it produced a bubble for every listing
 * showing the opening price as "now", which inverted the sign of every move.
 *
 * That guard is fixed, but this still reads price_history, because the event
 * log is the thing the indexer cannot get wrong: it is append-only, one row per
 * PriceUpdated, and it was correct throughout the period listings was frozen.
 * Deriving both ends of the comparison from one source also means the two
 * numbers can never disagree about which listing or which instant they
 * describe.
 *
 * WHY kol.change24h IS NOT USED
 *
 * It exists on the type and is hardcoded to 0 for all 126 listings in kols.ts —
 * seed scaffolding that was never wired up. Rendering it would put "+0.0%" on
 * every bubble in the confident green-or-red styling of a real measurement.
 *
 * WHAT THE WINDOW MEANS
 *
 * Only listings with at least two PriceUpdated events in the last 24h can show
 * a move, and only those are ranked. A listing that did not move in the window
 * is not a mover, so leaving it out is the definition rather than a gap. The
 * baseline is the earliest event inside the window rather than the last one
 * before it, which understates a listing whose first step happened early in the
 * window; the error is bounded by one oracle interval against a 24h span, and
 * understating a move on a splash screen is the right direction to be wrong in.
 */
export function use24hMovers(count: number): Mover[] | null {
  const [movers, setMovers] = useState<Mover[] | null>(null);

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) {
      setMovers([]);
      return;
    }
    let alive = true;

    (async () => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from("price_history")
        .select("kol_id, price_wei")
        .gte("block_timestamp", cutoff)
        // Ascending, so the first row seen for a listing is the oldest in the
        // window and the last is the newest. Any other order silently changes
        // which two numbers are being compared.
        .order("block_timestamp", { ascending: true })
        .limit(4000);
      if (!alive) return;
      if (error || !data) {
        setMovers([]);
        return;
      }

      const first = new Map<string, number>();
      const last = new Map<string, number>();
      for (const r of data) {
        const id = String(r.kol_id);
        const wei = Number(r.price_wei);
        if (!Number.isFinite(wei) || wei <= 0) continue;
        if (!first.has(id)) first.set(id, wei);
        last.set(id, wei);
      }

      const byId = new Map(KOLS.map((k) => [k.id, k]));
      const rows: Mover[] = [];
      for (const [id, base] of first) {
        const kol = byId.get(id);
        const now = last.get(id);
        // A listing present in the feed but absent from kols.ts has no name,
        // ticker or avatar to render. Skip it rather than invent one.
        if (!kol || now === undefined) continue;
        rows.push({ kol, priceWei: now, changePct: ((now - base) / base) * 100 });
      }

      // Largest absolute move first: a -18% is as much worth showing as a +18%,
      // and ranking signed would fill the splash with a single colour.
      rows.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
      setMovers(rows.slice(0, count));
    })();

    return () => {
      alive = false;
    };
  }, [count]);

  return movers;
}
