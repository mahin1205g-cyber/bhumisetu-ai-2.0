import pytest
from fastapi import HTTPException

from backend import main


class _Result:
    def __init__(self, row):
        self.row = row

    def fetchone(self):
        return self.row

    def fetchall(self):
        return self.rows if hasattr(self, "rows") else []


class _NoAssignmentConnection:
    def execute(self, sql, params=()):
        assert "information_schema.columns" in sql
        assert params == ("mutation_applications", "assigned_officer_id")
        return _Result({"available": False})


def test_officer_unified_query_fails_closed_without_assignment_columns():
    sql, params = main._unified_application_query(
        None,
        include_deed_digitization=True,
        officer_id=42,
        mutation_has_assignment=False,
        deed_has_assignment=False,
    )

    assert "AND FALSE" in sql
    assert sql.count("AND FALSE") == 2
    assert params == []


def test_officer_unified_query_filters_each_workflow_by_assigned_officer():
    sql, params = main._unified_application_query(
        None,
        include_deed_digitization=True,
        officer_id=42,
        mutation_has_assignment=True,
        deed_has_assignment=True,
    )

    assert "m.assigned_officer_id = %s" in sql
    assert "a.assigned_officer_id = %s" in sql
    assert params == [42, 42]


def test_assignment_guard_rejects_officers_when_schema_has_no_assignment_scope():
    with pytest.raises(HTTPException) as error:
        main._require_officer_assignment(
            _NoAssignmentConnection(), "mutation_applications", "tracking_no", "M-123", 42,
        )

    assert error.value.status_code == 403
    assert "assignments are not configured" in error.value.detail


@pytest.mark.parametrize(
    "endpoint,args",
    [
        (main.get_my_unified_application_history, {}),
        (main.get_my_application_by_tracking_id, {"tracking_id": "BHM-DIG-2026-000001"}),
    ],
)
def test_staff_cannot_use_citizen_history_or_owner_tracking_lookup(monkeypatch, endpoint, args):
    monkeypatch.setattr(
        main,
        "extract_user_from_auth_header",
        lambda _authorization: {"id": 10, "role": "admin", "name": "Admin"},
    )

    with pytest.raises(HTTPException) as error:
        endpoint(**args, authorization="Bearer test")

    assert error.value.status_code == 403


def test_mutation_assignment_requires_admin_before_database_access(monkeypatch):
    monkeypatch.setattr(
        main,
        "extract_user_from_auth_header",
        lambda _authorization: {"id": 9, "role": "officer", "name": "Officer"},
    )

    with pytest.raises(HTTPException) as error:
        main.assign_mutation_application(
            "MUT-2026-DHK-0001",
            main.MutationAssignmentRequest(officer_id=9),
            authorization="Bearer test",
        )

    assert error.value.status_code == 403
    assert "Only admins" in error.value.detail


class _StaffHistoryConnection:
    def __init__(self):
        self.statements = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql, params=()):
        self.statements.append((sql, params))
        if "to_regclass('public.deed_digitization_applications')" in sql:
            return _Result({"available": True})
        if "information_schema.columns" in sql:
            return _Result({"available": True})
        if "COUNT(*) FILTER" in sql:
            return _Result({"total": 3, "pending": 1, "under_review": 1, "completed": 1, "closed": 0})
        if "SELECT COUNT(*) AS total FROM (" in sql:
            return _Result({"total": 1})
        if "SELECT * FROM (" in sql:
            result = _Result(None)
            result.rows = [{
                "application_type": "mutation",
                "application_id": "17",
                "tracking_id": "MUT-CITIZEN-17",
                "applicant_name": "Other Citizen",
                "applicant_username": "citizen_17",
                "status": "submitted",
            }]
            return result
        raise AssertionError(f"Unexpected query in staff history test: {sql}")


@pytest.mark.parametrize("role", ["officer", "admin"])
def test_staff_history_lists_all_users_without_officer_assignment_filter(monkeypatch, role):
    connection = _StaffHistoryConnection()
    monkeypatch.setattr(
        main,
        "extract_user_from_auth_header",
        lambda _authorization: {"id": 9 if role == "officer" else 10, "role": role, "name": role.title()},
    )
    monkeypatch.setattr(main.engine, "conn", lambda: connection)

    result = main.get_staff_application_history(
        page=1, page_size=20, application_type="all", application_status=None, q="",
        date_field="submitted", date_from=None, date_to=None, sort="latest", authorization="Bearer staff",
    )

    assert result["total"] == 1
    assert result["items"][0]["applicant_name"] == "Other Citizen"
    list_query = next(sql for sql, _params in connection.statements if "SELECT * FROM (" in sql)
    assert "m.assigned_officer_id = %s" not in list_query
    assert "a.assigned_officer_id = %s" not in list_query
    assert "AND m.user_id = %s" not in list_query
    assert "AND a.owner_user_id = %s" not in list_query


class _StaffDetailConnection:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql, params=()):
        if "FROM mutation_applications m LEFT JOIN users" in sql:
            return _Result({
                "id": 17,
                "tracking_no": "MUT-CITIZEN-17",
                "user_id": 8,
                "applicant_name": "Other Citizen",
                "applicant_nid": "1234567890",
                "supporting_docs": "[]",
                "status": "Submitted",
                "created_at": "2026-11-12T10:00:00",
                "updated_at": "2026-11-12T10:00:00",
                "account_username": "citizen_17",
            })
        if "FROM mutation_status_history" in sql:
            result = _Result(None)
            result.rows = [{"status": "Submitted", "actor_name": "Other Citizen", "actor_role": "citizen"}]
            return result
        raise AssertionError(f"Unexpected query in staff detail test: {sql}")


@pytest.mark.parametrize("role", ["officer", "admin"])
def test_staff_can_open_another_users_application_detail_and_timeline(monkeypatch, role):
    monkeypatch.setattr(
        main,
        "extract_user_from_auth_header",
        lambda _authorization: {"id": 9 if role == "officer" else 10, "role": role, "name": role.title()},
    )
    monkeypatch.setattr(main.engine, "conn", _StaffDetailConnection)

    result = main.get_staff_application_history_detail("MUT-CITIZEN-17", authorization="Bearer staff")

    assert result["applicant_name"] == "Other Citizen"
    assert result["applicant_username"] == "citizen_17"
    assert result["timeline"][0]["status"] == "Submitted"
    assert "applicant_nid" not in result["details"]


@pytest.mark.parametrize(
    "endpoint,args",
    [
        (main.get_staff_application_history, {"page": 1, "page_size": 20, "application_type": "all", "q": ""}),
        (main.get_staff_application_history_detail, {"tracking_id": "MUT-CITIZEN-17"}),
    ],
)
def test_citizens_cannot_use_system_wide_staff_history(monkeypatch, endpoint, args):
    monkeypatch.setattr(
        main,
        "extract_user_from_auth_header",
        lambda _authorization: {"id": 8, "role": "citizen", "name": "Citizen"},
    )

    with pytest.raises(HTTPException) as error:
        endpoint(**args, authorization="Bearer citizen")

    assert error.value.status_code == 403
