"""Apply the additive Division and Union/Ward deed migration to PostgreSQL."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row


BACKEND = Path(__file__).resolve().parent
ROOT = BACKEND.parent
MIGRATION = BACKEND / "migrations" / "20261105_deed_division_union_support.sql"


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
    with psycopg.connect(database_url, connect_timeout=10, autocommit=True, row_factory=dict_row) as connection:
        required_tables = {"deeds", "deed_verifications", "divisions", "districts", "admin_unions"}
        existing_tables = {
            row["table_name"]
            for row in connection.execute(
                """SELECT table_name FROM information_schema.tables
                   WHERE table_schema = current_schema() AND table_name = ANY(%s)""",
                (list(required_tables),),
            ).fetchall()
        }
        missing = sorted(required_tables - existing_tables)
        if missing:
            raise RuntimeError(
                "Apply the location registry and Union migrations first; missing tables: "
                + ", ".join(missing)
            )
        connection.execute(sql)
        rows = connection.execute(
            """SELECT 'deeds' AS table_name,
                      COUNT(*) FILTER (WHERE division_id IS NOT NULL) AS with_division,
                      COUNT(*) FILTER (WHERE union_ward IS NOT NULL OR union_id IS NOT NULL) AS with_union_ward
               FROM deeds
               UNION ALL
               SELECT 'deed_verifications',
                      COUNT(*) FILTER (WHERE division_id IS NOT NULL),
                      COUNT(*) FILTER (WHERE union_ward IS NOT NULL OR union_id IS NOT NULL)
               FROM deed_verifications"""
        ).fetchall()
    for row in rows:
        print(
            f"{row['table_name']}: division_linked={row['with_division']}, "
            f"union_or_ward_present={row['with_union_ward']}"
        )
    print(f"MIGRATION_APPLIED {MIGRATION.name}")


if __name__ == "__main__":
    main()
