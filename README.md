# SHARPS

Crypto traders, listed as tradable stocks. Each listing is a real on-chain
wallet; its measured trading performance sets its share price. Runs on
[Robinhood Chain](https://chain.robinhood.com) (an Arbitrum Orbit L2).

Built with [Lovable](https://lovable.dev) — changes pushed to the connected
branch sync back into the Lovable editor, so keep that branch working.

---

## How the pieces fit

There are four moving parts, and they are only useful in this order:

```
  oracle/          reads each wallet's real trade history from a block explorer,
                   scores it 0-100, and pushes the score on-chain
        |
        v
  evm/             SharpsMarket.sol — the market. Holds the reserve, prices
                   shares off a bonding curve x the wallet's score, splits fees
        |
        | emits PriceUpdated
        v
  supabase/        an Edge Function indexes those events into Postgres, so
                   price history is ONE shared time series, not a per-browser
                   localStorage guess
        |
        | Realtime
        v
  src/             the app. Reads the shared feed; trades call the contract
```

The chain is the source of truth. Postgres is a queryable mirror, rebuildable
from scratch by resetting `indexer_state.last_indexed_block` and re-running.

---

## Local development

Requires Node 22+ (the tooling relies on native TypeScript type-stripping) and
[Foundry](https://book.getfoundry.sh/getting-started/installation) for contract
work.

```sh
npm i
cp .env.example .env      # then fill it in — see the comments in that file
npm run dev
```

The app runs without any backend configured: listings render at their opening
price with a flat chart. That is deliberate, so the UI is never blocked on
infrastructure — but it also means **a misconfigured backend looks like a quiet
app, not an error**. If charts are flat, check `.env` first.

### Contracts

`evm/lib/` is gitignored, so a fresh clone has no `forge-std` and tests will
fail to compile until you fetch it:

```sh
cd evm && forge install foundry-rs/forge-std && forge test
```

### Scripts

| Script                   | Does                                                                  |
| ------------------------ | --------------------------------------------------------------------- |
| `npm run dev` / `build`  | app                                                                   |
| `npm run typecheck`      | `tsc --noEmit`                                                        |
| `npm run test:contracts` | `forge test --root evm` (39 tests)                                    |
| `npm run verify`         | typecheck + lint + contract tests — the pre-push gate                 |
| `npm run lint`           | ESLint. Clean; the remaining warnings are dev-only fast-refresh hints |
| `npm run format`         | Prettier                                                              |
| `npm run seed:listings`  | writes `src/lib/kols.ts` into Postgres                                |
| `npm run oracle:publish` | one pass: scores wallets, writes JSON (no chain writes)                |
| `npm run oracle:push`    | one pass: scores wallets and pushes on-chain                          |
| `npm run oracle:run`     | **the live oracle** — stays up, cycles continuously                    |

---

## Going live

Nothing is deployed yet. These steps are ordered because each depends on the
one before it.

### 0. Testnet facts

| | |
| --- | --- |
| RPC | `https://rpc.testnet.chain.robinhood.com` |
| Chain id | 46630 (mainnet 4663) |
| Explorer | `https://explorer.testnet.chain.robinhood.com` (Blockscout) |
| Faucet | `https://faucet.testnet.chain.robinhood.com` — Chainlink and QuickNode also dispense the same testnet ETH |

Gas is ~0.01 gwei. Deploying the contract and opening all 108 listings costs
on the order of **0.0002 ETH**, so one faucet drip covers the entire bring-up
several times over. Budget is not the constraint here; having any balance at
all is.

Verification works through Blockscout:

```sh
forge verify-contract <address> src/SharpsMarket.sol:SharpsMarket \
  --chain-id 46630 --rpc-url https://rpc.testnet.chain.robinhood.com \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.chain.robinhood.com/api/
```

### 1. Deploy the contract (testnet first)

Do the whole sequence on testnet and actually exercise buy/sell/updatePrice
before touching mainnet.

Note the chain's block number *before* you broadcast and keep it: that is your
`MARKET_DEPLOY_BLOCK`. Any block at or before the deploy works — the indexer
just scans empty blocks ahead of it — but at ~100ms blocks a number that is
days early costs a lot of wasted scanning.

```sh
cd evm
export DEPLOYER_PRIVATE_KEY=0x...
export ADMIN_ADDRESS=0x...            # NOT the deployer
export ORACLE_AUTHORITY_ADDRESS=0x... # NOT the admin, NOT the deployer
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://rpc.testnet.chain.robinhood.com --broadcast
```

Both addresses default to the deployer if unset. Set them explicitly. The
contract separates admin (can list and pause) from oracle (can move prices) on
purpose; one key holding both collapses that separation into a single point of
compromise.

Record the deployed address and its deploy block — you need both below.

### 2. Open the listings

`createListing` is admin-only and one transaction per wallet, so 108 listings
is 108 transactions. The script skips wallets that already have a listing, so
re-running after a partial failure is safe.

```sh
export MARKET_ADDRESS=0x...
export ADMIN_PRIVATE_KEY=0x...
export KOL_WALLETS=$(node -e "import('./src/lib/kols.ts').then(m=>console.log(m.KOLS.map(k=>k.wallet).join(',')))")
forge script script/CreateListings.s.sol:CreateListings \
  --rpc-url https://rpc.testnet.chain.robinhood.com --broadcast
```

`BATCH_START` / `BATCH_COUNT` slice the list if you would rather go in chunks.

### 3. Database

Run `supabase/migrations/0001_market_state.sql`, then seed — the indexer treats
`kol_id` as a real foreign key, so an event for an unknown wallet is skipped
and reported rather than silently inventing a listing. Seeding must come first.

```sh
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:listings
```

### 4. Indexer

Deploy `supabase/functions/index-price-history` and give it these secrets:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ROBINHOOD_RPC_URL`,
`MARKET_ADDRESS`, `MARKET_DEPLOY_BLOCK`. Then schedule it (pg_cron or Supabase
scheduled functions) at roughly the oracle's cadence.

It is idempotent — rows are keyed `(tx_hash, log_index)` with `on conflict do
nothing`, and `last_indexed_block` only advances after a range commits. A crash
mid-run re-reads that range instead of skipping it.

### 5. Oracle

`oracle/run.ts` — a process that stays up, not a scheduled job. Each cycle it
indexes the cohort, publishes scores, and pushes the ones that moved on chain,
then pauses `CYCLE_SECONDS` (default 30) and does it again.

It has to be a service rather than a cron job. The Blockscout provider caches
each wallet's history in-process and pages back only as far as rows it hasn't
seen, so the first cycle pays for a full crawl and every cycle after it reads
one page per wallet. That cache only exists while the process does.

Measured over all 108 wallets, unauthenticated:

| | cold (cycle 1) | warm (cycle 2) |
|---|---|---|
| full cohort | 550.5s | **109.5s** |
| single wallet | 9.6s | 1.7s |

Metrics are byte-identical between the two paths — the warm pass is not a
cheaper approximation, it just stops reading history that hasn't changed.

A warm cycle is **rate-floor bound, not latency bound**: 108 wallets x 3
endpoints is ~324 requests, and without a key `MIN_GAP_MS` spaces request
starts 400ms apart. `BLOCKSCOUT_API_KEY` drops that to 120ms and raises
concurrency 4 -> 16, which should put a warm cycle near 40s — derived from
those constants, not yet measured. Get the key; it is free and it is the
single biggest lever on cadence.

Two things also come free from staying up: the rate cap's `prevAnchors` carry
across cycles instead of restarting from `BASE_PRICE`, and a cycle can never
run concurrently with itself.

```bash
MARKET_ADDRESS=0x… ORACLE_AUTHORITY_PRIVATE_KEY=0x… \
BLOCKSCOUT_API_KEY=… npm run oracle:run
```

Deploy it with `oracle/Dockerfile` (`fly.toml` is set up for Fly.io: one
always-on machine, no HTTP listener, never scaled to zero — a suspended machine
loses the cache and every wake-up pays for a cold crawl again).

`PUSH_ONCHAIN=0` runs the indexer with no key at all, which is the right way to
run a staging copy.

This is the only component that needs a hot key, so isolate it.

**`.github/workflows/oracle.yml` is now only a manual fallback.** It was the
oracle, on a five-minute cron, and it could not be: a run took ~10.5 minutes,
and GitHub delivered roughly three of those triggers a day rather than 288.
Don't tighten its schedule — two writers pushing the same scores both pay gas.

### 6. Frontend

Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_MARKET_ADDRESS`,
`VITE_ROBINHOOD_NETWORK` in the deploy environment and rebuild — Vite inlines
`VITE_*` at build time, so changing them requires a rebuild, not a restart.

---

## Before real money

- **The contract is unaudited.** It custodies user funds. Nothing above changes
  that, and mainnet without an audit is the single largest risk in this project.
- Admin, oracle, and deployer must be three separate keys.
- Exercise the full testnet loop — buy, sell, updatePrice, claim — before
  mainnet.

## Scoring, in one paragraph

A wallet's score is its percentile rank against the cohort across realized PnL,
win rate, volume, and consistency — then shrunk toward the middle by sample
size (`trades / (trades + 20)`), so a wallet with three lucky trades cannot
outrank one with three hundred. On-chain, score changes are rate-capped per
update, and price increases are additionally capped by what the reserve can
actually back, so a score jump can never let the last seller out at a price the
contract cannot pay. Full detail lives in `/docs` in the app.
