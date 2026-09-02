/**
 * index-price-history — the chain indexer behind the shared market feed.
 * ---------------------------------------------------------------------------
 * Reads SharpsMarket's PriceUpdated events from Robinhood Chain and writes
 * them into Postgres (public.price_history + public.listings). Supabase
 * Realtime then broadcasts those row changes to every connected client, so
 * all traders see the same price, chart, and market cap at the same moment.
 *
 * WHY THIS EXISTS: the frontend used to record price history per-browser into
 * localStorage, which meant two people looking at the same KOL could see
 * different charts, and a new visitor saw a flat line until their own session
 * accumulated data. On-chain events are the real, shared history — this
 * function is what turns them into a feed everyone reads from.
 *
 * DESIGN NOTES
 *  - The chain stays the source of truth. This DB is a queryable mirror,
 *    rebuildable from scratch by resetting indexer_state.last_indexed_block
 *    to the contract's deploy block and re-running.
 *  - Idempotent: rows are keyed by (tx_hash, log_index) with `on conflict do
 *    nothing`, so retries, overlapping ranges after a restart, or a partial
 *    failure mid-batch can never double-write a chart point.
 *  - Advances last_indexed_block ONLY after the rows for that range are
 *    committed, so a crash mid-run re-reads that range next time rather than
 *    skipping it. Re-reading is safe precisely because writes are idempotent.
 *  - Runs with the service role, the only writer RLS allows (see
 *    supabase/migrations/0001_market_state.sql).
 *
 * Invoke on a schedule (pg_cron / Supabase scheduled functions). Required
 * secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ROBINHOOD_RPC_URL,
 * MARKET_ADDRESS, and optionally MARKET_DEPLOY_BLOCK (first block to scan).
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { createPublicClient, http, parseAbiItem, type Address } from "npm:viem@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
/**
 * Defaults to TESTNET, matching src/lib/evm/chain.ts. This used to default to
 * mainnet, which is the wrong direction to fail in: a missing secret would
 * have silently indexed a different chain than the one the app trades on, and
 * written the result into the price history every user reads as authoritative.
 * A wrong shared feed is worse than an empty one, so the safe default is the
 * chain where being wrong costs nothing.
 */
const RPC_URL = Deno.env.get("ROBINHOOD_RPC_URL") ?? "https://rpc.testnet.chain.robinhood.com";
const MARKET_ADDRESS = Deno.env.get("MARKET_ADDRESS") as Address | undefined;

/**
 * The block SharpsMarket was deployed in. Leaving this at 0 is not merely
 * slow: at ~100ms blocks the scan would spend every run grinding through
 * millions of empty pre-deploy blocks, MAX_WINDOWS_PER_RUN at a time, and
 * would take a very long time to reach the first real event.
 */
const DEPLOY_BLOCK = BigInt(Deno.env.get("MARKET_DEPLOY_BLOCK") ?? "0");

/**
 * Robinhood Chain produces ~100ms blocks, so a day is on the order of a
 * million blocks and an unbounded getLogs would be refused by any RPC. Scan in
 * bounded windows and stop after a fixed number of them, letting the next
 * scheduled run pick up where this one stopped — a backfill therefore
 * converges over several runs instead of one run timing out forever.
 */
const BLOCK_WINDOW = BigInt(Deno.env.get("INDEXER_BLOCK_WINDOW") ?? "10000");
const MAX_WINDOWS_PER_RUN = Number(Deno.env.get("INDEXER_MAX_WINDOWS") ?? "20");

const PRICE_UPDATED = parseAbiItem(
  "event PriceUpdated(address indexed kolWallet, uint8 score, uint256 priceWei, uint256 timestamp)",
);

/**
 * Trades. Indexed alongside PriceUpdated because nothing else records that a
 * trade happened: PriceUpdated says the price changed, not how much changed
 * hands. Without these, traded volume, fill counts and holder activity are
 * unanswerable, and the product had to either hide the figure or substitute a
 * different quantity under the same word.
 *
 * Scanned in the same block windows and inserted with the same
 * (tx_hash, log_index) idempotency, so re-reads and retries cannot inflate
 * volume — which is exactly the number double-counting would corrupt.
 */
const BOUGHT = parseAbiItem(
  "event Bought(address indexed kolWallet, address indexed buyer, uint256 shares, uint256 weiCost, uint256 timestamp)",
);
const SOLD = parseAbiItem(
  "event Sold(address indexed kolWallet, address indexed seller, uint256 shares, uint256 weiOut, bool haircut, uint256 timestamp)",
);

type Json = Record<string, unknown>;

function jsonResponse(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async () => {
  if (!MARKET_ADDRESS) {
    return jsonResponse({ error: "MARKET_ADDRESS is not set — nothing to index." }, 500);
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const chain = createPublicClient({ transport: http(RPC_URL) });

  // Map on-chain wallet -> our listing id. Only wallets we actually list are
  // indexed; an event for an unknown wallet is skipped rather than inventing
  // a listing row (kol_id is a real foreign key).
  const { data: listingRows, error: listingErr } = await db
    .from("listings")
    .select("kol_id, kol_wallet");
  if (listingErr) {
    return jsonResponse({ error: `failed to load listings: ${listingErr.message}` }, 500);
  }
  const walletToId = new Map<string, string>(
    (listingRows ?? []).map((r) => [String(r.kol_wallet).toLowerCase(), String(r.kol_id)]),
  );
  if (walletToId.size === 0) {
    return jsonResponse(
      {
        error:
          "no rows in public.listings — seed listings before indexing (see scripts/seed-listings).",
      },
      500,
    );
  }

  const { data: stateRow, error: stateErr } = await db
    .from("indexer_state")
    .select("last_indexed_block")
    .eq("id", 1)
    .single();
  if (stateErr) {
    return jsonResponse({ error: `failed to read indexer_state: ${stateErr.message}` }, 500);
  }

  const storedBlock = BigInt(stateRow?.last_indexed_block ?? 0);
  let fromBlock = storedBlock > 0n ? storedBlock + 1n : DEPLOY_BLOCK;
  const headBlock = await chain.getBlockNumber();

  let windows = 0;
  let inserted = 0;
  let skippedUnknownWallet = 0;
  let fillsInserted = 0;

  while (fromBlock <= headBlock && windows < MAX_WINDOWS_PER_RUN) {
    const toBlock =
      fromBlock + BLOCK_WINDOW - 1n > headBlock ? headBlock : fromBlock + BLOCK_WINDOW - 1n;

    // All three event types come from the same window in parallel — one extra
    // round-trip per window rather than a second full scan of the chain.
    const [logs, boughtLogs, soldLogs] = await Promise.all([
      chain.getLogs({ address: MARKET_ADDRESS, event: PRICE_UPDATED, fromBlock, toBlock }),
      chain.getLogs({ address: MARKET_ADDRESS, event: BOUGHT, fromBlock, toBlock }),
      chain.getLogs({ address: MARKET_ADDRESS, event: SOLD, fromBlock, toBlock }),
    ]);

    // Fills first: a trade is what caused the price change indexed below, so
    // recording it first means the two are never observed out of order.
    const fillRows: Record<string, unknown>[] = [];
    for (const log of boughtLogs) {
      const wallet = String(log.args.kolWallet).toLowerCase();
      const kolId = walletToId.get(wallet);
      if (!kolId) continue;
      fillRows.push({
        kol_id: kolId,
        kol_wallet: wallet,
        side: "buy",
        trader: String(log.args.buyer).toLowerCase(),
        shares: String(log.args.shares),
        wei: String(log.args.weiCost),
        block_number: Number(log.blockNumber),
        block_timestamp: new Date(Number(log.args.timestamp) * 1000).toISOString(),
        tx_hash: log.transactionHash,
        log_index: log.logIndex,
      });
    }
    for (const log of soldLogs) {
      const wallet = String(log.args.kolWallet).toLowerCase();
      const kolId = walletToId.get(wallet);
      if (!kolId) continue;
      fillRows.push({
        kol_id: kolId,
        kol_wallet: wallet,
        side: "sell",
        trader: String(log.args.seller).toLowerCase(),
        shares: String(log.args.shares),
        wei: String(log.args.weiOut),
        block_number: Number(log.blockNumber),
        block_timestamp: new Date(Number(log.args.timestamp) * 1000).toISOString(),
        tx_hash: log.transactionHash,
        log_index: log.logIndex,
      });
    }
    if (fillRows.length > 0) {
      const { error: fillErr } = await db
        .from("fills")
        .upsert(fillRows, { onConflict: "tx_hash,log_index", ignoreDuplicates: true });
      if (fillErr) {
        return jsonResponse(
          { error: `fills insert failed at blocks ${fromBlock}-${toBlock}: ${fillErr.message}` },
          500,
        );
      }
      fillsInserted += fillRows.length;
    }

    if (logs.length > 0) {
      const rows = [];
      for (const log of logs) {
        const wallet = String(log.args.kolWallet).toLowerCase();
        const kolId = walletToId.get(wallet);
        if (!kolId) {
          skippedUnknownWallet++;
          continue;
        }
        rows.push({
          kol_id: kolId,
          kol_wallet: wallet,
          score: Number(log.args.score),
          price_wei: String(log.args.priceWei),
          block_number: Number(log.blockNumber),
          // The contract emits block.timestamp directly in the event, so this
          // needs no extra per-block RPC round-trip.
          block_timestamp: new Date(Number(log.args.timestamp) * 1000).toISOString(),
          tx_hash: log.transactionHash,
          log_index: log.logIndex,
        });
      }

      if (rows.length > 0) {
        // Idempotent: duplicates on (tx_hash, log_index) are dropped, so a
        // re-read of an already-indexed range is a no-op rather than an error.
        const { error: insertErr } = await db
          .from("price_history")
          .upsert(rows, { onConflict: "tx_hash,log_index", ignoreDuplicates: true });
        if (insertErr) {
          return jsonResponse(
            { error: `insert failed at blocks ${fromBlock}-${toBlock}: ${insertErr.message}` },
            500,
          );
        }
        inserted += rows.length;

        // Current-state mirror: last event in this window per KOL wins. Read
        // by clients for "what is the price right now", and what Realtime
        // broadcasts on change.
        const latestPerKol = new Map<string, (typeof rows)[number]>();
        for (const row of rows) {
          const prev = latestPerKol.get(row.kol_id);
          if (
            !prev ||
            row.block_number > prev.block_number ||
            (row.block_number === prev.block_number && row.log_index > prev.log_index)
          ) {
            latestPerKol.set(row.kol_id, row);
          }
        }
        for (const row of latestPerKol.values()) {
          const { error: updateErr } = await db
            .from("listings")
            .update({
              score: row.score,
              price_wei: row.price_wei,
              last_update_ts: row.block_timestamp,
              updated_at: new Date().toISOString(),
            })
            .eq("kol_id", row.kol_id)
            // Never let an out-of-order or replayed event walk current state
            // backwards past a newer one already recorded.
            .lte("last_update_ts", row.block_timestamp);
          if (updateErr) {
            return jsonResponse(
              { error: `listing update failed for ${row.kol_id}: ${updateErr.message}` },
              500,
            );
          }
        }
      }
    }

    // Only advance the cursor once this window's rows are committed. A crash
    // before here means the range is simply re-read next run (safe, since
    // writes are idempotent) rather than silently skipped.
    const { error: cursorErr } = await db
      .from("indexer_state")
      .update({ last_indexed_block: Number(toBlock), updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (cursorErr) {
      return jsonResponse({ error: `cursor update failed: ${cursorErr.message}` }, 500);
    }

    fromBlock = toBlock + 1n;
    windows++;
  }

  return jsonResponse({
    ok: true,
    headBlock: Number(headBlock),
    indexedThrough: Number(fromBlock - 1n),
    caughtUp: fromBlock > headBlock,
    windowsScanned: windows,
    rowsInserted: inserted,
    fillsInserted,
    skippedUnknownWallet,
  });
});
