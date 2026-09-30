# Abre el login de Cloudflare Tunnel (una vez). Autorizá bravaburgers.com.ar en el navegador.
$ErrorActionPreference = "Stop"
$cf = Join-Path $PSScriptRoot "..\osrm-local-pc\bin\cloudflared.exe"
if (-not (Test-Path $cf)) { throw "Falta infra\osrm-local-pc\bin\cloudflared.exe" }
Write-Host "Se abrirá el navegador para vincular Cloudflare con esta PC..." -ForegroundColor Cyan
& $cf tunnel login
Write-Host "Listo. Siguiente paso:" -ForegroundColor Green
Write-Host "  $cf tunnel create brava-routing" -ForegroundColor Gray
Write-Host "  .\setup-tunnel-bravaburgers.ps1 -TunnelUuid <UUID que imprime create>" -ForegroundColor Gray
