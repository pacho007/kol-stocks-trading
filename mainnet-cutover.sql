-- mainnet-cutover.sql — run ONCE, after the mainnet contract is deployed and
-- BEFORE the indexer runs against it.
--
-- WHY THIS IS NOT OPTIONAL
--
-- Every chain-specific row in this database was produced by the testnet
-- contract. The kol_ids are the same on mainnet, so nothing collides and
-- nothing errors — the old rows simply blend into the new ones:
--
--   price_history  1091 testnet points that would sit in the same series as
--                  mainnet prices. Charts and the splash 24h change would be
--                  computed across two different chains.
--   fills          5 testnet trades that would show in the live trade tape and
--                  count toward volume as if someone had really traded.
--   listings       score and price left at their last testnet values, shown as
--                  current until a mainnet event happens to overwrite them.
--   indexer_state  the worst of the four. The cursor sits around block
--                  113,000,000 from testnet while mainnet's head is about
--                  54,800,000, so the indexer starts 58 million blocks past the
--                  end of the chain, scans nothing, and reports success
--                  forever. The function now refuses to run in that state
--                  rather than pretending — but this is what clears it.
--
-- Listings themselves are NOT deleted: kol_id and kol_wallet are the same
-- traders on either chain, and fills.kol_id is a foreign key onto them. Only
-- the per-chain state on each row is reset to the opening values every listing
-- is created with.

begin;

-- Trades and price points are per-chain; none of these describe mainnet.
delete from public.fills;
delete from public.price_history;

-- Back to the values a freshly created listing has: neutral score, opening
-- price, nothing outstanding, nothing in the vault.
update public.listings
   set score               = 50,
       price_wei           = 4000000000000,
       shares_outstanding  = 0,
       vault_balance_wei   = 0,
       paused              = false,
       last_update_ts      = 'epoch',
       updated_at          = now();

-- Start the scan at the mainnet deploy block.
--
-- REPLACE <MAINNET_DEPLOY_BLOCK> with the block number printed by
-- evm/deploy-testnet.sh when it deployed to mainnet, minus one. The indexer
-- scans from last_indexed_block + 1, so subtracting one makes the deploy block
-- itself the first block read.
update public.indexer_state
   set last_indexed_block = <MAINNET_DEPLOY_BLOCK> - 1,
       updated_at         = now();

commit;

-- Verify: expect 0, 0, 126 rows all at score 50, and a cursor below the
-- mainnet head (~54,800,000 and rising).
select
  (select count(*) from public.fills)                              as fills,
  (select count(*) from public.price_history)                      as price_points,
  (select count(*) from public.listings)                           as listings,
  (select count(*) from public.listings where score <> 50)         as not_at_open,
  (select last_indexed_block from public.indexer_state where id=1) as cursor;
