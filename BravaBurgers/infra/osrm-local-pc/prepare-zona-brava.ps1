# OSRM solo zona Brava (7 poligonos checkout) — mas rapido en PC que Argentina entera.
# Requiere: Docker, y argentina-latest.osm.pbf en data/ (correr prepare.ps1 antes si falta).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$data = Join-Path $PSScriptRoot "data"
New-Item -ItemType Directory -Force -Path $data | Out-Null

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bboxScript = Join-Path $repoRoot "scripts\osrm-delivery-bbox.js"
if (-not (Test-Path $bboxScript)) {
  throw "No se encontro scripts/osrm-delivery-bbox.js"
}

$bboxJson = node $bboxScript
$bbox = $bboxJson | ConvertFrom-Json
$inv = [System.Globalization.CultureInfo]::InvariantCulture
function Fmt([double]$n) { return $n.ToString($inv) }
$bboxStr = "$(Fmt $bbox.minLng),$(Fmt $bbox.minLat),$(Fmt $bbox.maxLng),$(Fmt $bbox.maxLat)"
Write-Host "Bbox reparto (pad $($bbox.padRatio)): $bboxStr" -ForegroundColor Cyan

$srcPbf = Join-Path $data "argentina-latest.osm.pbf"
$zonaPbf = Join-Path $data "brava-zona.osm.pbf"
$zonaBase = "brava-zona"

if (-not (Test-Path $srcPbf) -or (Get-Item $srcPbf).Length -lt 400MB) {
  Write-Host "Falta mapa base. Ejecuta primero: .\prepare.ps1 (descarga Argentina ~412 MB)" -ForegroundColor Yellow
  exit 1
}

$osmiumImg = "iboates/osmium:latest"
Write-Host "Recortando PBF con osmium (puede tardar varios minutos)..."
docker pull $osmiumImg 2>$null | Out-Null
docker run --rm -t -v "${data}:/data" $osmiumImg `
  extract --bbox $bboxStr --strategy smart `
  -o "/data/brava-zona.osm.pbf" "/data/argentina-latest.osm.pbf"

if (-not (Test-Path $zonaPbf) -or (Get-Item $zonaPbf).Length -lt 1MB) {
  throw "Recorte fallo o PBF muy chico."
}
Write-Host "PBF zona: $([math]::Round((Get-Item $zonaPbf).Length/1MB)) MB" -ForegroundColor Green

$img = "osrm/osrm-backend:latest"
$vol = "${data}:/data"

Write-Host "osrm-extract (zona Brava)..."
docker run --rm -t -v $vol $img osrm-extract -p /opt/car.lua "/data/$zonaBase.osm.pbf"

Write-Host "osrm-partition..."
docker run --rm -t -v $vol $img osrm-partition "/data/$zonaBase.osrm"

Write-Host "osrm-customize..."
docker run --rm -t -v $vol $img osrm-customize "/data/$zonaBase.osrm"

$compose = Join-Path $PSScriptRoot "docker-compose.yml"
$composeText = Get-Content $compose -Raw
$newCmd = "osrm-routed --algorithm mld /data/$zonaBase.osrm"
if ($composeText -notmatch [regex]::Escape($newCmd)) {
  $composeText = $composeText -replace 'osrm-routed --algorithm mld /data/[^\s]+', $newCmd
  Set-Content -Path $compose -Value $composeText -NoNewline
  Write-Host "docker-compose.yml apunta a /data/$zonaBase.osrm" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Listo. Reinicia OSRM:" -ForegroundColor Green
Write-Host "  docker compose down; docker compose up -d"
Write-Host "  .\start-osrm.ps1"
Write-Host "Probar: http://127.0.0.1:5000/route/v1/driving/-58.48,-34.51;-58.47,-34.50?overview=false"
