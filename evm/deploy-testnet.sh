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

# Network, RPC and the chain-id guard all come from here.
# shellcheck source=./_network.sh
. "$(dirname "${BASH_SOURCE[0]}")/_network.sh"
# The three roles.
#
# Hardcoded for testnet because those keys are disposable and re-typing them
# every run is how you fat-finger one. On mainnet they MUST be supplied, and
# they must be new: a testnet key has been pasted into shells, logs and CI, so
# treating one as a mainnet admin key means the market's pause switch and the
# oracle's price authority are both already public.
#
# The contract separates deployer / admin / oracle on purpose. That separation
# is worth nothing if the same key fills two of the slots, so this refuses that
# outright rather than warning about it.
if [ "$SHARPS_NETWORK" = "mainnet" ]; then
  : "${EXPECTED_DEPLOYER:?Set EXPECTED_DEPLOYER to the mainnet deployer address}"
  : "${ADMIN_ADDRESS:?Set ADMIN_ADDRESS to the mainnet admin address}"
  : "${ORACLE_AUTHORITY_ADDRESS:?Set ORACLE_AUTHORITY_ADDRESS to the mainnet oracle address}"

  for testnet_key in \
    0xfDEBd2F3C69aB7618Ce329b9491165C6e92f39fB \
    0x013222Ee20f2c0e7C8B46B24d0dEe760CC10d065 \
    0xEBD5e38e399D09B7922c1CB3c7f3cf130a2cC65F; do
    for supplied in "$EXPECTED_DEPLOYER" "$ADMIN_ADDRESS" "$ORACLE_AUTHORITY_ADDRESS"; do
      if [ "$(echo "$supplied" | tr 'A-Z' 'a-z')" = "$(echo "$testnet_key" | tr 'A-Z' 'a-z')" ]; then
        echo "Refusing to deploy: $supplied is a TESTNET address. Generate fresh mainnet keys." >&2
        exit 1
      fi
    done
  done

  if [ "$(echo "$EXPECTED_DEPLOYER$ADMIN_ADDRESS$ORACLE_AUTHORITY_ADDRESS" | tr 'A-Z' 'a-z' | tr -d '\n' | fold -w42 | sort -u | wc -l)" -ne 3 ]; then
    echo "Refusing to deploy: deployer, admin and oracle must be three DIFFERENT addresses." >&2
    exit 1
  fi
else
  EXPECTED_DEPLOYER="${EXPECTED_DEPLOYER:-0xfDEBd2F3C69aB7618Ce329b9491165C6e92f39fB}"
  export ADMIN_ADDRESS="${ADMIN_ADDRESS:-0x013222Ee20f2c0e7C8B46B24d0dEe760CC10d065}"
  export ORACLE_AUTHORITY_ADDRESS="${ORACLE_AUTHORITY_ADDRESS:-0xEBD5e38e399D09B7922c1CB3c7f3cf130a2cC65F}"
fi
export EXPECTED_DEPLOYER

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

# Always build from scratch before deploying. forge will happily reuse a cached
# artifact and broadcast it, so a source change that has not been recompiled
# deploys as the OLD contract — successfully, with a fresh address, and no
# warning that the code is stale. That happened here three times in a row: the
# only symptom was "Detected artifacts built from source files that no longer
# exist", which reads like housekeeping noise.
#
# A deploy is the one operation where a stale build is unrecoverable-ish (the
# address is live, listings get created against it), and a clean rebuild costs
# a few seconds, so it is never worth skipping.
echo
echo "Rebuilding from source (never deploy a cached artifact)..."
forge clean
forge build --force 2>&1 | tail -2

# Prove the binary about to go on chain is the one built from this source.
LOCAL_CODE=$(forge inspect SharpsMarket deployedBytecode 2>/dev/null | tr -d '[:space:]')
echo "Built runtime size: $(( (${#LOCAL_CODE} - 2) / 2 )) bytes"
echo

forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast | tee /tmp/sharps-deploy.log

ADDR=$(grep -oE 'SharpsMarket deployed at: 0x[0-9a-fA-F]{40}' /tmp/sharps-deploy.log | tail -1 | grep -oE '0x[0-9a-fA-F]{40}' || true)
[ -n "$ADDR" ] || { echo; echo "Could not parse the deployed address from the output above."; exit 1; }

# Verify what landed on chain came from the build we just made — the check that
# would have caught three consecutive stale deploys immediately.
#
# Compared by SIZE, not by bytes. SharpsMarket has immutables (OPEN_PRICE_WEI,
# MIN_PRICE_WEI, MAX_PRICE_WEI), and those are substituted into the runtime
# code at construction while `forge inspect deployedBytecode` returns the
# compiler's template with the slots zeroed. The two are therefore never
# byte-equal, and an equality check false-alarms on every correct deploy —
# which is worse than no check, because a warning that always fires gets
# ignored on the one occasion it is real.
#
# Size still catches the failure this exists for: a stale artifact is a
# different build of different source, and the length gave it away last time
# (11,119 stale versus 11,249 current).
sleep 2
ONCHAIN=$(cast code "$ADDR" --rpc-url "$RPC")
ON_LEN=$(( (${#ONCHAIN} - 2) / 2 ))
BUILT_LEN=$(( (${#LOCAL_CODE} - 2) / 2 ))
if [ "$ON_LEN" -eq "$BUILT_LEN" ]; then
  echo "Deployed code is $ON_LEN bytes, matching the fresh build."
else
  echo
  echo "WARNING: deployed code size does not match the build from this source."
  echo "  on chain: $ON_LEN bytes"
  echo "  built:    $BUILT_LEN bytes"
  echo "That is the signature of a stale artifact. Do not create listings"
  echo "against this address until it is understood."
  exit 1
fi

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
