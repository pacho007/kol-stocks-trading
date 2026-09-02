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

| Script | Does |
|---|---|
| `npm run dev` / `build` | app |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:contracts` | `forge test --root evm` (39 tests) |
| `npm run verify` | typecheck + contract tests — the pre-push gate |
| `npm run lint` | ESLint. **Currently ~485 formatting errors**; run `npm run format` to clear them, ideally when nobody else is mid-change, since it touches most files |
| `npm run seed:listings` | writes `src/lib/kols.ts` into Postgres |
| `npm run oracle:publish` | scores wallets, writes JSON (no chain writes) |
| `npm run oracle:push` | scores wallets and pushes on-chain |

---

## Going live

Nothing is deployed yet. These steps are ordered because each depends on the
one before it.

### 1. Deploy the contract (testnet first)

Testnet is chain id 46630, mainnet 4663. Do the whole sequence on testnet and
actually exercise buy/sell/updatePrice before touching mainnet.

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

Runs off-chain on a schedule, holding `ORACLE_AUTHORITY_PRIVATE_KEY`. This is
the only component that needs a hot key, so isolate it.

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
