# Phase 1 Fresh Database Financial Core Verification Script
$ErrorActionPreference = "Stop"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "    KAMASI FINANCE - PHASE 1 FRESH DB VERIFICATION GATE  " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$tempDb = "prisma\phase1-fresh-check.db"
if (Test-Path $tempDb) {
    Remove-Item -Force $tempDb
}
if (Test-Path "$tempDb-journal") {
    Remove-Item -Force "$tempDb-journal"
}

$env:DATABASE_URL = "file:./phase1-fresh-check.db"

Write-Host "1. Running prisma migrate deploy on fresh database..." -ForegroundColor Yellow
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    Write-Error "Migration deployment failed!"
    exit 1
}

Write-Host "2. Running prisma generate..." -ForegroundColor Yellow
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Error "Prisma generate failed!"
    exit 1
}

Write-Host "3. Running Vitest Phase 1 Financial Core Integration Suite..." -ForegroundColor Yellow
npx vitest run src/lib/__tests__/phase1-financial-core.test.ts --fileParallelism=false
if ($LASTEXITCODE -ne 0) {
    Write-Error "Phase 1 Financial Core Integration Suite failed!"
    exit 1
}

if (Test-Path $tempDb) {
    Remove-Item -Force $tempDb
}
if (Test-Path "$tempDb-journal") {
    Remove-Item -Force "$tempDb-journal"
}

Write-Host "========================================================" -ForegroundColor Green
Write-Host "         PHASE 1 FINANCIAL CORE: PASS                   " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
