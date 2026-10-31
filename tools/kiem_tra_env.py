"""Check local backend/.env format without printing secrets or making DB calls."""
from pathlib import Path
from urllib.parse import urlsplit

path = Path(__file__).resolve().parents[1] / 'backend' / '.env'
if not path.exists():
    raise SystemExit('CHUA CO backend/.env. Sao chep backend/.env.example va dien thong tin DB.')

config = {}
issues = []
for n, raw in enumerate(path.read_text(encoding='utf-8-sig').splitlines(), 1):
    line = raw.strip()
    if not line or line.startswith('#'):
        continue
    if '=' not in line:
        issues.append(f'Dong {n}: thieu dau =')
        continue
    key, value = line.split('=', 1)
    if not key.strip() or not value.strip():
        issues.append(f'Dong {n}: thieu ten bien hoac gia tri')
    if key in config:
        issues.append(f'Dong {n}: trung bien {key}')
    config[key.strip()] = value.strip()

url = config.get('DATABASE_URL', '')
if not url:
    issues.append('Thieu DATABASE_URL')
else:
    try:
        parsed = urlsplit(url)
        dbname = parsed.path.lstrip('/')
        if parsed.scheme not in ('postgresql', 'postgres') or not parsed.hostname or not dbname:
            issues.append('DATABASE_URL khong dung dang postgresql://user:password@localhost:5432/database')
        if 'SESSION_HOURS' in url or 'CORS_ORIGINS' in url or 'UPLOAD_DIR' in url:
            issues.append('Cac bien cau hinh da bi dinh vao DATABASE_URL! Can xuong dong.')
        if 'MAT_KHAU' in url or 'change-me' in url:
            issues.append('DATABASE_URL van chua thay mat khau mau')
        print(f'DATABASE_URL: host={parsed.hostname or "?"}, port={parsed.port or 5432}, database={dbname or "?"}')
    except ValueError:
        issues.append('DATABASE_URL khong hop le (kiem tra ky tu dac biet trong mat khau)')
for required in ['CORS_ORIGINS', 'SESSION_HOURS', 'UPLOAD_DIR', 'MAX_UPLOAD_BYTES']:
    if required not in config:
        issues.append(f'Thieu {required}')
if issues:
    for problem in issues:
        print('LOI:', problem)
    raise SystemExit(1)
print('OK: backend/.env co dinh dang hop le (chua kiem tra duoc dang nhap PostgreSQL).')
