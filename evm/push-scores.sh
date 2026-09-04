#!/usr/bin/env bash
#
# push-scores.sh — push the published scores on chain. This is the step that
# makes prices actually move.
#
#   bash evm/push-scores.sh
#
# Reads public/scores.json (whatever oracle/publish.ts last produced) and sends
# batchUpdatePrice for all 108 listings, in chunks of 50. Each update emits
# PriceUpdated, which the Supabase indexer picks up, which is what fills
# price_history and draws the shared chart.
#
# Uses --from-scores rather than re-indexing: a fresh crawl is ~25 minutes at
# Blockscout's rate limit, and would produce a slightly different distribution
# than the one already reviewed.
#
# Prompts for the ORACLE key. That key can only call updatePrice /
# batchUpdatePrice — SharpsMarket's onlyOracle functions never touch
# vaultBalance or shareBalances — so even fully compromised it can nudge quoted
# prices within the rate cap and rails, and can never move funds. It is still
# a hot key, so it is read the same way as the others and unset on exit.
set -euo pipefail

# Network, RPC and the chain-id guard all come from here.
# shellcheck source=./_network.sh
. "$(dirname "${BASH_SOURCE[0]}")/_network.sh"
# Testnet default only. On mainnet this MUST be supplied — a hardcoded
# testnet address would either reject the real key or, worse, be treated as
# a legitimate role on a chain holding real money.
if [ "$SHARPS_NETWORK" = "mainnet" ]; then
  : "${EXPECTED_ORACLE:?Set EXPECTED_ORACLE for mainnet (the address this key must derive to)}"
else
  EXPECTED_ORACLE="${EXPECTED_ORACLE:-0xEBD5e38e399D09B7922c1CB3c7f3cf130a2cC65F}"
fi

export PATH="$HOME/.foundry/bin:$PATH"
cd "$(dirname "$0")"
REPO_ROOT="$(cd .. && pwd)"

cleanup() { unset ORACLE_AUTHORITY_PRIVATE_KEY; }
trap cleanup EXIT

# Same handoff as create-listings.sh — the address comes from the last deploy,
# never a constant, so this cannot push scores at a contract nobody is using.
if [ -f .deployed ]; then
  # shellcheck disable=SC1091
  . ./.deployed
  export MARKET_ADDRESS
else
  echo "evm/.deployed not found — deploy first."; exit 1
fi
echo "Market: $MARKET_ADDRESS"

CODE=$(cast code "$MARKET_ADDRESS" --rpc-url "$RPC" 2>/dev/null || echo 0x)
[ "${#CODE}" -gt 2 ] || { echo "No contract at $MARKET_ADDRESS."; exit 1; }

SCORES="$REPO_ROOT/public/scores.json"
[ -f "$SCORES" ] || { echo "public/scores.json missing — run: npm run oracle:publish"; exit 1; }
echo "Scores: $SCORES"

printf 'Paste the ORACLE private key (input hidden), then press Enter: '
read -rs ORACLE_AUTHORITY_PRIVATE_KEY
echo
[ -n "$ORACLE_AUTHORITY_PRIVATE_KEY" ] || { echo "No key entered."; exit 1; }
ORACLE_AUTHORITY_PRIVATE_KEY="${ORACLE_AUTHORITY_PRIVATE_KEY//[[:space:]\"\']/}"
[[ "$ORACLE_AUTHORITY_PRIVATE_KEY" == 0x* ]] || ORACLE_AUTHORITY_PRIVATE_KEY="0x$ORACLE_AUTHORITY_PRIVATE_KEY"
[[ "$ORACLE_AUTHORITY_PRIVATE_KEY" =~ ^0x[0-9a-fA-F]{64}$ ]] \
  || { echo "Expected 64 hex characters."; exit 1; }
export ORACLE_AUTHORITY_PRIVATE_KEY

DERIVED=$(cast wallet address --private-key "$ORACLE_AUTHORITY_PRIVATE_KEY" 2>/dev/null || echo INVALID)
ONCHAIN_ORACLE=$(cast call "$MARKET_ADDRESS" 'oracleAuthority()(address)' --rpc-url "$RPC")
if [ "${DERIVED,,}" != "${ONCHAIN_ORACLE,,}" ]; then
  echo "That key is not this contract's oracle authority."
  echo "  contract expects: $ONCHAIN_ORACLE"
  echo "  key derives to:   $DERIVED"
  echo "updatePrice is onlyOracle, so every call would revert."
  exit 1
fi
echo "Oracle key verified: $DERIVED"

BAL=$(cast balance "$DERIVED" --rpc-url "$RPC")
echo "Oracle balance: $(cast from-wei "$BAL") ETH"
if [ "$BAL" = "0" ]; then
  echo
  echo "Oracle has no ETH and cannot sign anything."
  echo "Run: bash evm/fund-oracle.sh"
  exit 1
fi

export ROBINHOOD_RPC_URL="$RPC"
export ROBINHOOD_NETWORK="testnet"

echo
cd "$REPO_ROOT"
npx tsx oracle/push-onchain-evm.ts --from-scores

echo
echo "Scores are on chain. Each batchUpdatePrice emitted PriceUpdated, so the"
echo "indexer will pick them up on its next 5-minute run and the charts will"
echo "start filling in."
