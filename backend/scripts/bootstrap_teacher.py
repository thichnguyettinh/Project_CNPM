import argparse
import getpass
import os
import sys
import uuid

import psycopg

from backend.app.security import hash_password, password_policy_errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Create the first Lớp Mình teacher account.")
    parser.add_argument("--username", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--phone")
    args = parser.parse_args()

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        parser.error("Set DATABASE_URL before creating the first teacher.")
    password = getpass.getpass("Teacher password (minimum 8 characters, uppercase, number, special character): ")
    password_errors = password_policy_errors(password)
    if password_errors:
        parser.error("Password must include " + ", ".join(password_errors) + ".")
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        parser.error("Passwords do not match.")

    with psycopg.connect(database_url) as connection:
        connection.execute(
            """
            INSERT INTO users
              (user_id, username, email, password_hash, role, full_name, phone, avatar_text)
            VALUES (%s, %s, %s, %s, 'teacher', %s, %s, %s)
            """,
            (
                str(uuid.uuid4()),
                args.username.strip(),
                args.email.strip().lower(),
                hash_password(password),
                args.name.strip(),
                args.phone,
                "".join(part[0] for part in args.name.split()[:2]).upper(),
            ),
        )
    print(f"Teacher account '{args.username}' created.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
