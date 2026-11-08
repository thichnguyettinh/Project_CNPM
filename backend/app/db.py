from collections.abc import Generator

import psycopg
from psycopg.rows import dict_row

from .config import DATABASE_URL


def get_db() -> Generator[psycopg.Connection, None, None]:
    with psycopg.connect(DATABASE_URL, row_factory=dict_row, connect_timeout=5) as connection:
        try:
            connection.execute("SET timezone = 'Asia/Ho_Chi_Minh'")
        except Exception:
            pass
        yield connection
