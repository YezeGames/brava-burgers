# Levanta OSRM (fallback) + Valhalla (principal) en Docker.
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
& (Join-Path $here "..\osrm-local-pc\start-osrm.ps1")
& (Join-Path $here "..\valhalla-local-pc\start-valhalla.ps1")
Write-Host ""
Write-Host "Routing listo. Túnel Valhalla (recomendado):" -ForegroundColor Cyan
Write-Host "  cd infra\valhalla-local-pc" -ForegroundColor Gray
Write-Host "  .\run-quick-tunnel-and-vercel.ps1" -ForegroundColor Gray
