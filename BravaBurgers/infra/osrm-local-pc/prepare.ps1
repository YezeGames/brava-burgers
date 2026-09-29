# Descarga mapa Argentina (Geofabrik) y preprocesa OSRM — una vez; tarda 20–60 min según PC/RAM.
# Requisitos: Docker Desktop en Windows, ~15 GB disco libre, 8 GB RAM recomendado.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$data = Join-Path $PSScriptRoot "data"
New-Item -ItemType Directory -Force -Path $data | Out-Null

$pbf = Join-Path $data "argentina-latest.osm.pbf"
$url = "https://download.geofabrik.de/south-america/argentina-latest.osm.pbf"

if (-not (Test-Path $pbf)) {
  Write-Host "Descargando $url (puede tardar)..."
  Invoke-WebRequest -Uri $url -OutFile $pbf -UseBasicParsing
} else {
  Write-Host "Ya existe $pbf — omitiendo descarga."
}

$img = "osrm/osrm-backend:latest"

Write-Host "osrm-extract..."
docker run --rm -t -v "${data}:/data" $img osrm-extract -p /opt/car.lua /data/argentina-latest.osm.pbf

Write-Host "osrm-partition..."
docker run --rm -t -v "${data}:/data" $img osrm-partition /data/argentina-latest.osrm

Write-Host "osrm-customize..."
docker run --rm -t -v "${data}:/data" $img osrm-customize /data/argentina-latest.osrm

Write-Host "Listo. Probar: docker compose up -d"
Write-Host "Luego: http://127.0.0.1:5000/route/v1/driving/-58.4,-34.6;-58.5,-34.7?overview=false"
