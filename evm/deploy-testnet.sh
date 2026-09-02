#!/usr/bin/env bash
#
# deploy-testnet.sh — one-command bring-up of SharpsMarket on Robinhood Chain
# testnet (chain id 46630).
#
#   bash evm/deploy-testnet.sh
#
# Prompts once for the deployer private key. That value is read with `read -s`
# so it is never echoed to the screen, never written to disk, and never enters
# shell history; it lives only in this process's environment and is unset on
# exit. Everything else is automated.
#
# Safe to re-run: it deploys a NEW contract each time, so only run it again if
# you actually want a fresh market.
set -euo pipefail

RPC="https://rpc.testnet.chain.robinhood.com"
EXPECTED_DEPLOYER="0xfDEBd2F3C69aB7618Ce329b9491165C6e92f39fB"
export ADMIN_ADDRESS="0x013222Ee20f2c0e7C8B46B24d0dEe760CC10d065"
export ORACLE_AUTHORITY_ADDRESS="0xEBD5e38e399D09B7922c1CB3c7f3cf130a2cC65F"

export PATH="$HOME/.foundry/bin:$PATH"
cd "$(dirname "$0")"

command -v forge >/dev/null || { echo "forge not found. Install Foundry first."; exit 1; }
[ -d lib/forge-std ] || { echo "lib/forge-std missing. Run: forge install foundry-rs/forge-std"; exit 1; }

cleanup() { unset DEPLOYER_PRIVATE_KEY; }
trap cleanup EXIT

printf 'Paste the DEPLOYER private key (input hidden), then press Enter: '
read -rs DEPLOYER_PRIVATE_KEY
echo
[ -n "$DEPLOYER_PRIVATE_KEY" ] || { echo "No key entered."; exit 1; }

# Normalise the key before anything consumes it.
#   - strip whitespace and any quotes a paste may carry along
#   - add the 0x prefix if absent
# MetaMask exports keys WITHOUT 0x, and while `cast` accepts that form,
# forge's vm.envUint does not: it fails with "missing hex prefix", but only
# after compiling and running the script, so the mismatch surfaces late and
# reads like a script bug rather than a formatting one.
DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY//[[:space:]\"\']/}"
[[ "$DEPLOYER_PRIVATE_KEY" == 0x* ]] || DEPLOYER_PRIVATE_KEY="0x$DEPLOYER_PRIVATE_KEY"

if [[ ! "$DEPLOYER_PRIVATE_KEY" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
  echo "That does not look like a private key: expected 64 hex characters."
  echo "Got ${#DEPLOYER_PRIVATE_KEY} characters (0x prefix included)."
  exit 1
fi
export DEPLOYER_PRIVATE_KEY

# Confirm the key belongs to the wallet we funded, BEFORE spending anything.
# A mistyped or wrong key otherwise fails deep inside forge with a confusing
# error, or worse, deploys from an account nobody is tracking.
DERIVED=$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY" 2>/dev/null || echo "INVALID")
if [ "${DERIVED,,}" != "${EXPECTED_DEPLOYER,,}" ]; then
  echo "Key does not match the funded deployer."
  echo "  expected: $EXPECTED_DEPLOYER"
  echo "  from key: $DERIVED"
  exit 1
fi
echo "Deployer key verified: $DERIVED"

BAL=$(cast balance "$DERIVED" --rpc-url "$RPC")
echo "Balance: $(cast from-wei "$BAL") ETH"
[ "$BAL" != "0" ] || { echo "Deployer has no ETH. Fund it at https://faucet.testnet.chain.robinhood.com"; exit 1; }

# Capture this BEFORE broadcasting: any block at or before the deploy is a
# valid MARKET_DEPLOY_BLOCK, and one taken seconds early wastes almost no
# scanning. Taken after, the indexer would skip the deploy and every event
# before its first run.
DEPLOY_BLOCK=$(cast block-number --rpc-url "$RPC")
echo "Deploy block floor: $DEPLOY_BLOCK"
echo

forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast | tee /tmp/sharps-deploy.log

ADDR=$(grep -oE 'SharpsMarket deployed at: 0x[0-9a-fA-F]{40}' /tmp/sharps-deploy.log | tail -1 | grep -oE '0x[0-9a-fA-F]{40}' || true)
[ -n "$ADDR" ] || { echo; echo "Could not parse the deployed address from the output above."; exit 1; }

# Hand the address to create-listings.sh rather than making someone paste it
# between the two steps. A stale hardcoded address there would not error — it
# would open 108 listings on the previous deployment, which looks like success.
cat > .deployed <<EOF
MARKET_ADDRESS=$ADDR
MARKET_DEPLOY_BLOCK=$DEPLOY_BLOCK
EOF

echo
echo "==================================================================="
echo "  SharpsMarket:        $ADDR"
echo "  MARKET_DEPLOY_BLOCK: $DEPLOY_BLOCK"
echo "  Explorer: https://explorer.testnet.chain.robinhood.com/address/$ADDR"
echo "==================================================================="
echo "  (also written to evm/.deployed for the next step)"
echo
echo "Confirm the Admin and Oracle lines above are NOT the deployer address."
echo "If either is, the env vars did not apply and privilege separation is lost."
echo
echo "Send these two values on. Both are public and safe to share."
