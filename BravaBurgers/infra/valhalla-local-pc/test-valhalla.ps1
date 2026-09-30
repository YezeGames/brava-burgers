# Prueba local route + locate (Valhalla).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$routeBody = @{
  locations = @(
    @{ lon = -58.482; lat = -34.505; type = "break" },
    @{ lon = -58.478; lat = -34.502; type = "break" }
  )
  costing = "auto"
  shape_format = "polyline6"
  directions_options = @{ language = "es-ES" }
} | ConvertTo-Json -Depth 6

Write-Host "POST /route ..." -ForegroundColor Cyan
$r = Invoke-RestMethod -Uri "http://127.0.0.1:8002/route" -Method Post -Body $routeBody -ContentType "application/json" -TimeoutSec 120
if (-not $r.trip.legs[0].shape) { throw "Sin shape en respuesta" }
Write-Host "OK route - shape length: $($r.trip.legs[0].shape.Length) chars, maniobras: $($r.trip.legs[0].maneuvers.Count)" -ForegroundColor Green

$locBody = @{
  locations = @(@{ lat = -34.505; lon = -58.482 })
  costing = "auto"
} | ConvertTo-Json -Depth 4

Write-Host "POST /locate ..." -ForegroundColor Cyan
$l = Invoke-RestMethod -Uri "http://127.0.0.1:8002/locate" -Method Post -Body $locBody -ContentType "application/json" -TimeoutSec 30
$snapLat = $null
$snapLon = $null
if ($l.edges -and $l.edges.Count -gt 0) {
  $snapLat = $l.edges[0].correlated_lat
  $snapLon = $l.edges[0].correlated_lon
} elseif ($l[0][0].lat) {
  $snapLat = $l[0][0].lat
  $snapLon = $l[0][0].lon
}
if (-not $snapLat) { throw "locate vacio" }
Write-Host "OK locate - snap: $snapLat, $snapLon" -ForegroundColor Green
