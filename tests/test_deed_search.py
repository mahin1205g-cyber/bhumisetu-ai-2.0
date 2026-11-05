import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import deed_search as ds  # noqa: E402

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)


def demo_row(**overrides):
    row = {
        "id": 1,
        "deed_no": "D-1001",
        "reg_year": 2025,
        "district": "ঢাকা",
        "upazila": "মিরপুর",
        "mouza": "পাইকপাড়া",
        "plot_id": "DHK-MIR-001",
        "khatian_no": "BS-1045",
        "seller_name": "রহিম উদ্দিন",
        "buyer_name": "করিম হোসেন",
        "area": 5.0,
        "price": 2400000,
        "sub_registry_office": "মিরপুর সাব-রেজিস্ট্রি অফিস",
        "reg_date": "2025-01-10",
    }
    row.update(overrides)
    return row


def fake_conn(rows=None, total=0):
    calls = []

    class Cursor:
        def execute(self, sql, params=()):
            calls.append((sql, tuple(params)))
            return self

        def fetchone(self):
            return {"n": total}

        def fetchall(self):
            return rows or []

    class Context:
        def __enter__(self):
            return Cursor()

        def __exit__(self, *exc):
            return False

    return (lambda: Context()), calls


def test_bengali_and_english_digits_are_normalized():
    assert ds.normalize_digits("ডি-১০০১/২০২৫") == "ডি-1001/2025"
    assert ds.normalize_deed_number(" d-১০০১  ") == "D-1001"
    assert ds.normalize_deed_number("D - 1001") == "D-1001"


def test_partial_search_text_collapses_spaces_and_digits():
    assert ds.normalize_text("  পাইকপাড়া   ১০২ ") == "পাইকপাড়া 102"
    assert ds.like_pattern(" 100%_\\ ") == "%100%"


def test_bengali_duration_label():
    label = ds.format_duration_bn(5 * 3600)
    assert "৫" not in label
    assert "5 ঘণ্টা" in label
    assert "মিনিট" in ds.format_duration_bn(5 * 3600 + 30 * 60)
    assert ds.format_duration_bn(42) == "42 সেকেন্ড"


def test_seven_failures_create_five_hour_lock(monkeypatch):
    monkeypatch.setattr(ds, "utc_now", lambda: NOW)
    failures, locked_until = 0, None
    for attempt in range(1, 8):
        failures, locked_until = ds.apply_failure(failures, locked_until, NOW)
        if attempt < 7:
            assert locked_until is None
            assert failures == attempt
    assert failures == ds.FAILED_ATTEMPT_LIMIT
    assert locked_until == NOW + timedelta(hours=5)
    assert ds.remaining_seconds(locked_until) == 5 * 3600


def test_active_lock_is_not_extended_by_new_failures():
    _, locked_until = ds.apply_failure(6, None, NOW)
    failures, same_lock = ds.apply_failure(ds.FAILED_ATTEMPT_LIMIT, locked_until, NOW + timedelta(hours=1))
    assert failures == ds.FAILED_ATTEMPT_LIMIT
    assert same_lock == locked_until


def test_expired_lock_resets_counter_before_new_failure():
    _, locked_until = ds.apply_failure(6, None, NOW)
    failures, new_lock = ds.apply_failure(ds.FAILED_ATTEMPT_LIMIT, locked_until, NOW + timedelta(hours=5, seconds=1))
    assert failures == 1
    assert new_lock is None


def test_counter_restarts_after_success_reset():
    assert ds.apply_failure(0, None, NOW) == (1, None)


def test_lock_payload_contains_required_bengali_message(monkeypatch):
    monkeypatch.setattr(ds, "utc_now", lambda: NOW)
    payload = ds._lock_payload(NOW + timedelta(hours=5), 7)
    assert payload["locked"] is True
    assert payload["lock_hours"] == 5
    assert payload["remaining_seconds"] == 5 * 3600
    assert "৭ বার" in payload["message_bn"]
    assert "৫ ঘণ্টা" in payload["message_bn"]
    assert payload["advanced_search_allowed"] is True
    assert "নয়" in ds.SCOPE_NOTE_BN


def test_anonymous_users_never_see_party_names():
    fields = ds.public_deed_fields(demo_row(), None)
    assert "seller_name" not in fields
    assert "buyer_name" not in fields
    assert "price" not in fields
    assert fields["deed_no"] == "D-1001"


def test_citizen_sees_masked_parties_but_not_price():
    fields = ds.public_deed_fields(demo_row(), "citizen")
    assert fields["seller_name"] == "র••• উ•••"
    assert fields["buyer_name"] == "ক••• হ•••"
    assert "price" not in fields


def test_officer_sees_full_parties_and_price():
    fields = ds.public_deed_fields(demo_row(), "officer")
    assert fields["seller_name"] == "রহিম উদ্দিন"
    assert fields["buyer_name"] == "করিম হোসেন"
    assert fields["price"] == 2400000


def test_missing_fields_are_not_invented():
    fields = ds.public_deed_fields(demo_row(deed_no="D-9999", reg_year=2024, mouza=None), "officer")
    assert "mouza" not in fields
    assert "deed_type" not in fields
    assert fields["deed_no"] == "D-9999"


def test_demo_records_are_flagged_honestly():
    assert ds.is_demo_record(demo_row()) is True
    assert ds.is_demo_record(demo_row(deed_no="REAL-77", reg_year=2024)) is False
    assert ds.public_deed_fields(demo_row(), "citizen")["is_synthetic_demo_record"] is True


def test_deed_number_lookup_is_parameterized(monkeypatch):
    conn, calls = fake_conn(rows=[demo_row()])
    monkeypatch.setattr(ds, "ensure_protection_schema", lambda: None)
    monkeypatch.setattr(ds.engine, "conn", conn)

    rows = ds.lookup_by_deed_number("d-১০০১")
    assert len(rows) == 1
    exact_sql, exact_params = calls[0]
    normalized_sql, normalized_params = calls[1]
    assert "WHERE deed_no = %s" in exact_sql
    assert exact_params == ("d-১০০১",)
    assert "IS DISTINCT FROM %s" in normalized_sql
    assert normalized_params == ("D-1001", "d-১০০১")


def test_deed_number_lookup_merges_normalized_duplicates(monkeypatch):
    exact = demo_row(id=1, deed_no="D-1001")
    alternate = demo_row(id=2, deed_no="d - ১০০১")

    class Cursor:
        current_sql = ""

        def execute(self, sql, params=()):
            self.current_sql = sql
            return self

        def fetchall(self):
            return [alternate] if "IS DISTINCT FROM %s" in self.current_sql else [exact]

    class Context:
        def __enter__(self):
            return Cursor()

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(ds, "ensure_protection_schema", lambda: None)
    monkeypatch.setattr(ds.engine, "conn", lambda: Context())

    rows = ds.lookup_by_deed_number("D-1001")
    assert [row["id"] for row in rows] == [2, 1]


def test_empty_deed_number_never_queries_database(monkeypatch):
    def explode():
        raise AssertionError("database must not be queried")

    monkeypatch.setattr(ds, "ensure_protection_schema", lambda: None)
    monkeypatch.setattr(ds.engine, "conn", explode)
    assert ds.lookup_by_deed_number("   ") == []


def test_advanced_search_is_parameterized_and_paginated(monkeypatch):
    conn, calls = fake_conn(rows=[demo_row()], total=1)
    monkeypatch.setattr(ds, "ensure_protection_schema", lambda: None)
    monkeypatch.setattr(ds.engine, "conn", conn)

    result = ds.search_deeds(
        {"deed_no": "d-1001", "district": "ঢাকা", "seller_name": "রহিম", "reg_year": "২০২৫"},
        page=2,
        page_size=999,
    )
    assert result["page"] == 2
    assert result["page_size"] == ds.MAX_PAGE_SIZE
    assert result["total"] == 1
    assert len(calls) == 2

    select_sql, select_params = calls[-1]
    assert "district" not in select_sql.split("WHERE")[0]
    assert "ঢাকা" not in select_sql and "রহিম" not in select_sql
    assert select_params == ("D-1001", 2025, "%ঢাকা%", "%রহিম%", ds.MAX_PAGE_SIZE, ds.MAX_PAGE_SIZE)
    assert "LIMIT %s OFFSET %s" in select_sql


def test_untrusted_forwarded_header_cannot_spoof_client_ip():
    class Headers(dict):
        def get(self, key, default=None):
            return dict.get(self, key.lower(), default)

    class Request:
        client = type("C", (), {"host": "10.0.0.9"})()

        def __init__(self):
            self.headers = Headers({
                "x-real-ip": "203.0.113.7",
                "x-forwarded-for": "1.2.3.4, 203.0.113.7",
            })

    assert ds.client_ip(Request()) == "203.0.113.7"


def test_session_token_is_reused_only_when_well_formed():
    assert ds.issue_session_token("a" * 48) == "a" * 48
    replacement = ds.issue_session_token("attacker-chosen")
    assert len(replacement) == 48
    assert ds.issue_session_token(None) != replacement


def test_secure_cookie_defaults_follow_deployment(monkeypatch):
    monkeypatch.delenv("COOKIE_SECURE", raising=False)
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("VERCEL", raising=False)
    assert ds.cookie_secure() is False

    monkeypatch.setenv("APP_ENV", "production")
    assert ds.cookie_secure() is True

    monkeypatch.delenv("APP_ENV")
    monkeypatch.setenv("VERCEL", "1")
    assert ds.cookie_secure() is True

    monkeypatch.setenv("COOKIE_SECURE", "0")
    assert ds.cookie_secure() is False


def test_search_lock_requires_only_repeated_evidence_not_identity_input():
    subjects_anonymous = ds._subjects(None, "b" * 48, "203.0.113.7")
    assert subjects_anonymous[0] == ("session", "b" * 48)
    assert subjects_anonymous[1][0] == "ip"

    subjects_user = ds._subjects(42, "c" * 48, "203.0.113.7")
    assert ("user", "42") in subjects_user


def test_negative_page_values_are_clamped(monkeypatch):
    conn, _ = fake_conn(rows=[], total=0)
    monkeypatch.setattr(ds, "ensure_protection_schema", lambda: None)
    monkeypatch.setattr(ds.engine, "conn", conn)
    result = ds.search_deeds({"district": "ঢাকা"}, page=-3, page_size=-5)
    assert result["page"] == 1
    assert result["page_size"] == 1
