# Ejecuta túnel fijo (valhalla + osrm subdominios). Dejá la ventana abierta.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$configPath = Join-Path $PSScriptRoot "tunnel-config.bravaburgers.yml"
if (-not (Test-Path $configPath)) {
  Write-Host "Corré primero: .\setup-tunnel-bravaburgers.ps1 -TunnelUuid <UUID>" -ForegroundColor Yellow
  exit 1
}

$cfOsrm = Join-Path $PSScriptRoot "..\osrm-local-pc\bin\cloudflared.exe"
$cf = if (Test-Path $cfOsrm) { $cfOsrm } else { "cloudflared" }

Write-Host "Túnel Brava: valhalla.bravaburgers.com.ar + osrm.bravaburgers.com.ar" -ForegroundColor Cyan
& $cf tunnel --config $configPath run
