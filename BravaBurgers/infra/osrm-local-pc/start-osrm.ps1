Set-Location $PSScriptRoot
docker compose up -d 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker no está listo. Abrí Docker Desktop." -ForegroundColor Yellow
  exit 1
}
