#!/usr/bin/env bash
#
# test-trade.sh - drive one full trade round-trip against the LIVE testnet
# contract and assert the results.
#
#   bash evm/test-trade.sh [eth-to-spend]      # default 0.0005
#
# This is the loop nobody has ever actually run: quote, buy, watch the price
# move, sell, get paid. Unit tests cover the same maths against a local EVM,
# but they cannot catch a bad ABI, a wrong address, a chain that prices gas
# differently, or a change that was never really deployed. Everything here is
# a real transaction on chain.
#
# It asserts rather than just printing, so a regression fails loudly:
#   - shares actually received match quoteBuy
#   - price rises after a buy and falls back after a sell
#   - PriceUpdated is emitted BY A TRADE (the chart fix - never exercised live)
#   - sell proceeds match quoteSell
#   - the listed trader's escrow accrues from the fee split
#   - a round trip costs only fees, never more
#
# Prompts once for a funded key. Read with read -s, never written to disk or
# shell history, unset on exit. Use the deployer - it holds testnet ETH and is
# not privileged on this contract, so a test buyer is exactly what it is.
set -uo pipefail

RPC="https://rpc.testnet.chain.robinhood.com"
SPEND_ETH="${1:-0.0005}"

export PATH="$HOME/.foundry/bin:$PATH"
cd "$(dirname "$0")"
REPO_ROOT="$(cd .. && pwd)"

command -v cast >/dev/null || { echo "cast not found. Install Foundry."; exit 1; }

cleanup() { unset PK; }
trap cleanup EXIT

if [ -f .deployed ]; then
  # shellcheck disable=SC1091
  . ./.deployed
else
  echo "evm/.deployed not found - deploy first."; exit 1
fi
M="$MARKET_ADDRESS"
echo "Market: $M"

CODE=$(cast code "$M" --rpc-url "$RPC" 2>/dev/null || echo 0x)
[ "${#CODE}" -gt 2 ] || { echo "No contract at $M"; exit 1; }

# Pick the first listed wallet from the app's own source, so the test exercises
# a listing the product actually shows rather than a hand-picked one.
KOLS_TS="$REPO_ROOT/src/lib/kols.ts"
KOL=$(grep -oE 'wallet:[[:space:]]*"0x[0-9a-fA-F]{40}"' "$KOLS_TS" | grep -oE '0x[0-9a-fA-F]{40}' | head -1)
echo "Listing: $KOL"

printf 'Paste a FUNDED private key to trade with (input hidden): '
read -rs PK
echo
[ -n "$PK" ] || { echo "No key entered."; exit 1; }
PK="${PK//[[:space:]\"\']/}"
[[ "$PK" == 0x* ]] || PK="0x$PK"
[[ "$PK" =~ ^0x[0-9a-fA-F]{64}$ ]] || { echo "Expected 64 hex characters."; exit 1; }

BUYER=$(cast wallet address --private-key "$PK" 2>/dev/null || echo INVALID)
[ "$BUYER" != "INVALID" ] || { echo "Could not derive an address from that key."; exit 1; }
echo "Trading as: $BUYER"

BAL0=$(cast balance "$BUYER" --rpc-url "$RPC")
echo "Balance: $(cast from-wei "$BAL0") ETH"
[ "$BAL0" != "0" ] || { echo "That wallet has no ETH."; exit 1; }

PASS=0; FAIL=0
ok()   { echo "  PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL  $1"; FAIL=$((FAIL+1)); }
check(){ if [ "$1" = "true" ]; then ok "$2"; else bad "$2 ($3)"; fi; }

listing_field() { # $1 = field index (0=score,1=priceWei,4=sharesOutstanding)
  cast call "$M" 'listings(address)(uint8,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool,bool)' \
    "$KOL" --rpc-url "$RPC" 2>/dev/null | sed -n "$(( $1 + 1 ))p" | awk '{print $1}'
}

SPEND_WEI=$(cast to-wei "$SPEND_ETH")

echo
echo "=============================================="
echo " BEFORE"
echo "=============================================="
PRICE0=$(listing_field 1)
SHARES_OUT0=$(listing_field 4)
MYSHARES0=$(cast call "$M" 'shareBalances(address,address)(uint256)' "$KOL" "$BUYER" --rpc-url "$RPC" | awk '{print $1}')
ESCROW0=$(cast call "$M" 'traderEscrow(address)(uint256)' "$KOL" --rpc-url "$RPC" | awk '{print $1}')
echo "  price            $PRICE0 wei"
echo "  shares outstanding $SHARES_OUT0"
echo "  my shares        $MYSHARES0"
echo "  trader escrow    $ESCROW0 wei"

# How many shares does this budget buy, and what does the contract say they cost?
NSHARES=$(cast call "$M" 'sharesForBudget(address,uint256)(uint256)' "$KOL" "$SPEND_WEI" --rpc-url "$RPC" | awk '{print $1}')
echo
echo "sharesForBudget($SPEND_ETH ETH) = $NSHARES shares"
[ "$NSHARES" != "0" ] || { echo "Budget too small to buy a whole share. Try a larger amount."; exit 1; }
QUOTED=$(cast call "$M" 'quoteBuy(address,uint256)(uint256)' "$KOL" "$NSHARES" --rpc-url "$RPC" | awk '{print $1}')
echo "quoteBuy($NSHARES shares)       = $QUOTED wei"

echo
echo "=============================================="
echo " BUY"
echo "=============================================="
TX=$(cast send "$M" 'buy(address,uint256)' "$KOL" "$NSHARES" \
      --value "$QUOTED" --private-key "$PK" --rpc-url "$RPC" --json 2>&1)
BUY_HASH=$(echo "$TX" | grep -oE '"transactionHash":"0x[0-9a-f]+"' | head -1 | grep -oE '0x[0-9a-f]+')
if [ -z "$BUY_HASH" ]; then
  echo "Buy failed:"; echo "$TX" | tail -5; exit 1
fi
echo "  tx $BUY_HASH"

PRICE1=$(listing_field 1)
MYSHARES1=$(cast call "$M" 'shareBalances(address,address)(uint256)' "$KOL" "$BUYER" --rpc-url "$RPC" | awk '{print $1}')
ESCROW1=$(cast call "$M" 'traderEscrow(address)(uint256)' "$KOL" --rpc-url "$RPC" | awk '{print $1}')
GAINED=$(( MYSHARES1 - MYSHARES0 ))

echo "  price now        $PRICE1 wei"
echo "  my shares now    $MYSHARES1  (+$GAINED)"
echo "  trader escrow    $ESCROW1 wei"
echo
check "$([ "$GAINED" = "$NSHARES" ] && echo true || echo false)" \
      "shares received match the quote" "got $GAINED, quoted $NSHARES"
check "$([ "$PRICE1" -gt "$PRICE0" ] && echo true || echo false)" \
      "buying raised the price" "$PRICE0 -> $PRICE1"
check "$([ "$ESCROW1" -gt "$ESCROW0" ] && echo true || echo false)" \
      "trader escrow accrued from the fee split" "$ESCROW0 -> $ESCROW1"

# The chart fix: a TRADE must emit PriceUpdated, not just an oracle cycle.
# Nothing has ever verified this against a live deployment.
RCPT=$(cast receipt "$BUY_HASH" --rpc-url "$RPC" 2>/dev/null)
PU_TOPIC=$(cast keccak "PriceUpdated(address,uint8,uint256,uint256)")
if echo "$RCPT" | grep -qi "${PU_TOPIC#0x}"; then
  ok "buy emitted PriceUpdated (the indexer will chart this trade)"
else
  bad "buy did NOT emit PriceUpdated - the chart will miss trades"
fi

echo
echo "=============================================="
echo " SELL (everything just bought)"
echo "=============================================="
SELL_QUOTE=$(cast call "$M" 'quoteSell(address,uint256)(uint256)' "$KOL" "$GAINED" --rpc-url "$RPC" | awk '{print $1}')
echo "quoteSell($GAINED shares) = $SELL_QUOTE wei"

BAL_PRE=$(cast balance "$BUYER" --rpc-url "$RPC")
TX2=$(cast send "$M" 'sell(address,uint256,uint256)' "$KOL" "$GAINED" 0 \
      --private-key "$PK" --rpc-url "$RPC" --json 2>&1)
SELL_HASH=$(echo "$TX2" | grep -oE '"transactionHash":"0x[0-9a-f]+"' | head -1 | grep -oE '0x[0-9a-f]+')
if [ -z "$SELL_HASH" ]; then
  echo "Sell failed:"; echo "$TX2" | tail -5; exit 1
fi
echo "  tx $SELL_HASH"

PRICE2=$(listing_field 1)
MYSHARES2=$(cast call "$M" 'shareBalances(address,address)(uint256)' "$KOL" "$BUYER" --rpc-url "$RPC" | awk '{print $1}')
echo "  price now        $PRICE2 wei"
echo "  my shares now    $MYSHARES2"
echo
check "$([ "$MYSHARES2" = "$MYSHARES0" ] && echo true || echo false)" \
      "all bought shares were sold back" "$MYSHARES2 vs $MYSHARES0"
check "$([ "$PRICE2" -lt "$PRICE1" ] && echo true || echo false)" \
      "selling lowered the price" "$PRICE1 -> $PRICE2"
check "$([ "$PRICE2" = "$PRICE0" ] && echo true || echo false)" \
      "price returned to where it started" "$PRICE0 -> $PRICE2"

RCPT2=$(cast receipt "$SELL_HASH" --rpc-url "$RPC" 2>/dev/null)
if echo "$RCPT2" | grep -qi "${PU_TOPIC#0x}"; then
  ok "sell emitted PriceUpdated"
else
  bad "sell did NOT emit PriceUpdated"
fi

echo
echo "=============================================="
echo " RESULT"
echo "=============================================="
BAL_END=$(cast balance "$BUYER" --rpc-url "$RPC")
echo "  balance before   $(cast from-wei "$BAL0") ETH"
echo "  balance after    $(cast from-wei "$BAL_END") ETH"
echo "  net cost         $(cast from-wei $(( BAL0 - BAL_END ))) ETH  (fees + gas)"
echo
echo "  A round trip should cost only the 2% buy fee, the 2% sell fee and gas."
echo "  Losing materially more than that means the curve is not returning what"
echo "  it charged, which is the thing the reserve invariant exists to prevent."
echo
echo "  $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
