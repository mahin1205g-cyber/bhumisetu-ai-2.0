import io
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import main


class FakeResult:
    def __init__(self, row=None):
        self.row = row

    def fetchone(self):
        return self.row


class FakeUploadFile:
    def __init__(self, data, content_type):
        self.data = data
        self.content_type = content_type
        self.closed = False

    async def read(self, limit):
        return self.data[:limit]

    async def close(self):
        self.closed = True


class FakeConnection:
    def __init__(self, state):
        self.state = state

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, params=()):
        normalized_query = " ".join(query.split())
        if normalized_query.startswith("SELECT id FROM users"):
            return FakeResult({"id": params[0]})
        if normalized_query.startswith("INSERT INTO profile_pictures"):
            self.state["image_data"] = params[1]
            self.state["updated_at"] = params[2]
            return FakeResult()
        if normalized_query.startswith("UPDATE users SET profile_picture=%s"):
            self.state["profile_picture"] = params[0]
            return FakeResult()
        if normalized_query.startswith("UPDATE users SET profile_picture=NULL"):
            self.state["profile_picture"] = None
            return FakeResult()
        if normalized_query.startswith("DELETE FROM profile_pictures"):
            self.state["image_data"] = None
            return FakeResult()
        if normalized_query.startswith("SELECT u.profile_picture, p.image_data FROM users"):
            if self.state["profile_picture"] and self.state["image_data"]:
                return FakeResult({
                    "profile_picture": self.state["profile_picture"],
                    "image_data": self.state["image_data"],
                })
            return FakeResult()
        raise AssertionError(f"Unexpected query: {normalized_query}")


def png_image(width=900, height=600):
    output = io.BytesIO()
    Image.new("RGB", (width, height), (12, 110, 78)).save(output, format="PNG")
    return output.getvalue()


def run_immediate(coroutine):
    try:
        coroutine.send(None)
    except StopIteration as completed:
        return completed.value
    raise AssertionError("Expected the fake upload to complete without async I/O")


@pytest.fixture
def picture_state(monkeypatch):
    state = {"profile_picture": None, "image_data": None, "updated_at": None}
    monkeypatch.setattr(main.engine, "conn", lambda: FakeConnection(state))

    def authenticated_user(_authorization):
        return {
            "id": 17,
            "name": "Test Citizen",
            "username": "citizen_17",
            "email": "citizen@example.test",
            "role": "citizen",
            "designation": "নাগরিক",
            "profile_picture": state["profile_picture"],
        }

    monkeypatch.setattr(main, "extract_user_from_auth_header", authenticated_user)
    return state


def test_profile_picture_persists_in_database_flow_across_profile_reload(picture_state):
    upload = FakeUploadFile(png_image(), "image/png")
    saved = run_immediate(main.upload_profile_picture(upload, authorization="Bearer test-token"))

    assert upload.closed
    assert saved["profile_picture"] == picture_state["profile_picture"]
    assert len(saved["profile_picture"]) == 32
    assert picture_state["image_data"].startswith(b"RIFF")
    assert main.get_current_user(authorization="Bearer test-token")["profile_picture"] == saved["profile_picture"]

    response = main.get_profile_picture(user_id=17, authorization="Bearer test-token")
    assert response.media_type == "image/webp"
    with Image.open(io.BytesIO(response.body)) as saved_image:
        assert saved_image.format == "WEBP"
        assert saved_image.size == (512, 341)

    removed = main.delete_profile_picture(authorization="Bearer test-token")
    assert removed["profile_picture"] is None
    assert picture_state["image_data"] is None
    with pytest.raises(HTTPException) as error:
        main.get_profile_picture(user_id=17, authorization="Bearer test-token")
    assert error.value.status_code == 404


def test_profile_picture_rejects_mismatched_mime_type():
    with pytest.raises(HTTPException) as error:
        main._normalize_profile_picture(png_image(), "image/jpeg")
    assert error.value.status_code == 415


def test_profile_picture_endpoints_require_authentication(monkeypatch):
    monkeypatch.setattr(main, "extract_user_from_auth_header", lambda _authorization: None)
    with pytest.raises(HTTPException) as error:
        main.get_profile_picture(user_id=17, authorization=None)
    assert error.value.status_code == 401
