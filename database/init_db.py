import psycopg
import sys
from pathlib import Path

def init_postgres():
    conn = psycopg.connect("postgresql://postgres@127.0.0.1:5432/postgres", autocommit=True)
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_roles WHERE rolname='lopminh'")
        if not cur.fetchone():
            cur.execute("CREATE ROLE lopminh WITH LOGIN PASSWORD 'change-me' SUPERUSER CREATEDB")
            print("Created role lopminh")
        else:
            cur.execute("ALTER ROLE lopminh WITH LOGIN PASSWORD 'change-me' SUPERUSER CREATEDB")
            print("Updated role lopminh")

        cur.execute("SELECT 1 FROM pg_database WHERE datname='lopminh'")
        if not cur.fetchone():
            cur.execute("CREATE DATABASE lopminh OWNER lopminh")
            print("Created database lopminh")
        else:
            print("Database lopminh already exists")
    conn.close()

    # Now connect to lopminh database and apply schema.sql
    print("Connecting to database lopminh...")
    conn_lopminh = psycopg.connect("postgresql://lopminh:change-me@127.0.0.1:5432/lopminh", autocommit=True)
    
    schema_file = Path(__file__).parent / "schema.sql"
    print(f"Applying {schema_file}...")
    schema_sql = schema_file.read_text(encoding="utf-8")
    with conn_lopminh.cursor() as cur:
        cur.execute(schema_sql)
    print("schema.sql applied successfully!")

    # Apply seed_test_accounts.sql
    seed_file = Path(__file__).parent / "seed_test_accounts.sql"
    print(f"Applying {seed_file}...")
    seed_sql = seed_file.read_text(encoding="utf-8")
    with conn_lopminh.cursor() as cur:
        cur.execute(seed_sql)
    print("seed_test_accounts.sql applied successfully!")

    # Verify tables
    with conn_lopminh.cursor() as cur:
        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
        tables = [r[0] for r in cur.fetchall()]
        print(f"Public tables created ({len(tables)}):", tables)

        cur.execute("SELECT username, role, full_name, status FROM users")
        users = cur.fetchall()
        print("Users in database:", users)

    conn_lopminh.close()

if __name__ == "__main__":
    init_postgres()
