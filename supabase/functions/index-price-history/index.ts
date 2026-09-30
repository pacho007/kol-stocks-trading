/**
 * index-price-history — the chain indexer behind the shared market feed.
 * ---------------------------------------------------------------------------
 * Reads the sharps program's events from Solana and writes them into Postgres
 * (public.price_history, public.fills, public.listings). Supabase Realtime
 * then broadcasts those row changes to every connected client, so all traders
 * see the same price, chart, and market cap at the same moment.
 *
 * HOW EVENTS ARE READ
 *  - getSignaturesForAddress(PROGRAM_ID) lists every transaction that touched
 *    the program, newest first, back to the stored cursor (last_signature).
 *  - Each transaction is processed OLDEST FIRST, and the cursor advances after
 *    each chunk is committed — so a run that hits its time budget simply stops,
 *    and the next run continues exactly where it left off.
 *  - Anchor's emit! writes "Program data: <base64>" log lines. A line is only
 *    accepted when the sharps program is the one executing at that point in
 *    the log (tracked through the invoke/success stack): any program in the
 *    same transaction could print a line that LOOKS like our event, and a
 *    forged Bought would otherwise become real traded volume.
 *
 * DESIGN NOTES
 *  - The chain stays the source of truth. This DB is a rebuildable mirror:
 *    clear the tables and set indexer_state.last_signature to null.
 *  - Idempotent: rows are keyed by (signature, event_index) with
 *    `on conflict do nothing`, so retries and re-reads never double-write.
 *  - Runs with the service role, the only writer RLS allows.
 *
 * Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SOLANA_RPC_URL,
 * PROGRAM_ID.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { eventDiscriminator, programEvents } from "./events.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
/** Devnet by default — a wrong shared feed is worse than an empty one. */
const RPC_URL = Deno.env.get("SOLANA_RPC_URL") ?? "https://api.devnet.solana.com";
const PROGRAM_ID = Deno.env.get("PROGRAM_ID");

/** Stop starting new work after this long, well inside the function timeout. */
const TIME_BUDGET_MS = Number(Deno.env.get("INDEXER_TIME_BUDGET_MS") ?? "100000");
const CHUNK = Number(Deno.env.get("INDEXER_CHUNK") ?? "25");
const CONCURRENCY = Number(Deno.env.get("INDEXER_CONCURRENCY") ?? "5");

type Json = Record<string, unknown>;

function jsonResponse(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ------------------------------------------------------------------ RPC

let rpcId = 0;
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let delay = 400;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    });
    if (res.status === 429 && attempt < 6) {
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
      continue;
    }
    const body = await res.json();
    if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
    return body.result as T;
  }
}

type SigInfo = { signature: string; slot: number; err: unknown; blockTime: number | null };
type Tx = {
  slot: number;
  blockTime: number | null;
  meta: { err: unknown; logMessages: string[] | null } | null;
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

// ------------------------------------------------------------------ run

Deno.serve(async () => {
  const started = Date.now();
  if (!PROGRAM_ID) return jsonResponse({ error: "PROGRAM_ID is not set — nothing to index." }, 500);

  // REFUSE TO INDEX THE WRONG CLUSTER. PROGRAM_ID and SOLANA_RPC_URL are
  // independent secrets; a program id with no executable account on this RPC
  // means they name different clusters, and indexing would silently record
  // nothing forever.
  const programInfo = await rpc<{ value: { executable: boolean } | null }>("getAccountInfo", [
    PROGRAM_ID,
    { encoding: "base64" },
  ]).catch(() => null);
  if (!programInfo?.value?.executable) {
    return jsonResponse(
      {
        error:
          `PROGRAM_ID ${PROGRAM_ID} is not a deployed program on the cluster at SOLANA_RPC_URL. ` +
          `Refusing to index rather than silently recording nothing.`,
      },
      500,
    );
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: listingRows, error: listingErr } = await db
    .from("listings")
    .select("kol_id, kol_wallet");
  if (listingErr)
    return jsonResponse({ error: `failed to load listings: ${listingErr.message}` }, 500);
  // Exact match: base58 is case-sensitive.
  const walletToId = new Map<string, string>(
    (listingRows ?? []).map((r) => [String(r.kol_wallet), String(r.kol_id)]),
  );
  if (walletToId.size === 0) {
    return jsonResponse(
      { error: "no rows in public.listings — seed listings before indexing." },
      500,
    );
  }

  const { data: stateRow, error: stateErr } = await db
    .from("indexer_state")
    .select("last_signature")
    .eq("id", 1)
    .single();
  if (stateErr)
    return jsonResponse({ error: `failed to read indexer_state: ${stateErr.message}` }, 500);
  const until: string | null = stateRow?.last_signature ?? null;

  // Every signature newer than the cursor, newest first, then flipped.
  const pending: SigInfo[] = [];
  let before: string | undefined;
  for (;;) {
    const page = await rpc<SigInfo[]>("getSignaturesForAddress", [
      PROGRAM_ID,
      { limit: 1000, ...(before ? { before } : {}), ...(until ? { until } : {}) },
    ]);
    pending.push(...page);
    if (page.length < 1000) break;
    before = page[page.length - 1]!.signature;
  }
  pending.reverse();

  const discs = new Map<string, string>();
  for (const name of ["PriceUpdated", "Bought", "Sold"])
    discs.set(await eventDiscriminator(name), name);

  let processed = 0;
  let pricesInserted = 0;
  let fillsInserted = 0;
  let skippedUnknownWallet = 0;

  for (let i = 0; i < pending.length; i += CHUNK) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const chunk = pending.slice(i, i + CHUNK);
    const txs = await mapLimit(chunk, CONCURRENCY, (s) =>
      s.err
        ? Promise.resolve(null)
        : rpc<Tx | null>("getTransaction", [
            s.signature,
            { encoding: "json", maxSupportedTransactionVersion: 1, commitment: "confirmed" },
          ]),
    );

    const priceRows: Record<string, unknown>[] = [];
    const fillRows: Record<string, unknown>[] = [];
    chunk.forEach((s, j) => {
      const tx = txs[j];
      if (!tx?.meta || tx.meta.err || !tx.meta.logMessages) return;
      programEvents(tx.meta.logMessages, PROGRAM_ID, discs).forEach((ev, eventIndex) => {
        const kolId = walletToId.get(ev.kolWallet);
        if (!kolId) {
          skippedUnknownWallet++;
          return;
        }
        const blockTime = new Date(Number(ev.ts) * 1000).toISOString();
        const common = {
          kol_id: kolId,
          kol_wallet: ev.kolWallet,
          slot: tx.slot,
          block_time: blockTime,
          signature: s.signature,
          event_index: eventIndex,
        };
        if (ev.kind === "price") {
          priceRows.push({
            ...common,
            score: ev.score,
            price_lamports: ev.priceLamports.toString(),
          });
        } else {
          fillRows.push({
            ...common,
            side: ev.side,
            trader: ev.trader,
            shares: ev.shares.toString(),
            lamports: ev.lamports.toString(),
          });
        }
      });
    });

    // Fills first: a trade is what caused the price change recorded with it.
    if (fillRows.length > 0) {
      const { error } = await db
        .from("fills")
        .upsert(fillRows, { onConflict: "signature,event_index", ignoreDuplicates: true });
      if (error) return jsonResponse({ error: `fills insert failed: ${error.message}` }, 500);
      fillsInserted += fillRows.length;
    }
    if (priceRows.length > 0) {
      const { error } = await db
        .from("price_history")
        .upsert(priceRows, { onConflict: "signature,event_index", ignoreDuplicates: true });
      if (error) return jsonResponse({ error: `price insert failed: ${error.message}` }, 500);
      pricesInserted += priceRows.length;

      // Current-state mirror: the last event per KOL in this chunk wins.
      const latest = new Map<string, Record<string, unknown>>();
      for (const row of priceRows) latest.set(String(row.kol_id), row);
      for (const row of latest.values()) {
        const { error: updateErr } = await db
          .from("listings")
          .update({
            score: row.score,
            price_lamports: row.price_lamports,
            last_update_ts: row.block_time,
            updated_at: new Date().toISOString(),
          })
          .eq("kol_id", String(row.kol_id))
          // Never walk current state backwards past a newer event; the null
          // arm lets a seeded row take its first update.
          .or(`last_update_ts.is.null,last_update_ts.lte."${row.block_time}"`);
        if (updateErr) {
          return jsonResponse({ error: `listing update failed: ${updateErr.message}` }, 500);
        }
      }
    }

    // Advance only after this chunk's rows are committed.
    const last = chunk[chunk.length - 1]!;
    const { error: cursorErr } = await db
      .from("indexer_state")
      .update({
        last_signature: last.signature,
        last_slot: last.slot,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (cursorErr)
      return jsonResponse({ error: `cursor update failed: ${cursorErr.message}` }, 500);
    processed += chunk.length;
  }

  return jsonResponse({
    ok: true,
    pending: pending.length,
    processed,
    caughtUp: processed === pending.length,
    pricesInserted,
    fillsInserted,
    skippedUnknownWallet,
  });
});
