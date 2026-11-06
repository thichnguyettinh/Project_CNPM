# ==============================================================================
# HỆ THỐNG QUẢN LÝ LỚP HỌC THÊM - "LỚP MÌNH"
# Script khởi chạy toàn bộ hệ thống (PostgreSQL + FastAPI Backend + Frontend Web)
# ==============================================================================
$ErrorActionPreference = "Stop"

# 1. Tự động xác định thư mục gốc bằng $PSScriptRoot
$ROOT_DIR = $PSScriptRoot
if (-not $ROOT_DIR) {
    $ROOT_DIR = (Get-Location).Path
}
Set-Location -Path $ROOT_DIR

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   HE THONG QUAN LY LOP HOC THEM - 'LOP MINH'" -ForegroundColor Cyan
Write-Host "   Thu muc du an: $ROOT_DIR" -ForegroundColor DarkCyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Hàm kiểm tra cổng TCP nhanh, tin cậy, không gây lỗi WMI/CIM
function Test-PortOpen([string]$HostName, [int]$Port) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect($HostName, $Port, $null, $null)
        $wait = $iar.AsyncWaitHandle.WaitOne(1000, $false)
        if (-not $wait) {
            $client.Close()
            return $false
        }
        $client.EndConnect($iar)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

# 2. Tự động tìm và chọn Python Virtual Environment
$VENV_CANDIDATES = @(
    $env:VIRTUAL_ENV,
    (Join-Path $ROOT_DIR ".venv"),
    (Join-Path $ROOT_DIR "venv"),
    (Join-Path $ROOT_DIR "backend\venv")
)

$VENV_DIR = $null
$PYTHON_EXE = $null

foreach ($cand in $VENV_CANDIDATES) {
    if ($cand -and (Test-Path $cand)) {
        $py = Join-Path $cand "Scripts\python.exe"
        if (Test-Path $py) {
            $VENV_DIR = $cand
            $PYTHON_EXE = $py
            break
        }
    }
}

if (-not $PYTHON_EXE) {
    $sysPy = (Get-Command python -ErrorAction SilentlyContinue)
    if ($sysPy) {
        $PYTHON_EXE = $sysPy.Source
        Write-Host "[!] Khong tim thay thu muc virtual environment (.venv / backend\venv)." -ForegroundColor Yellow
        Write-Host "    Su dung Python he thong: $PYTHON_EXE" -ForegroundColor Yellow
    } else {
        Write-Host "[ERROR] Khong tim thay Python! Vui long cai dat Python 3.11+ hoac tao virtual environment .venv." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[OK] Tim thay Python Virtual Environment tai: $VENV_DIR" -ForegroundColor Green
}

# 3. Kiểm tra các thư viện backend cần thiết
Write-Host "Dang kiem tra cac thu vien can thiet..." -ForegroundColor DarkGray
$checkScript = "import fastapi, uvicorn, psycopg, pydantic; print('OK')"
$pkgCheck = & $PYTHON_EXE -c $checkScript 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Thieu mot so thu vien backend. Dang cai dat tu backend\requirements.txt..." -ForegroundColor Yellow
    & $PYTHON_EXE -m pip install -r (Join-Path $ROOT_DIR "backend\requirements.txt")
}

# 10. Kiểm tra file .env và DATABASE_URL
$backendEnv = Join-Path $ROOT_DIR "backend\.env"
$backendEnvExample = Join-Path $ROOT_DIR "backend\.env.example"
if (-not (Test-Path $backendEnv)) {
    if (Test-Path $backendEnvExample) {
        Write-Host "[!] Chua co backend\.env, tu dong sao chep tu backend\.env.example..." -ForegroundColor Yellow
        Copy-Item $backendEnvExample $backendEnv
    } else {
        Write-Host "[!] Tao file backend\.env mac dinh..." -ForegroundColor Yellow
        @"
DATABASE_URL=postgresql://lopminh:change-me@127.0.0.1:5432/lopminh
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:7000,http://127.0.0.1:7000
SESSION_HOURS=12
UPLOAD_DIR=uploads
MAX_UPLOAD_BYTES=10485760
"@ | Set-Content -Path $backendEnv -Encoding UTF8
    }
}

$PG_DATA = Join-Path $ROOT_DIR "database\pgdata"
$PG_CTL = $null
$startedPgByScript = $false

# 4, 5, 6, 7. Kiểm tra và khởi động PostgreSQL Server
Write-Host "[1/3] Kiem tra PostgreSQL tren cong 5432..." -ForegroundColor Yellow
$pgRunning = Test-PortOpen "127.0.0.1" 5432

if (-not $pgRunning) {
    Write-Host "  -> PostgreSQL chua chay tren cong 5432. Dang xac dinh cong cu PostgreSQL..." -ForegroundColor DarkYellow
    
    $PG_BIN = $null
    
    # 7. Tìm qua python pgserver package
    try {
        $pgserverBin = & $PYTHON_EXE -c "import pgserver, pathlib; print(pathlib.Path(pgserver.__file__).parent / 'pginstall' / 'bin')" 2>&1
        if ($pgserverBin -and (Test-Path (Join-Path $pgserverBin.ToString().Trim() "pg_ctl.exe"))) {
            $PG_BIN = $pgserverBin.ToString().Trim()
        }
    } catch {}

    # Kiểm tra trong venv Lib\site-packages\pgserver
    if (-not $PG_BIN -and $VENV_DIR) {
        $cand = Join-Path $VENV_DIR "Lib\site-packages\pgserver\pginstall\bin"
        if (Test-Path (Join-Path $cand "pg_ctl.exe")) {
            $PG_BIN = $cand
        }
    }

    # Kiểm tra PATH hệ thống
    if (-not $PG_BIN) {
        $cmd = Get-Command pg_ctl -ErrorAction SilentlyContinue
        if ($cmd) {
            $PG_BIN = Split-Path $cmd.Source -Parent
        }
    }

    # Kiểm tra Program Files
    if (-not $PG_BIN) {
        $pfCandidates = Get-ChildItem -Path "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
        foreach ($pf in $pfCandidates) {
            $cand = Join-Path $pf.FullName "bin"
            if (Test-Path (Join-Path $cand "pg_ctl.exe")) {
                $PG_BIN = $cand
                break
            }
        }
    }

    if (-not $PG_BIN) {
        Write-Host "  [!] Khong tim thay pg_ctl.exe. Dang thu cai dat goi pgserver..." -ForegroundColor Yellow
        & $PYTHON_EXE -m pip install pgserver
        try {
            $pgserverBin = & $PYTHON_EXE -c "import pgserver, pathlib; print(pathlib.Path(pgserver.__file__).parent / 'pginstall' / 'bin')" 2>&1
            if ($pgserverBin -and (Test-Path (Join-Path $pgserverBin.ToString().Trim() "pg_ctl.exe"))) {
                $PG_BIN = $pgserverBin.ToString().Trim()
            }
        } catch {}
    }

    if (-not $PG_BIN -or -not (Test-Path (Join-Path $PG_BIN "pg_ctl.exe"))) {
        Write-Host "[ERROR] Khong tim thay pg_ctl.exe de khoi dong PostgreSQL!" -ForegroundColor Red
        Write-Host "        Vui long cai dat PostgreSQL hoac chay: pip install pgserver" -ForegroundColor Red
        exit 1
    }

    $PG_CTL = Join-Path $PG_BIN "pg_ctl.exe"
    $INITDB = Join-Path $PG_BIN "initdb.exe"
    Write-Host "  -> Tim thay PostgreSQL tai: $PG_BIN" -ForegroundColor DarkGray

    # 8. Kiểm tra thư mục dữ liệu PGDATA (không xóa dữ liệu đang có)
    $needInit = $false
    if (-not (Test-Path $PG_DATA) -or -not (Test-Path (Join-Path $PG_DATA "PG_VERSION"))) {
        $needInit = $true
        Write-Host "  -> Thu muc du lieu chua ton tai, dang khoi tao cluster tai: $PG_DATA..." -ForegroundColor Green
        New-Item -ItemType Directory -Path $PG_DATA -Force | Out-Null
        & $INITDB -D $PG_DATA -U postgres -A trust --encoding=UTF8
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Khoi tao PostgreSQL database cluster that bai!" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "  -> Su dung thu muc du lieu san co tai: $PG_DATA (giu nguyen du lieu)" -ForegroundColor DarkGray
    }

    # Đảm bảo logging_collector bật để tránh lỗi sharing violation trên Windows
    $pgConf = Join-Path $PG_DATA "postgresql.conf"
    if (Test-Path $pgConf) {
        $confContent = Get-Content $pgConf -Raw
        if ($confContent -notmatch "logging_collector\s*=\s*on") {
            Add-Content -Path $pgConf -Value "`nlogging_collector = on`nlog_directory = 'log'`nlog_filename = 'postgresql-%Y-%m-%d.log'`n"
        }
    }

    # Xử lý file khóa postmaster.pid cũ nếu tiến trình đã chết
    $pidFile = Join-Path $PG_DATA "postmaster.pid"
    if (Test-Path $pidFile) {
        try {
            $pidContent = Get-Content $pidFile -TotalCount 1
            $stalePid = [int]$pidContent.Trim()
            $procAlive = Get-Process -Id $stalePid -ErrorAction SilentlyContinue
            if (-not $procAlive) {
                Write-Host "  -> Phat hien postmaster.pid cu tu phien truoc, don dep an toan." -ForegroundColor DarkYellow
                Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
            }
        } catch {}
    }

    # Khởi động PostgreSQL Server
    Write-Host "  -> Dang khoi chay PostgreSQL Server..." -ForegroundColor Green
    & $PG_CTL -D $PG_DATA -o "-h * -p 5432" start
    $startedPgByScript = $true

    # 9. Chờ PostgreSQL sẵn sàng trước khi tiếp tục
    $retries = 25
    while ($retries -gt 0) {
        Start-Sleep -Milliseconds 500
        if (Test-PortOpen "127.0.0.1" 5432) {
            break
        }
        $retries--
    }

    if (-not (Test-PortOpen "127.0.0.1" 5432)) {
        Write-Host "[ERROR] PostgreSQL khong the mo cong 5432 sau khi khoi dong!" -ForegroundColor Red
        exit 1
    }

    Write-Host "  -> PostgreSQL da san sang tren cong 5432." -ForegroundColor Green

    # Khởi tạo bảng và seed dữ liệu nếu là cluster mới
    if ($needInit) {
        Write-Host "  -> Dang khoi tao cau truc bang va tai khoan mau (database\init_db.py)..." -ForegroundColor Green
        & $PYTHON_EXE (Join-Path $ROOT_DIR "database\init_db.py")
        if (Test-Path (Join-Path $ROOT_DIR "database\seed_classes_and_sessions.py")) {
            Write-Host "  -> Dang tao du lieu 6 lop hoc, 96 hoc sinh va lich hoc..." -ForegroundColor Green
            & $PYTHON_EXE (Join-Path $ROOT_DIR "database\seed_classes_and_sessions.py")
        }
    }
} else {
    Write-Host "  -> PostgreSQL dang hoat dong san sang tren cong 5432." -ForegroundColor Green
}

# 11, 14. Khởi động Backend (FastAPI - Port 8001)
Write-Host "[2/3] Kiem tra Backend API tren cong 8001..." -ForegroundColor Yellow
$backendRunning = Test-PortOpen "127.0.0.1" 8001
$backendProcess = $null

if (-not $backendRunning) {
    Write-Host "  -> Dang khoi chay Backend API Server (Port 8001)..." -ForegroundColor Green
    $backendProcess = Start-Process -FilePath $PYTHON_EXE -ArgumentList "-m uvicorn backend.app.main:app --env-file backend\.env --port 8001" -WorkingDirectory $ROOT_DIR -PassThru
    
    $retries = 25
    while ($retries -gt 0) {
        Start-Sleep -Milliseconds 500
        if (Test-PortOpen "127.0.0.1" 8001) {
            break
        }
        $retries--
    }

    if (-not (Test-PortOpen "127.0.0.1" 8001)) {
        Write-Host "[ERROR] Backend API khong the khoi dong tren cong 8001!" -ForegroundColor Red
        if ($backendProcess -and -not $backendProcess.HasExited) {
            Stop-Process -Id $backendProcess.Id -Force
        }
        if ($startedPgByScript -and $PG_CTL) {
            & $PG_CTL -D $PG_DATA stop
        }
        exit 1
    }
    Write-Host "  -> Backend API da san sang tren cong 8001." -ForegroundColor Green
} else {
    Write-Host "  -> Backend API dang hoat dong san sang tren cong 8001." -ForegroundColor Green
}

# 12, 14. Khởi động Frontend Web Server (Port 3000)
Write-Host "[3/3] Kiem tra Frontend tren cong 3000..." -ForegroundColor Yellow
$frontendRunning = Test-PortOpen "127.0.0.1" 3000
$frontendProcess = $null

if (-not $frontendRunning) {
    Write-Host "  -> Dang khoi chay Frontend Web Server (Port 3000)..." -ForegroundColor Green
    $frontendProcess = Start-Process -FilePath $PYTHON_EXE -ArgumentList "-m http.server 3000" -WorkingDirectory $ROOT_DIR -PassThru
    
    $retries = 15
    while ($retries -gt 0) {
        Start-Sleep -Milliseconds 400
        if (Test-PortOpen "127.0.0.1" 3000) {
            break
        }
        $retries--
    }

    if (-not (Test-PortOpen "127.0.0.1" 3000)) {
        Write-Host "[ERROR] Frontend Web Server khong the khoi dong tren cong 3000!" -ForegroundColor Red
        if ($frontendProcess -and -not $frontendProcess.HasExited) {
            Stop-Process -Id $frontendProcess.Id -Force
        }
        if ($backendProcess -and -not $backendProcess.HasExited) {
            Stop-Process -Id $backendProcess.Id -Force
        }
        if ($startedPgByScript -and $PG_CTL) {
            & $PG_CTL -D $PG_DATA stop
        }
        exit 1
    }
    Write-Host "  -> Frontend Web Server da san sang tren cong 3000." -ForegroundColor Green
} else {
    Write-Host "  -> Frontend dang hoat dong san sang tren cong 3000." -ForegroundColor Green
}

# 16. Hiển thị thông tin kết nối và mở trình duyệt
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   DA KHOI CHAY HOAN TAT!" -ForegroundColor Green
Write-Host "   Frontend Website : http://localhost:3000" -ForegroundColor White
Write-Host "   Backend API      : http://127.0.0.1:8001" -ForegroundColor White
Write-Host "   Swagger API Docs : http://127.0.0.1:8001/docs" -ForegroundColor White
Write-Host "   Tai khoan demo   : teacher / student / parent (Mat khau: 123)" -ForegroundColor DarkGray
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Nhan Ctrl+C bat ky luc nao de dung he thong an toan." -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

Start-Process "http://localhost:3000"

# 15. Cơ chế dừng các tiến trình do script tạo ra khi nhấn Ctrl+C hoặc đóng script
try {
    while ($true) {
        Start-Sleep -Seconds 1
        if ($backendProcess -and $backendProcess.HasExited) {
            Write-Host "[!] Tien trinh Backend da dung dot ngot." -ForegroundColor Red
            break
        }
        if ($frontendProcess -and $frontendProcess.HasExited) {
            Write-Host "[!] Tien trinh Frontend da dung dot ngot." -ForegroundColor Red
            break
        }
    }
}
finally {
    Write-Host "`nDang dung cac tien trinh he thong do script khoi dong..." -ForegroundColor Yellow
    if ($frontendProcess -and -not $frontendProcess.HasExited) {
        Write-Host "  -> Dung Frontend Server (PID $($frontendProcess.Id))..." -ForegroundColor DarkGray
        Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($backendProcess -and -not $backendProcess.HasExited) {
        Write-Host "  -> Dung Backend Server (PID $($backendProcess.Id))..." -ForegroundColor DarkGray
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($startedPgByScript -and $PG_CTL -and (Test-Path $PG_DATA)) {
        Write-Host "  -> Dung PostgreSQL Server an toan..." -ForegroundColor DarkGray
        & $PG_CTL -D $PG_DATA stop
    }
    Write-Host "Da dung he thong thanh cong." -ForegroundColor Green
}
