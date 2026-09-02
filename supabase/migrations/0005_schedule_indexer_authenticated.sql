-- 0005_schedule_indexer_authenticated.sql
-- ---------------------------------------------------------------------------
-- Re-schedules the indexer to call an AUTHENTICATED function, and keeps the
-- key in Vault rather than in this file.
--
-- Run this only AFTER re-deploying index-price-history with JWT verification
-- enabled (it is currently deployed with verification off, which is why 0002
-- needs no Authorization header). Running it before that just adds a header
-- the function ignores; running it after is what actually closes the hole.
--
-- Why bother, given the exposure is bounded: the function only ever writes
-- what the chain already says, rows are unique on (tx_hash, log_index) so
-- repeats insert nothing, and the cursor only moves forward. So an attacker
-- cannot corrupt a price. What they can do is make you pay for unlimited
-- invocations of a function that does RPC reads and database writes, which is
-- a cost and availability problem rather than a correctness one. Acceptable on
-- testnet; not something to carry into mainnet.

-- Store the service role key once, encrypted, instead of pasting it into the
-- cron job body where it would live in plain text in the database and in this
-- file's git history forever.
--
-- Run this line ONCE, separately, with the real key substituted, and do NOT
-- commit it filled in:
--
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
--
-- Confirm it landed, without printing the secret:
--   select name, created_at from vault.secrets where name = 'service_role_key';

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'service_role_key') then
    raise exception
      'vault secret "service_role_key" not found. Create it first (see the comment above), then re-run this migration.';
  end if;
end
$$;

select cron.unschedule('index-price-history')
where exists (select 1 from cron.job where jobname = 'index-price-history');

select cron.schedule(
  'index-price-history',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://ncsydqwcbtjppfgwxyvt.supabase.co/functions/v1/index-price-history',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      -- Read at call time from Vault, so the key exists in exactly one place
      -- and rotating it does not mean rewriting the schedule.
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
         where name = 'service_role_key'
      )
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Verify the job is registered and firing:
--   select jobname, schedule, active from cron.job;
--   select status, start_time, return_message
--     from cron.job_run_details
--    where jobname = 'index-price-history'
--    order by start_time desc limit 5;
--
-- A 401 in return_message after switching means the function is enforcing JWT
-- and the header is not reaching it — check the Vault secret name matches.
