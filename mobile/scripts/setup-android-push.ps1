# Sets up Firebase (google-services.json + FCM service account) and EAS push credentials.
# Requires: Firebase Console access + EAS login (eas whoami).

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

$FirebaseProjectId = 'netpay-47909'
$AndroidPackage = 'com.netpay.mobile'
$GoogleServicesPath = Join-Path $ProjectRoot 'google-services.json'
$FcmKeyPath = Join-Path $ProjectRoot 'fcm-service-account.json'
$FcmKeyAltGlob = Join-Path $ProjectRoot '*-firebase-adminsdk-*.json'

$FirebaseGeneralUrl = "https://console.firebase.google.com/project/$FirebaseProjectId/settings/general/android:com.netpay.mobile"
$FirebaseServiceAccountsUrl = "https://console.firebase.google.com/project/$FirebaseProjectId/settings/serviceaccounts/adminsdk"
$ExpoCredentialsUrl = 'https://expo.dev/accounts/versawealthearn/projects/netpay/credentials'

function Test-GoogleServicesFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        return @{ ok = $false; message = 'File not found.' }
    }
    try {
        $json = Get-Content $Path -Raw | ConvertFrom-Json
        $packageName = $json.client[0].client_info.android_client_info.package_name
        $apiKey = $json.client[0].api_key[0].current_key
        if ($packageName -ne $AndroidPackage) {
            return @{ ok = $false; message = "Package is $packageName, expected $AndroidPackage." }
        }
        if (-not $apiKey -or [string]::IsNullOrWhiteSpace($apiKey)) {
            return @{ ok = $false; message = 'Firebase API key (current_key) is empty — re-download from Firebase Console.' }
        }
        return @{ ok = $true; message = 'Valid google-services.json' }
    } catch {
        return @{ ok = $false; message = $_.Exception.Message }
    }
}

function Test-FcmServiceAccountFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        return @{ ok = $false; message = 'File not found.' }
    }
    try {
        $json = Get-Content $Path -Raw | ConvertFrom-Json
        if ($json.type -ne 'service_account') {
            return @{ ok = $false; message = 'JSON is not a service account key.' }
        }
        if (-not $json.private_key -or -not $json.client_email) {
            return @{ ok = $false; message = 'Missing private_key or client_email.' }
        }
        if ($json.project_id -ne $FirebaseProjectId) {
            return @{ ok = $false; message = "Project id is $($json.project_id), expected $FirebaseProjectId." }
        }
        return @{ ok = $true; message = 'Valid FCM service account key' }
    } catch {
        return @{ ok = $false; message = $_.Exception.Message }
    }
}

function Resolve-FcmKeyPath {
    if (Test-Path $FcmKeyPath) { return $FcmKeyPath }
    $matches = Get-ChildItem -Path $ProjectRoot -Filter '*-firebase-adminsdk-*.json' -File -ErrorAction SilentlyContinue
    if ($matches.Count -eq 1) { return $matches[0].FullName }
    return $null
}

Write-Host ''
Write-Host '=== NetPay Android push setup ===' -ForegroundColor Cyan
Write-Host "Project: $FirebaseProjectId | Package: $AndroidPackage"
Write-Host ''

Write-Host 'Checking EAS login...'
npx eas-cli whoami | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw 'Not logged in to EAS. Run: npx eas-cli login'
}

$googleStatus = Test-GoogleServicesFile -Path $GoogleServicesPath
Write-Host ''
Write-Host 'google-services.json:' $(if ($googleStatus.ok) { 'OK' } else { 'MISSING/INVALID' }) -ForegroundColor $(if ($googleStatus.ok) { 'Green' } else { 'Yellow' })
Write-Host "  $($googleStatus.message)"

$fcmPath = Resolve-FcmKeyPath
if (-not $fcmPath) {
    $fcmStatus = @{ ok = $false; message = 'Save Firebase Admin SDK key as mobile/fcm-service-account.json' }
} else {
    if ($fcmPath -ne $FcmKeyPath) {
        Write-Host "  Found $($fcmPath | Split-Path -Leaf); copying to fcm-service-account.json..."
        Copy-Item $fcmPath $FcmKeyPath -Force
        $fcmPath = $FcmKeyPath
    }
    $fcmStatus = Test-FcmServiceAccountFile -Path $fcmPath
}

Write-Host ''
Write-Host 'FCM service account key:' $(if ($fcmStatus.ok) { 'OK' } else { 'MISSING/INVALID' }) -ForegroundColor $(if ($fcmStatus.ok) { 'Green' } else { 'Yellow' })
Write-Host "  $($fcmStatus.message)"

if (-not $googleStatus.ok) {
    Write-Host ''
    Write-Host 'Step 1 — Download google-services.json' -ForegroundColor Cyan
    Write-Host '  1. Open Firebase project settings for the Android app'
    Write-Host '  2. Download google-services.json'
    Write-Host "  3. Save it to: $GoogleServicesPath"
    Start-Process $FirebaseGeneralUrl
}

if (-not $fcmStatus.ok) {
    Write-Host ''
    Write-Host 'Step 2 — Create FCM V1 service account key' -ForegroundColor Cyan
    Write-Host '  1. Firebase > Project settings > Service accounts'
    Write-Host '  2. Click Generate new private key'
    Write-Host "  3. Save the JSON as: $FcmKeyPath"
    Start-Process $FirebaseServiceAccountsUrl
}

if (-not $googleStatus.ok -or -not $fcmStatus.ok) {
    Write-Host ''
    Write-Host 'Place both files, then run this script again:' -ForegroundColor Yellow
    Write-Host '  npm run setup:android-push'
    exit 1
}

Write-Host ''
Write-Host 'Running local validation...'
node ./scripts/validate-config.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Step 3 — Upload FCM key to EAS' -ForegroundColor Cyan
Write-Host '  Opening Expo credentials dashboard...'
Write-Host "  Upload $FcmKeyPath under Android > com.netpay.mobile > FCM V1 service account key"
Start-Process $ExpoCredentialsUrl

Write-Host ''
Write-Host 'Step 4 — EAS CLI (interactive — complete in this terminal)' -ForegroundColor Cyan
Write-Host '  Choose: Android > preview (or production) > Google Service Account > FCM V1 > Upload key'
Write-Host '  EAS should auto-detect fcm-service-account.json in this folder.'
Write-Host ''

npx eas-cli credentials:configure-build -p android -e preview

Write-Host ''
Write-Host 'Done. Rebuild and install the Android app (not Expo Go):' -ForegroundColor Green
Write-Host '  npm run build:android:apk'
Write-Host '  npm run start:dev'
