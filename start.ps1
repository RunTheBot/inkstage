$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'Install Node.js 22.12+ or 24 LTS, then run this script again.'
    exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host 'Open http://localhost:4173 in your browser. Keep this window open while presenting.'
& npm.cmd start
