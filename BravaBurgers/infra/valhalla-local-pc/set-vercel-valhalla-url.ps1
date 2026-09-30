# BRAVA_VALHALLA_BASE_URL + BRAVA_ROUTING_ENGINE=valhalla en Vercel.
param(
  [Parameter(Mandatory = $true)]
  [string]$Url
)

$ErrorActionPreference = "Stop"
$url = $Url.Trim().TrimEnd("/")
if ($url -notmatch "/route$") {
  $url = "$url/route"
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$upsert = Join-Path $root "scripts\upsert-vercel-env.js"
if (-not (Test-Path $upsert)) {
  throw "No se encontró scripts/upsert-vercel-env.js"
}

$token = $env:VERCEL_TOKEN
if (-not $token) {
  $candidates = @(
    (Join-Path $root "secrets\vercel-token.txt"),
    (Join-Path $root "..\WHATSAPP_VERCEL_ENV.txt"),
    (Join-Path $root ".env.local"),
    (Join-Path $root ".env")
  )
  foreach ($f in $candidates) {
    if (-not (Test-Path $f)) { continue }
    $raw = (Get-Content $f -Raw).Trim()
    if ($f -like "*vercel-token.txt" -and $raw -match '^vcp_') {
      $token = ($raw -split "`n")[0].Trim()
    } else {
      foreach ($line in Get-Content $f) {
        if ($line -match '^\s*VERCEL_TOKEN\s*=\s*(.+)\s*$') {
          $token = $Matches[1].Trim().Trim('"').Trim("'")
          break
        }
      }
    }
    if ($token) { break }
  }
}

if (-not $token) {
  Write-Host "Falta VERCEL_TOKEN." -ForegroundColor Yellow
  Write-Host '  $env:VERCEL_TOKEN="..."; .\set-vercel-valhalla-url.ps1 -Url "https://valhalla.tudominio.com/route"'
  exit 1
}

$env:VERCEL_TOKEN = $token
node $upsert BRAVA_VALHALLA_BASE_URL $url
node $upsert BRAVA_ROUTING_ENGINE valhalla
Write-Host "BRAVA_VALHALLA_BASE_URL y BRAVA_ROUTING_ENGINE=valhalla en Vercel. Redeploy production." -ForegroundColor Green
