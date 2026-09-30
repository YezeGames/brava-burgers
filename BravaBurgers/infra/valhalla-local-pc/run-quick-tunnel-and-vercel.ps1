# Túnel temporal trycloudflare → Valhalla :8002 + variables Vercel.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$cfLocal = Join-Path $PSScriptRoot "bin\cloudflared.exe"
$cfOsrm = Join-Path $PSScriptRoot "..\osrm-local-pc\bin\cloudflared.exe"
$cf = if (Test-Path $cfLocal) { $cfLocal } elseif (Test-Path $cfOsrm) { $cfOsrm } else { $null }
if (-not $cf) {
  throw "Falta cloudflared en bin\ o infra\osrm-local-pc\bin\"
}

$routeBody = '{"locations":[{"lon":-58.482,"lat":-34.505,"type":"break"},{"lon":-58.478,"lat":-34.502,"type":"break"}],"costing":"auto","shape_format":"polyline6"}'
try {
  Invoke-RestMethod -Uri "http://127.0.0.1:8002/route" -Method Post -Body $routeBody -ContentType "application/json" -TimeoutSec 90 | Out-Null
} catch {
  Write-Host "Valhalla no responde en :8002. Ejecutá: .\prepare.ps1" -ForegroundColor Red
  exit 1
}

Write-Host "Iniciando túnel Valhalla (dejá esta ventana abierta)..." -ForegroundColor Cyan
$proc = Start-Process -FilePath $cf -ArgumentList "tunnel","--url","http://127.0.0.1:8002" -RedirectStandardOutput "tunnel-out.log" -RedirectStandardError "tunnel-err.log" -PassThru -NoNewWindow
Start-Sleep -Seconds 8
$url = $null
foreach ($log in @("tunnel-err.log", "tunnel-out.log")) {
  if (-not (Test-Path $log)) { continue }
  $raw = Get-Content $log -Raw -ErrorAction SilentlyContinue
  if ($raw -match "(https://[a-z0-9-]+\.trycloudflare\.com)") {
    $url = $Matches[1]
    break
  }
}
if (-not $url) {
  Write-Host "No se detectó URL trycloudflare. Revisá tunnel-err.log" -ForegroundColor Yellow
  exit 1
}

Write-Host "Túnel Valhalla: $url" -ForegroundColor Green
$base = "$url/route"
& (Join-Path $PSScriptRoot "set-vercel-valhalla-url.ps1") -Url $base
Write-Host "PID tunel: $($proc.Id) - no cierres este proceso mientras repartan." -ForegroundColor Gray
Write-Host "Tunel Valhalla activo en segundo plano (PID $($proc.Id))." -ForegroundColor Green
