# Instalación guiada: PBF zona Brava + Docker Valhalla + prueba local.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=== Brava Valhalla (PC local) ===" -ForegroundColor Cyan

docker info 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Instalá Docker Desktop y volvé a ejecutar este script." -ForegroundColor Red
  exit 1
}

$osrmDir = Join-Path $PSScriptRoot "..\osrm-local-pc"
$pbf = Join-Path $osrmDir "data\brava-zona.osm.pbf"
if (-not (Test-Path $pbf)) {
  Write-Host "Preparando mapa OSRM/Valhalla (zona Brava)..." -ForegroundColor Yellow
  Push-Location $osrmDir
  if (-not (Test-Path "data\argentina-latest.osm.pbf")) {
    & .\prepare.ps1
  }
  & .\prepare-zona-brava.ps1
  Pop-Location
}

& .\prepare.ps1

Write-Host ""
Write-Host "Esperando que Valhalla termine el build (puede tardar). Cuando responda:" -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 120; $i++) {
  Start-Sleep -Seconds 15
  try {
    & .\test-valhalla.ps1
    $ready = $true
    break
  } catch {
    Write-Host "  ... aún construyendo tiles ($($i + 1)/120)" -ForegroundColor DarkGray
  }
}

if (-not $ready) {
  Write-Host "Valhalla sigue construyendo. Seguí con: docker compose logs -f valhalla" -ForegroundColor Yellow
  Write-Host "Luego: .\test-valhalla.ps1 y .\run-quick-tunnel-and-vercel.ps1" -ForegroundColor Gray
  exit 0
}

Write-Host ""
Write-Host "Instalación OK. Para reparto del día:" -ForegroundColor Green
Write-Host "  1. .\start-valhalla.ps1" -ForegroundColor Gray
Write-Host "  2. .\run-quick-tunnel-and-vercel.ps1   (URL nueva → Vercel automático)" -ForegroundColor Gray
Write-Host "  o túnel fijo: ver README.md (valhalla.tudominio.com)" -ForegroundColor Gray
