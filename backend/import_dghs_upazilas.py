"""Import official DGHS GeoCodes Upazila codes and separate metro thanas.

Dry-run by default. Data is fetched from the current official FHIR CodeSystem,
validated and retained as a source snapshot before any database write.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import urllib.request
from datetime import date
from pathlib import Path

from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = Path(__file__).resolve().parent / "data" / "dghs_bd_geocodes_0.5.0.json"
SOURCE_URL = "https://fhir.dghs.gov.bd/core/CodeSystem-bd-geocodes.json"
EXPECTED_VERSION = "0.5.0"
DATASET_KEY = "dghs_bd_geocodes_upazilas"


def fetch_source() -> tuple[dict, bytes]:
    request = urllib.request.Request(
        SOURCE_URL,
        headers={"Accept": "application/fhir+json, application/json", "User-Agent": "Bhumisetu-location-import/1.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read()
    source = json.loads(raw)
    if source.get("resourceType") != "CodeSystem" or source.get("id") != "bd-geocodes":
        raise ValueError("Official source did not return the expected Bangladesh GeoCodes CodeSystem")
    if source.get("version") != EXPECTED_VERSION:
        raise ValueError(f"Expected DGHS GeoCodes {EXPECTED_VERSION}, received {source.get('version')!r}")
    return source, raw


def parse_source(source: dict) -> tuple[list[dict], list[dict], str]:
    concepts = source.get("concept") or []
    if not concepts:
        raise ValueError("Official GeoCodes snapshot has no concepts")
    by_code: dict[str, str] = {}
    for concept in concepts:
        code = str(concept.get("code", "")).strip()
        display = str(concept.get("display", "")).strip()
        if code and display:
            if code in by_code and by_code[code] != display:
                raise ValueError(f"Official GeoCodes contains conflicting labels for code {code}")
            by_code[code] = display

    district_codes = {
        code for code in by_code
        if re.fullmatch(r"\d{4}", code)
    }
    city_corporation_codes = {
        code for code, display in by_code.items()
        if re.fullmatch(r"\d{6}", code) and "city corporation" in display.casefold()
    }
    entries = [
        {"code": code, "name_en": display, "district_code": code[:4], "parent_code": code[:6]}
        for code, display in by_code.items()
        if re.fullmatch(r"\d{8}", code)
    ]
    if not 450 <= len(entries) <= 700:
        raise ValueError(f"Unexpected number of 8-digit DGHS Upazila ValueSet entries: {len(entries)}")
    if not city_corporation_codes:
        raise ValueError("Could not identify DGHS city corporation parent codes for separating metropolitan thanas")
    unknown_districts = sorted({item["district_code"] for item in entries} - district_codes)
    if unknown_districts:
        raise ValueError(f"Upazila codes refer to district codes absent from the official snapshot: {unknown_districts}")
    if len({item["code"] for item in entries}) != len(entries):
        raise ValueError("Duplicate eight-digit administrative codes found")

    upazilas, thanas = [], []
    for item in entries:
        if item["parent_code"] in city_corporation_codes:
            thanas.append(item)
        else:
            upazilas.append(item)
    if len(upazilas) < 450 or not thanas:
        raise ValueError(f"Unexpected classification totals: upazilas={len(upazilas)}, metro_thanas={len(thanas)}")
    return upazilas, thanas, hashlib.sha256(SNAPSHOT.read_bytes()).hexdigest()


def apply_import(upazilas: list[dict], thanas: list[dict], digest: str) -> dict:
    load_dotenv(Path(__file__).resolve().parent / ".env")
    load_dotenv(ROOT / ".env")
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured")

    counts = {"upazilas": len(upazilas), "police_thanas": len(thanas), "mouzas": 0}
    notes = (
        "Official DGHS GeoCodes v0.5.0 eight-digit Upazila ValueSet imported. "
        "Eight-digit entries whose six-digit parent is explicitly a City Corporation are stored as metropolitan police thanas. "
        "Names are English source labels; Bengali translations and verified national Mouza coverage are not part of this source."
    )
    with psycopg.connect(database_url, connect_timeout=10, row_factory=dict_row) as connection:
        imported = connection.execute(
            """INSERT INTO location_dataset_imports
                   (dataset_key, source_url, dataset_version, retrieved_at, sha256,
                    status, record_counts, coverage_notes, imported_at)
               VALUES (%s, %s, %s, %s, %s, 'partial', %s::jsonb, %s, CURRENT_TIMESTAMP)
               ON CONFLICT (dataset_key, sha256) DO UPDATE
                   SET status='partial', record_counts=EXCLUDED.record_counts,
                       coverage_notes=EXCLUDED.coverage_notes, imported_at=CURRENT_TIMESTAMP
               RETURNING id""",
            (DATASET_KEY, SOURCE_URL, EXPECTED_VERSION, date.today(), digest, json.dumps(counts), notes),
        ).fetchone()
        import_id = imported["id"]
        district_ids = {
            row["code"]: row["id"]
            for row in connection.execute("SELECT code, id FROM districts WHERE is_active=TRUE").fetchall()
        }
        missing = sorted({row["district_code"] for row in upazilas + thanas} - district_ids.keys())
        if missing:
            raise RuntimeError(f"Official Upazila rows refer to districts absent from the live registry: {missing}")

        for table, rows in (("upazilas", upazilas), ("police_thanas", thanas)):
            for item in rows:
                connection.execute(
                    f"""INSERT INTO {table}
                           (district_id, code, name_bn, name_en, source_import_id, is_active)
                       VALUES (%s, %s, NULL, %s, %s, TRUE)
                       ON CONFLICT (district_id, code) DO UPDATE SET
                           name_bn=COALESCE(upazilas.name_bn, EXCLUDED.name_bn),
                           source_import_id=EXCLUDED.source_import_id, is_active=TRUE""",
                    (district_ids[item["district_code"]], item["code"], item["name_en"], import_id),
                )
        actual_upazilas = connection.execute(
            "SELECT COUNT(*) AS total FROM upazilas WHERE source_import_id=%s AND is_active=TRUE", (import_id,)
        ).fetchone()["total"]
        actual_thanas = connection.execute(
            "SELECT COUNT(*) AS total FROM police_thanas WHERE source_import_id=%s AND is_active=TRUE", (import_id,)
        ).fetchone()["total"]
        if actual_upazilas != len(upazilas) or actual_thanas != len(thanas):
            raise RuntimeError("Live imported location counts do not match the validated DGHS snapshot")
    return {"upazilas": actual_upazilas, "police_thanas": actual_thanas, "status": "partial", "import_id": import_id}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write validated official records into PostgreSQL")
    args = parser.parse_args()
    source, raw = fetch_source()
    SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT.write_bytes(raw)
    upazilas, thanas, digest = parse_source(source)
    result = {
        "version": source["version"], "source": SOURCE_URL,
        "upazilas": len(upazilas), "police_thanas": len(thanas),
        "total_eight_digit_entries": len(upazilas) + len(thanas), "sha256": digest,
    }
    if args.apply:
        result.update(apply_import(upazilas, thanas, digest))
        print("IMPORT_APPLIED", json.dumps(result, ensure_ascii=False))
    else:
        print("DRY_RUN_OK", json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
