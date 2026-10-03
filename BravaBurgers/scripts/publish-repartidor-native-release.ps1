# Build APK + GitHub Release + repartidor-native-update.json (automático)
# Uso: .\scripts\publish-repartidor-native-release.ps1
#      .\scripts\publish-repartidor-native-release.ps1 -PushGit
param(
    [string]$ReleaseNotes = "",
    [switch]$SkipBuild,
    [switch]$PushGit
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$native = Join-Path $root "repartidor-native-android"
$gradleFile = Join-Path $native "app\build.gradle.kts"
$jsonPath = Join-Path $root "repartidor-native-update.json"
$repo = "YezeGames/brava-burgers"
$assetName = "brava-repartidor-native.apk"

if (-not (Test-Path (Join-Path $native "gradlew.bat"))) {
    throw "No se encontró repartidor-native-android en $root"
}

function Get-GradleVersion {
    param([string]$Path)
    $text = Get-Content $Path -Raw
    if ($text -match 'versionCode\s*=\s*(\d+)') { $script:VersionCode = [int]$Matches[1] } else { throw "versionCode no encontrado" }
    if ($text -match 'versionName\s*=\s*"([^"]+)"') { $script:VersionName = $Matches[1] } else { throw "versionName no encontrado" }
}

Get-GradleVersion $gradleFile
$ReleaseTag = "repartidor-native-v$VersionCode"
$downloadUrl = "https://github.com/$repo/releases/download/$ReleaseTag/$assetName"

Write-Host "Publicando $VersionName (code $VersionCode) tag $ReleaseTag"

if (-not $SkipBuild) {
    Push-Location $native
    try {
        .\gradlew.bat assembleDebug --no-daemon
    } finally {
        Pop-Location
    }
}

$apkSrc = Join-Path $native "app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apkSrc)) { throw "APK no encontrada: $apkSrc" }
$apkTmp = Join-Path $env:TEMP $assetName
Copy-Item $apkSrc $apkTmp -Force

$releaseExists = $false
try {
    gh release view $ReleaseTag --repo $repo 2>$null | Out-Null
    $releaseExists = $true
} catch {
    $releaseExists = $false
}

if ($releaseExists) {
    Write-Host "Release existente; subiendo APK (--clobber)..."
    gh release upload $ReleaseTag $apkTmp --repo $repo --clobber
    if ($ReleaseNotes) {
        gh release edit $ReleaseTag --repo $repo --notes $ReleaseNotes
    }
} else {
    $ghArgs = @(
        "release", "create", $ReleaseTag,
        $apkTmp,
        "--repo", $repo,
        "--title", "Repartidor nativo · $VersionName"
    )
    if ($ReleaseNotes) {
        $ghArgs += @("--notes", $ReleaseNotes)
    } else {
        $ghArgs += @("--notes", "Build $VersionName · versionCode $VersionCode")
    }
    & gh @ghArgs
}

$manifest = [ordered]@{
    version_code       = $VersionCode
    version_name       = $VersionName
    apk_url            = $downloadUrl
    release_notes      = if ($ReleaseNotes) { $ReleaseNotes } else { "Actualización $VersionName" }
    min_version_code   = $VersionCode
    force_update       = $true
}
$manifest | ConvertTo-Json | Set-Content -Path $jsonPath -Encoding UTF8

Write-Host ""
Write-Host "APK:" -ForegroundColor Green
Write-Host $downloadUrl
Write-Host "Manifest:" -ForegroundColor Green
Write-Host $jsonPath

if ($PushGit) {
    Push-Location $root
    try {
        $gitRoot = git rev-parse --show-toplevel 2>$null
        if (-not $gitRoot) { throw "No hay repo git" }
        Set-Location $gitRoot
        $relJson = git ls-files --full-name | Where-Object { $_ -like "*repartidor-native-update.json" } | Select-Object -First 1
        if (-not $relJson) {
            $relJson = "BravaBurgers/repartidor-native-update.json"
            if (-not (Test-Path $relJson)) { $relJson = "repartidor-native-update.json" }
        }
        Copy-Item $jsonPath (Join-Path $gitRoot $relJson) -Force
        git add $relJson
        git add -- "*repartidor-native-android/app/build.gradle.kts" 2>$null
        git commit -m "repartidor nativo: release $ReleaseTag ($VersionName)" 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Sin cambios git o commit omitido." -ForegroundColor Yellow
        } else {
            git push origin main
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host ""
    Write-Host "Push: commit repartidor-native-update.json + push main (o -PushGit en este script)."
}
