Set-Location $PSScriptRoot
docker compose up -d 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker no está listo. Abrí Docker Desktop." -ForegroundColor Yellow
  exit 1
}
Write-Host "Valhalla en http://127.0.0.1:8002 (logs: docker compose logs -f valhalla)" -ForegroundColor Green
