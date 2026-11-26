$ErrorActionPreference = 'Stop'

Write-Host 'Checking for Android device over USB...'
$devices = adb devices | Select-String 'device$'
if (-not $devices) {
  Write-Host ''
  Write-Host 'No Android device detected.' -ForegroundColor Yellow
  Write-Host '1. Connect your phone with a USB cable'
  Write-Host '2. Enable Developer options + USB debugging on the phone'
  Write-Host '3. Set USB mode to File transfer / MTP (not charge only)'
  Write-Host '4. Accept the Allow USB debugging prompt on the phone'
  Write-Host '5. Run this script again'
  exit 1
}

Write-Host 'Device found. Forwarding Metro port 8081...'
adb reverse tcp:8081 tcp:8081
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to run adb reverse tcp:8081 tcp:8081'
}

Write-Host ''
Write-Host 'Android push notifications do NOT work in Expo Go (SDK 53+).' -ForegroundColor Yellow
Write-Host 'Use an installed NetPay development/production build on the phone.' -ForegroundColor Yellow
Write-Host ''
Write-Host 'First time only:'
Write-Host '  npm run build:android:apk'
Write-Host '  Install the APK on your phone, then run this script again.'
Write-Host ''
Write-Host 'USB forwarding ready. Starting Expo for the dev client on localhost...'
Write-Host 'Open the installed NetPay app (not Expo Go). It should connect to exp://127.0.0.1:8081'
Write-Host ''

npx expo start --clear --localhost --dev-client
