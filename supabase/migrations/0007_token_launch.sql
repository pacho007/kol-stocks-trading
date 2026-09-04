-- 0007_token_launch.sql — the $SHARPS contract address, editable without a deploy.
--
-- WHY A TABLE AND NOT AN ENV VAR
--
-- At launch the single most urgent thing is publishing the real contract
-- address, because the window between a token going live and the first
-- impersonator posting a fake one is minutes. Buyers will look for the address
-- on the official site, and if it is not there yet they will take it from
-- whoever posted first.
--
-- An env var cannot win that race: VITE_ values are inlined at BUILD time, so
-- changing one means editing config, waiting for a rebuild, and republishing —
-- and it cannot be done from a phone. A row in a public table is read at
-- runtime, so one UPDATE makes the address live on every open page.
--
--   update public.token_launch
--      set contract_address = '0x…',
--          pons_url         = 'https://…',
--          launched_at      = now()
--    where id = 1;
--
-- Publicly readable, and writable only with the service role — an anon visitor
-- cannot change the address the site is telling everyone to trust. That last
-- part is the whole point: this row IS the claim of authenticity, so it must be
-- harder to write than it is to read.
create table if not exists public.token_launch (
  id               integer primary key default 1,
  contract_address text,
  pons_url         text,
  launched_at      timestamptz,
  updated_at       timestamptz not null default now(),
  -- One row, forever. A second row would create an ambiguity about which
  -- address is the real one, which is exactly the confusion this exists to
  -- prevent.
  constraint token_launch_singleton check (id = 1)
);

comment on table public.token_launch is
  'Single row holding the live $SHARPS contract address. Read at runtime by /sharps so the address can be published without a rebuild.';

insert into public.token_launch (id) values (1) on conflict (id) do nothing;

alter table public.token_launch enable row level security;

drop policy if exists "token launch is publicly readable" on public.token_launch;
create policy "token launch is publicly readable"
  on public.token_launch for select
  using (true);
