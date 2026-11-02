# Lớp Mình - Script khởi chạy toàn bộ hệ thống (PostgreSQL + Backend + Frontend)
$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   HE THONG QUAN LY LOP HOC THEM - 'LOP MINH'" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$ROOT_DIR = $PSScriptRoot
$PGDATA = Join-Path $ROOT_DIR "database\pgdata"
$PG_BIN = Join-Path $ROOT_DIR "backend\venv\Lib\site-packages\pgserver\pginstall\bin"
$PYTHON_VENV = Join-Path $ROOT_DIR "backend\venv\Scripts\python.exe"

# 1. Khoi dong PostgreSQL
Write-Host "[1/3] Kiem tra PostgreSQL tren cong 5432..." -ForegroundColor Yellow
$pgRunning = Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $pgRunning) {
    Write-Host "  -> Dang khoi chay PostgreSQL Server..." -ForegroundColor Green
    & "$PG_BIN\pg_ctl.exe" -D "$PGDATA" -o "-h 127.0.0.1 -p 5432" -l "$PGDATA\server.log" start
    Start-Sleep -Seconds 2
} else {
    Write-Host "  -> PostgreSQL dang hoat dong san sang tren cong 5432." -ForegroundColor Green
}

# 2. Khoi dong Backend (FastAPI - Port 8001)
Write-Host "[2/3] Kiem tra Backend API tren cong 8001..." -ForegroundColor Yellow
$backendRunning = Test-NetConnection -ComputerName 127.0.0.1 -Port 8001 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $backendRunning) {
    Write-Host "  -> Dang khoi chay Backend API Server (Port 8001)..." -ForegroundColor Green
    Start-Process -FilePath $PYTHON_VENV -ArgumentList "-m uvicorn backend.app.main:app --env-file backend\.env --port 8001" -WorkingDirectory $ROOT_DIR
    Start-Sleep -Seconds 2
} else {
    Write-Host "  -> Backend API dang hoat dong san sang tren cong 8001." -ForegroundColor Green
}

# 3. Khoi dong Frontend (Port 3000)
Write-Host "[3/3] Kiem tra Frontend tren cong 3000..." -ForegroundColor Yellow
$frontendRunning = Test-NetConnection -ComputerName 127.0.0.1 -Port 3000 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $frontendRunning) {
    Write-Host "  -> Dang khoi chay Frontend Web Server (Port 3000)..." -ForegroundColor Green
    Start-Process -FilePath "python" -ArgumentList "-m http.server 3000" -WorkingDirectory $ROOT_DIR
    Start-Sleep -Seconds 1
} else {
    Write-Host "  -> Frontend dang hoat dong san sang tren cong 3000." -ForegroundColor Green
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   DA KHOI CHAY HOAN TAT!" -ForegroundColor Green
Write-Host "   Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "   Backend API: http://127.0.0.1:8001" -ForegroundColor White
Write-Host "   API Docs: http://127.0.0.1:8001/docs" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan

Start-Process "http://localhost:3000"
