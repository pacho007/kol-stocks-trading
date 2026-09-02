#!/usr/bin/env bash
#
# create-listings.sh — open a listing for every wallet in src/lib/kols.ts.
#
#   bash evm/create-listings.sh
#
# Runs as ADMIN (createListing is admin-only), so it prompts for the admin key,
# not the deployer's. Same handling as deploy-testnet.sh: read -s, normalised,
# never written to disk or shell history, unset on exit.
#
# Idempotent by design — CreateListings.s.sol skips wallets that already have a
# listing, so re-running after a partial failure resumes rather than reverting
# the whole batch.
set -euo pipefail

RPC="https://rpc.testnet.chain.robinhood.com"
export MARKET_ADDRESS="0x4546baeE5e02b65E60AA713D1A8586c08d1305Ed"
EXPECTED_ADMIN="0x013222Ee20f2c0e7C8B46B24d0dEe760CC10d065"

export PATH="$HOME/.foundry/bin:$PATH"
cd "$(dirname "$0")"
REPO_ROOT="$(cd .. && pwd)"

command -v forge >/dev/null || { echo "forge not found."; exit 1; }

cleanup() { unset ADMIN_PRIVATE_KEY; }
trap cleanup EXIT

# Wallet list is read from kols.ts at run time rather than kept as a second
# hardcoded copy, so it cannot drift from what the frontend and the seeded
# database use.
#
# Parsed with grep rather than by importing the module: this script runs under
# WSL, where node is typically not installed even when it is present on the
# Windows side. Safe here because `wallet: "0x..."` is the only 40-hex-digit
# pattern in the file — grepping for bare addresses and for the keyed form both
# return exactly 108, so there is nothing else to false-match.
KOLS_TS="$REPO_ROOT/src/lib/kols.ts"
[ -f "$KOLS_TS" ] || { echo "Cannot find $KOLS_TS"; exit 1; }
echo "Reading wallets from src/lib/kols.ts ..."
KOL_WALLETS="$(grep -oE 'wallet:[[:space:]]*"0x[0-9a-fA-F]{40}"' "$KOLS_TS" \
  | grep -oE '0x[0-9a-fA-F]{40}' | paste -sd, -)"
export KOL_WALLETS
COUNT=$(awk -F, '{print NF}' <<<"$KOL_WALLETS")
echo "Found $COUNT wallets."
[ "$COUNT" -gt 0 ] || { echo "No wallets parsed — aborting."; exit 1; }

printf 'Paste the ADMIN private key (input hidden), then press Enter: '
read -rs ADMIN_PRIVATE_KEY
echo
[ -n "$ADMIN_PRIVATE_KEY" ] || { echo "No key entered."; exit 1; }
ADMIN_PRIVATE_KEY="${ADMIN_PRIVATE_KEY//[[:space:]\"\']/}"
[[ "$ADMIN_PRIVATE_KEY" == 0x* ]] || ADMIN_PRIVATE_KEY="0x$ADMIN_PRIVATE_KEY"
if [[ ! "$ADMIN_PRIVATE_KEY" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
  echo "That does not look like a private key: expected 64 hex characters."
  exit 1
fi
export ADMIN_PRIVATE_KEY

DERIVED=$(cast wallet address --private-key "$ADMIN_PRIVATE_KEY" 2>/dev/null || echo "INVALID")
if [ "${DERIVED,,}" != "${EXPECTED_ADMIN,,}" ]; then
  echo "That key is not the admin wallet."
  echo "  contract admin: $EXPECTED_ADMIN"
  echo "  from key:       $DERIVED"
  echo "createListing is admin-only, so any other key would revert on every call."
  exit 1
fi
echo "Admin key verified: $DERIVED"

BAL=$(cast balance "$DERIVED" --rpc-url "$RPC")
echo "Admin balance: $(cast from-wei "$BAL") ETH"
if [ "$BAL" = "0" ]; then
  echo
  echo "Admin has no ETH, and this sends $COUNT transactions."
  echo "Fund it at https://faucet.testnet.chain.robinhood.com"
  echo "  address: $EXPECTED_ADMIN"
  exit 1
fi

echo
forge script script/CreateListings.s.sol:CreateListings --rpc-url "$RPC" --broadcast

echo
echo "Listings now open on-chain:"
cast call "$MARKET_ADDRESS" 'listingCount()(uint256)' --rpc-url "$RPC" 2>/dev/null \
  || echo "  (no listingCount getter — check the explorer)"
