from collections.abc import Generator

import psycopg
from psycopg.rows import dict_row

from .config import DATABASE_URL


def get_db() -> Generator[psycopg.Connection, None, None]:
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as connection:
        yield connection
