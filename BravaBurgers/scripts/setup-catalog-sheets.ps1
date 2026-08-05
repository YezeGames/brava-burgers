# Abre el Sheet de menú y copia SetupCatalogSheets.gs al portapapeles
$root = Split-Path -Parent $PSScriptRoot
$codePath = Join-Path $root "apps-script\SetupCatalogSheets.gs"
$sheetUrl = "https://docs.google.com/spreadsheets/d/1s3sZcKRqwpCH8L4N1xfgyba14s_HUC3F43FL5ekOCS0/edit"

if (-not (Test-Path $codePath)) {
    Write-Error "No encuentro $codePath"
    exit 1
}

Get-Content -LiteralPath $codePath -Raw | Set-Clipboard
Write-Host ""
Write-Host "=== SetupCatalogSheets.gs copiado al portapapeles ===" -ForegroundColor Green
Write-Host ""
Write-Host "1. Se abrira BRAVA-BURGERS-Pedilo en Google Sheets."
Write-Host "2. Extensiones -> Apps Script"
Write-Host "3. Archivo + (o + junto a Archivos) -> Crear -> Script"
Write-Host "4. Nombrar: SetupCatalogSheets -> Pegar (Ctrl+V) -> Guardar"
Write-Host "5. Elegir funcion: setupExtrasEIngredientesEnCatalogo -> Ejecutar"
Write-Host "6. Autorizar permisos la primera vez"
Write-Host ""
Write-Host "Crea pestañas: extras, ingredientes + columnas Grupo extras / Quitar / Ingredientes en productos"
Write-Host "Ingredientes (en productos): por burger, separados con coma — ej. Cebolla, Cheddar, Lechuga"
Write-Host ""

Start-Process $sheetUrl
