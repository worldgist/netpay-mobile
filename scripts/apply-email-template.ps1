# Apply NetPay Confirm signup email template to Supabase
# Run from repo root: .\scripts\apply-email-template.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent

Write-Host ""
Write-Host "NetPay - Apply Supabase email template" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project: xrpuvnhmdmpgelfxpdcx (Netpay)"
Write-Host "Templates:"
Write-Host "  - supabase/templates/confirm-signup.html"
Write-Host "  - supabase/templates/reset-password.html"
Write-Host "OTP length: 6 digits (10 minute expiry)"
Write-Host ""

Push-Location $RepoRoot
try {
  $projects = npx supabase projects list 2>$null
  if ($LASTEXITCODE -eq 0 -and ($projects -match "xrpuvnhmdmpgelfxpdcx")) {
    Write-Host "Supabase CLI is logged in. Pushing auth + email template config..." -ForegroundColor Green
    Write-Host "(Run from repo root — not the mobile/ folder.)"
    Write-Host ""
    npx supabase config push --yes
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  } else {
    Write-Host "Supabase CLI is not logged in. Using Management API token instead."
    Write-Host "Get one here: https://supabase.com/dashboard/account/tokens"
    Write-Host ""
    $token = Read-Host "Paste your Supabase access token"
    if ([string]::IsNullOrWhiteSpace($token)) {
      Write-Host "No token provided. Cancelled." -ForegroundColor Red
      exit 1
    }
    node "$PSScriptRoot\update-supabase-email-templates.js" $token.Trim()
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Optional: verify in dashboard" -ForegroundColor Yellow
Write-Host "https://supabase.com/dashboard/project/xrpuvnhmdmpgelfxpdcx/auth/templates"
Write-Host "https://supabase.com/dashboard/project/xrpuvnhmdmpgelfxpdcx/auth/url-configuration"
Write-Host ""
