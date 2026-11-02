import sys
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import main


class Result:
    def __init__(self, row=None):
        self.row = row

    def fetchone(self):
        return self.row


class LockoutStore:
    """Small in-memory stand-in for the PostgreSQL lockout table for unit tests."""

    def __init__(self, now=1_000):
        self.now = now
        self.rows = {}
        self.queries = []

    def execute(self, query, params):
        self.queries.append(query)
        feature, identity = params
        key = (feature, identity)
        if "VALUES(%s,%s,0)" in query:
            self.rows.setdefault(key, {"failed_attempt_count": 0, "locked_until": None})
            return Result()
        if query.lstrip().startswith("SELECT CEIL"):
            row = self.rows.get(key)
            if not row or not row["locked_until"] or row["locked_until"] <= self.now:
                return Result({"remaining_seconds": None})
            return Result({"remaining_seconds": row["locked_until"] - self.now})
        if "VALUES(%s,%s,1,NULL)" in query:
            row = self.rows.get(key)
            if row is None:
                row = {"failed_attempt_count": 1, "locked_until": None}
                self.rows[key] = row
            elif row["locked_until"] and row["locked_until"] > self.now:
                pass
            elif row["locked_until"] and row["locked_until"] <= self.now:
                row["failed_attempt_count"] = 1
                row["locked_until"] = None
            else:
                row["failed_attempt_count"] += 1
            if row["failed_attempt_count"] >= 5 and not row["locked_until"]:
                row["locked_until"] = self.now + 10 * 60 * 60
            remaining = max(0, row["locked_until"] - self.now) if row["locked_until"] else 0
            return Result({"failed_attempt_count": row["failed_attempt_count"], "remaining_seconds": remaining})
        if "SET failed_attempt_count=0" in query:
            row = self.rows[key]
            row["failed_attempt_count"] = 0
            row["locked_until"] = None
            return Result()
        raise AssertionError(f"Unexpected lockout SQL: {query}")


def test_recovery_phone_normalization():
    assert main._normalize_recovery_phone("01712345678") == ("01712345678", "8801712345678", "+8801712345678")
    assert main._normalize_recovery_phone("০১৭১২৩৪৫৬৭৮") == ("01712345678", "8801712345678", "+8801712345678")
    assert main._normalize_recovery_phone("+8801712345678")[2] == "+8801712345678"
    with pytest.raises(HTTPException):
        main._normalize_recovery_phone("017000")


def test_recovery_hash_requires_secret_and_is_stable(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "a" * 48)
    assert main._recovery_hash("identity:test") == main._recovery_hash("identity:test")
    assert main._recovery_hash("identity:test") != main._recovery_hash("identity:other")


def test_recovery_routes_have_no_otp():
    paths = {route.path for route in main.app.routes}
    assert "/api/auth/recovery/start" in paths
    assert "/api/auth/recovery/reset" in paths
    assert "/api/auth/recovery/username" in paths
    assert "/api/auth/recovery/verify-code" not in paths
    assert not hasattr(main, "_recovery_sms_config")


def test_user_a_lockout_never_blocks_user_b(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "a" * 48)
    store = LockoutStore()
    user_a = main._recovery_identity("forgot_password", "citizen_a", "01711111111", "1111111111")
    user_b = main._recovery_identity("forgot_password", "citizen_b", "01722222222", "2222222222")
    for _ in range(5):
        attempts, _ = main._record_recovery_failure(store, "forgot_password", user_a)
    assert attempts == 5
    assert main._recovery_lockout_remaining(store, "forgot_password", user_a) == 10 * 60 * 60
    assert main._recovery_lockout_remaining(store, "forgot_password", user_b) == 0
    assert all(len(identity_hash) == 64 for _, identity_hash in store.rows)
    assert "01711111111" not in repr(store.rows)
    assert "1111111111" not in repr(store.rows)


def test_known_username_alone_cannot_lock_the_real_identity(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "a" * 48)
    store = LockoutStore()
    real_identity = main._recovery_identity("forgot_password", "citizen_a", "01711111111", "1111111111")
    guessed_identity = main._recovery_identity("forgot_password", "citizen_a", "01799999999", "9999999999")
    for _ in range(5):
        main._record_recovery_failure(store, "forgot_password", guessed_identity)
    assert main._recovery_lockout_remaining(store, "forgot_password", guessed_identity) > 0
    assert main._recovery_lockout_remaining(store, "forgot_password", real_identity) == 0


def test_ip_burst_limit_is_scoped_to_identity_not_everyone_at_that_ip(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "a" * 48)
    user_a = main._recovery_identity("forgot_password", "rate-user-a", "01711111111", "1111111111")
    user_b = main._recovery_identity("forgot_password", "rate-user-b", "01722222222", "2222222222")
    for _ in range(main._RECOVERY_IP_MAX_REQUESTS):
        main._enforce_recovery_ip_rate_limit("shared-network", "forgot_password", user_a)
    with pytest.raises(HTTPException) as error:
        main._enforce_recovery_ip_rate_limit("shared-network", "forgot_password", user_a)
    assert error.value.status_code == 429
    # Same source address does not rate-limit another person's recovery identity.
    main._enforce_recovery_ip_rate_limit("shared-network", "forgot_password", user_b)


def test_forgot_password_and_forgot_username_counters_are_independent(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "a" * 48)
    store = LockoutStore()
    password_identity = main._recovery_identity("forgot_password", "same identity", "01711111111", "1111111111")
    username_identity = main._recovery_identity("forgot_username", "same identity", "01711111111", "1111111111")
    for _ in range(5):
        main._record_recovery_failure(store, "forgot_password", password_identity)
    assert main._recovery_lockout_remaining(store, "forgot_password", password_identity) > 0
    assert main._recovery_lockout_remaining(store, "forgot_username", username_identity) == 0
    assert password_identity != username_identity
    assert not store.rows.get(("forgot_username", password_identity))


def test_successful_recovery_clears_only_its_feature_counter(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "a" * 48)
    store = LockoutStore()
    identity = main._recovery_identity("forgot_password", "citizen_a", "01711111111", "1111111111")
    for _ in range(3):
        main._record_recovery_failure(store, "forgot_password", identity)
    main._recovery_lockout_remaining(store, "forgot_password", identity)
    main._clear_recovery_failures(store, "forgot_password", identity)
    assert store.rows[("forgot_password", identity)]["failed_attempt_count"] == 0
    assert main._recovery_lockout_remaining(store, "forgot_password", identity) == 0


def test_recovery_lockout_does_not_block_normal_login(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "a" * 48)
    store = LockoutStore()
    identity = main._recovery_identity("forgot_password", "citizen_a", "01711111111", "1111111111")
    for _ in range(5):
        main._record_recovery_failure(store, "forgot_password", identity)
    account = {"id": 4, "username": "citizen_a", "email": "a@example.com", "role": "citizen", "auth_version": 0, "password_hash": "hash", "salt": "salt", "name": "A"}
    class LoginDB:
        def execute(self, query, params=()):
            if "SELECT * FROM users" in query:
                return Result(account)
            if "FROM login_attempt_lockouts WHERE user_id=%s" in query:
                return Result({"remaining_seconds": None})
            if "INSERT INTO login_attempt_lockouts" in query:
                return Result()
            raise AssertionError(f"Unexpected login SQL: {query}")

    @contextmanager
    def login_conn():
        yield LoginDB()

    monkeypatch.setattr(main.engine, "conn", login_conn)
    monkeypatch.setattr(main.engine, "verify_password", lambda *args: True)
    monkeypatch.setattr(main.engine, "password_needs_rehash", lambda *args: False)
    monkeypatch.setattr(main.engine, "log_audit", lambda *args, **kwargs: None)
    monkeypatch.setattr(main, "issue_access_token", lambda user_id, version=0: "signed-token")
    result = main.login(main.LoginRequest(identifier="citizen_a", password="test-password"), SimpleNamespace(client=SimpleNamespace(host="127.0.0.1")))
    assert result["user"]["id"] == 4
    assert result["token"] == "signed-token"


def test_recovery_lockout_is_ten_hours_and_expires(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "a" * 48)
    store = LockoutStore(now=1_000)
    identity = main._recovery_identity("forgot_username", "a citizen", "01711111111", "1111111111")
    for _ in range(5):
        _, remaining = main._record_recovery_failure(store, "forgot_username", identity)
    assert remaining == 10 * 60 * 60
    store.now += 10 * 60 * 60 + 1
    assert main._recovery_lockout_remaining(store, "forgot_username", identity) == 0
    attempts, remaining = main._record_recovery_failure(store, "forgot_username", identity)
    assert attempts == 1
    assert remaining == 0


def test_failure_counter_uses_single_atomic_postgres_upsert(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "a" * 48)
    store = LockoutStore()
    identity = main._recovery_identity("forgot_password", "citizen_a", "01711111111", "1111111111")
    main._record_recovery_failure(store, "forgot_password", identity)
    query = next(query for query in store.queries if "VALUES(%s,%s,1,NULL)" in query)
    assert "ON CONFLICT(feature_type,identity_hash) DO UPDATE" in query
    assert "RETURNING failed_attempt_count" in query


@pytest.mark.parametrize("feature", ["forgot_password", "forgot_username"])
def test_recovery_endpoints_return_lockout_on_fifth_failed_identity(monkeypatch, feature):
    monkeypatch.setenv("JWT_SECRET", "a" * 48)
    store = LockoutStore()

    class RecoveryDB:
        def execute(self, query, params=()):
            if "FROM users" in query:
                return Result(None)
            return store.execute(query, params)

    @contextmanager
    def conn():
        yield RecoveryDB()

    monkeypatch.setattr(main.engine, "conn", conn)
    request = SimpleNamespace(client=SimpleNamespace(host="test-client"))
    if feature == "forgot_password":
        submit = lambda: main.recovery_start(
            main.RecoveryIdentityRequest(username="routepass1", phone="01788888888", nid="8888888888"), request
        )
    else:
        submit = lambda: main.recover_username(
            main.ForgotUsernameRequest(full_name="Test Route User", phone="01788888888", nid="8888888888"), request
        )

    for _ in range(4):
        with pytest.raises(HTTPException) as error:
            submit()
        assert error.value.status_code == 400
    with pytest.raises(HTTPException) as error:
        submit()
    assert error.value.status_code == 429
    assert error.value.detail["code"] == "recovery_locked"
    assert error.value.detail["remaining_seconds"] == 10 * 60 * 60
