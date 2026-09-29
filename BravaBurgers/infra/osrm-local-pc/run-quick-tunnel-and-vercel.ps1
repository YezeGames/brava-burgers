# Túnel temporal Cloudflare (trycloudflare) + BRAVA_OSRM_BASE_URL en Vercel.
# Requiere OSRM en http://127.0.0.1:5000
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$cf = Join-Path $PSScriptRoot "bin\cloudflared.exe"
if (-not (Test-Path $cf)) { throw "Falta bin\cloudflared.exe" }

try {
  Invoke-WebRequest -Uri "http://127.0.0.1:5000/" -UseBasicParsing -TimeoutSec 5 | Out-Null
} catch {
  Write-Host "OSRM no responde en :5000. Ejecutá: docker compose up -d" -ForegroundColor Red
  exit 1
}

Write-Host "Iniciando túnel (dejá esta ventana abierta)..." -ForegroundColor Cyan
$proc = Start-Process -FilePath $cf -ArgumentList "tunnel","--url","http://127.0.0.1:5000" -RedirectStandardOutput "tunnel-out.log" -RedirectStandardError "tunnel-err.log" -PassThru -NoNewWindow
Start-Sleep -Seconds 8
$err = Get-Content "tunnel-err.log" -Raw -ErrorAction SilentlyContinue
$url = $null
if ($err -match "(https://[a-z0-9-]+\.trycloudflare\.com)") { $url = $Matches[1] }
if (-not $url) {
  $out = Get-Content "tunnel-out.log" -Raw -ErrorAction SilentlyContinue
  if ($out -match "(https://[a-z0-9-]+\.trycloudflare\.com)") { $url = $Matches[1] }
}
if (-not $url) {
  Write-Host "No se detectó URL. Revisá tunnel-err.log" -ForegroundColor Yellow
  exit 1
}
Write-Host "Túnel: $url" -ForegroundColor Green
$base = "$url/route/v1/driving"
& (Join-Path $PSScriptRoot "set-vercel-osrm-url.ps1") -Url $base
Write-Host "PID túnel: $($proc.Id) — no cierres este script mientras repartan." -ForegroundColor Gray
Wait-Process $proc
