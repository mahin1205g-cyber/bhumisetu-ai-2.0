"""Database access for the verified Bangladesh location hierarchy."""

from __future__ import annotations

import re
import unicodedata
import csv
import json
from functools import lru_cache
from pathlib import Path

try:
    import engine
except ImportError:
    from . import engine


class LocationNotFound(Exception):
    pass


_LOCATION_TABLES = {
    "divisions": (None, None),
    "districts": ("division_id", None),
    "upazilas": ("district_id", "upazila"),
    "police_thanas": ("district_id", "police_thana"),
    "mouzas": (None, None),
}


@lru_cache(maxsize=1)
def _official_admin_labels() -> dict[str, dict[str, dict[str, str]]]:
    """Return reviewed bilingual division/district labels keyed by official code.

    The bundled snapshot is sourced from DGHS GeoCodes and the National Portal.
    It fills missing catalog labels at read time; it never writes to PostgreSQL.
    """
    source_path = Path(__file__).resolve().parent / "data" / "dghs_admin_levels_0.5.0.csv"
    try:
        with source_path.open(encoding="utf-8-sig", newline="") as stream:
            rows = list(csv.DictReader(stream))
    except OSError:
        return {"divisions": {}, "districts": {}}

    labels: dict[str, dict[str, dict[str, str]]] = {"divisions": {}, "districts": {}}
    for item in rows:
        table = {"division": "divisions", "district": "districts"}.get(item.get("level"))
        code = str(item.get("code") or "").strip()
        name_bn = str(item.get("name_bn") or "").strip()
        name_en = str(item.get("name_en") or "").strip()
        if table and code and name_bn and name_en:
            labels[table][code] = {"name_bn": name_bn, "name_en": name_en}
    return labels


@lru_cache(maxsize=1)
def _official_upazila_labels() -> dict[str, str]:
    """Map DGHS Upazila codes to unambiguous Bengali labels in the official Union directory."""
    source_path = Path(__file__).resolve().parent / "data" / "national_portal_unions_20261104.json"
    try:
        source = json.loads(source_path.read_text(encoding="utf-8"))
        records = source.get("records") or []
    except (OSError, ValueError, AttributeError):
        return {}

    candidates: dict[str, dict[str, str]] = {}
    for item in records:
        label = str(item.get("upazila_name_bn") or "").strip()
        try:
            code = (
                f"{int(item.get('division_bbs_code')):02d}"
                f"{int(item.get('district_bbs_code')):02d}"
                f"{int(item.get('upazila_bbs_code')):04d}"
            )
        except (TypeError, ValueError):
            continue
        key = normalize_location_label(label)
        if key:
            candidates.setdefault(code, {})[key] = label
    return {
        code: next(iter(labels.values()))
        for code, labels in candidates.items()
        if len(labels) == 1
    }


@lru_cache(maxsize=1)
def _official_upazila_labels_by_name() -> dict[str, str]:
    """Return National Portal Upazila labels keyed by an unambiguous English label."""
    source_path = Path(__file__).resolve().parent / "data" / "national_portal_unions_20261104.json"
    try:
        source = json.loads(source_path.read_text(encoding="utf-8"))
        records = source.get("records") or []
    except (OSError, ValueError, AttributeError):
        return {}

    candidates: dict[str, dict[str, str]] = {}
    for item in records:
        english_key = _normalize_english_label(item.get("upazila_name_en"))
        bengali = str(item.get("upazila_name_bn") or "").strip()
        bengali_key = normalize_location_label(bengali)
        if english_key and bengali_key:
            candidates.setdefault(english_key, {})[bengali_key] = bengali
    return {
        english_key: next(iter(labels.values()))
        for english_key, labels in candidates.items()
        if len(labels) == 1
    }


@lru_cache(maxsize=1)
def _official_location_overrides() -> dict[str, dict[str, str]]:
    source_path = Path(__file__).resolve().parent / "data" / "official_location_name_bn_overrides.json"
    try:
        source = json.loads(source_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"upazilas": {}, "dhaka_metro_locations": {}}
    return {
        "upazilas": source.get("upazilas") or {},
        "dhaka_metro_locations": source.get("dhaka_metro_locations") or {},
    }


def _with_official_admin_labels(table: str, row):
    if row is None:
        return None
    result = dict(row)
    if table in ("divisions", "districts"):
        official = _official_admin_labels().get(table, {}).get(str(result.get("code") or "").strip())
        if official:
            for field in ("name_bn", "name_en"):
                result[field] = official[field]
    elif table == "upazilas":
        code = str(result.get("code") or "").strip()
        overrides = _official_location_overrides()
        official_bn = (
            overrides["upazilas"].get(code)
            or overrides["dhaka_metro_locations"].get(code)
            or _official_upazila_labels().get(code)
            or _official_upazila_labels_by_name().get(_normalize_english_label(result.get("name_en")))
        )
        if official_bn:
            result["name_bn"] = official_bn
    elif table == "police_thanas":
        official_bn = _official_location_overrides()["dhaka_metro_locations"].get(str(result.get("code") or "").strip())
        if official_bn:
            result["name_bn"] = official_bn
    return result


def normalize_location_label(value: str | None) -> str:
    """Normalize formatting only; do not transliterate or guess aliases."""
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    return re.sub(r"[\W_]+", "", text, flags=re.UNICODE)


def _normalize_english_label(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).casefold()
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", "", text)


def _location_rows(connection, table: str, parent_column: str | None = None, parent_id=None):
    if table not in _LOCATION_TABLES:
        raise ValueError("Unsupported location table")
    if parent_column not in (None, "division_id", "district_id", "upazila_id", "police_thana_id"):
        raise ValueError("Unsupported location parent column")
    where = "WHERE is_active=TRUE"
    params = []
    if parent_column and parent_id is not None:
        where += f" AND {parent_column}=%s"
        params.append(parent_id)
    elif parent_column and parent_id is None:
        return []
    rows = connection.execute(
        f"SELECT id, code, name_bn, name_en, "
        f"{parent_column or 'NULL'} AS parent_id FROM {table} {where}",
        params,
    ).fetchall()
    return [_with_official_admin_labels(table, row) for row in rows]


def _match_location_row(rows, value: str | None):
    key = normalize_location_label(value)
    if not key:
        return None
    matches = {
        (row["id"], row["code"]): row
        for row in rows
        if key in {
            normalize_location_label(row.get("name_bn")),
            normalize_location_label(row.get("name_en")),
            normalize_location_label(row.get("code")),
        }
    }
    return next(iter(matches.values())) if len(matches) == 1 else None


def _location_row_by_id(connection, table: str, location_id, parent_column: str | None = None, parent_id=None):
    if table not in _LOCATION_TABLES:
        raise ValueError("Unsupported location table")
    where = "WHERE id=%s AND is_active=TRUE"
    params = [location_id]
    if parent_column and parent_id is not None:
        where += f" AND {parent_column}=%s"
        params.append(parent_id)
    row = connection.execute(
        f"SELECT id, code, name_bn, name_en, "
        f"{parent_column or 'NULL'} AS parent_id FROM {table} {where}",
        params,
    ).fetchone()
    return _with_official_admin_labels(table, row)


def _resolve_location_row(connection, table: str, label: str | None, location_id=None,
                          parent_column: str | None = None, parent_id=None):
    if location_id is not None:
        return _location_row_by_id(connection, table, location_id, parent_column, parent_id)
    return _match_location_row(_location_rows(connection, table, parent_column, parent_id), label)


def resolve_location_reference(connection, record: dict) -> dict:
    """Resolve a submitted or legacy record's names to unique catalog IDs.

    Legacy text is accepted only when it matches one active bilingual catalog
    label/code within its known parent. Ambiguous or unlisted names remain
    unresolved and must not be treated as a location mismatch.
    """
    division = _resolve_location_row(
        connection, "divisions", record.get("division"), record.get("division_id")
    )
    division_id = division.get("id") if division else record.get("division_id")

    district = _resolve_location_row(
        connection, "districts", record.get("district"), record.get("district_id"),
        "division_id" if division_id is not None else None, division_id,
    )
    if district and division is None and district.get("parent_id") is not None:
        division = _location_row_by_id(connection, "divisions", district.get("parent_id"))
    district_id = district.get("id") if district else record.get("district_id")

    explicit_location_id = record.get("location_id")
    location_type = record.get("location_type")
    if record.get("upazila_id") is not None:
        explicit_location_id, location_type = record.get("upazila_id"), "upazila"
    elif record.get("police_thana_id") is not None:
        explicit_location_id, location_type = record.get("police_thana_id"), "police_thana"

    location = None
    if location_type == "upazila":
        location = _resolve_location_row(
            connection, "upazilas", record.get("upazila"), explicit_location_id,
            "district_id", district_id,
        )
    elif location_type == "police_thana":
        location = _resolve_location_row(
            connection, "police_thanas", record.get("upazila"), explicit_location_id,
            "district_id", district_id,
        )
    elif district_id is not None:
        candidates = []
        for table in ("upazilas", "police_thanas"):
            rows = _location_rows(connection, table, "district_id", district_id)
            if explicit_location_id is not None:
                matches = [row for row in rows if str(row["id"]) == str(explicit_location_id)]
            else:
                key = normalize_location_label(record.get("upazila"))
                matches = [row for row in rows if key and key in {
                    normalize_location_label(row.get("name_bn")),
                    normalize_location_label(row.get("name_en")),
                    normalize_location_label(row.get("code")),
                }]
            candidates.extend((table, row) for row in matches)
        if len(candidates) == 1:
            location_type, location = candidates[0]
            location_type = "upazila" if location_type == "upazilas" else "police_thana"

    if location and district is None and not record.get("district") and location.get("parent_id") is not None:
        district = _location_row_by_id(connection, "districts", location.get("parent_id"))
        if district and division is None and district.get("parent_id") is not None:
            division = _location_row_by_id(connection, "divisions", district.get("parent_id"))
        district_id = district.get("id") if district else None

    location_id = location.get("id") if location else explicit_location_id
    mouza = None
    if (
        location_id is not None
        and location_type in {"upazila", "police_thana"}
        and record.get("mouza_input_mode") != "manual"
    ):
        parent_column = "upazila_id" if location_type == "upazila" else "police_thana_id"
        mouza = _resolve_location_row(
            connection, "mouzas", record.get("mouza"), record.get("mouza_id"),
            parent_column, location_id,
        )

    return {
        "division": division,
        "district": district,
        "location": location,
        "location_type": location_type if location else None,
        "mouza": mouza,
        "division_id": division.get("id") if division else None,
        "district_id": district.get("id") if district else None,
        "location_id": location.get("id") if location else None,
        "mouza_id": mouza.get("id") if mouza else None,
    }


def resolve_union_reference(connection, upazila_id, label: str | None = None, union_id=None):
    """Resolve an official Union by ID or one exact bilingual label in an Upazila."""
    if union_id is not None:
        return connection.execute(
            """SELECT id, code, name_bn, name_en, upazila_id AS parent_id
               FROM admin_unions WHERE id=%s AND upazila_id=%s AND is_active=TRUE""",
            (union_id, upazila_id),
        ).fetchone()
    if upazila_id is None or not normalize_location_label(label):
        return None
    rows = connection.execute(
        """SELECT id, code, name_bn, name_en, upazila_id AS parent_id
           FROM admin_unions WHERE upazila_id=%s AND is_active=TRUE""",
        (upazila_id,),
    ).fetchall()
    return _match_location_row(rows, label)


def coverage_status() -> dict:
    with engine.conn() as connection:
        row = connection.execute(
            """SELECT DISTINCT ON (dataset_key)
                      dataset_key, dataset_version, source_url, retrieved_at, status,
                      record_counts, coverage_notes, created_at, id
               FROM location_dataset_imports
               ORDER BY dataset_key, created_at DESC, id DESC"""
        ).fetchall()
    if not row:
        return {"status": "unavailable", "dataset": None}
    latest = sorted(row, key=lambda item: (item["created_at"], item["id"]), reverse=True)
    record_counts = {}
    for item in latest:
        record_counts.update(item["record_counts"] or {})
    status = "complete" if latest and all(item["status"] == "complete" for item in latest) else "partial"
    newest = latest[0]
    return {
        "status": status,
        "dataset": {
            "key": newest["dataset_key"],
            "version": newest["dataset_version"],
            "source_url": newest["source_url"],
            "retrieved_at": newest["retrieved_at"].isoformat() if newest["retrieved_at"] else None,
            "record_counts": record_counts,
            "notes": " ".join(item["coverage_notes"] for item in latest if item["coverage_notes"]),
            "sources": [
                {"key": item["dataset_key"], "version": item["dataset_version"], "source_url": item["source_url"]}
                for item in latest
            ],
        },
    }


def list_divisions(query: str = "", limit: int = 50) -> list[dict]:
    pattern = f"%{query.strip()}%"
    with engine.conn() as connection:
        rows = connection.execute(
            """SELECT id, code, name_bn, name_en
               FROM divisions
               WHERE is_active=TRUE
                 AND (%s='' OR name_bn ILIKE %s OR COALESCE(name_en, '') ILIKE %s OR code ILIKE %s)
               ORDER BY name_bn, code LIMIT %s""",
            (query.strip(), pattern, pattern, pattern, limit),
        ).fetchall()
    return [_with_official_admin_labels("divisions", row) for row in rows]


def list_districts(query: str = "", limit: int = 200, division_id: int | None = None) -> list[dict]:
    pattern = f"%{query.strip()}%"
    with engine.conn() as connection:
        rows = connection.execute(
            """SELECT d.id, d.code, d.name_bn, d.name_en,
                      v.id AS division_id, v.code AS division_code,
                      v.name_bn AS division_name_bn, v.name_en AS division_name_en
               FROM districts d
               JOIN divisions v ON v.id = d.division_id
               WHERE d.is_active = TRUE AND v.is_active = TRUE
                 AND (%s::bigint IS NULL OR d.division_id=%s)
                 AND (%s = '' OR COALESCE(d.name_bn, '') ILIKE %s OR COALESCE(d.name_en, '') ILIKE %s
                      OR d.code ILIKE %s)
               ORDER BY COALESCE(d.name_bn, d.name_en), d.code LIMIT %s""",
            (division_id, division_id, query.strip(), pattern, pattern, pattern, limit),
        ).fetchall()
    return [
        {
            **_with_official_admin_labels("districts", row),
            "division": _with_official_admin_labels("divisions", {
                "id": row["division_id"], "code": row["division_code"],
                "name_bn": row["division_name_bn"], "name_en": row["division_name_en"],
            }),
        }
        for row in rows
    ]


def district_exists(district_id: int) -> bool:
    with engine.conn() as connection:
        row = connection.execute(
            "SELECT id FROM districts WHERE id=%s AND is_active=TRUE", (district_id,)
        ).fetchone()
    return row is not None


def division_exists(division_id: int) -> bool:
    with engine.conn() as connection:
        row = connection.execute(
            "SELECT id FROM divisions WHERE id=%s AND is_active=TRUE", (division_id,)
        ).fetchone()
    return row is not None


def district_belongs_to_division(district_id: int, division_id: int) -> bool:
    with engine.conn() as connection:
        row = connection.execute(
            "SELECT 1 FROM districts WHERE id=%s AND division_id=%s AND is_active=TRUE",
            (district_id, division_id),
        ).fetchone()
    return row is not None


def parent_exists(parent_type: str, parent_id: int) -> bool:
    table = {"upazila": "upazilas", "police_thana": "police_thanas"}.get(parent_type)
    if not table:
        raise ValueError("Unsupported location parent type")
    with engine.conn() as connection:
        row = connection.execute(
            f"SELECT id FROM {table} WHERE id=%s AND is_active=TRUE", (parent_id,)
        ).fetchone()
    return row is not None


def list_district_children(table: str, district_id: int, query: str = "", limit: int = 300) -> list[dict]:
    if table not in {"upazilas", "police_thanas"}:
        raise ValueError("Unsupported location type")
    pattern = f"%{query.strip()}%"
    with engine.conn() as connection:
        rows = connection.execute(
            f"""SELECT id, district_id, code, name_bn, name_en
                FROM {table}
                WHERE district_id=%s AND is_active=TRUE
                  AND (%s='' OR name_bn ILIKE %s OR COALESCE(name_en, '') ILIKE %s OR code ILIKE %s)
                ORDER BY COALESCE(name_bn, name_en), code LIMIT %s""",
            (district_id, query.strip(), pattern, pattern, pattern, limit),
        ).fetchall()
    return [_with_official_admin_labels(table, row) for row in rows]


def list_mouzas(parent_type: str, parent_id: int, query: str = "", limit: int = 500) -> list[dict]:
    parent_column = {"upazila": "upazila_id", "police_thana": "police_thana_id"}.get(parent_type)
    if not parent_column:
        raise ValueError("Unsupported location parent type")
    pattern = f"%{query.strip()}%"
    with engine.conn() as connection:
        rows = connection.execute(
            f"""SELECT id, code, name_bn, name_en, {parent_column} AS parent_id
                FROM mouzas
                WHERE {parent_column}=%s AND is_active=TRUE
                  AND (%s='' OR name_bn ILIKE %s OR COALESCE(name_en, '') ILIKE %s OR code ILIKE %s)
                ORDER BY name_bn, code LIMIT %s""",
            (parent_id, query.strip(), pattern, pattern, pattern, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def list_upazila_unions(upazila_id: int, query: str = "", limit: int = 100) -> list[dict]:
    """Return official Union names linked to an active Upazila."""
    pattern = f"%{query.strip()}%"
    with engine.conn() as connection:
        rows = connection.execute(
            """SELECT id, code, name_bn, name_en
               FROM admin_unions
               WHERE upazila_id=%s AND is_active=TRUE
                 AND (%s='' OR name_bn ILIKE %s OR COALESCE(name_en, '') ILIKE %s OR code ILIKE %s)
               ORDER BY name_bn, code LIMIT %s""",
            (upazila_id, query.strip(), pattern, pattern, pattern, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def resolve_upazila_union(union_id: int, upazila_id: int) -> dict:
    """Validate that a selected official Union belongs to the selected Upazila."""
    with engine.conn() as connection:
        row = connection.execute(
            """SELECT id, code, name_bn, name_en
               FROM admin_unions
               WHERE id=%s AND upazila_id=%s AND is_active=TRUE""",
            (union_id, upazila_id),
        ).fetchone()
    if not row:
        raise LocationNotFound("Selected Union does not belong to the selected Upazila")
    return dict(row)


def get_district_hierarchy(district_id: int) -> dict:
    with engine.conn() as connection:
        district = connection.execute(
            """SELECT d.id, d.code, d.name_bn, d.name_en,
                      v.id AS division_id, v.code AS division_code,
                      v.name_bn AS division_name_bn, v.name_en AS division_name_en
               FROM districts d JOIN divisions v ON v.id=d.division_id
               WHERE d.id=%s AND d.is_active=TRUE AND v.is_active=TRUE""",
            (district_id,),
        ).fetchone()
    if not district:
        raise LocationNotFound("District not found")
    return {
        "id": district["id"], "code": district["code"],
        "name_bn": district["name_bn"], "name_en": district["name_en"],
        "division": {
            "id": district["division_id"], "code": district["division_code"],
            "name_bn": district["division_name_bn"], "name_en": district["division_name_en"],
        },
        "upazilas": list_district_children("upazilas", district_id),
        "police_thanas": list_district_children("police_thanas", district_id),
    }


def resolve_selection(
    district_id: int,
    location_type: str,
    location_id: int,
    mouza_id: int | None = None,
) -> dict:
    """Resolve canonical names and enforce all submitted parent-child links."""
    if location_type == "upazila":
        table, name_column, foreign_key = "upazilas", "upazila_id", "upazila_id"
    elif location_type == "police_thana":
        table, name_column, foreign_key = "police_thanas", "police_thana_id", "police_thana_id"
    else:
        raise LocationNotFound("Unsupported location type")

    with engine.conn() as connection:
        district = connection.execute(
            """SELECT d.id, d.code, d.name_bn, d.name_en, d.division_id,
                      v.code AS division_code, v.name_bn AS division_name_bn,
                      v.name_en AS division_name_en
               FROM districts d
               JOIN divisions v ON v.id=d.division_id AND v.is_active=TRUE
               WHERE d.id=%s AND d.is_active=TRUE""",
            (district_id,),
        ).fetchone()
        if not district:
            raise LocationNotFound("Selected district is not available")

        location = connection.execute(
            f"""SELECT id, district_id, code, name_bn, name_en
                FROM {table} WHERE id=%s AND district_id=%s AND is_active=TRUE""",
            (location_id, district_id),
        ).fetchone()
        if not location:
            raise LocationNotFound("Selected Upazila/Thana does not belong to the selected district")

        mouza = None
        if mouza_id is not None:
            mouza = connection.execute(
                f"""SELECT id, code, name_bn, name_en, {foreign_key} AS parent_id
                    FROM mouzas WHERE id=%s AND {foreign_key}=%s AND is_active=TRUE""",
                (mouza_id, location_id),
            ).fetchone()
            if not mouza:
                raise LocationNotFound("Selected Mouza does not belong to the selected Upazila/Thana")

    return {
        "division_id": district["division_id"],
        "division": district["division_name_bn"] or district["division_name_en"],
        "division_name_en": district["division_name_en"],
        "district_id": district["id"], "district": district["name_bn"] or district["name_en"],
        "district_name_en": district["name_en"],
        "location_type": location_type,
        "location_id": location["id"], "location": location["name_bn"] or location["name_en"],
        "location_name_en": location["name_en"],
        "upazila_id": location["id"] if location_type == "upazila" else None,
        "police_thana_id": location["id"] if location_type == "police_thana" else None,
        "mouza_id": mouza["id"] if mouza else None,
        "mouza": (mouza["name_bn"] or mouza["name_en"]) if mouza else "",
        "mouza_name_en": mouza["name_en"] if mouza else None,
    }
