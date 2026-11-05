"""Import the official DGHS division and district GeoCodes snapshot.

Dry-run by default. Run with --apply after the location registry migration has
been applied. The source snapshot contains no Upazila, Thana, or Mouza rows.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
from datetime import date
from pathlib import Path

from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = Path(__file__).resolve().parent / "data" / "dghs_admin_levels_0.5.0.csv"
SOURCE_URL = "https://fhir.dghs.gov.bd/core/CodeSystem-bd-geocodes.html"
DISTRICT_TRANSLATION_SOURCE_URL = "https://bangladesh.gov.bd/views/district-list/District-List/"
DATASET_KEY = "dghs_bd_geocodes_admin"
DATASET_VERSION = "0.5.0"


def load_rows() -> tuple[list[dict[str, str]], list[dict[str, str]], str]:
    contents = DATA_FILE.read_bytes()
    digest = hashlib.sha256(contents).hexdigest()
    with DATA_FILE.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    divisions = [row for row in rows if row["level"] == "division"]
    districts = [row for row in rows if row["level"] == "district"]
    division_codes = {row["code"] for row in divisions}
    if len(divisions) != 8 or len(division_codes) != 8:
        raise ValueError("Source snapshot must contain exactly 8 unique divisions")
    if len(districts) != 64 or len({row["code"] for row in districts}) != 64:
        raise ValueError("Source snapshot must contain exactly 64 unique districts")
    if any(row["parent_code"] not in division_codes for row in districts):
        raise ValueError("Every district must reference a division in this snapshot")
    if any(not row["name_en"].strip() or len(row["code"]) != 4 for row in districts):
        raise ValueError("Every district needs a 4-digit code and English label")
    if any(not row["name_bn"].strip() for row in districts):
        raise ValueError("Every district needs a reviewed Bengali label from the National Portal snapshot")
    if any(not row["name_bn"].strip() or len(row["code"]) != 2 for row in divisions):
        raise ValueError("Every division needs a 2-digit code and Bengali label")
    return divisions, districts, digest


def apply_import(divisions: list[dict[str, str]], districts: list[dict[str, str]], digest: str) -> dict:
    load_dotenv(Path(__file__).resolve().parent / ".env")
    load_dotenv(ROOT / ".env")
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured")

    with psycopg.connect(database_url, connect_timeout=10, row_factory=dict_row) as connection:
        import_row = connection.execute(
            """INSERT INTO location_dataset_imports
                   (dataset_key, source_url, dataset_version, retrieved_at, sha256,
                    status, record_counts, coverage_notes, imported_at)
               VALUES (%s, %s, %s, %s, %s, 'partial', %s::jsonb, %s, CURRENT_TIMESTAMP)
               ON CONFLICT (dataset_key, sha256) DO UPDATE
                   SET status='partial', record_counts=EXCLUDED.record_counts,
                       coverage_notes=EXCLUDED.coverage_notes,
                       imported_at=CURRENT_TIMESTAMP
               RETURNING id""",
            (
                DATASET_KEY,
                SOURCE_URL,
                DATASET_VERSION,
                date.today(),
                digest,
                json.dumps({"divisions": len(divisions), "districts": len(districts)}, ensure_ascii=False),
                "Division/district codes and English labels: DGHS GeoCodes. Bengali district labels: Bangladesh National Portal district list (" + DISTRICT_TRANSLATION_SOURCE_URL + "). Upazila/Thana/Mouza data are separate datasets.",
            ),
        ).fetchone()
        import_id = import_row["id"]

        for item in divisions:
            connection.execute(
                """INSERT INTO divisions (code, name_bn, name_en, source_import_id, is_active)
                   VALUES (%s, %s, %s, %s, TRUE)
                   ON CONFLICT (code) DO UPDATE SET
                       name_bn=EXCLUDED.name_bn, name_en=EXCLUDED.name_en,
                       source_import_id=EXCLUDED.source_import_id, is_active=TRUE""",
                (item["code"], item["name_bn"], item["name_en"], import_id),
            )

        division_ids = {
            row["code"]: row["id"]
            for row in connection.execute("SELECT id, code FROM divisions WHERE is_active=TRUE").fetchall()
        }
        for item in districts:
            connection.execute(
                """INSERT INTO districts
                       (division_id, code, name_bn, name_en, source_import_id, is_active)
                   VALUES (%s, %s, NULLIF(%s, ''), %s, %s, TRUE)
                   ON CONFLICT (division_id, code) DO UPDATE SET
                       name_bn=COALESCE(EXCLUDED.name_bn, districts.name_bn),
                       name_en=EXCLUDED.name_en,
                       source_import_id=EXCLUDED.source_import_id, is_active=TRUE""",
                (division_ids[item["parent_code"]], item["code"], item["name_bn"], item["name_en"], import_id),
            )

        imported_divisions = connection.execute(
            "SELECT COUNT(*) AS total FROM divisions WHERE source_import_id=%s AND is_active=TRUE",
            (import_id,),
        ).fetchone()["total"]
        imported_districts = connection.execute(
            "SELECT COUNT(*) AS total FROM districts WHERE source_import_id=%s AND is_active=TRUE",
            (import_id,),
        ).fetchone()["total"]
        if imported_divisions != len(divisions) or imported_districts != len(districts):
            raise RuntimeError("Imported division/district row counts do not match the verified source snapshot")

    return {
        "import_id": import_id,
        "divisions": imported_divisions,
        "districts": imported_districts,
        "status": "partial",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the verified 8-division/64-district snapshot to PostgreSQL")
    args = parser.parse_args()
    divisions, districts, digest = load_rows()
    summary = {"divisions": len(divisions), "districts": len(districts), "sha256": digest}
    if args.apply:
        summary.update(apply_import(divisions, districts, digest))
        print("IMPORT_APPLIED", json.dumps(summary, ensure_ascii=False))
    else:
        print("DRY_RUN_OK", json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
