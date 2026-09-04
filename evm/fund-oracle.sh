#!/usr/bin/env bash
#
# fund-oracle.sh — move testnet ETH from the deployer to the oracle wallet.
#
#   bash evm/fund-oracle.sh [amount-in-eth]     # default 0.002
#
# The oracle is the only component that needs a hot key, since it signs
# batchUpdatePrice on a schedule. It therefore needs its own balance, and the
# faucet allows one claim per 24h, so it is funded from the deployer.
#
# Pushing 108 scores is 3 batched transactions (CHUNK_SIZE 50), so the default
# here is far more than one cycle needs and leaves room for a watch loop to run
# for a long while before topping up.
#
# Prompts for the DEPLOYER key, which holds the funds. Same handling as the
# other scripts: read -s, normalised, never on disk or in shell history.
set -euo pipefail

# Network, RPC and the chain-id guard all come from here.
# shellcheck source=./_network.sh
. "$(dirname "${BASH_SOURCE[0]}")/_network.sh"
# Testnet default only. On mainnet this MUST be supplied — a hardcoded
# testnet address would either reject the real key or, worse, be treated as
# a legitimate role on a chain holding real money.
if [ "$SHARPS_NETWORK" = "mainnet" ]; then
  : "${DEPLOYER:?Set DEPLOYER for mainnet (the address this key must derive to)}"
else
  DEPLOYER="${DEPLOYER:-0xfDEBd2F3C69aB7618Ce329b9491165C6e92f39fB}"
fi
# Testnet default only. On mainnet this MUST be supplied — a hardcoded
# testnet address would either reject the real key or, worse, be treated as
# a legitimate role on a chain holding real money.
if [ "$SHARPS_NETWORK" = "mainnet" ]; then
  : "${ORACLE:?Set ORACLE for mainnet (the address this key must derive to)}"
else
  ORACLE="${ORACLE:-0xEBD5e38e399D09B7922c1CB3c7f3cf130a2cC65F}"
fi
AMOUNT="${1:-0.002}"

export PATH="$HOME/.foundry/bin:$PATH"
command -v cast >/dev/null || { echo "cast not found. Install Foundry first."; exit 1; }

cleanup() { unset PK; }
trap cleanup EXIT

echo "Sending $AMOUNT ETH"
echo "  from deployer $DEPLOYER"
echo "  to   oracle   $ORACLE"
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
if [ "$BAL" -lt "$WEI" ] 2>/dev/null; then
  echo "Deployer balance $(cast from-wei "$BAL") ETH is short of $AMOUNT ETH."
  exit 1
fi

cast send "$ORACLE" --value "$WEI" --private-key "$PK" --rpc-url "$RPC" >/dev/null
echo "Sent."
echo
echo "deployer: $(cast from-wei "$(cast balance "$DEPLOYER" --rpc-url "$RPC")") ETH"
echo "oracle:   $(cast from-wei "$(cast balance "$ORACLE"   --rpc-url "$RPC")") ETH"
echo
echo "Next: bash evm/push-scores.sh"
