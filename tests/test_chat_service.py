import os
import sys
import tempfile
import pytest

os.environ["LANDTECH_DB"] = os.path.join(tempfile.mkdtemp(), "chat_test.db")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from fastapi.testclient import TestClient
from main import app
import engine

client = TestClient(app)


def test_chat_status_endpoint():
    res = client.get("/api/chat/status")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "online"
    assert "provider" in data
    assert len(data["supported_languages"]) >= 3
    assert len(data["features"]) >= 3


def test_chat_domain_fee_inquiry():
    # Bengali inquiry
    res = client.post("/api/chat/message", json={
        "message": "ই নামজারি করতে মোট কত টাকা সরকারি ফি দিতে হয়?"
    })
    assert res.status_code == 200
    data = res.json()
    assert "১,১৭০" in data["reply"] or "1170" in data["reply"]
    assert "provider" in data


def test_chat_banglish_inquiry():
    # Banglish inquiry
    res = client.post("/api/chat/message", json={
        "message": "namjari korte ki ki kagoj lagbe ar fee koto?"
    })
    assert res.status_code == 200
    data = res.json()
    assert len(data["reply"]) > 50


def test_chat_khatian_inquiry():
    # CS vs SA vs RS vs BS
    res = client.post("/api/chat/message", json={
        "message": "CS এবং RS খতিয়ানের মধ্যে পার্থক্য কি?"
    })
    assert res.status_code == 200
    data = res.json()
    assert "CS" in data["reply"]
    assert "RS" in data["reply"]


def test_chat_dynamic_application_tracking():
    # Seed db first
    client.post("/api/seed")

    # Fetch a seeded tracking number
    apps = engine.list_mutation_applications()
    assert len(apps) > 0
    tno = apps[0]["tracking_no"]
    applicant = apps[0]["applicant_name"]

    res = client.post("/api/chat/message", json={
        "message": f"আমার {tno} আবেদনের বর্তমান অবস্থা কী?"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["context_used"] is True
    assert tno in data["reply"]
    assert applicant in data["reply"]
