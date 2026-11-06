"""
Công cụ kiểm tra chẩn đoán toàn bộ hệ sinh thái dự án Lớp Mình:
- Python & Virtual Environment
- Thư viện bắt buộc
- Cấu hình backend/.env
- Trạng thái PostgreSQL & CSDL lopminh
- Bảng dữ liệu và tài khoản thử nghiệm
"""
import sys
import os
import socket
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def check_port(port: int, host="127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0

def main():
    print("=" * 60)
    print("   KIEM TRA CHAN DOAN HE THONG - 'LOP MINH'")
    print("=" * 60)
    
    # 1. Python info
    print(f"1. Python executable: {sys.executable}")
    print(f"   Python version   : {sys.version.split()[0]}")
    
    # 2. Required libraries
    print("\n2. Kiem tra thu vien Python:")
    libs = ["fastapi", "uvicorn", "psycopg", "pydantic", "pgserver"]
    all_libs_ok = True
    for lib in libs:
        try:
            __import__(lib)
            print(f"   [OK] {lib}")
        except ImportError:
            print(f"   [THIEU] {lib}")
            all_libs_ok = False
            
    # 3. .env check
    print("\n3. Kiem tra backend/.env:")
    env_file = ROOT / "backend" / ".env"
    if env_file.exists():
        print(f"   [OK] backend/.env ton tai ({env_file.stat().st_size} bytes)")
    else:
        print("   [CANH BAO] backend/.env chua ton tai!")

    # 4. Port checks
    print("\n4. Kiem tra cac cong dich vu:")
    p5432 = check_port(5432)
    p8001 = check_port(8001)
    p3000 = check_port(3000)
    print(f"   Port 5432 (PostgreSQL) : {'DANG CHAY' if p5432 else 'CHUA CHAY'}")
    print(f"   Port 8001 (FastAPI API): {'DANG CHAY' if p8001 else 'CHUA CHAY'}")
    print(f"   Port 3000 (Frontend Web): {'DANG CHAY' if p3000 else 'CHUA CHAY'}")

    # 5. Database check
    if p5432:
        print("\n5. Kiem tra truy van Database lopminh:")
        try:
            import psycopg
            conn = psycopg.connect("postgresql://lopminh:change-me@127.0.0.1:5432/lopminh", connect_timeout=3)
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
                tbl_count = cur.fetchone()[0]
                cur.execute("SELECT count(*) FROM users")
                user_count = cur.fetchone()[0]
                cur.execute("SELECT count(*) FROM classes")
                class_count = cur.fetchone()[0]
                cur.execute("SELECT count(*) FROM class_sessions")
                session_count = cur.fetchone()[0]
                print(f"   [OK] Ket noi CSDL thanh cong!")
                print(f"        - So bang du lieu  : {tbl_count}")
                print(f"        - So nguoi dung    : {user_count}")
                print(f"        - So lop hoc       : {class_count}")
                print(f"        - So buoi hoc (TKB): {session_count}")
            conn.close()
        except Exception as e:
            print(f"   [LOI] Khong the truy van CSDL lopminh: {e}")
    else:
        print("\n5. Kiem tra database: Bo qua vi PostgreSQL chua chay tren cong 5432.")

    print("\n" + "=" * 60)
    print("   KET QUA CHAN DOAN HOAN TAT")
    print("=" * 60)

if __name__ == "__main__":
    main()

