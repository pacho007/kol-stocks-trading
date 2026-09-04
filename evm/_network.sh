#!/usr/bin/env bash
#
# _network.sh — shared network resolution for every script in this directory.
#
# Sourced, not run. Every script here used to hardcode the testnet RPC, which
# meant there was no way to touch mainnet at all except by editing six files
# and hoping you got all six.
#
#   SHARPS_NETWORK=testnet  (default)  chain 46630
#   SHARPS_NETWORK=mainnet             chain 4663  — REAL MONEY
#
# Defaults to testnet on purpose. A missing variable must never be the thing
# that decides to spend real money.

: "${SHARPS_NETWORK:=testnet}"

case "$SHARPS_NETWORK" in
  testnet)
    RPC="${ROBINHOOD_RPC_URL:-https://rpc.testnet.chain.robinhood.com}"
    EXPECTED_CHAIN_ID=46630
    ;;
  mainnet)
    RPC="${ROBINHOOD_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
    EXPECTED_CHAIN_ID=4663
    ;;
  *)
    echo "SHARPS_NETWORK must be 'testnet' or 'mainnet' (got '$SHARPS_NETWORK')." >&2
    exit 1
    ;;
esac

export PATH="$HOME/.foundry/bin:$PATH"
command -v cast >/dev/null || { echo "cast not found. Install Foundry first." >&2; exit 1; }

# Ask the endpoint what chain it actually is, rather than trusting the URL.
#
# The failure this prevents is the expensive one: a URL typo, a stale
# ROBINHOOD_RPC_URL in the environment, or a copied command that still says
# "testnet" while SHARPS_NETWORK says mainnet. Every one of those ends with a
# transaction signed against a chain you did not mean, and on mainnet that is
# real money — so this is checked before anything is signed, every time.
ACTUAL_CHAIN_ID="$(cast chain-id --rpc-url "$RPC" 2>/dev/null || echo "unreachable")"
if [ "$ACTUAL_CHAIN_ID" != "$EXPECTED_CHAIN_ID" ]; then
  echo "Refusing to continue: RPC chain id does not match the requested network." >&2
  echo "  SHARPS_NETWORK : $SHARPS_NETWORK (expects chain $EXPECTED_CHAIN_ID)" >&2
  echo "  RPC            : $RPC" >&2
  echo "  RPC reports    : $ACTUAL_CHAIN_ID" >&2
  exit 1
fi

# On mainnet, make the operator say so out loud.
#
# Not ceremony: every script in this directory was written and rehearsed
# against testnet, where a mistake costs nothing and re-running is free. The
# same command on mainnet spends real ETH and deploys a contract that will
# custody other people's funds. One deliberate keystroke is the cheapest
# possible guard against muscle memory.
if [ "$SHARPS_NETWORK" = "mainnet" ] && [ "${SHARPS_MAINNET_CONFIRMED:-}" != "1" ]; then
  echo
  echo "  ***  MAINNET  ***  chain $EXPECTED_CHAIN_ID — this spends real ETH."
  echo
  printf "Type MAINNET to continue: "
  read -r confirm
  [ "$confirm" = "MAINNET" ] || { echo "Aborted."; exit 1; }
  export SHARPS_MAINNET_CONFIRMED=1
fi

echo "Network: $SHARPS_NETWORK (chain $EXPECTED_CHAIN_ID)"
echo "RPC: $RPC"
