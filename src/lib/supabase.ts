/**
 * supabase.ts — access to the shared market feed.
 * ---------------------------------------------------------------------------
 * Every trader reads price, chart, and market cap from one shared Postgres
 * feed rather than each browser polling the chain on its own schedule and
 * recording its own private localStorage history. One source means two people
 * looking at the same listing at the same moment see the same numbers — which
 * is the whole point for something people trade against each other on.
 *
 * The client itself comes from `@/integrations/supabase/client`, which Lovable
 * Cloud generates and owns (it handles preview-auth brokering and the newer
 * opaque API key format). This module deliberately does NOT construct a second
 * client — two clients would mean two Realtime connections and two auth
 * states. It only adds a null-guard, because the generated client throws when
 * its env vars are missing and the app should still render (listings at their
 * opening price, empty chart) before the backend is wired up.
 *
 * Only the publishable/anon key ever reaches this code. RLS (see
 * supabase/migrations/0001_market_state.sql) makes it read-only on market
 * data: it cannot write a price or forge a chart point. The service role key
 * bypasses RLS entirely and belongs only in the indexer's server-side secrets.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as generatedClient } from "@/integrations/supabase/client";

const hasEnv = Boolean(
  import.meta.env["VITE_SUPABASE_URL"] && import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
);

/**
 * Null when Lovable Cloud isn't configured yet, so callers can fall back
 * instead of white-screening. The generated client is a lazy Proxy that only
 * constructs (and throws) on first property access, so referencing it here is
 * safe as long as we gate on the env vars first.
 */
export const supabase: SupabaseClient | null = hasEnv
  ? (generatedClient as unknown as SupabaseClient)
  : null;

export const isSupabaseConfigured = supabase !== null;

/** One row of the shared price history — mirrors public.price_history. */
export type PriceHistoryRow = {
  kol_id: string;
  score: number;
  price_wei: string;
  block_timestamp: string;
};

/** Current authoritative listing state — mirrors public.listings. */
export type ListingRow = {
  kol_id: string;
  kol_wallet: string;
  score: number;
  price_wei: string;
  shares_outstanding: string;
  vault_balance_wei: string;
  paused: boolean;
  last_update_ts: string | null;
};

/** wei (18dp) -> a float price in the chain's native token. */
export function weiToNative(wei: string): number {
  return Number(wei) / 1e18;
}
