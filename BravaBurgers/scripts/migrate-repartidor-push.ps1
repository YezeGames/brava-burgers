# Migra tabla repartidor_push_tokens vía API admin (requiere sesión admin).
# Alternativa: pegar supabase/repartidor-push-tokens.sql en Supabase SQL Editor.

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
$repoBrava = Split-Path $scriptDir -Parent

Write-Host "Migración push tokens..." -ForegroundColor Cyan

if ($env:SUPABASE_DB_PASSWORD -or $env:POSTGRES_URL) {
  Push-Location $repoBrava
  node -e "const { migrateRepartidorPushTokensSchema } = require('./lib/dbMigrate'); migrateRepartidorPushTokensSchema().then(r => { console.log(JSON.stringify(r)); process.exit(r.ok ? 0 : 1); });"
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -eq 0) {
    Write-Host "Supabase: tabla repartidor_push_tokens OK." -ForegroundColor Green
    exit 0
  }
}

Write-Host "Sin SUPABASE_DB_PASSWORD/POSTGRES_URL en este PC." -ForegroundColor Yellow
Write-Host "Opción A: Supabase → SQL Editor → pegar supabase/repartidor-push-tokens.sql → Run"
Write-Host "Opción B: Admin logueado → consola del navegador (F12):"
Write-Host @"
fetch('/api/admin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'migrateRepartidorPush', token: localStorage.getItem('brava_admin_token') || '' })
}).then(r => r.json()).then(console.log);
"@
