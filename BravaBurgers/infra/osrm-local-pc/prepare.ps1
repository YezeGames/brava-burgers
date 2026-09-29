# Geofabrik Argentina + OSRM preprocess (20-60 min first run).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$data = Join-Path $PSScriptRoot "data"
New-Item -ItemType Directory -Force -Path $data | Out-Null

$pbf = Join-Path $data "argentina-latest.osm.pbf"
$url = "https://download.geofabrik.de/south-america/argentina-latest.osm.pbf"

if ((Test-Path $pbf) -and (Get-Item $pbf).Length -gt 400MB) {
  Write-Host "Mapa OK ($([math]::Round((Get-Item $pbf).Length/1MB)) MB), omitiendo descarga."
} else {
  Write-Host "Descargando mapa Argentina (curl)..."
  curl.exe -L --retry 5 --retry-delay 3 -C - -o $pbf $url
  if (-not (Test-Path $pbf) -or (Get-Item $pbf).Length -lt 400MB) {
    throw "Descarga incompleta (esperado ~412 MB)."
  }
}

$img = "osrm/osrm-backend:latest"
$vol = "${data}:/data"

Write-Host "osrm-extract..."
docker run --rm -t -v $vol $img osrm-extract -p /opt/car.lua /data/argentina-latest.osm.pbf

Write-Host "osrm-partition..."
docker run --rm -t -v $vol $img osrm-partition /data/argentina-latest.osrm

Write-Host "osrm-customize..."
docker run --rm -t -v $vol $img osrm-customize /data/argentina-latest.osrm

Write-Host "Listo. Ejecuta: docker compose up -d"
