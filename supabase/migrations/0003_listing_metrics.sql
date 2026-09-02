-- 0003_listing_metrics.sql — the oracle's measurements, shared like everything else.
-- ---------------------------------------------------------------------------
-- Why this exists: publish.ts already computes win rate, realized PnL, volume,
-- trade count, biggest wins/losses and the percentile breakdown behind each
-- score. All of it was written to public/scores.json, which is gitignored (it
-- is generated, so correctly so) and therefore never ships. The deployed app
-- fetches /scores.json, gets a 404, and every one of those panels renders
-- empty — win rate "—", no PnL, no biggest wins, no "why this score".
--
-- The data existed; it just had no route to production. This gives it the same
-- route price and score already take: written by the oracle with the service
-- role, read by everyone through RLS, broadcast by Realtime so two people
-- looking at a listing see identical numbers.
--
-- scores.json stays as the local-dev fallback, so the app still works with no
-- backend configured.

create table if not exists public.listing_metrics (
  kol_id            text primary key references public.listings (kol_id) on delete cascade,

  -- Measured over the scoring window, in the chain's native token (ETH).
  -- Named *_eth rather than the *_sol these carried before the move off
  -- Solana: a field named for the wrong asset is how someone eventually reads
  -- an ETH figure as SOL.
  realized_pnl_eth  double precision not null default 0,
  volume_eth        double precision not null default 0,
  win_rate          double precision not null default 0,   -- 0..1
  trades            integer          not null default 0,

  -- Evidence behind the score, not inputs to it. Arrays of
  -- { symbol, pnl, proceeds, ts, multiple }.
  top_wins          jsonb            not null default '[]'::jsonb,
  top_losses        jsonb            not null default '[]'::jsonb,

  -- The percentile components that produced the score, plus how much of that
  -- blend survived small-sample shrinkage. { pnlPct, winPct, volPct, tradesPct }.
  breakdown         jsonb            not null default '{}'::jsonb,
  -- trades / (trades + 20). 0 means "not measured", which is deliberately
  -- distinguishable from a measured 0% win rate.
  confidence        double precision not null default 0,

  updated_at        timestamptz      not null default now(),

  constraint listing_metrics_win_rate_range   check (win_rate >= 0 and win_rate <= 1),
  constraint listing_metrics_confidence_range check (confidence >= 0 and confidence <= 1)
);

comment on table public.listing_metrics is
  'Per-listing oracle measurements. Written only by the oracle (service role); the source of truth for what the UI shows beneath the price.';

-- ---------------------------------------------------------------------------
-- Row Level Security — public read, oracle-only write.
-- ---------------------------------------------------------------------------
-- Same shape as listings/price_history: no insert or update policy is granted
-- at all, so a leaked publishable key cannot forge a win rate. The oracle uses
-- the service role, which bypasses RLS and needs no policy of its own.

alter table public.listing_metrics enable row level security;

drop policy if exists "listing metrics are publicly readable" on public.listing_metrics;
create policy "listing metrics are publicly readable"
  on public.listing_metrics for select
  using (true);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'listing_metrics'
  ) then
    alter publication supabase_realtime add table public.listing_metrics;
  end if;
end
$$;
