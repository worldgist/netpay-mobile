# Opens Expo dashboard and launches interactive EAS FCM upload in a new terminal.
$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path $PSScriptRoot -Parent
$FcmKeyPath = Join-Path $ProjectRoot 'fcm-service-account.json'
$ExpoCredentialsUrl = 'https://expo.dev/accounts/versawealthearn/projects/netpay/credentials/android/com.netpay.mobile'

if (-not (Test-Path $FcmKeyPath)) {
    Write-Host 'Missing fcm-service-account.json — run npm run setup:android-push first.' -ForegroundColor Red
    exit 1
}

Set-Clipboard -Value $FcmKeyPath
Write-Host 'Copied FCM key path to clipboard:' -ForegroundColor Green
Write-Host "  $FcmKeyPath"
Write-Host ''
Write-Host 'Opening Expo credentials page...'
Start-Process $ExpoCredentialsUrl

Write-Host ''
Write-Host 'Dashboard upload (easiest):' -ForegroundColor Cyan
Write-Host '  1. On the page that opened, find FCM V1 service account key'
Write-Host '  2. Click Add a service account key / Upload new key'
Write-Host '  3. Select the file (path is in your clipboard — paste in file picker address bar)'
Write-Host '  4. Click Save'
Write-Host ''
Write-Host 'OR use CLI — opening a new terminal with EAS credentials...' -ForegroundColor Cyan

$cliCommand = @"
Set-Location '$ProjectRoot'
Write-Host ''
Write-Host '=== EAS FCM upload ===' -ForegroundColor Cyan
Write-Host 'Follow the menus:'
Write-Host '  1. Google Service Account'
Write-Host '  2. Manage FCM V1 key'
Write-Host '  3. Upload new service account key'
Write-Host '  4. When asked for path, paste (already in clipboard):'
Write-Host '     $FcmKeyPath'
Write-Host ''
npx eas-cli credentials:configure-build -p android -e preview
Write-Host ''
Write-Host 'Press Enter to close...'
Read-Host
"@

Start-Process powershell -ArgumentList '-NoExit', '-Command', $cliCommand

Write-Host 'Done — complete the upload in the browser or the new terminal window.' -ForegroundColor Green
