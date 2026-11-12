import base64
import json
import sys
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException, Response
from starlette.requests import Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import main


def test_access_token_is_signed_and_looks_up_current_user(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-only-secret-with-enough-entropy")
    expected = {"id": 7, "name": "Test Citizen", "role": "citizen"}
    monkeypatch.setattr(main.engine, "get_user_by_id", lambda user_id: expected if user_id == 7 else None)
    token = main.issue_access_token(7)

    assert main.extract_user_from_auth_header(f"Bearer {token}") == expected
    assert main.extract_user_from_auth_header("Bearer lg-token-7-forged") is None
    assert main.extract_user_from_auth_header(f"Bearer {token}x") is None


def test_expired_access_token_is_rejected(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-only-secret-with-enough-entropy")
    monkeypatch.setattr(main.time, "time", lambda: 2_000_000_000)
    payload = base64.urlsafe_b64encode(json.dumps({"sub": 7, "exp": 1}).encode()).rstrip(b"=").decode()
    import hashlib
    import hmac

    signature = base64.urlsafe_b64encode(
        hmac.new(b"test-only-secret-with-enough-entropy", payload.encode(), hashlib.sha256).digest()
    ).rstrip(b"=").decode()
    assert main.extract_user_from_auth_header(f"Bearer {payload}.{signature}") is None


def test_password_reset_auth_version_invalidates_old_token(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-only-secret-with-enough-entropy")
    token = main.issue_access_token(7, auth_version=0)
    monkeypatch.setattr(main.engine, "get_user_by_id", lambda _: {"id": 7, "role": "admin", "auth_version": 1})
    assert main.extract_user_from_auth_header(f"Bearer {token}") is None


@pytest.mark.parametrize("role", ["citizen", "officer", "admin"])
def test_session_access_token_uses_current_database_role(monkeypatch, role):
    monkeypatch.setenv("JWT_SECRET", "test-only-secret-with-enough-entropy")
    expected = {"id": 8, "name": "Current User", "role": role, "auth_version": 3}
    monkeypatch.setattr(main.engine, "get_user_by_auth_session", lambda session_id: expected if session_id == "session-8" else None)
    token = main.issue_access_token(8, 3, session_id="session-8")

    assert main.extract_user_from_auth_header(f"Bearer {token}") == expected
    monkeypatch.setattr(main.engine, "get_user_by_auth_session", lambda _: None)
    assert main.extract_user_from_auth_header(f"Bearer {token}") is None


def test_login_issues_secure_persistent_refresh_cookie(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-only-secret-with-enough-entropy")
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setattr(main, "_create_auth_session", lambda user_id, auth_version: ("session-5", "refresh-secret"))
    response = Response()

    token = main._issue_login_access_token(
        {"id": 5, "auth_version": 2}, _request("/api/auth/login"), response
    )

    assert main._verified_access_payload(f"Bearer {token}")["sid"] == "session-5"
    cookie_header = response.headers["set-cookie"].lower()
    assert "httponly" in cookie_header
    assert "secure" in cookie_header
    assert "samesite=none" in cookie_header
    assert "max-age=2592000" in cookie_header


def test_valid_legacy_access_token_is_upgraded_to_refresh_cookie(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-only-secret-with-enough-entropy")
    user = {"id": 12, "role": "citizen", "auth_version": 0}
    monkeypatch.setattr(main.engine, "get_user_by_id", lambda user_id: user if user_id == 12 else None)
    monkeypatch.setattr(main, "_create_auth_session", lambda user_id, auth_version: ("upgraded-session", "new-refresh"))
    old_token = main.issue_access_token(12)
    response = Response()

    result = main.refresh_auth_session(
        _request("/api/auth/refresh"), response, f"Bearer {old_token}", None
    )

    assert main._verified_access_payload(f"Bearer {result['token']}")["sid"] == "upgraded-session"
    assert "httponly" in response.headers["set-cookie"].lower()


class SessionResult:
    def __init__(self, row=None):
        self.row = row

    def fetchone(self):
        return self.row


class RefreshSessionDB:
    def __init__(self, row):
        self.row = row
        self.queries = []

    def execute(self, query, params=()):
        self.queries.append((query, params))
        if "FROM auth_sessions s JOIN users" in query:
            token_hash = params[0]
            if self.row and token_hash in (self.row["refresh_token_hash"], self.row["previous_refresh_token_hash"]):
                return SessionResult(dict(self.row))
            return SessionResult()
        if "SET previous_refresh_token_hash=refresh_token_hash" in query:
            self.row["previous_refresh_token_hash"] = self.row["refresh_token_hash"]
            self.row["refresh_token_hash"] = params[0]
            self.row["previous_rotated_at"] = datetime.now(timezone.utc)
            return SessionResult()
        if "SET revoked_at=COALESCE" in query:
            return SessionResult()
        raise AssertionError(f"Unexpected SQL: {query}")


def _request(path):
    return Request({
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    })


def _install_session_db(monkeypatch, db):
    @contextmanager
    def conn():
        yield db

    monkeypatch.setattr(main.engine, "conn", conn)


def test_refresh_rotates_httponly_cookie_and_access_token(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-only-secret-with-enough-entropy")
    old_cookie = "original-refresh-secret"
    db = RefreshSessionDB({
        "session_id": "session-1",
        "user_id": 9,
        "auth_version": 2,
        "current_auth_version": 2,
        "refresh_token_hash": main._refresh_token_hash(old_cookie),
        "previous_refresh_token_hash": None,
        "previous_rotated_at": None,
        "revoked_at": None,
        "expired": False,
    })
    _install_session_db(monkeypatch, db)

    response = Response()
    result = main.refresh_auth_session(_request("/api/auth/refresh"), response, None, old_cookie)

    assert result["success"] is True
    assert db.row["previous_refresh_token_hash"] == main._refresh_token_hash(old_cookie)
    assert db.row["refresh_token_hash"] != main._refresh_token_hash(old_cookie)
    assert main._verified_access_payload(f"Bearer {result['token']}")["sid"] == "session-1"
    cookie_header = response.headers["set-cookie"].lower()
    assert "httponly" in cookie_header
    assert "path=/api/auth" in cookie_header


def test_refresh_rejects_invalid_and_recently_rotated_tokens_without_dropping_new_cookie(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-only-secret-with-enough-entropy")
    recent_db = RefreshSessionDB({
        "session_id": "session-2",
        "user_id": 10,
        "auth_version": 1,
        "current_auth_version": 1,
        "refresh_token_hash": main._refresh_token_hash("current-cookie"),
        "previous_refresh_token_hash": main._refresh_token_hash("old-cookie"),
        "previous_rotated_at": datetime.now(timezone.utc),
        "revoked_at": None,
        "expired": False,
    })
    _install_session_db(monkeypatch, recent_db)
    response = Response()
    with pytest.raises(HTTPException) as rotated:
        main.refresh_auth_session(_request("/api/auth/refresh"), response, None, "old-cookie")
    assert rotated.value.status_code == 409
    assert "set-cookie" not in response.headers

    invalid_db = RefreshSessionDB(None)
    _install_session_db(monkeypatch, invalid_db)
    response = Response()
    with pytest.raises(HTTPException) as invalid:
        main.refresh_auth_session(_request("/api/auth/refresh"), response, None, "unknown-cookie")
    assert invalid.value.status_code == 401
    assert "max-age=0" in response.headers["set-cookie"].lower()


def test_explicit_logout_revokes_refresh_session_and_clears_cookie(monkeypatch):
    db = RefreshSessionDB(None)
    _install_session_db(monkeypatch, db)
    response = Response()

    result = main.logout_auth_session(_request("/api/auth/logout"), response, "refresh-cookie")

    assert result == {"success": True}
    revoke_query, params = db.queries[0]
    assert "UPDATE auth_sessions" in revoke_query
    assert params == (main._refresh_token_hash("refresh-cookie"),) * 2
    assert "max-age=0" in response.headers["set-cookie"].lower()
