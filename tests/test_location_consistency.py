import csv
import re
from pathlib import Path

from backend.engine import _classify_mouza_check
from backend.import_national_portal_unions import collect_unambiguous_upazila_labels
from backend.location_service import (
    _with_official_admin_labels,
    normalize_location_label,
    resolve_location_reference,
)


class LocationCatalogConnection:
    def __init__(self):
        self.rows = {
            "divisions": [
                {"id": 1, "code": "30", "name_bn": "ঢাকা", "name_en": "Dhaka"},
            ],
            "districts": [
                {"id": 10, "code": "3026", "name_bn": "ঢাকা", "name_en": "Dhaka", "division_id": 1},
            ],
            "upazilas": [
                {"id": 100, "code": "302626", "name_bn": "মিরপুর", "name_en": "Mirpur", "district_id": 10},
            ],
            "police_thanas": [],
            "mouzas": [
                {"id": 1000, "code": "JL-17", "name_bn": "পাইকপাড়া", "name_en": "Paikpara", "upazila_id": 100},
            ],
        }

    def execute(self, sql, params=()):
        table_match = re.search(r"FROM\s+(divisions|districts|upazilas|police_thanas|mouzas)", sql, re.I)
        assert table_match, sql
        table = table_match.group(1).lower()
        parent_match = re.search(r"AND\s+(division_id|district_id|upazila_id|police_thana_id)=%s", sql, re.I)
        id_match = re.search(r"WHERE\s+id=%s", sql, re.I)
        filtered = list(self.rows[table])
        if id_match:
            filtered = [row for row in filtered if row["id"] == params[0]]
        if parent_match:
            parent_column = parent_match.group(1).lower()
            parent_id = params[-1] if id_match else params[0]
            filtered = [row for row in filtered if row.get(parent_column) == parent_id]
        if "AS parent_id" in sql:
            parent_column = re.search(r"(division_id|district_id|upazila_id|police_thana_id)\s+AS parent_id", sql, re.I)
            parent_name = parent_column.group(1).lower() if parent_column else None
            filtered = [
                {**row, "parent_id": row.get(parent_name) if parent_name else None}
                for row in filtered
            ]
        return _Rows(filtered)


class _Rows:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.rows[0] if self.rows else None


def test_location_label_normalization_keeps_bengali_characters():
    assert normalize_location_label(" ঢাকা ") == normalize_location_label("ঢাকা")
    assert normalize_location_label("ঢাকা") != normalize_location_label("Dhaka")


def test_legacy_english_record_resolves_to_same_location_ids_as_bengali_selection():
    connection = LocationCatalogConnection()
    submitted = resolve_location_reference(connection, {
        "division_id": 1,
        "district_id": 10,
        "location_id": 100,
        "location_type": "upazila",
        "mouza_id": 1000,
    })
    recorded = resolve_location_reference(connection, {
        "division": "Dhaka",
        "district": "Dhaka",
        "upazila": "Mirpur",
        "mouza": "Paikpara",
    })
    assert submitted["district_id"] == recorded["district_id"] == 10
    assert submitted["location_id"] == recorded["location_id"] == 100
    assert submitted["mouza_id"] == recorded["mouza_id"] == 1000


def test_manual_mouza_text_is_not_promoted_to_an_official_catalog_match():
    connection = LocationCatalogConnection()
    manual = resolve_location_reference(connection, {
        "division_id": 1,
        "district_id": 10,
        "location_id": 100,
        "location_type": "upazila",
        "mouza": "পাইকপাড়া",
        "mouza_input_mode": "manual",
    })

    assert manual["location_id"] == 100
    assert manual["mouza"] is None
    assert manual["mouza_id"] is None


def test_mouza_verification_keeps_catalog_ids_and_manual_text_distinct():
    assert _classify_mouza_check("catalog", "পাইকপাড়া", "পাইকপাড়া", True, True) == "MATCHED"
    assert _classify_mouza_check("catalog", "পাইকপাড়া", "পাইকপাড়া", True, False) == "MISMATCH"
    assert _classify_mouza_check("catalog", "পাইকপাড়া", "পাইকপাড়া", True, None) == "UNAVAILABLE"
    assert _classify_mouza_check("manual", "  পাইকপাড়া ", "পাইকপাড়া", True, None) == "MATCHED"
    assert _classify_mouza_check("manual", "অন্য মৌজা", "পাইকপাড়া", True, None) == "MISMATCH"
    assert _classify_mouza_check("manual", "পাইকপাড়া", "পাইকপাড়া", False, None) == "MATCHED"


def test_official_snapshot_bridges_missing_district_translation_without_db_write():
    connection = LocationCatalogConnection()
    connection.rows["districts"][0]["name_bn"] = None

    english = resolve_location_reference(connection, {"division": "Dhaka", "district": "Dhaka"})
    bengali = resolve_location_reference(connection, {"division": "ঢাকা", "district": "ঢাকা"})

    assert english["district_id"] == bengali["district_id"] == 10
    assert english["district"]["name_bn"] == bengali["district"]["name_bn"] == "ঢাকা"


def test_official_sources_supply_bengali_upazila_and_dhaka_thana_labels():
    dhamrai = _with_official_admin_labels("upazilas", {
        "id": 200, "code": "30260014", "name_bn": None, "name_en": "DHAMRAI",
    })
    dhamrai_legacy_code = _with_official_admin_labels("upazilas", {
        "id": 202, "code": "legacy-30260014", "name_bn": None, "name_en": "Dhamrai",
    })
    mirpur = _with_official_admin_labels("police_thanas", {
        "id": 201, "code": "30262548", "name_bn": None, "name_en": "Mirpur",
    })
    mirpur_upazila_catalog_row = _with_official_admin_labels("upazilas", {
        "id": 203, "code": "30262548", "name_bn": None, "name_en": "Mirpur",
    })
    adabor = _with_official_admin_labels("upazilas", {
        "id": 204, "code": "30262502", "name_bn": None, "name_en": "Adabor",
    })
    charfession = _with_official_admin_labels("upazilas", {
        "id": 205, "code": "10090025", "name_bn": None, "name_en": "Charfession",
    })

    assert dhamrai["name_bn"] == "ধামরাই"
    assert dhamrai_legacy_code["name_bn"] == "ধামরাই"
    assert mirpur["name_bn"] == "মিরপুর"
    assert mirpur_upazila_catalog_row["name_bn"] == "মিরপুর"
    assert adabor["name_bn"] == "আদাবর"
    assert charfession["name_bn"] == "চরফ্যাশন"


def test_official_district_snapshot_has_reviewed_bengali_labels():
    path = Path(__file__).resolve().parents[1] / "backend" / "data" / "dghs_admin_levels_0.5.0.csv"
    with path.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    districts = [row for row in rows if row["level"] == "district"]
    assert len(districts) == 64
    assert all(row["name_bn"].strip() for row in districts)
    assert len({row["code"] for row in districts}) == 64


def test_upazila_translations_skip_conflicting_source_labels():
    rows = [
        {"code": "union-a", "upazila_name_bn": "মিরপুর"},
        {"code": "union-b", "upazila_name_bn": "মিরপুর"},
        {"code": "union-c", "upazila_name_bn": "মীরপুর"},
        {"code": "union-d", "upazila_name_bn": "অন্য নাম"},
        {"code": "union-e", "upazila_name_bn": ""},
    ]
    labels = collect_unambiguous_upazila_labels(rows, {
        "union-a": 1, "union-b": 1, "union-c": 2, "union-d": 2, "union-e": 3,
    })
    assert labels == {1: "মিরপুর"}
