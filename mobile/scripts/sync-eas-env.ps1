# Syncs EXPO_PUBLIC_* vars from .env to EAS preview environment for cloud builds.
$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

$EnvFile = Join-Path $ProjectRoot '.env'
if (-not (Test-Path $EnvFile)) {
    throw "Missing $EnvFile"
}

$vars = @{}
Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { return }
    $name = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    if ($name.StartsWith('EXPO_PUBLIC_')) {
        $vars[$name] = $value
    }
}

if ($vars.Count -eq 0) {
    throw 'No EXPO_PUBLIC_* variables found in .env'
}

Write-Host "Syncing $($vars.Count) variables to EAS preview..." -ForegroundColor Cyan

foreach ($entry in $vars.GetEnumerator()) {
    Write-Host "  $($entry.Key)"
    npx eas-cli env:set preview `
        --name $entry.Key `
        --value $entry.Value `
        --visibility secret `
        --environment preview `
        --non-interactive
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to set $($entry.Key)"
    }
}

Write-Host ''
Write-Host 'Done. Rebuild the APK:' -ForegroundColor Green
Write-Host '  npm run build:android:apk'
