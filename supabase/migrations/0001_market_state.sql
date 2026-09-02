-- Shared market state for SHARPS.
-- ---------------------------------------------------------------------------
-- This is the single source of truth every client reads, so that everyone
-- trading the same listings sees the same price, the same chart, and the same
-- market cap at the same moment. Nothing here is derived per-browser: the
-- frontend used to record its own price history into localStorage, which meant
-- two users could see different charts for the same KOL. That is replaced by
-- these tables plus Supabase Realtime broadcast.
--
-- Authority model:
--   * The indexer (supabase/functions/index-price-history) runs with the
--     service role and is the ONLY writer. It reconstructs everything from
--     SharpsMarket's on-chain PriceUpdated events, so the chain stays the
--     ultimate source of truth and this database is a queryable mirror of it.
--   * Everyone else gets read-only access (RLS policies below). A client
--     cannot write a price, which is what keeps the feed fair.

-- uint256 values (wei, share counts) do not fit in bigint. numeric(78,0) holds
-- the full uint256 range (2^256-1 is 78 digits) with no precision loss.

create table if not exists public.listings (
  kol_id              text primary key,
  kol_wallet          text        not null unique,
  score               smallint    not null default 50,
  price_wei           numeric(78, 0) not null,
  shares_outstanding  numeric(78, 0) not null default 0,
  vault_balance_wei   numeric(78, 0) not null default 0,
  paused              boolean     not null default false,
  last_update_ts      timestamptz,
  updated_at          timestamptz not null default now(),
  constraint listings_score_range check (score >= 0 and score <= 100)
);

comment on table public.listings is
  'Current authoritative state per KOL listing, mirrored from SharpsMarket on Robinhood Chain.';

create table if not exists public.price_history (
  id               bigserial primary key,
  kol_id           text        not null references public.listings (kol_id) on delete cascade,
  kol_wallet       text        not null,
  score            smallint    not null,
  price_wei        numeric(78, 0) not null,
  block_number     bigint      not null,
  block_timestamp  timestamptz not null,
  tx_hash          text        not null,
  log_index        integer     not null,
  created_at       timestamptz not null default now(),
  -- Idempotency: one row per on-chain log, forever. Re-running the indexer,
  -- overlapping block ranges after a restart, or a retry after a partial
  -- failure can never duplicate a chart point.
  constraint price_history_log_unique unique (tx_hash, log_index)
);

comment on table public.price_history is
  'Append-only time series, one row per on-chain PriceUpdated event. Backs the price chart.';

-- The chart query is always "latest N points for one KOL, newest first".
create index if not exists price_history_kol_time_idx
  on public.price_history (kol_id, block_timestamp desc);

-- Resume point so a restarted indexer does not rescan from genesis.
create table if not exists public.indexer_state (
  id                 integer     primary key default 1,
  last_indexed_block bigint      not null default 0,
  updated_at         timestamptz not null default now(),
  constraint indexer_state_singleton check (id = 1)
);

insert into public.indexer_state (id, last_indexed_block)
values (1, 0)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Public read, nobody-but-the-indexer write. The service role used by the
-- Edge Function bypasses RLS entirely, so it needs no policy of its own —
-- deliberately NOT granting any insert/update policy here means a leaked anon
-- key still cannot forge a price or a chart point.

alter table public.listings      enable row level security;
alter table public.price_history enable row level security;
alter table public.indexer_state enable row level security;

drop policy if exists "listings are publicly readable" on public.listings;
create policy "listings are publicly readable"
  on public.listings for select
  using (true);

drop policy if exists "price history is publicly readable" on public.price_history;
create policy "price history is publicly readable"
  on public.price_history for select
  using (true);

-- indexer_state has NO select policy: it is operational bookkeeping, not
-- market data, and nothing in the client needs it.

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Broadcast row changes to every subscribed client simultaneously — this is
-- what makes the live feed shared and fair rather than per-browser polling.
-- `add table` errors if the table is already a member, hence the guards.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'listings'
  ) then
    alter publication supabase_realtime add table public.listings;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'price_history'
  ) then
    alter publication supabase_realtime add table public.price_history;
  end if;
end
$$;
