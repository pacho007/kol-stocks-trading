# SHARPS

Crypto traders, listed as tradable stocks. Each listing is a real Solana
wallet; its measured trading performance sets its share price. Runs on
[Solana](https://solana.com).

Built with [Lovable](https://lovable.dev) — changes pushed to the connected
branch sync back into the Lovable editor, so keep that branch working.

---

## How the pieces fit

There are four moving parts, and they are only useful in this order:

```
  oracle/          reads each trader wallet's swap history from Solana mainnet,
                   scores it 0-100, and pushes the score on-chain
        |
        v
  anchor/          the sharps program — the market. Holds each listing's
                   reserve, prices shares off a bonding curve x the wallet's
                   score, splits fees
        |
        | emits PriceUpdated / Bought / Sold
        v
  supabase/        an Edge Function indexes those events into Postgres, so
                   price history is ONE shared time series, not a per-browser
                   localStorage guess
        |
        | Realtime
        v
  src/             the app. Reads the shared feed; trades call the program
```

The chain is the source of truth. Postgres is a queryable mirror, rebuildable
from scratch by clearing the tables and setting `indexer_state.last_signature`
to null.

Traders are always read from **Solana mainnet** (where they actually trade),
whichever cluster the market program runs on.

---

## Local development

Requires Node 22+. Program work needs the Solana CLI 3.1.10 and Anchor 1.1.2
(on Windows, inside WSL).

```sh
npm i
cp .env.example .env      # then fill it in — see the comments in that file
npm run dev
```

The app runs without any backend configured: listings render at their opening
price with a flat chart. That is deliberate, so the UI is never blocked on
infrastructure — but it also means **a misconfigured backend looks like a quiet
app, not an error**. If charts are flat, check `.env` first.

### The program

```sh
cd anchor
anchor build                         # -> target/deploy/sharps.so + target/idl/sharps.json
cargo test -p sharps --lib           # curve / fee / solvency unit tests
solana-test-validator --reset \
  --bpf-program <PROGRAM_ID> target/deploy/sharps.so
npm i && npm test                    # 11 end-to-end tests against that validator
```

After a build, copy `target/idl/sharps.json` to `src/lib/solana/sharps-idl.json`
— the app, oracle and indexer all encode instructions from it.
`anchor/target/deploy/sharps-keypair.json` is the program's upgrade identity:
back it up, never commit it.

`SOLANA_CLUSTER=localnet npx tsx scripts/e2e-localnet.ts` then drives the
app's own transaction builders against the same validator, checking its
quotes match what the program actually charges to the lamport.

### Scripts

| Script                   | Does                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| `npm run dev` / `build`  | app                                                               |
| `npm run typecheck`      | `tsc --noEmit`                                                    |
| `npm run verify`         | typecheck + lint — the pre-push gate                              |
| `npm run test:program`   | the program's end-to-end tests (needs a local validator)          |
| `npm run lint`           | ESLint                                                            |
| `npm run format`         | Prettier                                                          |
| `npm run admin`          | `init <oracle>` / `list` / `status` / `pause` against the program |
| `npm run seed:listings`  | writes `src/lib/kols.ts` into Postgres                            |
| `npm run oracle:publish` | one pass: scores wallets, writes JSON (no chain writes)           |
| `npm run oracle:push`    | pushes `public/scores.json` on-chain                              |
| `npm run oracle:run`     | **the live oracle** — stays up, cycles continuously               |

---

## Going live

Devnet first; exercise buy/sell/update/claim there before mainnet. These steps
are ordered because each depends on the one before it.

### 1. Keys

Three separate keys: the **deployer** (pays for and upgrades the program), the
**admin** (creates listings, pauses), and the **oracle** (pushes scores). The
program separates admin from oracle on purpose; one key holding both collapses
that separation into a single point of compromise.

```sh
solana-keygen new -o ~/.config/sharps-devnet/admin.json
solana-keygen new -o ~/.config/sharps-devnet/oracle.json
```

Deploying the ~320 KB program needs about 2.3 SOL of rent (plus a temporary
buffer of the same size during the upload), so fund the deployer with ~5 SOL.
On devnet that's free from https://faucet.solana.com.

### 2. Deploy the program

```sh
cd anchor
solana program deploy target/deploy/sharps.so \
  --program-id target/deploy/sharps-keypair.json \
  --keypair ~/.config/sharps-devnet/admin.json -u devnet
```

### 3. Initialize and open the listings

```sh
export SOLANA_CLUSTER=devnet ADMIN_KEYPAIR_PATH=~/.config/sharps-devnet/admin.json
npm run admin -- init <ORACLE_PUBKEY>
npm run admin -- list      # one listing per trader in src/lib/kols.ts; re-runnable
```

### 4. Database

Apply the migrations through `0008_solana.sql`, then seed — the indexer treats
`kol_id` as a real foreign key, so an event for an unknown wallet is skipped
and reported rather than silently inventing a listing. Seeding must come first.

```sh
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:listings
```

### 5. Indexer

`deploy-indexer.ps1` deploys `supabase/functions/index-price-history` and sets
`SOLANA_RPC_URL` and `PROGRAM_ID`. pg_cron runs it every 5 minutes.

It pages the program's signatures from the stored cursor, processes them oldest
first, and only accepts `Program data:` lines emitted while the sharps program
is executing. Idempotent: rows are keyed `(signature, event_index)` with
`on conflict do nothing`, and the cursor only advances after a chunk commits.

### 6. Oracle

`oracle/run.ts` — a process that stays up, not a scheduled job. Each cycle it
reads every trader since `LAUNCH_TS`, publishes scores, and pushes the ones that
moved on chain, then pauses `CYCLE_SECONDS` and does it again. The per-wallet
history cache (newest signature read, movements so far) only exists while the
process does, which is why it's a service.

```bash
TRADER_RPC_URL=https://mainnet.helius-rpc.com/?api-key=… \
SOLANA_CLUSTER=devnet ORACLE_KEYPAIR_PATH=~/.config/sharps-devnet/oracle.json \
LAUNCH_TS=<unix seconds> npm run oracle:run
```

**`TRADER_RPC_URL` must be a dedicated RPC.** The public mainnet endpoint
rate-limits `getTransaction` to a trickle; it's fine for a handful of wallets
and useless for a cohort. Deploy with `oracle/Dockerfile` (`fly.toml` is set up
for Fly.io: one always-on machine). `PUSH_ONCHAIN=0` runs it with no key at all.

`.github/workflows/oracle.yml` is a manual fallback only — two writers pushing
the same scores both pay for it.

### 7. Frontend

`VITE_SOLANA_CLUSTER` (and optionally `VITE_SOLANA_RPC_URL` / `VITE_PROGRAM_ID`)
in `.env.production`. Vite inlines `VITE_*` at build time, so changing them
requires a rebuild. `node scripts/verify-deployment.mjs` checks that the site,
the program and the indexed database all agree on one deployment.

---

## Before real money

- **The program is unaudited.** It custodies user funds. Mainnet without an
  audit is the single largest risk in this project.
- Deployer, admin and oracle must be three separate keys; consider moving the
  program's upgrade authority to a multisig.
- Exercise the full devnet loop — buy, sell, oracle update, claim — first.

## Scoring, in one paragraph

A wallet's score is its percentile rank against the cohort across realized PnL,
win rate, volume, and trade count — then shrunk toward the middle by sample
size (`trades / (trades + 20)`), so a wallet with three lucky trades cannot
outrank one with three hundred. Only SOL-quoted round trips count. On-chain,
score changes are rate-capped per update, and price increases are additionally
capped by what the reserve can actually back, so a score jump can never let the
last seller out at a price the program cannot pay. Full detail lives in `/docs`
in the app.
