param(
  [Parameter(Mandatory = $true)]
  [string]$ServiceAccountPath,
  [string]$Project = "brava-burgers",
  [string]$Team = "bravaburgers"
)

$ErrorActionPreference = "Stop"
$token = $env:VERCEL_TOKEN
if (-not $token) { Write-Error "Falta VERCEL_TOKEN" }
if (-not (Test-Path $ServiceAccountPath)) { Write-Error "No existe: $ServiceAccountPath" }

$jsonOneLine = (Get-Content $ServiceAccountPath -Raw | ConvertFrom-Json | ConvertTo-Json -Compress -Depth 30)

$headers = @{
  Authorization = "Bearer $token"
  "Content-Type" = "application/json"
}
$base = "https://api.vercel.com"
$teamId = $Team
if ($Team -and $Team -notmatch "^team_") {
  $teams = Invoke-RestMethod -Uri "$base/v2/teams?teamId=$Team" -Headers $headers
  $match = $teams.teams | Where-Object { $_.slug -eq $Team -or $_.name -eq $Team } | Select-Object -First 1
  if ($match) { $teamId = $match.id }
}
$projUri = "$base/v9/projects/$Project$(if ($teamId) { '?teamId=' + $teamId })"
$proj = Invoke-RestMethod -Uri $projUri -Headers $headers
$projectId = $proj.id

$listUri = "$base/v9/projects/$projectId/env$(if ($teamId) { '?teamId=' + $teamId })"
$existing = Invoke-RestMethod -Uri $listUri -Headers $headers
$found = $existing.envs | Where-Object { $_.key -eq "FIREBASE_SERVICE_ACCOUNT_JSON" } | Select-Object -First 1

$body = @{
  key       = "FIREBASE_SERVICE_ACCOUNT_JSON"
  value     = $jsonOneLine
  type      = "encrypted"
  target    = @("production", "preview", "development")
}

if ($found) {
  $patchUri = "$base/v9/projects/$projectId/env/$($found.id)$(if ($teamId) { '?teamId=' + $teamId })"
  Invoke-RestMethod -Method PATCH -Uri $patchUri -Headers $headers -Body ($body | ConvertTo-Json -Depth 5) | Out-Null
  Write-Host "Vercel: FIREBASE_SERVICE_ACCOUNT_JSON actualizada." -ForegroundColor Green
} else {
  $createUri = "$base/v10/projects/$projectId/env$(if ($teamId) { '?teamId=' + $teamId })"
  Invoke-RestMethod -Method POST -Uri $createUri -Headers $headers -Body ($body | ConvertTo-Json -Depth 5) | Out-Null
  Write-Host "Vercel: FIREBASE_SERVICE_ACCOUNT_JSON creada." -ForegroundColor Green
}

Write-Host "Redeploy: Vercel → Deployments → Redeploy (o push a main)." -ForegroundColor Yellow
