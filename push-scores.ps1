# push-scores.ps1 - push the published scores on chain. This is the step that
# makes prices actually move.
#
#   powershell -ExecutionPolicy Bypass -File .\push-scores.ps1
#
# PowerShell rather than bash on purpose. Node lives on the Windows side (WSL
# has no node of its own here - `npx` there resolves to
# /mnt/c/Program Files/nodejs), and environment variables do NOT cross the WSL
# to Windows boundary: an exported key in a WSL script arrives at the Node
# process as undefined. Running both halves on Windows removes the boundary
# instead of tunnelling through it with WSLENV.
#
# ASCII only, deliberately. Windows PowerShell 5.1 assumes the ANSI codepage
# for files with no BOM, so a UTF-8 em dash in a comment is read as two garbage
# characters and can corrupt parsing further down the file. An earlier version
# of this script printed empty values for variables that were being assigned
# correctly, purely because of that.
#
# Reads public/scores.json and sends batchUpdatePrice for every listing, in
# chunks of 50. Each update emits PriceUpdated, which the Supabase indexer
# picks up, which is what fills price_history and draws the shared chart.
#
# The key is read with -AsSecureString so it is not echoed and not in shell
# history, converted in-process, and cleared on the way out. It can only call
# updatePrice/batchUpdatePrice - SharpsMarket's onlyOracle functions never
# touch vaultBalance or shareBalances - so even fully compromised it can nudge
# quoted prices within the rate cap and rails, never move funds.

$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($root)) { $root = Split-Path -Parent $MyInvocation.MyCommand.Path }
if ([string]::IsNullOrWhiteSpace($root)) { $root = (Get-Location).Path }
Set-Location -Path $root

$deployed = Join-Path $root "evm\.deployed"
if (-not (Test-Path $deployed)) {
    Write-Host "evm/.deployed not found at $deployed - deploy first." -ForegroundColor Red
    exit 1
}

# Direct assignment, not a ForEach-Object script block: a variable written
# inside a pipeline script block does not reliably survive into the parent
# scope, which produced an empty MARKET_ADDRESS that only surfaced when node
# rejected it at the very end.
$lines = @(Get-Content $deployed)
$marketLine = $lines | Where-Object { $_ -match '^MARKET_ADDRESS=' } | Select-Object -First 1
$blockLine  = $lines | Where-Object { $_ -match '^MARKET_DEPLOY_BLOCK=' } | Select-Object -First 1
$market = "$marketLine".Replace("MARKET_ADDRESS=", "").Trim()
$block  = "$blockLine".Replace("MARKET_DEPLOY_BLOCK=", "").Trim()

if ($market -notmatch '^0x[0-9a-fA-F]{40}$') {
    Write-Host "Could not read a contract address from $deployed" -ForegroundColor Red
    Write-Host "  got: [$market]" -ForegroundColor Red
    foreach ($l in $lines) { Write-Host "  file: $l" }
    exit 1
}

$scores = Join-Path $root "public\scores.json"
if (-not (Test-Path $scores)) {
    Write-Host "public/scores.json missing at $scores - run: npm run oracle:publish" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host ("Market:       " + $market)
Write-Host ("Deploy block: " + $block)
Write-Host ("Scores:       " + $scores)
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
if ($key -notmatch '^0x') { $key = "0x" + $key }
if ($key -notmatch '^0x[0-9a-fA-F]{64}$') {
    Write-Host "That does not look like a private key: expected 64 hex characters." -ForegroundColor Red
    exit 1
}

try {
    $env:ORACLE_AUTHORITY_PRIVATE_KEY = $key
    $env:MARKET_ADDRESS = $market
    $env:ROBINHOOD_RPC_URL = "https://rpc.testnet.chain.robinhood.com"
    $env:ROBINHOOD_NETWORK = "testnet"

    # push-onchain-evm.ts does its own preflight: contract exists, the key
    # really is the contract's oracleAuthority (onlyOracle would otherwise
    # revert every chunk), and the wallet has gas.
    npx tsx oracle/push-onchain-evm.ts --from-scores
} finally {
    $env:ORACLE_AUTHORITY_PRIVATE_KEY = $null
    $key = $null
    [GC]::Collect()
}

Write-Host ""
Write-Host "Each batchUpdatePrice emitted PriceUpdated, so the indexer will pick"
Write-Host "them up on its next 5-minute run and the charts will start filling in."
