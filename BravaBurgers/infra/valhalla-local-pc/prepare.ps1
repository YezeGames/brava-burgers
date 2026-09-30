# Copia el PBF zona Brava (compartido con OSRM) y levanta Valhalla (build tiles si faltan).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$osmData = Join-Path $PSScriptRoot "..\osrm-local-pc\data"
$pbf = Join-Path $osmData "brava-zona.osm.pbf"
if (-not (Test-Path $pbf) -or (Get-Item $pbf).Length -lt 1MB) {
  Write-Host "Falta brava-zona.osm.pbf. Ejecutá:" -ForegroundColor Yellow
  Write-Host "  cd infra\osrm-local-pc" -ForegroundColor Gray
  Write-Host "  .\prepare.ps1" -ForegroundColor Gray
  Write-Host "  .\prepare-zona-brava.ps1" -ForegroundColor Gray
  exit 1
}

$destDir = Join-Path $PSScriptRoot "custom_files"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$destPbf = Join-Path $destDir "brava-zona.osm.pbf"
$srcHash = (Get-FileHash $pbf -Algorithm SHA256).Hash
$marker = Join-Path $destDir ".pbf-sha256"
$prev = if (Test-Path $marker) { (Get-Content $marker -Raw).Trim() } else { "" }

if ($srcHash -ne $prev -or -not (Test-Path $destPbf)) {
  Write-Host "Copiando PBF zona Brava..." -ForegroundColor Cyan
  Copy-Item $pbf $destPbf -Force
  Set-Content -Path $marker -Value $srcHash -NoNewline
  foreach ($dir in @("valhalla_tiles", "admins", "timezones")) {
    $p = Join-Path $destDir $dir
    if (Test-Path $p) {
      Write-Host "Borrando $dir (mapa actualizado)..." -ForegroundColor Yellow
      Remove-Item -Recurse -Force $p
    }
  }
}

Write-Host "docker compose pull..." -ForegroundColor Cyan
docker compose pull
Write-Host "docker compose up -d..." -ForegroundColor Cyan
docker compose up -d

Write-Host ""
Write-Host "Valhalla: http://127.0.0.1:8002" -ForegroundColor Green
Write-Host "Primera vez: build de tiles (20-90 min). Logs: docker compose logs -f valhalla" -ForegroundColor Yellow
Write-Host "Listo cuando: .\test-valhalla.ps1" -ForegroundColor Gray
