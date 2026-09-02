-- 0002_schedule_indexer.sql — run the indexer on a timer.
-- ---------------------------------------------------------------------------
-- 0001 creates the tables the indexer writes into; this schedules the Edge
-- Function that fills them. Without it the function only ever runs when
-- something invokes it by hand, which means the shared price feed silently
-- stops updating the moment you stop poking it.
--
-- BEFORE RUNNING THIS, replace the two placeholders below:
--   <PROJECT_REF>        e.g. ncsydqwcbtjppfgwxyvt (supabase/config.toml)
--   <SERVICE_ROLE_KEY>   Project Settings -> API -> service_role
--
-- On the service role key: it bypasses RLS entirely. Putting it in a migration
-- means it lands in your git history, so DO NOT commit this file with the key
-- filled in. Either run it once from the SQL editor with the values pasted in,
-- or keep it in Vault (the commented-out variant at the bottom).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: unschedule first so re-running this migration doesn't stack up
-- duplicate jobs all hitting the function at the same instant.
select cron.unschedule('index-price-history')
where exists (select 1 from cron.job where jobname = 'index-price-history');

-- Every 5 minutes. The oracle refreshes roughly every 20 (oracle/publish.ts's
-- REFRESH_MIN), so this is comfortably ahead of it without being wasteful --
-- the function is idempotent and cheap when there are no new events, and
-- running well inside the oracle's period keeps chart lag bounded by the
-- oracle rather than by the indexer.
select cron.schedule(
  'index-price-history',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/index-price-history',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Check it registered:
--   select jobname, schedule, active from cron.job;
-- Check it is actually firing (start_time, status, return_message):
--   select * from cron.job_run_details
--    where jobname = 'index-price-history'
--    order by start_time desc limit 10;

-- ---------------------------------------------------------------------------
-- Preferred variant: keep the key in Vault instead of in SQL text.
-- Store it once, out of band:
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
-- then schedule with a lookup rather than a literal:
--
--   select cron.schedule(
--     'index-price-history', '*/5 * * * *',
--     $$
--     select net.http_post(
--       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/index-price-history',
--       headers := jsonb_build_object(
--         'Content-Type',  'application/json',
--         'Authorization', 'Bearer ' || (
--           select decrypted_secret from vault.decrypted_secrets
--            where name = 'service_role_key'
--         )
--       ),
--       body := '{}'::jsonb,
--       timeout_milliseconds := 55000
--     );
--     $$
--   );
