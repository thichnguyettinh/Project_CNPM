import os
import sys
import time
import json
import socket
import subprocess
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def is_port_open(port: int, host="127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0

def find_pg_bin() -> Path:
    # 1. Check in .venv or venv
    for venv_name in [".venv", "venv", r"backend\venv"]:
        p = ROOT / venv_name / "Lib" / "site-packages" / "pgserver" / "pginstall" / "bin"
        if (p / "pg_ctl.exe").exists():
            return p
    # 2. Check current python site-packages
    try:
        import pgserver
        p = Path(pgserver.__file__).parent / "pginstall" / "bin"
        if (p / "pg_ctl.exe").exists():
            return p
    except Exception:
        pass
    raise RuntimeError("Cannot find pg_ctl.exe")

def main():
    print("=== TEST HE THONG KHOI CHAY (PostgreSQL + FastAPI + Frontend) ===", flush=True)
    pg_bin = find_pg_bin()
    pg_ctl = str(pg_bin / "pg_ctl.exe")
    pgdata = str(ROOT / "database" / "pgdata")
    python_exe = sys.executable

    # 1. Start PostgreSQL if not already running on port 5432
    started_pg = False
    if not is_port_open(5432):
        print("[1] Dang khoi dong PostgreSQL tren cong 5432...", flush=True)
        # Check stale postmaster.pid
        pid_file = Path(pgdata) / "postmaster.pid"
        if pid_file.exists():
            print("  -> Phat hien postmaster.pid cu, xoa de khoi dong lai.", flush=True)
            pid_file.unlink(missing_ok=True)

        res = subprocess.run([pg_ctl, "-D", pgdata, "-o", "-h 127.0.0.1 -p 5432", "start"])
        started_pg = True
        # Wait for port 5432
        for _ in range(15):
            if is_port_open(5432):
                break
            time.sleep(1)
        if not is_port_open(5432):
            print("ERROR: PostgreSQL khong mo cong 5432!", flush=True)
            sys.exit(1)
    else:
        print("[1] PostgreSQL da dang chay tren cong 5432.", flush=True)

    # 2. Test PostgreSQL Database query
    print("[2] Kiem tra ket noi Database...", flush=True)
    import psycopg
    conn = psycopg.connect("postgresql://lopminh:change-me@127.0.0.1:5432/lopminh")
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM users")
        user_count = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM classes")
        class_count = cur.fetchone()[0]
        print(f"  -> Ket noi PostgreSQL thanh cong! users={user_count}, classes={class_count}", flush=True)
    conn.close()

    # 3. Start Backend FastAPI on port 8001
    started_backend = False
    backend_proc = None
    if not is_port_open(8001):
        print("[3] Dang khoi dong Backend API tren cong 8001...", flush=True)
        env = os.environ.copy()
        env["DATABASE_URL"] = "postgresql://lopminh:change-me@127.0.0.1:5432/lopminh"
        backend_proc = subprocess.Popen(
            [python_exe, "-m", "uvicorn", "backend.app.main:app", "--env-file", "backend/.env", "--port", "8001"],
            cwd=str(ROOT),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        started_backend = True
        for _ in range(15):
            if is_port_open(8001):
                break
            time.sleep(1)
        if not is_port_open(8001):
            print("ERROR: Backend API khong khoi dong duoc tren cong 8001!", flush=True)
            if backend_proc:
                backend_proc.kill()
            if started_pg:
                subprocess.run([pg_ctl, "-D", pgdata, "stop"])
            sys.exit(1)
    else:
        print("[3] Backend API da dang hoat dong tren cong 8001.", flush=True)

    # 4. Start Frontend on port 3000
    started_frontend = False
    frontend_proc = None
    if not is_port_open(3000):
        print("[4] Dang khoi dong Frontend HTTP Server tren cong 3000...", flush=True)
        frontend_proc = subprocess.Popen(
            [python_exe, "-m", "http.server", "3000"],
            cwd=str(ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        started_frontend = True
        for _ in range(10):
            if is_port_open(3000):
                break
            time.sleep(0.5)
        if not is_port_open(3000):
            print("ERROR: Frontend Web Server khong khoi dong duoc tren cong 3000!", flush=True)
            if frontend_proc:
                frontend_proc.kill()
            if backend_proc:
                backend_proc.kill()
            if started_pg:
                subprocess.run([pg_ctl, "-D", pgdata, "stop"])
            sys.exit(1)
    else:
        print("[4] Frontend da dang hoat dong tren cong 3000.", flush=True)

    # 5. Run API Tests
    print("[5] Kiem tra cac API quan trong...")
    try:
        # 5.1 /api/health
        req = urllib.request.Request("http://127.0.0.1:8001/api/health")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            print("  -> /api/health:", data)
            assert data.get("status") == "ok"

        # 5.2 /docs
        req = urllib.request.Request("http://127.0.0.1:8001/docs")
        with urllib.request.urlopen(req, timeout=5) as resp:
            assert resp.status == 200
            print("  -> /docs: 200 OK")

        # 5.3 Login teacher
        body = json.dumps({"identity": "teacher", "password": "123"}).encode()
        req = urllib.request.Request("http://127.0.0.1:8001/api/auth/login", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            login_data = json.loads(resp.read().decode())
            teacher_token = login_data["access_token"]
            print("  -> Login teacher OK:", login_data["user"]["fullName"], flush=True)

        # 5.4 Dashboard teacher
        req = urllib.request.Request("http://127.0.0.1:8001/api/dashboard", headers={"Authorization": f"Bearer {teacher_token}"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            dash_data = json.loads(resp.read().decode())
            class_count = dash_data.get("classes", {}).get("class_count", 0)
            student_count = dash_data.get("students", {}).get("student_count", 0)
            print(f"  -> Dashboard teacher: classes={class_count}, students={student_count}", flush=True)
            assert class_count > 0

        # 5.5 Login student
        body = json.dumps({"identity": "student", "password": "123"}).encode()
        req = urllib.request.Request("http://127.0.0.1:8001/api/auth/login", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            login_student = json.loads(resp.read().decode())
            print("  -> Login student OK:", login_student["user"]["fullName"], flush=True)

        # 5.6 Login parent
        body = json.dumps({"identity": "parent", "password": "123"}).encode()
        req = urllib.request.Request("http://127.0.0.1:8001/api/auth/login", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            login_parent = json.loads(resp.read().decode())
            print("  -> Login parent OK:", login_parent["user"]["fullName"], flush=True)

        # 5.7 Frontend root index.html
        req = urllib.request.Request("http://127.0.0.1:3000/index.html")
        with urllib.request.urlopen(req, timeout=5) as resp:
            html = resp.read().decode(errors="ignore")
            assert "Lớp Mình" in html or "lopminh" in html.lower() or "đăng nhập" in html.lower()
            print("  -> Frontend index.html: 200 OK")

        print("\n>>> TAT CA KIEM TRA HE THONG KHOI CHAY DEU DAT (ALL PASS)! <<<")
    finally:
        # Cleanup processes started by this test
        if frontend_proc:
            print("Dung Frontend test process...")
            frontend_proc.kill()
        if backend_proc:
            print("Dung Backend test process...")
            backend_proc.kill()
        if started_pg:
            print("Dung PostgreSQL test process...")
            subprocess.run([pg_ctl, "-D", pgdata, "stop"])

if __name__ == "__main__":
    main()
