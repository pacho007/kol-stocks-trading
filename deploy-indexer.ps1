# deploy-indexer.ps1 - ship the price indexer and point it at the deployed market.
#
#   powershell -ExecutionPolicy Bypass -File .\deploy-indexer.ps1
#
# Deploys supabase/functions/index-price-history and sets the three values it
# needs. Notably NOT among them: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
# Supabase injects both into the Edge Functions runtime automatically, so no
# secret is typed, stored, or transmitted here - every value below is public.
#
# Uses --project-ref instead of `supabase link` on purpose: linking prompts for
# the database password, which this task has no need for.

$ErrorActionPreference = "Stop"

$ProjectRef   = "ncsydqwcbtjppfgwxyvt"
$FunctionName = "index-price-history"

# Deployed SharpsMarket on Robinhood Chain testnet (chain id 46630).
$MarketAddress = "0x4546baeE5e02b65E60AA713D1A8586c08d1305Ed"

# The block the contract was deployed in. The indexer starts scanning here;
# at ~100ms blocks, a value even a day early would mean grinding through
# millions of empty blocks before reaching the first real event.
$DeployBlock   = "111826920"

$RpcUrl        = "https://rpc.testnet.chain.robinhood.com"

Set-Location -Path $PSScriptRoot

Write-Host ""
Write-Host "1/3  Signing in to Supabase (a browser window will open)..." -ForegroundColor Cyan
npx --yes supabase login

Write-Host ""
Write-Host "2/3  Deploying the $FunctionName function..." -ForegroundColor Cyan
npx --yes supabase functions deploy $FunctionName --project-ref $ProjectRef

Write-Host ""
Write-Host "3/3  Setting configuration (all public values)..." -ForegroundColor Cyan
npx --yes supabase secrets set --project-ref $ProjectRef `
  "ROBINHOOD_RPC_URL=$RpcUrl" `
  "MARKET_ADDRESS=$MarketAddress" `
  "MARKET_DEPLOY_BLOCK=$DeployBlock"

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "  market:       $MarketAddress"
Write-Host "  deploy block: $DeployBlock"
Write-Host "  rpc:          $RpcUrl"
Write-Host ""
Write-Host "Next: run supabase/migrations/0002_schedule_indexer.sql to put it on a timer."
