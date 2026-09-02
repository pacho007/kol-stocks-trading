-- 0002_schedule_indexer.sql — run the indexer on a timer.
-- ---------------------------------------------------------------------------
-- 0001 creates the tables the indexer writes into; this schedules the Edge
-- Function that fills them. Without it the function only runs when something
-- invokes it by hand, so the shared price feed silently stops updating the
-- moment you stop poking it.
--
-- Paste this whole file into the SQL editor and run it. Nothing to fill in,
-- and no key to handle — see the note on authentication below.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: unschedule first so re-running never stacks duplicate jobs that
-- all fire at the same instant.
select cron.unschedule('index-price-history')
where exists (select 1 from cron.job where jobname = 'index-price-history');

-- Every 5 minutes. The oracle refreshes roughly every 20 (oracle/publish.ts's
-- REFRESH_MIN), so this stays comfortably ahead of it without being wasteful:
-- the function is cheap and idempotent when there are no new events, and
-- running well inside the oracle's period keeps chart lag bounded by the
-- oracle rather than by the indexer.
--
-- AUTHENTICATION: deliberately none. The function is deployed with JWT
-- verification off (verified: an unauthenticated POST returns 200 and a normal
-- indexing report), so no Authorization header is needed — which means the
-- service role key stays out of this file, out of the cron job body, and out
-- of git history, where a scheduled job would otherwise have parked it
-- permanently in plain text.
--
-- The trade-off is that anyone who learns the URL can trigger an index run.
-- That is bounded rather than dangerous: the function only ever writes what
-- the chain already says, rows are unique on (tx_hash, log_index) so repeats
-- insert nothing, and last_indexed_block only moves forward after a range
-- commits. So the exposure is compute cost, not corrupted prices. Fine on
-- testnet. Before mainnet, either re-deploy with JWT verification on and move
-- the key into Vault (see the bottom of this file), or put the function behind
-- a shared secret.
select cron.schedule(
  'index-price-history',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://ncsydqwcbtjppfgwxyvt.supabase.co/functions/v1/index-price-history',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Check it registered:
--   select jobname, schedule, active from cron.job;
--
-- Check it is actually firing (start_time, status, return_message):
--   select * from cron.job_run_details
--    where jobname = 'index-price-history'
--    order by start_time desc limit 10;
--
-- Check it is actually indexing, once the oracle starts pushing scores:
--   select count(*) from public.price_history;
--   select last_indexed_block, updated_at from public.indexer_state;

-- ---------------------------------------------------------------------------
-- If you later re-deploy the function WITH JWT verification enabled, it will
-- need an Authorization header. Keep the key in Vault rather than inline:
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
-- then schedule with a lookup instead of a literal:
--
--   headers := jsonb_build_object(
--     'Content-Type',  'application/json',
--     'Authorization', 'Bearer ' || (
--       select decrypted_secret from vault.decrypted_secrets
--        where name = 'service_role_key'
--     )
--   ),
