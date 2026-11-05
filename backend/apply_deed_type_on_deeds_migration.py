"""Add the deed_type field to the application deeds table."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row


BACKEND = Path(__file__).resolve().parent
ROOT = BACKEND.parent
MIGRATION = BACKEND / "migrations" / "20261105_deed_type_on_deeds.sql"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--check", action="store_true", help="read the current deeds column and row counts")
    actions.add_argument("--apply", action="store_true", help="apply the additive migration")
    args = parser.parse_args()
    sql = MIGRATION.read_text(encoding="utf-8")
    if not args.apply and not args.check:
        print(f"DRY_RUN_OK migration={MIGRATION.name}")
        return

    load_dotenv(BACKEND / ".env")
    load_dotenv(ROOT / ".env")
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured")

    with psycopg.connect(database_url, connect_timeout=10, autocommit=True, row_factory=dict_row) as connection:
        table_exists = connection.execute(
            """SELECT EXISTS (
                   SELECT 1 FROM information_schema.tables
                   WHERE table_schema=current_schema() AND table_name='deeds'
               ) AS present"""
        ).fetchone()["present"]
        if not table_exists:
            raise RuntimeError("The deeds table is missing from the current database schema")
        column = connection.execute(
            """SELECT data_type, is_nullable
               FROM information_schema.columns
               WHERE table_schema=current_schema()
                 AND table_name='deeds' AND column_name='deed_type'"""
        ).fetchone()
        before = column is not None

        if args.check:
            row_counts = connection.execute(
                """SELECT COUNT(*) AS total,
                          COUNT(*) FILTER (WHERE deed_type IS NOT NULL AND BTRIM(deed_type) <> '') AS populated
                   FROM deeds""" if before else "SELECT COUNT(*) AS total, 0 AS populated FROM deeds"
            ).fetchone()
            print(
                f"SCHEMA_CHECK_OK deed_type_present={str(before).lower()} "
                f"type={column['data_type'] if column else 'missing'} "
                f"nullable={column['is_nullable'] if column else 'missing'} "
                f"rows={row_counts['total']} populated_types={row_counts['populated']}"
            )
            return

        connection.execute(sql)

        after = connection.execute(
            """SELECT COUNT(*) AS total,
                      COUNT(*) FILTER (WHERE deed_type IS NOT NULL AND BTRIM(deed_type) <> '') AS populated
               FROM deeds"""
        ).fetchone()
        after_column = connection.execute(
            """SELECT data_type, is_nullable
               FROM information_schema.columns
               WHERE table_schema=current_schema()
                 AND table_name='deeds' AND column_name='deed_type'"""
        ).fetchone()

    print(
        f"MIGRATION_APPLIED {MIGRATION.name} "
        f"column_was_present={str(before).lower()} "
        f"type={after_column['data_type']} nullable={after_column['is_nullable']} "
        f"rows={after['total']} populated_types={after['populated']}"
    )


if __name__ == "__main__":
    main()
