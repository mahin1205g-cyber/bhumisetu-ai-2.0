"""Apply the additive nullable district-translation migration to PostgreSQL."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv


BACKEND = Path(__file__).resolve().parent
ROOT = BACKEND.parent
MIGRATION = BACKEND / "migrations" / "20261104_district_translation_support.sql"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="apply the reviewed additive migration")
    args = parser.parse_args()
    sql = MIGRATION.read_text(encoding="utf-8")
    if not args.apply:
        print(f"DRY_RUN_OK migration={MIGRATION.name}")
        return

    load_dotenv(BACKEND / ".env")
    load_dotenv(ROOT / ".env")
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    with psycopg.connect(database_url, connect_timeout=10, autocommit=True) as connection:
        connection.execute(sql)
    print(f"MIGRATION_APPLIED {MIGRATION.name}")


if __name__ == "__main__":
    main()
