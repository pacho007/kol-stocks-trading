-- 0004_fills.sql - record actual trades, so volume is a measurement.
-- ---------------------------------------------------------------------------
-- The indexer subscribed to PriceUpdated only, so Bought and Sold went
-- unrecorded and nothing in the product could say how much had actually
-- traded. The index bar had to drop its volume tile, and the market table
-- substituted each trader's own on-chain volume, which is a different quantity
-- wearing the same word.
--
-- The events already carry everything needed; they simply had no destination.

create table if not exists public.fills (
  id              bigserial primary key,
  kol_id          text        not null references public.listings (kol_id) on delete cascade,
  kol_wallet      text        not null,

  side            text        not null check (side in ('buy', 'sell')),
  trader          text        not null,          -- the buyer or seller
  shares          numeric(78, 0) not null,
  -- Wei paid on a buy, or received on a sell. Fee-inclusive on the buy side
  -- and net of fees on the sell side, matching what the wallet actually moved.
  wei             numeric(78, 0) not null,

  block_number    bigint      not null,
  block_timestamp timestamptz not null,
  tx_hash         text        not null,
  log_index       integer     not null,
  created_at      timestamptz not null default now(),

  -- Same idempotency guarantee as price_history: one row per on-chain log,
  -- forever, so retries and overlapping scan ranges cannot double-count volume.
  constraint fills_log_unique unique (tx_hash, log_index)
);

comment on table public.fills is
  'One row per Bought/Sold event. The source of truth for traded volume and holder activity.';

-- Volume queries are always "this listing, recent first" or "everything since
-- a timestamp"; both are served by this.
create index if not exists fills_kol_time_idx
  on public.fills (kol_id, block_timestamp desc);
create index if not exists fills_time_idx
  on public.fills (block_timestamp desc);

alter table public.fills enable row level security;

drop policy if exists "fills are publicly readable" on public.fills;
create policy "fills are publicly readable"
  on public.fills for select
  using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fills'
  ) then
    alter publication supabase_realtime add table public.fills;
  end if;
end
$$;

-- 24h rolling volume per listing, as a view so the app does not have to carry
-- the window logic and every client agrees on what "24h" means.
create or replace view public.listing_volume_24h as
select
  l.kol_id,
  coalesce(sum(f.wei), 0)::numeric(78, 0) as volume_wei,
  coalesce(count(f.id), 0)                as fill_count,
  coalesce(count(distinct f.trader), 0)   as trader_count
from public.listings l
left join public.fills f
  on f.kol_id = l.kol_id
 and f.block_timestamp > now() - interval '24 hours'
group by l.kol_id;

comment on view public.listing_volume_24h is
  'Rolling 24h traded volume per listing. A view rather than a maintained column so it can never drift from the fills it summarises.';
