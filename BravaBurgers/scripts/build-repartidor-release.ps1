# Signed release APK - Brava Repartidor (Capacitor).
# Usage: cd BravaBurgers; .\scripts\build-repartidor-release.ps1

$ErrorActionPreference = "Stop"
$BravaRoot = Split-Path $PSScriptRoot -Parent
$Mobile = Join-Path $BravaRoot "mobile-repartidor"
$Android = Join-Path $Mobile "android"
$Secrets = Join-Path $BravaRoot "secrets"
$Keystore = Join-Path $Secrets "brava-repartidor-release.jks"
$SecretProps = Join-Path $Secrets "brava-repartidor-release.properties"
$AndroidProps = Join-Path $Android "keystore.properties"
$EnvScript = Join-Path $Mobile "scripts\env-android.ps1"

New-Item -ItemType Directory -Force -Path $Secrets | Out-Null

if (-not (Test-Path $Keystore)) {
  Write-Host "Creating release keystore (one time)..." -ForegroundColor Cyan
  $pw = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
  $dname = "CN=Brava Repartidor, OU=Operaciones, O=Brava Burgers, L=Olivos, ST=Buenos Aires, C=AR"
  & keytool -genkeypair -v -storetype PKCS12 -keystore $Keystore -alias "brava-repartidor" `
    -keyalg RSA -keysize 2048 -validity 10000 -storepass $pw -keypass $pw -dname $dname
  if ($LASTEXITCODE -ne 0) { Write-Error "keytool failed. Is JDK on PATH?" }
  @(
    "storePassword=$pw"
    "keyPassword=$pw"
    "keyAlias=brava-repartidor"
    "storeFile=../../secrets/brava-repartidor-release.jks"
    ""
    "# Backup brava-repartidor-release.jks - required for future app updates."
  ) | Set-Content -Path $SecretProps -Encoding UTF8
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($SecretProps, ((Get-Content $SecretProps -Raw).TrimEnd() + "`n"), $utf8NoBom)
  Write-Host "Passwords saved in: $SecretProps (do not commit)" -ForegroundColor Yellow
} elseif (-not (Test-Path $SecretProps)) {
  Write-Error "Keystore exists but missing $SecretProps"
}

$lines = Get-Content $SecretProps | Where-Object { $_ -and $_ -notmatch '^\s*#' }
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($AndroidProps, (($lines -join "`n") + "`n"), $utf8NoBom)

if (-not (Test-Path (Join-Path $Android "app\google-services.json"))) {
  Write-Host "WARN: missing google-services.json - FCM may not work." -ForegroundColor Yellow
}

Write-Host "Capacitor sync..." -ForegroundColor Cyan
Push-Location $Mobile
cmd /c "npm install >nul 2>nul"
& (Join-Path $Mobile "scripts\patch-bg-geo-service.ps1")
cmd /c "npx cap sync android >nul 2>nul"
& (Join-Path $Mobile "scripts\patch-bg-geo-service.ps1")
Pop-Location

if (Test-Path $EnvScript) { . $EnvScript }

Write-Host "assembleRelease..." -ForegroundColor Cyan
Push-Location $Android
.\gradlew.bat assembleRelease
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { exit $code }

$apk = Join-Path $Android "app\build\outputs\apk\release\app-release.apk"
if (Test-Path $apk) {
  $dest = Join-Path $Secrets "brava-repartidor-release.apk"
  Copy-Item -LiteralPath $apk -Destination $dest -Force
  Write-Host ""
  Write-Host "Release APK ready:" -ForegroundColor Green
  Write-Host "  $apk"
  Write-Host "  Copy: $dest"
  Write-Host "Share via WhatsApp. Backup the .jks file." -ForegroundColor Yellow
} else {
  Write-Error "app-release.apk not found"
}
