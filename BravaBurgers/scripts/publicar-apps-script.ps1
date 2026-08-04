# Copia Code.gs al portapapeles y abre el Sheet para pegar en Apps Script
$root = Split-Path -Parent $PSScriptRoot
$codePath = Join-Path $root "apps-script\Code.gs"
$sheetUrl = "https://docs.google.com/spreadsheets/d/1s3sZcKRqwpCH8L4N1xfgyba14s_HUC3F43FL5ekOCS0/edit"

if (-not (Test-Path $codePath)) {
    Write-Error "No encuentro $codePath"
    exit 1
}

Get-Content -LiteralPath $codePath -Raw | Set-Clipboard
Write-Host ""
Write-Host "=== Code.gs copiado al portapapeles ===" -ForegroundColor Green
Write-Host ""
Write-Host "1. Se abrira tu Google Sheet."
Write-Host "2. Extensiones -> Apps Script"
Write-Host "3. En Code.gs: Ctrl+A, Ctrl+V (pegar)"
Write-Host "4. Guardar (Ctrl+S)"
Write-Host "5. Implementar -> Gestionar implementaciones -> lapiz en Web app -> Nueva version -> Implementar"
Write-Host ""
Write-Host "Probar: abri en el navegador tu URL /exec (debe decir version: 2 en doGet)"
Write-Host ""

Start-Process $sheetUrl
