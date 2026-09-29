#Requires -RunAsAdministrator
<#
  Instala y deja listo OSRM en ESTA PC (local Brava) + túnel Cloudflare + Vercel.
  Ejecutar: clic derecho PowerShell → "Ejecutar como administrador"
  cd BravaBurgers\infra\osrm-local-pc
  .\INSTALAR-OSRM-LOCAL.ps1

  Tras instalar Docker puede pedir REINICIO una sola vez.
#>
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

$binDir = Join-Path $PSScriptRoot "bin"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

function Ensure-Cloudflared {
  $exe = Join-Path $binDir "cloudflared.exe"
  if (Test-Path $exe) { return $exe }
  Write-Step "Descargando cloudflared..."
  $zip = Join-Path $env:TEMP "cloudflared-windows-amd64.exe"
  $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  Copy-Item $zip $exe -Force
  return $exe
}

function Test-DockerReady {
  try {
    $v = docker version --format "{{.Server.Version}}" 2>$null
    return [bool]$v
  } catch {
    return $false
  }
}

Write-Step "Comprobando virtualización (requerida para Docker)"
$virt = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty VirtualizationFirmwareEnabled -ErrorAction SilentlyContinue
if ($virt -eq $false -and $null -ne $virt) {
  Write-Host @"
La virtualización está OFF en BIOS/UEFI. Sin eso Docker no corre en esta PC.

1. Reiniciá → entrá a BIOS (F2/Del/F10 según marca)
2. Activá Intel VT-x / AMD-V (SVM)
3. En Windows: Panel de control → Activar 'Plataforma de máquina virtual' y 'Subsistema Windows para Linux'
4. Reiniciá y volvé a ejecutar este script.

Guía: https://aka.ms/enablevirtualization
"@ -ForegroundColor Red
  exit 3030
}

Write-Step "Comprobando WSL (requerido por Docker Desktop)"
$wslOk = $false
try {
  $st = wsl --status 2>&1 | Out-String
  if ($st -match "no est" -and $st -match "instalad") { $wslOk = $false }
  elseif ($st -match "virtualizaci" -and $st -match "no") { $wslOk = $false }
  else { $wslOk = $true }
} catch {
  $wslOk = $false
}
if (-not $wslOk) {
  Write-Host "Instalando WSL (puede pedir reinicio al terminar)..."
  wsl --install --no-distribution
  Write-Host "IMPORTANTE: Reiniciá Windows y volvé a ejecutar este script." -ForegroundColor Yellow
  exit 3010
}

if (-not (Test-DockerReady)) {
  Write-Step "Instalando Docker Desktop (winget)"
  winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
  Write-Host "Abrí Docker Desktop desde el menú Inicio, esperá 'Engine running' y volvé a ejecutar este script." -ForegroundColor Yellow
  Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -ErrorAction SilentlyContinue
  exit 3020
}

Write-Step "Preparando mapa OSRM (Geofabrik Argentina — solo la primera vez)"
& (Join-Path $PSScriptRoot "prepare.ps1")

Write-Step "Levantando OSRM en http://127.0.0.1:5000"
docker compose up -d

Start-Sleep -Seconds 3
try {
  $probe = Invoke-WebRequest -Uri "http://127.0.0.1:5000/route/v1/driving/-58.381,-34.603;-58.420,-34.615?overview=false" -UseBasicParsing -TimeoutSec 15
  if ($probe.StatusCode -ne 200) { throw "bad status" }
  Write-Host "OSRM local OK" -ForegroundColor Green
} catch {
  Write-Host "OSRM aún no responde; esperá 30 s y probá de nuevo en el navegador." -ForegroundColor Yellow
}

$cf = Ensure-Cloudflared
Write-Step "Cloudflare Tunnel"
$configPath = Join-Path $PSScriptRoot "tunnel-config.yml"
$hostname = "osrm.bravaburgers.com.ar"
if (-not (Test-Path $configPath)) {
  @"
# Completar tras: cloudflared tunnel login
# cloudflared tunnel create brava-osrm
# Copiar UUID abajo y credentials-file

tunnel: REEMPLAZAR-TUNNEL-UUID
credentials-file: C:\Users\$env:USERNAME\.cloudflared\REEMPLAZAR-TUNNEL-UUID.json

ingress:
  - hostname: $hostname
    service: http://127.0.0.1:5000
  - service: http_status:404
"@ | Set-Content -Path $configPath -Encoding UTF8
}

Write-Host @"

--- Túnel (una vez, navegador) ---
1. $($cf) tunnel login
2. $($cf) tunnel create brava-osrm
3. Editá tunnel-config.yml con el UUID y credentials-file
4. En Cloudflare DNS: CNAME osrm -> <id>.cfargotunnel.com
5. Instalar servicio:
   $($cf) service install
   $($cf) tunnel --config `"$configPath`" run

--- Túnel rápido (prueba sin DNS, URL temporal) ---
   $($cf) tunnel --url http://127.0.0.1:5000
   Copiá la URL https://....trycloudflare.com y ejecutá:
   .\set-vercel-osrm-url.ps1 -Url `"https://....trycloudflare.com/route/v1/driving`"

--- Producción ---
   .\set-vercel-osrm-url.ps1 -Url `"https://$hostname/route/v1/driving`"

"@ -ForegroundColor Gray

Write-Step "Tareas al iniciar Windows (opcional)"
$taskScript = Join-Path $PSScriptRoot "start-osrm.ps1"
@"
Set-Location `"$PSScriptRoot`"
docker compose up -d
"@ | Set-Content $taskScript -Encoding UTF8
Write-Host "Creá Tarea programada que ejecute: powershell -File `"$taskScript`"" -ForegroundColor Gray

Write-Host "`nListo (local). Falta túnel + Vercel si aún no corriste set-vercel-osrm-url.ps1" -ForegroundColor Green
