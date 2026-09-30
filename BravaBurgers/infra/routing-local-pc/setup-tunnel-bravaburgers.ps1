# Configura túnel fijo bravaburgers.com.ar (Valhalla + OSRM) y Vercel producción.
param(
  [string]$TunnelUuid = "",
  [switch]$SkipVercel
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$cfOsrm = Join-Path $PSScriptRoot "..\osrm-local-pc\bin\cloudflared.exe"
$cfVal = Join-Path $PSScriptRoot "..\valhalla-local-pc\bin\cloudflared.exe"
$cf = if (Test-Path $cfOsrm) { $cfOsrm } elseif (Test-Path $cfVal) { $cfVal } else { "cloudflared" }

$example = Join-Path $PSScriptRoot "tunnel-config.bravaburgers.example.yml"
$configName = "tunnel-config.bravaburgers.yml"
$configPath = Join-Path $PSScriptRoot $configName

if (-not (Test-Path $configPath)) {
  if (-not $TunnelUuid) {
    Write-Host "Falta tunnel-config.bravaburgers.yml" -ForegroundColor Yellow
    Write-Host "1. $cf tunnel login" -ForegroundColor Gray
    Write-Host "2. $cf tunnel create brava-routing" -ForegroundColor Gray
    Write-Host "3. Volvé a correr:" -ForegroundColor Gray
    Write-Host "   .\setup-tunnel-bravaburgers.ps1 -TunnelUuid <UUID>" -ForegroundColor Cyan
    Copy-Item $example $configPath
    exit 1
  }
  $user = $env:USERNAME
  $tpl = Get-Content $example -Raw
  $tpl = $tpl -replace "TUNNEL-UUID", $TunnelUuid
  $tpl = $tpl -replace "TU_USUARIO", $user
  Set-Content -Path $configPath -Value $tpl -Encoding UTF8
  Write-Host "Creado $configName" -ForegroundColor Green
}

Write-Host ""
Write-Host "DNS en Cloudflare (proxied):" -ForegroundColor Cyan
Write-Host "  CNAME valhalla -> <tunnel-id>.cfargotunnel.com" -ForegroundColor Gray
Write-Host "  CNAME osrm     -> <tunnel-id>.cfargotunnel.com" -ForegroundColor Gray
Write-Host ""
Write-Host "Probar túnel (ventana abierta):" -ForegroundColor Cyan
Write-Host "  $cf tunnel --config `"$configPath`" run brava-routing" -ForegroundColor Gray
Write-Host ""

if (-not $SkipVercel) {
  $valhallaUrl = "https://valhalla.bravaburgers.com.ar/route"
  & (Join-Path $PSScriptRoot "..\valhalla-local-pc\set-vercel-valhalla-url.ps1") -Url $valhallaUrl
  Write-Host "Vercel apunta a $valhallaUrl (redeploy al push o dashboard)." -ForegroundColor Green
}

Write-Host "Servicio Windows (opcional, arranca con la PC):" -ForegroundColor Cyan
Write-Host "  Copiá $configPath a %USERPROFILE%\.cloudflared\config.yml" -ForegroundColor Gray
Write-Host "  $cf service install" -ForegroundColor Gray
Write-Host "  net start cloudflared" -ForegroundColor Gray
