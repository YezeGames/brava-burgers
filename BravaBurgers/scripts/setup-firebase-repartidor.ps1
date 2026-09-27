# Configura Firebase FCM para la app repartidor (Windows).
# Requiere: Node.js, internet, cuenta Google (Gmail) tuya — una sola vez.
#
# Uso:
#   cd BravaBurgers
#   .\scripts\setup-firebase-repartidor.ps1
#
# Opcional (subir clave a Vercel automático):
#   $env:VERCEL_TOKEN = "..."   # https://vercel.com/account/tokens
#   .\scripts\setup-firebase-repartidor.ps1

param(
  [string]$ProjectId = "brava-burgers-repartidor",
  [string]$PackageName = "app.bravaburgers.repartidor",
  [string]$VercelProject = "brava-burgers",
  [string]$VercelTeam = "bravaburgers"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (Test-Path (Join-Path $PSScriptRoot "..\package.json")) {
  $RepoBrava = Split-Path $PSScriptRoot -Parent
} else {
  $RepoBrava = Join-Path $Root "BravaBurgers"
}
$MobileApp = Join-Path $RepoBrava "mobile-repartidor\android\app"
$SecretsDir = Join-Path $RepoBrava "secrets"
$GsJson = Join-Path $MobileApp "google-services.json"
$SaJson = Join-Path $SecretsDir "firebase-admin.json"

Write-Host ""
Write-Host "=== Brava — setup Firebase push repartidor ===" -ForegroundColor Cyan
Write-Host "Proyecto Firebase: $ProjectId"
Write-Host "Paquete Android:   $PackageName"
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Instalá Node.js LTS (nodejs.org) y volvé a ejecutar."
}

New-Item -ItemType Directory -Force -Path $SecretsDir | Out-Null
New-Item -ItemType Directory -Force -Path $MobileApp | Out-Null

Write-Host "[1/6] Login Firebase CLI (se abre el navegador; elegí tu Gmail de Brava/personal)..." -ForegroundColor Yellow
npx --yes firebase-tools@13 login
if ($LASTEXITCODE -ne 0) {
  Write-Error "Login falló. Reintentá: npx firebase-tools login"
}

Write-Host "[2/6] Crear proyecto Firebase (si ya existe, sigue igual)..." -ForegroundColor Yellow
$projList = npx firebase-tools projects:list --json 2>$null | ConvertFrom-Json
$exists = $false
if ($projList -and $projList.result) {
  $exists = @($projList.result | Where-Object { $_.projectId -eq $ProjectId }).Count -gt 0
}
if (-not $exists) {
  npx firebase-tools projects:create $ProjectId --display-name "Brava Repartidor"
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "No se pudo crear el proyecto (¿nombre ocupado?). Cambiá -ProjectId o creá el proyecto en console.firebase.google.com"
  }
} else {
  Write-Host "  Proyecto $ProjectId ya existe." -ForegroundColor Green
}

Write-Host "[3/6] App Android + google-services.json..." -ForegroundColor Yellow
if (-not (Test-Path $GsJson)) {
  $appsJson = npx firebase-tools apps:list ANDROID --project $ProjectId --json 2>$null | ConvertFrom-Json
  $appId = $null
  if ($appsJson -and $appsJson.result) {
    foreach ($a in $appsJson.result) {
      if ($a.namespace -eq $PackageName) { $appId = $a.appId; break }
    }
  }
  if (-not $appId) {
    Write-Host "  Creando app Android..."
    $createOut = npx firebase-tools apps:create ANDROID $PackageName --project $ProjectId --json 2>&1 | Out-String
    if ($createOut -match '"appId"\s*:\s*"([^"]+)"') {
      $appId = $Matches[1]
    }
  }
  if ($appId) {
    Push-Location $MobileApp
    npx firebase-tools apps:sdkconfig ANDROID $appId --project $ProjectId --out google-services.json
    Pop-Location
    if (Test-Path $GsJson) {
      Write-Host "  OK: $GsJson" -ForegroundColor Green
    }
  }
}
if (-not (Test-Path $GsJson)) {
  Write-Host ""
  Write-Host "  No se generó google-services.json por CLI." -ForegroundColor Red
  Write-Host "  Manual (2 min):" -ForegroundColor Yellow
  Write-Host "  1) https://console.firebase.google.com/project/$ProjectId/settings/general"
  Write-Host "  2) Agregar app → Android → paquete: $PackageName"
  Write-Host "  3) Descargar google-services.json → copiar a:"
  Write-Host "     $GsJson"
  Write-Host ""
  Read-Host "Cuando lo hayas copiado, Enter para continuar"
}

Write-Host "[4/6] Clave cuenta de servicio (servidor Vercel)..." -ForegroundColor Yellow
if (-not (Test-Path $SaJson)) {
  $saUrl = "https://console.firebase.google.com/project/$ProjectId/settings/serviceaccounts/adminsdk"
  Write-Host "  Se abre la consola. Pulsá 'Generar nueva clave privada' y guardá el archivo como:"
  Write-Host "  $SaJson"
  Start-Process $saUrl
  Read-Host "Cuando guardaste firebase-admin.json en secrets, Enter"
}

if (-not (Test-Path $SaJson)) {
  Write-Error "Falta $SaJson — sin eso Vercel no puede enviar push."
}

Write-Host "[5/6] Variable FIREBASE_SERVICE_ACCOUNT_JSON en Vercel..." -ForegroundColor Yellow
$vercelToken = $env:VERCEL_TOKEN
if (-not $vercelToken) {
  Write-Host "  Sin VERCEL_TOKEN: hacelo manual en vercel.com → brava-burgers → Settings → Environment Variables"
  Write-Host "  Nombre: FIREBASE_SERVICE_ACCOUNT_JSON"
  Write-Host "  Valor: todo el JSON en UNA línea (minificado)."
  $min = (Get-Content $SaJson -Raw | ConvertFrom-Json | ConvertTo-Json -Compress -Depth 20)
  $outFile = Join-Path $SecretsDir "firebase-vercel-oneline.txt"
  Set-Content -Path $outFile -Value $min -NoNewline -Encoding UTF8
  Write-Host "  Copiá desde: $outFile"
} else {
  & (Join-Path $PSScriptRoot "set-vercel-firebase-env.ps1") -ServiceAccountPath $SaJson -Project $VercelProject -Team $VercelTeam
}

Write-Host "[6/6] Tabla Supabase repartidor_push_tokens..." -ForegroundColor Yellow
$migrateScript = Join-Path $PSScriptRoot "migrate-repartidor-push.ps1"
if (Test-Path $migrateScript) {
  & $migrateScript
} else {
  Write-Host "  Ejecutá en Supabase SQL Editor: supabase/repartidor-push-tokens.sql"
}

Write-Host ""
Write-Host "Compilar APK (con JDK 21 + ANDROID_HOME configurados):" -ForegroundColor Cyan
Write-Host "  . .\mobile-repartidor\scripts\env-android.ps1"
Write-Host "  cd mobile-repartidor\android"
Write-Host "  .\gradlew.bat assembleDebug"
Write-Host ""
Write-Host "APK: mobile-repartidor\android\app\build\outputs\apk\debug\app-debug.apk" -ForegroundColor Green
Write-Host "Listo. Instalá APK, login repartidor, publicá ruta desde admin." -ForegroundColor Green
