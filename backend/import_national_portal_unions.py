"""Import official Union names from the Bangladesh National Portal.

The portal publishes its Union directory in the Union List page's embedded
``__lists.unions`` data. The importer keeps a normalized source snapshot and
links each Union to the existing DGHS Upazila code when the BBS hierarchy code
is present in the local location registry. Unmatched source parents remain
available in the snapshot but are not presented as verified suggestions.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import unicodedata
import urllib.request
from datetime import date
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv


BACKEND = Path(__file__).resolve().parent
ROOT = BACKEND.parent
SNAPSHOT = BACKEND / "data" / "national_portal_unions_20261104.json"
SOURCE_URL = "https://bangladesh.gov.bd/views/union-list/"
DATASET_KEY = "bangladesh_national_portal_unions"
MIN_EXPECTED_UNIONS = 4000
MAX_EXPECTED_UNIONS = 5000


def _balanced_array(source: str, start: int) -> str:
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(source)):
        char = source[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
        elif char == '"':
            in_string = True
        elif char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return source[start:index + 1]
    raise ValueError("Could not parse the official Union list array")


def parse_official_page(page: str) -> list[dict]:
    marker = "const __lists ="
    marker_at = page.find(marker)
    if marker_at < 0:
        raise ValueError("Official National Portal page did not include its location data")
    lists_source = page[marker_at + len(marker):]
    union_match = re.search(r"\bunions\s*:\s*\[", lists_source)
    if not union_match:
        raise ValueError("Official National Portal page did not include the Union list")
    array_start = union_match.end() - 1
    official_rows = json.loads(_balanced_array(lists_source, array_start))

    rows = []
    for item in official_rows:
        division = item.get("division") or {}
        district = item.get("district") or {}
        upazila = item.get("upazila") or {}
        code = str(item.get("_id") or "").strip()
        name_bn = str(item.get("title_bn") or item.get("title") or "").strip()
        name_en = str(item.get("title_en") or "").strip()
        upazila_name_en = str(upazila.get("title_en") or "").strip()
        district_name_en = str(district.get("title_en") or "").strip()
        if not all((code, name_bn, upazila_name_en, district_name_en)):
            raise ValueError("An official Union entry is missing its ID, name, or parent names")
        rows.append({
            "code": code,
            "name_bn": name_bn,
            "name_en": name_en or None,
            "division_bbs_code": str(division.get("bbs_code") or "").strip(),
            "district_bbs_code": str(district.get("bbs_code") or "").strip(),
            "upazila_bbs_code": str(upazila.get("bbs_code") or "").strip(),
            "division_name_en": str(division.get("title_en") or "").strip(),
            "district_name_en": district_name_en,
            "upazila_name_bn": str(upazila.get("title_bn") or "").strip() or None,
            "upazila_name_en": upazila_name_en,
            "national_upazila_id": str(upazila.get("id") or "").strip() or None,
        })

    if not MIN_EXPECTED_UNIONS <= len(rows) <= MAX_EXPECTED_UNIONS:
        raise ValueError(f"Unexpected official Union count: {len(rows)}")
    if len({row["code"] for row in rows}) != len(rows):
        raise ValueError("The official Union directory contains duplicate source IDs")
    return rows


def refresh_snapshot() -> dict:
    request = urllib.request.Request(
        SOURCE_URL,
        headers={"Accept": "text/html", "User-Agent": "Bhumisetu-location-import/1.0"},
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = response.read()
    page = raw.decode("utf-8", "replace")
    rows = parse_official_page(page)
    snapshot = {
        "source_url": SOURCE_URL,
        "retrieved_at": date.today().isoformat(),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "record_count": len(rows),
        "records": rows,
    }
    SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return snapshot


def load_snapshot() -> dict:
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    rows = snapshot.get("records") or []
    if snapshot.get("source_url") != SOURCE_URL or snapshot.get("record_count") != len(rows):
        raise ValueError("The saved official Union snapshot is incomplete or has an unexpected source URL")
    if not MIN_EXPECTED_UNIONS <= len(rows) <= MAX_EXPECTED_UNIONS:
        raise ValueError(f"Unexpected official Union count in snapshot: {len(rows)}")
    return snapshot


def _normalize(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).casefold()
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", "", text)


def _normalize_bengali_label(value: str | None) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    return " ".join(text.split())


def collect_unambiguous_upazila_labels(rows: list[dict], upazila_ids: dict[str, int]) -> dict[int, str]:
    """Collect official Bengali Upazila labels; discard conflicting labels."""
    labels_by_id: dict[int, dict[str, str]] = {}
    for item in rows:
        upazila_id = upazila_ids.get(item.get("code"))
        label = str(item.get("upazila_name_bn") or "").strip()
        normalized = _normalize_bengali_label(label)
        if upazila_id is None or not normalized:
            continue
        labels_by_id.setdefault(upazila_id, {})[normalized] = label
    return {
        upazila_id: next(iter(labels.values()))
        for upazila_id, labels in labels_by_id.items()
        if len(labels) == 1
    }


def map_upazila_ids(connection, rows: list[dict]) -> dict[str, int]:
    existing = connection.execute(
        """SELECT u.id, u.code, u.name_en, u.name_bn, d.code AS district_code,
                  d.name_en AS district_name_en, d.name_bn AS district_name_bn
           FROM upazilas u JOIN districts d ON d.id=u.district_id
           WHERE u.is_active=TRUE AND d.is_active=TRUE"""
    ).fetchall()
    by_code = {str(row["code"]): row["id"] for row in existing}
    by_name_and_district: dict[tuple[str, str], list[int]] = {}
    by_parent_names: dict[tuple[str, str], list[int]] = {}
    for row in existing:
        for label in (row["name_en"], row["name_bn"]):
            key = (str(row["district_code"]), _normalize(label))
            if key[1]:
                by_name_and_district.setdefault(key, []).append(row["id"])
            for district_label in (row["district_name_en"], row["district_name_bn"]):
                parent_key = (_normalize(district_label), _normalize(label))
                if all(parent_key):
                    by_parent_names.setdefault(parent_key, []).append(row["id"])

    matched: dict[str, int] = {}
    for item in rows:
        division_code = item.get("division_bbs_code", "")
        district_bbs = item.get("district_bbs_code", "")
        upazila_bbs = item.get("upazila_bbs_code", "")
        expected_code = ""
        try:
            expected_code = f"{int(division_code):02d}{int(district_bbs):02d}{int(upazila_bbs):04d}"
        except (TypeError, ValueError):
            pass
        upazila_id = by_code.get(expected_code)
        if upazila_id is None:
            district_code = expected_code[:4] if expected_code else ""
            candidates = by_name_and_district.get((district_code, _normalize(item["upazila_name_en"])), [])
            if not candidates and item.get("upazila_name_bn"):
                candidates = by_name_and_district.get((district_code, _normalize(item["upazila_name_bn"])), [])
            unique_candidates = set(candidates)
            if len(unique_candidates) == 1:
                upazila_id = unique_candidates.pop()
        if upazila_id is None:
            name_candidates = by_parent_names.get(
                (_normalize(item.get("district_name_en")), _normalize(item.get("upazila_name_en"))),
                [],
            )
            unique_candidates = set(name_candidates)
            if len(unique_candidates) == 1:
                upazila_id = unique_candidates.pop()
        if upazila_id is not None:
            matched[item["code"]] = upazila_id
    return matched


def import_snapshot(snapshot: dict) -> dict:
    load_dotenv(BACKEND / ".env")
    load_dotenv(ROOT / ".env")
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured")

    rows = snapshot["records"]
    with psycopg.connect(database_url, connect_timeout=10, row_factory=dict_row) as connection:
        print("Connected to configured location database", flush=True)
        upazila_ids = map_upazila_ids(connection, rows)
        upazila_labels = collect_unambiguous_upazila_labels(rows, upazila_ids)
        print(f"Mapped {len(upazila_ids)} of {len(rows)} official Union rows to app Upazilas", flush=True)
        status = "complete" if len(upazila_ids) == len(rows) else "partial"
        notes = (
            f"Official Bangladesh National Portal Union directory, retrieved {snapshot['retrieved_at']}. "
            f"{len(rows)} official Union names were imported; {len(upazila_ids)} link to an Upazila in this app's official location registry. "
            f"The snapshot also supplies an unambiguous Bengali Upazila label for {len(upazila_labels)} linked records; conflicting labels are skipped and existing Bengali labels are preserved. "
            "The directory does not publish Ward names; enter Ward manually. Unlinked Union names remain in the source snapshot."
        )
        import_row = connection.execute(
            """INSERT INTO location_dataset_imports
                   (dataset_key, source_url, dataset_version, retrieved_at, sha256,
                    status, record_counts, coverage_notes, imported_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, CURRENT_TIMESTAMP)
               ON CONFLICT (dataset_key, sha256) DO UPDATE
                   SET status=EXCLUDED.status, record_counts=EXCLUDED.record_counts,
                       coverage_notes=EXCLUDED.coverage_notes, imported_at=CURRENT_TIMESTAMP
               RETURNING id""",
            (
                DATASET_KEY, SOURCE_URL, snapshot["retrieved_at"], snapshot["retrieved_at"], snapshot["sha256"],
                status, json.dumps({
                    "unions": len(rows),
                    "unions_linked_to_upazila": len(upazila_ids),
                    "upazilas_with_unambiguous_bengali_labels": len(upazila_labels),
                }), notes,
            ),
        ).fetchone()
        import_id = import_row["id"]
        print("Recorded Union source snapshot metadata", flush=True)
        union_rows = [
            (
                item["code"], upazila_ids.get(item["code"]), item["name_bn"], item["name_en"],
                item["upazila_name_bn"], item["upazila_name_en"], item["district_name_en"],
                import_id, SOURCE_URL,
            )
            for item in rows
        ]
        connection.execute(
            """CREATE TEMP TABLE union_import_stage (
                   code TEXT, upazila_id BIGINT, name_bn TEXT, name_en TEXT,
                   parent_upazila_name_bn TEXT, parent_upazila_name_en TEXT,
                   parent_district_name_en TEXT, source_import_id BIGINT,
                   source_reference TEXT
               ) ON COMMIT DROP"""
        )
        with connection.cursor() as cursor:
            with cursor.copy(
                """COPY union_import_stage
                   (code, upazila_id, name_bn, name_en, parent_upazila_name_bn,
                    parent_upazila_name_en, parent_district_name_en, source_import_id,
                    source_reference) FROM STDIN"""
            ) as copy:
                for union_row in union_rows:
                    copy.write_row(union_row)
        print("Copied validated Union rows into temporary staging table", flush=True)
        connection.execute(
            """INSERT INTO admin_unions
                   (code, upazila_id, name_bn, name_en, parent_upazila_name_bn,
                    parent_upazila_name_en, parent_district_name_en, source_import_id,
                    source_reference, is_active)
               SELECT code, upazila_id, name_bn, name_en, parent_upazila_name_bn,
                      parent_upazila_name_en, parent_district_name_en, source_import_id,
                      source_reference, TRUE
               FROM union_import_stage
               ON CONFLICT (code) DO UPDATE SET
                   upazila_id=EXCLUDED.upazila_id,
                   name_bn=EXCLUDED.name_bn,
                   name_en=EXCLUDED.name_en,
                   parent_upazila_name_bn=EXCLUDED.parent_upazila_name_bn,
                   parent_upazila_name_en=EXCLUDED.parent_upazila_name_en,
                   parent_district_name_en=EXCLUDED.parent_district_name_en,
                   source_import_id=EXCLUDED.source_import_id,
                   source_reference=EXCLUDED.source_reference,
                   is_active=TRUE"""
        )
        print("Upserted official Union names", flush=True)
        for upazila_id, label in upazila_labels.items():
            connection.execute(
                """UPDATE upazilas SET name_bn=%s
                   WHERE id=%s AND is_active=TRUE AND name_bn IS NULL""",
                (label, upazila_id),
            )
        print(f"Added missing Bengali names for {len(upazila_labels)} unambiguous Upazilas", flush=True)
        imported_count = connection.execute(
            "SELECT COUNT(*) AS total FROM admin_unions WHERE source_import_id=%s AND is_active=TRUE",
            (import_id,),
        ).fetchone()["total"]
        if imported_count != len(rows):
            raise RuntimeError(f"Imported {imported_count} of {len(rows)} validated Union records")
    return {"unions": imported_count, "linked": len(upazila_ids), "unlinked": len(rows) - len(upazila_ids), "status": status}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="fetch the current official portal list and replace the normalized snapshot")
    parser.add_argument("--apply", action="store_true", help="import the validated snapshot into PostgreSQL")
    args = parser.parse_args()
    snapshot = refresh_snapshot() if args.refresh or not SNAPSHOT.exists() else load_snapshot()
    if args.apply:
        summary = import_snapshot(snapshot)
        print("IMPORT_APPLIED", json.dumps(summary, ensure_ascii=False))
    else:
        print("DRY_RUN_OK", json.dumps({
            "snapshot": str(SNAPSHOT), "official_records": len(snapshot["records"]),
            "sha256": snapshot["sha256"], "source": SOURCE_URL,
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()
