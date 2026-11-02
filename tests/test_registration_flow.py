import sys
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import main
import engine


class Result:
    def __init__(self, row=None):
        self.row = row

    def fetchone(self):
        return self.row


class RegistrationDB:
    def __init__(self, duplicate_email=False, duplicate_nid=False, duplicate_username=False):
        self.duplicate_email = duplicate_email
        self.duplicate_nid = duplicate_nid
        self.duplicate_username = duplicate_username
        self.insert_params = None
        self.committed = False
        self.username_lookup = None

    def execute(self, query, params=()):
        if "pg_advisory_xact_lock" in query:
            return Result()
        if "LOWER(email)" in query:
            return Result({"id": 1} if self.duplicate_email else None)
        if "LOWER(username)" in query:
            self.username_lookup = params[0]
            return Result({"id": 1} if self.duplicate_username else None)
        if "regexp_replace" in query:
            return Result({"id": 1} if self.duplicate_nid else None)
        if query.lstrip().startswith("INSERT INTO users"):
            self.insert_params = params
            return Result({"id": 88})
        raise AssertionError(f"Unexpected SQL: {query}")


class LoginDB:
    def __init__(self, accounts):
        self.accounts = {str(account["id"]): dict(account) for account in accounts}
        self.lockouts = {}
        self.queries = []

    def execute(self, query, params=()):
        self.queries.append((query, params))
        normalized = " ".join(query.split())
        if "SELECT * FROM users" in normalized:
            identifier = params[0]
            account = next((a for a in self.accounts.values()
                            if a["email"].lower() == identifier or a["username"].lower() == identifier), None)
            return Result(dict(account) if account else None)
        if "FROM login_attempt_lockouts WHERE user_id=%s" in normalized:
            row = self.lockouts.get(params[0])
            return Result({"remaining_seconds": row["remaining_seconds"]} if row else {"remaining_seconds": None})
        if "INSERT INTO login_attempt_lockouts" in normalized and "RETURNING failed_attempt_count" in normalized:
            user_id = params[0]
            row = self.lockouts.get(user_id, {"failed_attempt_count": 0, "remaining_seconds": 0})
            if row["remaining_seconds"] > 0:
                pass
            else:
                row["failed_attempt_count"] = 1 if row["failed_attempt_count"] >= 5 else row["failed_attempt_count"] + 1
                row["remaining_seconds"] = 10 * 60 * 60 if row["failed_attempt_count"] >= 5 else 0
            self.lockouts[user_id] = row
            return Result(dict(row))
        if "INSERT INTO login_attempt_lockouts" in normalized and "failed_attempt_count=0" in normalized:
            self.lockouts[params[0]] = {"failed_attempt_count": 0, "remaining_seconds": 0}
            return Result()
        if normalized.startswith("UPDATE users SET password_hash="):
            return Result()
        raise AssertionError(f"Unexpected SQL: {query}")


def request(**overrides):
    values = {
        "name": "Test Citizen",
        "username": "Citizen01",
        "email": "new@example.com",
        "phone": "01712345678",
        "nid": "1234567890",
        "password": "abcdefgh",
        "password_confirmation": "abcdefgh",
        "role": "admin",
    }
    values.update(overrides)
    return main.RegisterRequest(**values)


def install_db(monkeypatch, db):
    @contextmanager
    def conn():
        yield db
        db.committed = True

    monkeypatch.setattr(main.engine, "conn", conn)
    monkeypatch.setattr(main.engine, "hash_password", lambda password: ("HASHED_VALUE", "SALT_VALUE"))
    monkeypatch.setattr(main.engine, "get_user_by_id", lambda uid: {
        "id": uid, "name": "Test Citizen", "username": "Citizen01", "email": "new@example.com", "role": "citizen"
    })
    monkeypatch.setattr(main.engine, "log_audit", lambda *args, **kwargs: None)
    monkeypatch.setattr(main, "issue_access_token", lambda uid, version=0: "signed-token")


def test_registration_accepts_eight_character_password_and_forces_citizen(monkeypatch):
    db = RegistrationDB()
    install_db(monkeypatch, db)

    result = main.register(request(password="abcdefgh", password_confirmation="abcdefgh"))

    assert result["user"]["role"] == "citizen"
    assert result["user"]["username"] == "Citizen01"
    assert result["token"] == "signed-token"
    assert db.insert_params[4:6] == ("HASHED_VALUE", "SALT_VALUE")
    assert "abcdefgh" not in db.insert_params
    assert db.insert_params[1] == "Citizen01"
    assert db.committed


def test_registration_rejects_seven_character_password():
    with pytest.raises(ValidationError):
        request(password="1234567", password_confirmation="1234567")


def test_registration_accepts_twelve_character_password(monkeypatch):
    db = RegistrationDB()
    install_db(monkeypatch, db)
    result = main.register(request(password="abcdefghijkl", password_confirmation="abcdefghijkl"))
    assert result["success"]


@pytest.mark.parametrize(
    ("db", "expected"),
    [
        (RegistrationDB(duplicate_nid=True), "An account with this NID already exists."),
        (RegistrationDB(duplicate_username=True), "This username is already taken"),
    ],
)
def test_duplicate_nid_and_username_are_rejected(monkeypatch, db, expected):
    install_db(monkeypatch, db)
    with pytest.raises(HTTPException) as error:
        main.register(request())
    assert error.value.status_code == 409
    assert error.value.detail == expected
    assert db.insert_params is None


def test_username_uniqueness_check_is_case_insensitive(monkeypatch):
    db = RegistrationDB(duplicate_username=True)
    install_db(monkeypatch, db)
    with pytest.raises(HTTPException) as error:
        main.register(request(username="cITIZEN01"))
    assert error.value.status_code == 409
    assert db.username_lookup == "citizen01"


def test_two_different_nids_and_usernames_register(monkeypatch):
    first_db = RegistrationDB()
    install_db(monkeypatch, first_db)
    assert main.register(request())["success"]

    second_db = RegistrationDB()
    install_db(monkeypatch, second_db)
    assert main.register(request(username="citizen02", email="other@example.com", nid="1234567891"))["success"]
    assert first_db.insert_params[1] != second_db.insert_params[1]
    assert first_db.insert_params[6] != second_db.insert_params[6]


@pytest.mark.parametrize("value", ["১২৩৪৫৬৭৮৯০", "123-456-7890", " 1234567890", "123456789"])
def test_nid_rejects_non_ascii_digits_separators_spaces_and_wrong_lengths(value):
    with pytest.raises(HTTPException):
        main._normalize_nid(value)


@pytest.mark.parametrize("value", ["0000000000", "1234567890123", "12345678901234567"])
def test_nid_accepts_exact_supported_ascii_lengths(value):
    assert main._normalize_nid(value) == value


@pytest.mark.parametrize("username", ["abc", "two words", "bad/name", "a" * 31])
def test_username_rejects_invalid_formats(username):
    assert not main._valid_username(username)


def test_username_availability_returns_live_status(monkeypatch):
    db = RegistrationDB(duplicate_username=True)

    @contextmanager
    def conn():
        yield db

    monkeypatch.setattr(main.engine, "conn", conn)
    assert main.username_availability("Citizen01")["available"] is False
    assert main.username_availability("bad name")["message"] == "Invalid username"


@pytest.mark.parametrize("identifier", ["legacy@example.com", "legacy_user"])
def test_login_authenticates_existing_email_and_username(monkeypatch, identifier):
    password_hash, salt = engine.hash_password("pass1234", "legacy-test-salt")
    legacy_user = {
        "id": 9, "name": "Legacy User", "username": "legacy_user", "email": "legacy@example.com",
        "role": "officer", "password_hash": password_hash, "salt": salt,
    }
    captured = {"queries": []}

    @contextmanager
    def conn():
        class FakeConnection:
            def execute(self, query, params):
                captured["queries"].append(query)
                captured["identifier"] = params
                return Result(legacy_user)
        yield FakeConnection()

    monkeypatch.setattr(engine, "init", lambda: None)
    monkeypatch.setattr(engine, "conn", conn)
    monkeypatch.setattr(engine, "log_audit", lambda *args, **kwargs: None)
    result = engine.authenticate_user(identifier, "pass1234")
    assert result["role"] == "officer"
    lookup = next(query for query in captured["queries"] if "SELECT * FROM users" in query)
    assert "LOWER(username)" in lookup
    assert "LOWER(BTRIM(email))" in lookup
    assert any("UPDATE users SET password_hash" in query for query in captured["queries"])


def test_password_hashing_uses_argon2id_and_keeps_legacy_verification():
    encoded, salt = engine.hash_password("StrongPass123")
    assert encoded.startswith("$argon2id$")
    assert salt == ""
    assert engine.verify_password("StrongPass123", encoded, salt)
    assert not engine.verify_password("wrong-password", encoded, salt)
    legacy_hash, legacy_salt = engine.hash_password("OldPass123", "old-salt")
    assert engine.verify_password("OldPass123", legacy_hash, legacy_salt)
    assert engine.password_needs_rehash(legacy_hash)


@pytest.mark.parametrize("role", ["citizen", "officer", "admin"])
def test_login_returns_database_role_for_dashboard_selection(monkeypatch, role):
    account = {"id": 11, "username": "user_11", "email": "person@example.com", "role": role, "auth_version": 0, "password_hash": "hash", "salt": "salt", "name": "Test"}
    db = LoginDB([account])

    @contextmanager
    def conn():
        yield db

    monkeypatch.setattr(main.engine, "conn", conn)
    monkeypatch.setattr(main.engine, "verify_password", lambda password, pw_hash, salt: True)
    monkeypatch.setattr(main.engine, "password_needs_rehash", lambda pw_hash: False)
    monkeypatch.setattr(main.engine, "log_audit", lambda *args, **kwargs: None)
    monkeypatch.setattr(main, "issue_access_token", lambda user_id, version=0: "signed-token")
    result = main.login(main.LoginRequest(identifier="person@example.com", password="pass1234"), SimpleNamespace(client=SimpleNamespace(host="127.0.0.1")))
    assert result["user"]["role"] == role


def test_login_persists_fifth_failure_for_only_that_user_and_success_clears(monkeypatch):
    user_a = {"id": 21, "username": "user_a", "email": "a@example.com", "role": "citizen", "auth_version": 0, "password_hash": "hash", "salt": "salt", "name": "A"}
    user_b = {"id": 22, "username": "user_b", "email": "b@example.com", "role": "citizen", "auth_version": 0, "password_hash": "hash", "salt": "salt", "name": "B"}
    db = LoginDB([user_a, user_b])

    @contextmanager
    def conn():
        yield db

    monkeypatch.setattr(main.engine, "conn", conn)
    monkeypatch.setattr(main.engine, "verify_password", lambda password, pw_hash, salt: password == "correct")
    monkeypatch.setattr(main.engine, "password_needs_rehash", lambda pw_hash: False)
    monkeypatch.setattr(main.engine, "log_audit", lambda *args, **kwargs: None)
    monkeypatch.setattr(main, "issue_access_token", lambda user_id, version=0: "signed-token")
    request_obj = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))

    for attempt in range(5):
        with pytest.raises(HTTPException) as error:
            main.login(main.LoginRequest(identifier="user_a", password="wrong"), request_obj)
        assert error.value.status_code == (429 if attempt == 4 else 401)
    assert db.lockouts[21]["remaining_seconds"] == 10 * 60 * 60
    assert main.login(main.LoginRequest(identifier="user_b", password="correct"), request_obj)["user"]["id"] == 22


def test_login_counter_upsert_is_atomic_and_account_scoped():
    class SQLSpy:
        query = ""

        def execute(self, query, params):
            self.query = query
            assert params[0] == 123
            return Result({"failed_attempt_count": 1, "remaining_seconds": 0})

    spy = SQLSpy()
    assert main._record_login_failure(spy, 123) == (1, 0)
    assert "ON CONFLICT(user_id) DO UPDATE" in spy.query
    assert "RETURNING failed_attempt_count" in spy.query
    assert "login_attempt_lockouts" in spy.query
