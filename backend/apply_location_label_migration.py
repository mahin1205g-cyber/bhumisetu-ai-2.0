"""Apply nullable Bengali-label support for official English-only location names."""

from __future__ import annotations

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
MIGRATION = Path(__file__).resolve().parent / "migrations" / "20261104_location_english_label_support.sql"


def main() -> None:
    load_dotenv(Path(__file__).resolve().parent / ".env")
    load_dotenv(ROOT / ".env")
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    sql = MIGRATION.read_text(encoding="utf-8")
    with psycopg.connect(database_url, connect_timeout=10) as connection:
        connection.execute(sql)
    print("MIGRATION_APPLIED", MIGRATION.name)


if __name__ == "__main__":
    main()
