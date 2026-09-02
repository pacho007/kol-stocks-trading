/**
 * seed-listings.ts — populate public.listings from src/lib/kols.ts.
 * ---------------------------------------------------------------------------
 * The indexer maps on-chain wallets to our listing ids, so these rows must
 * exist before it can write any price history (kol_id is a real foreign key,
 * deliberately — an event for an unknown wallet should be skipped and
 * reported, not silently invent a listing).
 *
 * Idempotent: re-running upserts by kol_id and never clobbers live price/score
 * state written by the indexer — it only ensures the row exists with the right
 * wallet. Safe to re-run after adding KOLs to kols.ts.
 *
 * Uses the SERVICE ROLE key (the only writer RLS permits). That key bypasses
 * RLS entirely — keep it in your shell/secret manager, never in the app.
 *
 * Run:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx supabase/seed-listings.ts
 */

import { createClient } from "@supabase/supabase-js";
import { KOLS } from "../src/lib/kols.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Both come from your Supabase project settings (API). The service role key\n" +
      "bypasses RLS — never commit it and never expose it to the browser.",
  );
  process.exit(1);
}

/** Opening price, in wei — must match SharpsMarket's OPEN_PRICE_WEI (score 50). */
const OPEN_PRICE_WEI = "4000000000000";

async function main() {
  const db = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const rows = KOLS.map((k) => ({
    kol_id: k.id,
    kol_wallet: k.wallet.toLowerCase(),
    price_wei: OPEN_PRICE_WEI,
  }));

  // onConflict on the primary key: insert new listings, leave existing rows'
  // live score/price alone (only kol_wallet is corrected if it changed).
  const { error } = await db
    .from("listings")
    .upsert(rows, { onConflict: "kol_id", ignoreDuplicates: true });

  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }

  const { count } = await db.from("listings").select("*", { count: "exact", head: true });
  console.log(`Seeded ${rows.length} listings from kols.ts. Table now holds ${count ?? "?"} rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
