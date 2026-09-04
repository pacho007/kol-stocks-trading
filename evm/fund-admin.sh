#!/usr/bin/env bash
#
# fund-admin.sh — move testnet ETH from the deployer to the admin wallet.
#
#   bash evm/fund-admin.sh [amount-in-eth]     # default 0.003
#
# Why this exists: the faucet is rate limited to one claim per 24h, and the
# deployer already holds far more than the whole bring-up needs. Opening 108
# listings costs a measured 196,637 gas each — about 0.00021 ETH in total at
# the chain's 0.01 gwei — so the default here is roughly 14x the requirement
# and still leaves the deployer the bulk of its balance.
#
# Prompts for the DEPLOYER key (it holds the funds). Same handling as the other
# scripts: read -s, normalised, never on disk or in shell history, unset on exit.
set -euo pipefail

# Network, RPC and the chain-id guard all come from here.
# shellcheck source=./_network.sh
. "$(dirname "${BASH_SOURCE[0]}")/_network.sh"
DEPLOYER="0xfDEBd2F3C69aB7618Ce329b9491165C6e92f39fB"
ADMIN="0x013222Ee20f2c0e7C8B46B24d0dEe760CC10d065"
AMOUNT="${1:-0.003}"

export PATH="$HOME/.foundry/bin:$PATH"
command -v cast >/dev/null || { echo "cast not found. Install Foundry first."; exit 1; }

cleanup() { unset PK; }
trap cleanup EXIT

echo "Sending $AMOUNT ETH"
echo "  from deployer $DEPLOYER"
echo "  to   admin    $ADMIN"
echo

printf 'Paste the DEPLOYER private key (input hidden), then press Enter: '
read -rs PK
echo
[ -n "$PK" ] || { echo "No key entered."; exit 1; }
PK="${PK//[[:space:]\"\']/}"
[[ "$PK" == 0x* ]] || PK="0x$PK"
[[ "$PK" =~ ^0x[0-9a-fA-F]{64}$ ]] || { echo "Expected 64 hex characters."; exit 1; }

DERIVED=$(cast wallet address --private-key "$PK" 2>/dev/null || echo INVALID)
if [ "${DERIVED,,}" != "${DEPLOYER,,}" ]; then
  echo "That key is not the deployer (the wallet holding the funds)."
  echo "  expected: $DEPLOYER"
  echo "  from key: $DERIVED"
  exit 1
fi
echo "Deployer key verified."

WEI=$(cast to-wei "$AMOUNT")
BAL=$(cast balance "$DEPLOYER" --rpc-url "$RPC")
if [ "$(echo "$BAL" | tr -d '\n')" = "0" ] || [ "$BAL" -lt "$WEI" ] 2>/dev/null; then
  echo "Deployer balance $(cast from-wei "$BAL") ETH is short of $AMOUNT ETH."
  exit 1
fi

cast send "$ADMIN" --value "$WEI" --private-key "$PK" --rpc-url "$RPC" >/dev/null
echo "Sent."
echo
echo "deployer: $(cast from-wei "$(cast balance "$DEPLOYER" --rpc-url "$RPC")") ETH"
echo "admin:    $(cast from-wei "$(cast balance "$ADMIN"    --rpc-url "$RPC")") ETH"
echo
echo "Next: bash evm/create-listings.sh"
