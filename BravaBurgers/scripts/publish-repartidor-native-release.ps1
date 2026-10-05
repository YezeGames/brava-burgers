# Build APK + GitHub Release + repartidor-native-update.json (automático)
# Uso: .\scripts\publish-repartidor-native-release.ps1
#      .\scripts\publish-repartidor-native-release.ps1 -PushGit
param(
    [string]$ReleaseNotes = "",
    [switch]$SkipBuild,
    [switch]$PushGit,
    [switch]$SkipFcm
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

function Get-VercelTokenLine {
    $p = Join-Path $root "secrets\vercel-token.txt"
    if (-not (Test-Path $p)) { return "" }
    foreach ($line in Get-Content $p -Encoding UTF8) {
        $t = $line.Trim()
        if ($t.StartsWith("vcp_")) { return $t }
    }
    return ""
}

function Ensure-RepartidorOtaHookSecret {
    $hookFile = Join-Path $root "secrets\repartidor-ota-hook.txt"
    if (Test-Path $hookFile) {
        return (Get-Content $hookFile -Raw -Encoding UTF8).Trim()
    }
    $newHook = ([Guid]::NewGuid().ToString("n") + [Guid]::NewGuid().ToString("n"))
    New-Item -ItemType Directory -Force -Path (Split-Path $hookFile) | Out-Null
    Set-Content -Path $hookFile -Value $newHook -Encoding UTF8 -NoNewline
    Write-Host "OTA hook: creado secrets/repartidor-ota-hook.txt" -ForegroundColor DarkGray
    $vToken = Get-VercelTokenLine
    if ($vToken) {
        $env:VERCEL_TOKEN = $vToken
        $upsert = Join-Path $root "scripts\upsert-vercel-env.js"
        if (Test-Path $upsert) {
            Push-Location $root
            try {
                node $upsert REPARTIDOR_OTA_HOOK_SECRET $newHook
            } catch {
                Write-Host "No se pudo subir REPARTIDOR_OTA_HOOK_SECRET a Vercel." -ForegroundColor Yellow
            } finally {
                Pop-Location
            }
        }
    } else {
        Write-Host "Subí REPARTIDOR_OTA_HOOK_SECRET a Vercel (mismo valor que el archivo hook)." -ForegroundColor Yellow
    }
    return $newHook
}

function Invoke-RepartidorAppUpdateFcm {
    param(
        [int]$Code,
        [string]$Name
    )
    $localScript = Join-Path $root "scripts\notify-repartidor-app-update.js"
    $remoteScript = Join-Path $root "scripts\notify-repartidor-app-update-remote.js"
    $supabaseEnv = Join-Path $root "secrets\supabase.env"
    Write-Host "FCM app_update → repartidores (version $Name)..." -ForegroundColor Cyan
    Push-Location $root
    try {
        if ((Test-Path $localScript) -and (Test-Path $supabaseEnv)) {
            $saJson = Join-Path $root "secrets\firebase-admin.json"
            if (Test-Path $saJson) {
                $env:FIREBASE_SERVICE_ACCOUNT_JSON = Get-Content -Path $saJson -Raw -Encoding UTF8
            }
            node $localScript --version-code $Code --version-name $Name
            if ($LASTEXITCODE -eq 0) { return }
        }
        if (-not (Test-Path $remoteScript)) {
            Write-Host "FCM: falta notify-repartidor-app-update-remote.js" -ForegroundColor Yellow
            return
        }
        Ensure-RepartidorOtaHookSecret | Out-Null
        Write-Host "FCM vía API producción (Supabase/FCM en Vercel)..." -ForegroundColor DarkGray
        node $remoteScript --version-code $Code --version-name $Name
        if ($LASTEXITCODE -ne 0) {
            Write-Host "FCM remoto falló. ¿Deploy listo y REPARTIDOR_OTA_HOOK_SECRET en Vercel?" -ForegroundColor Yellow
        }
    } finally {
        Pop-Location
    }
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
        $destJson = Join-Path $gitRoot $relJson
        if ($jsonPath -ne $destJson) {
            Copy-Item $jsonPath $destJson -Force
        }
        git add $relJson
        foreach ($rel in @(
            "repartidor-native-android",
            "BravaBurgers/repartidor-native-android",
            "lib/repartidorPushTokens.js",
            "BravaBurgers/lib/repartidorPushTokens.js",
            "lib/repartidorRoutePush.js",
            "BravaBurgers/lib/repartidorRoutePush.js",
            "scripts/notify-repartidor-app-update.js",
            "BravaBurgers/scripts/notify-repartidor-app-update.js",
            "scripts/publish-repartidor-native-release.ps1",
            "BravaBurgers/scripts/publish-repartidor-native-release.ps1",
            "scripts/notify-repartidor-app-update-remote.js",
            "BravaBurgers/scripts/notify-repartidor-app-update-remote.js",
            "scripts/pull-supabase-env-from-vercel.js",
            "BravaBurgers/scripts/pull-supabase-env-from-vercel.js",
            "api/admin.js",
            "BravaBurgers/api/admin.js",
            "secrets/supabase.env.example",
            "BravaBurgers/secrets/supabase.env.example",
            "secrets/repartidor-ota-hook.txt.example",
            "BravaBurgers/secrets/repartidor-ota-hook.txt.example"
        )) {
            if (Test-Path (Join-Path $gitRoot $rel)) {
                git add -- $rel
            }
        }
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

if (-not $SkipFcm) {
    Invoke-RepartidorAppUpdateFcm -Code $VersionCode -Name $VersionName
} else {
    Write-Host "FCM omitido (-SkipFcm)." -ForegroundColor DarkGray
}
