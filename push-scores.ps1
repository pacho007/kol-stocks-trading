# push-scores.ps1 — push the published scores on chain. This is the step that
# makes prices actually move.
#
#   powershell -ExecutionPolicy Bypass -File .\push-scores.ps1
#
# PowerShell rather than bash on purpose. Node lives on the Windows side (WSL
# has no node of its own — `npx` there resolves to /mnt/c/Program Files/nodejs),
# and environment variables do NOT cross the WSL to Windows boundary: an
# exported key in a WSL script arrives at the Node process as undefined. The
# bash version failed exactly that way. Running both halves on Windows removes
# the boundary instead of trying to tunnel through it with WSLENV.
#
# Reads public/scores.json and sends batchUpdatePrice for every listing, in
# chunks of 50. Each update emits PriceUpdated, which the Supabase indexer
# picks up, which is what fills price_history and draws the shared chart.
#
# The key is read with -AsSecureString so it is not echoed and not in shell
# history, converted in-process, and cleared from the environment on the way
# out. It can only call updatePrice/batchUpdatePrice — SharpsMarket's
# onlyOracle functions never touch vaultBalance or shareBalances — so even
# fully compromised it can nudge quoted prices within the rate cap and rails,
# never move funds.

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

# Contract address comes from the last deploy, never a constant, so this cannot
# push scores at a contract nobody is using.
$deployed = Join-Path $PSScriptRoot "evm\.deployed"
if (-not (Test-Path $deployed)) {
  Write-Host "evm/.deployed not found — deploy first." -ForegroundColor Red
  exit 1
}
$market = $null
$block = $null
Get-Content $deployed | ForEach-Object {
  if ($_ -match '^MARKET_ADDRESS=(.+)$')      { $market = $Matches[1].Trim() }
  if ($_ -match '^MARKET_DEPLOY_BLOCK=(.+)$') { $block  = $Matches[1].Trim() }
}
if (-not $market) { Write-Host "No MARKET_ADDRESS in evm/.deployed." -ForegroundColor Red; exit 1 }

$scores = Join-Path $PSScriptRoot "public\scores.json"
if (-not (Test-Path $scores)) {
  Write-Host "public/scores.json missing — run: npm run oracle:publish" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Market:       $market"
Write-Host "Deploy block: $block"
Write-Host "Scores:       $scores"
Write-Host ""

$secure = Read-Host -Prompt "Paste the ORACLE private key (input hidden)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

# MetaMask exports without 0x; viem needs it. Same normalisation as the shell
# scripts, so a paste that works in one works in the other.
$key = ($key -replace '[\s"'']', '')
if ($key -notmatch '^0x') { $key = "0x$key" }
if ($key -notmatch '^0x[0-9a-fA-F]{64}$') {
  Write-Host "That does not look like a private key: expected 64 hex characters." -ForegroundColor Red
  exit 1
}

try {
  $env:ORACLE_AUTHORITY_PRIVATE_KEY = $key
  $env:MARKET_ADDRESS               = $market
  $env:ROBINHOOD_RPC_URL            = "https://rpc.testnet.chain.robinhood.com"
  $env:ROBINHOOD_NETWORK            = "testnet"

  # push-onchain-evm.ts does its own preflight: contract exists, the key really
  # is the contract's oracleAuthority (onlyOracle would otherwise revert every
  # chunk), and the wallet has gas.
  npx tsx oracle/push-onchain-evm.ts --from-scores
} finally {
  $env:ORACLE_AUTHORITY_PRIVATE_KEY = $null
  $key = $null
  [GC]::Collect()
}

Write-Host ""
Write-Host "Each batchUpdatePrice emitted PriceUpdated, so the indexer will pick"
Write-Host "them up on its next 5-minute run and the charts will start filling in."
