# deploy-indexer.ps1 — ship the price indexer and point it at the deployed program.
#
#   powershell -ExecutionPolicy Bypass -File .\deploy-indexer.ps1
#
# Deploys supabase/functions/index-price-history and sets the two values it
# needs. Notably NOT among them: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
# Supabase injects both into the Edge Functions runtime automatically, so no
# secret is typed, stored, or transmitted here — every value below is public.
#
# Uses --project-ref instead of `supabase link` on purpose: linking prompts for
# the database password, which this task has no need for.

$ErrorActionPreference = "Stop"

$ProjectRef   = "ncsydqwcbtjppfgwxyvt"
$FunctionName = "index-price-history"

# The sharps program (anchor/programs/sharps), and the cluster it runs on.
# Must match VITE_SOLANA_CLUSTER / VITE_PROGRAM_ID in the app build.
$ProgramId    = "5HVwtd2UXjn9q1v8L3zV4iidkopPUXGyXntbnQzgR1Ei"
$RpcUrl       = "https://api.devnet.solana.com"

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
  "SOLANA_RPC_URL=$RpcUrl" `
  "PROGRAM_ID=$ProgramId"

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "  program: $ProgramId"
Write-Host "  rpc:     $RpcUrl"
Write-Host ""
Write-Host "It runs every 5 minutes via pg_cron (supabase/migrations/0005)."
