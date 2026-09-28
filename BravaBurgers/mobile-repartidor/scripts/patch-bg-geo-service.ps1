# Aplica parche FGS location (Android 10+) al plugin background-geolocation.
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Mobile = Join-Path $Root "mobile-repartidor"
$Patch = Join-Path $Mobile "vendor-patches\BackgroundGeolocationService.java"
$Target = Join-Path $Mobile "node_modules\@capacitor-community\background-geolocation\android\src\main\java\com\equimaps\capacitor_background_geolocation\BackgroundGeolocationService.java"
if (-not (Test-Path $Patch)) { Write-Error "Missing patch: $Patch" }
if (-not (Test-Path $Target)) {
  Write-Host "Run npm install in mobile-repartidor first." -ForegroundColor Yellow
  exit 1
}
Copy-Item -Path $Patch -Destination $Target -Force
Write-Host "Patched BackgroundGeolocationService.java" -ForegroundColor Green
