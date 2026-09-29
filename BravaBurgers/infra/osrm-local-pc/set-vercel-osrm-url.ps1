# Actualiza BRAVA_OSRM_BASE_URL en Vercel (no imprime el valor en logs del repo).
param(
  [Parameter(Mandatory = $true)]
  [string]$Url
)

$ErrorActionPreference = "Stop"
$url = $Url.Trim().TrimEnd("/")
if ($url -notmatch "/route/v1/driving") {
  $url = "$url/route/v1/driving"
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$upsert = Join-Path $root "scripts\upsert-vercel-env.js"
if (-not (Test-Path $upsert)) {
  throw "No se encontró scripts/upsert-vercel-env.js"
}

$token = $env:VERCEL_TOKEN
if (-not $token) {
  $candidates = @(
    (Join-Path $root "..\WHATSAPP_VERCEL_ENV.txt"),
    (Join-Path $root ".env.local"),
    (Join-Path $root ".env")
  )
  foreach ($f in $candidates) {
    if (-not (Test-Path $f)) { continue }
    foreach ($line in Get-Content $f) {
      if ($line -match '^\s*VERCEL_TOKEN\s*=\s*(.+)\s*$') {
        $token = $Matches[1].Trim().Trim('"').Trim("'")
        break
      }
    }
    if ($token) { break }
  }
}

if (-not $token) {
  Write-Host "Falta VERCEL_TOKEN. Ejemplo:" -ForegroundColor Yellow
  Write-Host '  $env:VERCEL_TOKEN="..."; .\set-vercel-osrm-url.ps1 -Url "https://osrm.bravaburgers.com.ar/route/v1/driving"'
  exit 1
}

$env:VERCEL_TOKEN = $token
node $upsert BRAVA_OSRM_BASE_URL $url
Write-Host "BRAVA_OSRM_BASE_URL actualizado en Vercel. Redeploy: push a main o Redeploy en dashboard." -ForegroundColor Green
