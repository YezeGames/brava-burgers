# Sube OPENROUTESERVICE_API_KEY a Vercel leyendo secrets/ (no imprime la key).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$secrets = Join-Path $root "secrets"
$keyFile = Join-Path $secrets "openrouteservice-api-key.txt"
$tokenFile = Join-Path $secrets "vercel-token.txt"
$upsert = Join-Path $root "scripts\upsert-vercel-env.js"

if (-not (Test-Path $keyFile)) {
  Write-Host "Creá $keyFile con una sola línea (API key ORS)." -ForegroundColor Yellow
  exit 1
}
$key = (Get-Content $keyFile -Raw).Trim()
if (-not $key) { throw "openrouteservice-api-key.txt vacío" }

$token = $env:VERCEL_TOKEN
if (-not $token -and (Test-Path $tokenFile)) {
  $token = (Get-Content $tokenFile -Raw).Trim()
}
if (-not $token) { throw "Falta vercel-token.txt o VERCEL_TOKEN" }

$env:VERCEL_TOKEN = $token
node $upsert OPENROUTESERVICE_API_KEY $key
Write-Host "OPENROUTESERVICE_API_KEY en Vercel. Redeploy production para aplicar." -ForegroundColor Green
