import base64
import json
import sys
from pathlib import Path

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
