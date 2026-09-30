-- 0008_solana.sql — move the market's mirror tables from Robinhood Chain to Solana.
--
-- The market now runs on the sharps Solana program (anchor/programs/sharps)
-- with a fresh set of listed traders, so nothing in these tables carries over:
-- every row describes a Robinhood Chain wallet or event. They are cleared,
-- then the EVM-shaped columns are renamed to what they now hold:
--
--   wei / *_wei       -> lamports / *_lamports   (1 SOL = 1e9 lamports)
--   *_eth             -> *_sol
--   block_number      -> slot
--   tx_hash           -> signature                (base58 transaction signature)
--   log_index         -> event_index              (position among the tx's program events)
--   indexer cursor    -> last_signature           (getSignaturesForAddress paging)
--
-- Wallet columns are NOT lowercased any more: base58 is case-sensitive.

begin;

truncate table public.price_history, public.fills, public.listing_metrics, public.listings cascade;

-- listings
alter table public.listings rename column price_wei to price_lamports;
alter table public.listings rename column vault_balance_wei to vault_balance_lamports;
alter table public.listings alter column price_lamports type numeric(20, 0);
alter table public.listings alter column vault_balance_lamports type numeric(20, 0);
alter table public.listings alter column shares_outstanding type numeric(20, 0);
comment on table public.listings is
  'Current authoritative state per KOL listing, mirrored from the sharps program on Solana.';

-- price_history
alter table public.price_history rename column price_wei to price_lamports;
alter table public.price_history rename column block_number to slot;
alter table public.price_history rename column block_timestamp to block_time;
alter table public.price_history rename column tx_hash to signature;
alter table public.price_history rename column log_index to event_index;
alter table public.price_history alter column price_lamports type numeric(20, 0);
alter table public.price_history rename constraint price_history_log_unique to price_history_event_unique;
comment on table public.price_history is
  'Append-only time series, one row per on-chain PriceUpdated event. Backs the price chart.';
drop index if exists public.price_history_kol_time_idx;
create index if not exists price_history_kol_time_idx
  on public.price_history (kol_id, block_time desc);

-- fills (the view depends on fills.wei, so it goes first)
drop view if exists public.listing_volume_24h;

alter table public.fills rename column wei to lamports;
alter table public.fills rename column block_number to slot;
alter table public.fills rename column block_timestamp to block_time;
alter table public.fills rename column tx_hash to signature;
alter table public.fills rename column log_index to event_index;
alter table public.fills alter column lamports type numeric(20, 0);
alter table public.fills alter column shares type numeric(20, 0);
alter table public.fills rename constraint fills_log_unique to fills_event_unique;
drop index if exists public.fills_kol_time_idx;
drop index if exists public.fills_time_idx;
create index if not exists fills_kol_time_idx on public.fills (kol_id, block_time desc);
create index if not exists fills_time_idx on public.fills (block_time desc);
create index if not exists fills_trader_idx on public.fills (trader, block_time);

create view public.listing_volume_24h
with (security_invoker = true) as
select
  l.kol_id,
  coalesce(sum(f.lamports), 0)::numeric(20, 0) as volume_lamports,
  coalesce(count(f.id), 0)                     as fill_count,
  coalesce(count(distinct f.trader), 0)        as trader_count
from public.listings l
left join public.fills f
  on f.kol_id = l.kol_id
 and f.block_time > now() - interval '24 hours'
group by l.kol_id;
comment on view public.listing_volume_24h is
  'Rolling 24h traded volume per listing, in lamports. A view so it can never drift from the fills it summarises.';

-- listing_metrics
alter table public.listing_metrics rename column realized_pnl_eth to realized_pnl_sol;
alter table public.listing_metrics rename column volume_eth to volume_sol;

-- indexer cursor: Solana is paged by signature, not block range.
alter table public.indexer_state rename column last_indexed_block to last_slot;
alter table public.indexer_state add column if not exists last_signature text;
update public.indexer_state set last_slot = 0, last_signature = null, updated_at = now() where id = 1;

-- token_launch: the $SHARPS token is a Solana mint now; launchpad is no longer Pons.
alter table public.token_launch rename column contract_address to mint_address;
alter table public.token_launch rename column pons_url to launchpad_url;
update public.token_launch set mint_address = null, launchpad_url = null, launched_at = null, updated_at = now() where id = 1;
comment on table public.token_launch is
  'Single row holding the live $SHARPS mint address. Read at runtime by /sharps so the address can be published without a rebuild.';

commit;
