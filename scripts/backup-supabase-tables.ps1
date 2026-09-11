# Backup Netpay public tables via Supabase Management API (no Docker required)
param(
  [string]$BackupRoot = ""
)

$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")
if (-not $BackupRoot) {
  $ts = Get-Date -Format "yyyyMMdd-HHmmss"
  $BackupRoot = Join-Path "backups" "supabase-$ts"
}

$tablesDir = Join-Path $BackupRoot "tables"
New-Item -ItemType Directory -Force -Path $tablesDir | Out-Null
$logPath = Join-Path $BackupRoot "backup-run.log"
"Starting table backup at $(Get-Date -Format o)" | Set-Content $logPath

function Invoke-SupabaseJsonSql([string]$Sql) {
  $raw = & npx supabase db query --linked --agent=no -o json $Sql 2>&1 | ForEach-Object { "$_" }
  $joined = $raw -join "`n"
  $idx = $joined.IndexOf("[")
  if ($idx -lt 0) {
    if ($joined -match "\[\]") { return "[]" }
    throw "No JSON array for SQL.`n$joined"
  }
  $jsonPart = $joined.Substring($idx)
  $endArr = $jsonPart.LastIndexOf("]")
  if ($endArr -ge 0) { return $jsonPart.Substring(0, $endArr + 1).Trim() }
  return $jsonPart.Trim()
}

try {
  $tablesJson = Invoke-SupabaseJsonSql "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name;"
  $tables = @(($tablesJson | ConvertFrom-Json).table_name)
  "Found $($tables.Count) tables" | Add-Content $logPath
} catch {
  "FATAL listing tables: $($_.Exception.Message)" | Add-Content $logPath
  Write-Host "FATAL listing tables: $($_.Exception.Message)"
  exit 1
}

$manifest = @()

foreach ($t in $tables) {
  try {
    $data = Invoke-SupabaseJsonSql ("select * from public.`"{0}`";" -f $t)
    $path = Join-Path $tablesDir "$t.json"
    Set-Content -Path $path -Value $data -Encoding utf8
    $count = 0
    try {
      $parsed = ConvertFrom-Json -InputObject $data
      if ($null -eq $parsed) { $count = 0 }
      elseif ($parsed -is [System.Array]) { $count = $parsed.Count }
      else { $count = 1 }
    } catch { $count = -1 }
    $manifest += [pscustomobject]@{
      table  = $t
      rows   = $count
      file   = "$t.json"
      status = "ok"
      bytes  = (Get-Item $path).Length
    }
    $msg = "OK $t rows=$count"
    Write-Host $msg
    $msg | Add-Content $logPath
  } catch {
    $manifest += [pscustomobject]@{
      table  = $t
      rows   = 0
      file   = "$t.json"
      status = "error: $($_.Exception.Message)"
      bytes  = 0
    }
    $msg = "FAIL $t : $($_.Exception.Message)"
    Write-Host $msg
    $msg | Add-Content $logPath
  }
}

$manifestPath = Join-Path $BackupRoot "manifest.json"
$manifest | ConvertTo-Json -Depth 5 | Set-Content $manifestPath -Encoding utf8
$done = "DONE tables=$($tables.Count) backup=$BackupRoot"
Write-Host $done
$done | Add-Content $logPath
