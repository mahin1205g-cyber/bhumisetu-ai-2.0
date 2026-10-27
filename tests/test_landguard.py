import os
import sys
import tempfile
import pytest

os.environ["LANDTECH_DB"] = os.path.join(tempfile.mkdtemp(), "landguard_test.db")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from fastapi.testclient import TestClient
from main import app
import engine

client = TestClient(app)


def test_seed_and_demo_users():
    # Seed database
    res = client.post("/api/seed")
    assert res.status_code == 200
    assert res.json()["total"] > 0

    # Test demo users list
    demos = client.get("/api/auth/demo-users").json()
    assert len(demos) == 3
    assert any(d["role"] == "citizen" for d in demos)
    assert any(d["role"] == "officer" for d in demos)
    assert any(d["role"] == "admin" for d in demos)


def test_auth_flow():
    # Login with demo citizen
    login_res = client.post("/api/auth/login", json={
        "identifier": "citizen@landguard.gov.bd",
        "password": "demo123"
    })
    assert login_res.status_code == 200
    assert login_res.json()["user"]["role"] == "citizen"
    assert "token" in login_res.json()

    # Register new citizen
    reg_res = client.post("/api/auth/register", json={
        "name": "নতুন নাগরিক",
        "email": "new_citizen@example.com",
        "password": "pass12345",
        "phone": "01700000000",
        "nid": "19952692518000999"
    })
    assert reg_res.status_code == 200
    assert reg_res.json()["user"]["name"] == "নতুন নাগরিক"


def test_p2_deed_verification():
    # Test matching deed
    res = client.post("/api/verification/verify-deed", json={
        "deed_no": "D-8492",
        "reg_year": 2023,
        "district": "ঢাকা",
        "upazila": "মিরপুর",
        "mouza": "পাইকপাড়া",
        "plot_id": "DHK-MIR-002",
        "khatian_no": "BS-1046",
        "owner_name": "মোহাম্মদ রফিক"
    })
    assert res.status_code == 200
    data = res.json()
    assert "verification_ref" in data
    assert data["result_status"] == "MATCH"
    assert data["match_score"] >= 85

    # Test inconsistent owner name
    res_inconsistent = client.post("/api/verification/verify-deed", json={
        "deed_no": "D-1001",
        "reg_year": 2025,
        "district": "ঢাকা",
        "upazila": "মিরপুর",
        "mouza": "পাইকপাড়া",
        "plot_id": "DHK-MIR-001",
        "khatian_no": "BS-1045",
        "owner_name": "ভুল নাম"
    })
    assert res_inconsistent.status_code == 200
    data_inc = res_inconsistent.json()
    assert data_inc["result_status"] == "POTENTIAL_INCONSISTENCY"
    assert len(data_inc["discrepancies"]) > 0

    # Fetch report by reference
    ref = data["verification_ref"]
    rep_res = client.get(f"/api/verification/report/{ref}")
    assert rep_res.status_code == 200
    assert rep_res.json()["verification_ref"] == ref


def test_p4_smart_e_namjari_workflow():
    # 1. Submit mutation application
    apply_res = client.post("/api/mutation/apply", json={
        "applicant_name": "মোঃ জহিরুল ইসলাম",
        "applicant_nid": "19912692518000111",
        "applicant_phone": "01712345678",
        "applicant_address": "মিরপুর, ঢাকা",
        "district": "ঢাকা",
        "upazila": "মিরপুর",
        "mouza": "পাইকপাড়া",
        "jl_no": "১০২",
        "khatian_type": "BS",
        "khatian_no": "BS-1046",
        "plot_no": "DHK-MIR-002",
        "land_area": 3.5,
        "land_class": "বাড়ি",
        "ownership_source": "ক্রয়সূত্রে",
        "deed_no": "D-8492",
        "deed_date": "2023-04-18",
        "supporting_docs": ["মূল সাফা কবলা দলিল", "দাখিলা"]
    })
    assert apply_res.status_code == 200
    app_data = apply_res.json()
    tracking_no = app_data["tracking_no"]
    assert tracking_no.startswith("MUT-2026-DHK-")
    assert app_data["status"] == "Submitted"

    # 2. Track application
    track_res = client.get(f"/api/mutation/track/{tracking_no}")
    assert track_res.status_code == 200
    assert track_res.json()["tracking_no"] == tracking_no
    assert len(track_res.json()["timeline"]) >= 1

    # 3. Officer Review Action: Document Verification
    action1 = client.post("/api/mutation/action", json={
        "tracking_no": tracking_no,
        "new_status": "Document Verification",
        "changed_by_name": "বেগম ফরিদা পারভীন",
        "changed_by_role": "officer",
        "remarks": "কাগজপত্র যাচাই সন্তোষজনক"
    })
    assert action1.status_code == 200
    assert action1.json()["status"] in ("Document Verification", "Under Review")

    # 4. Officer Review Action: Approved
    action2 = client.post("/api/mutation/action", json={
        "tracking_no": tracking_no,
        "new_status": "Approved",
        "changed_by_name": "বেগম ফরিদা পারভীন",
        "changed_by_role": "officer",
        "remarks": "ডেমো সিস্টেমে নামজারি ও জমাভাগ মঞ্জুর করা হলো"
    })
    assert action2.status_code == 200
    assert action2.json()["status"] == "Approved"

    # 5. Verify timeline has all actions
    track_final = client.get(f"/api/mutation/track/{tracking_no}").json()
    assert len(track_final["timeline"]) == 3


def test_p5_pre_purchase_due_diligence():
    # 1. High risk assessment (Conflict: seller not recorded owner + court dispute)
    res = client.post("/api/due-diligence/assess", json={
        "seller_name": "অপরিচিত বিক্রেতা",
        "seller_nid": "19800000000000000",
        "deed_no": "D-1001",
        "reg_year": 2025,
        "district": "ঢাকা",
        "upazila": "মিরপুর",
        "mouza": "পাইকপাড়া",
        "khatian_no": "BS-1045",
        "plot_no": "DHK-MIR-001",
        "recorded_area": 5.0,
        "proposed_area": 8.0, # excess area
        "documents_held": ["শুধুমাত্র ফটোকপি"],
        "has_court_dispute": True
    })
    assert res.status_code == 200
    data = res.json()
    assert "report_ref" in data
    assert data["risk_level"] == "high"
    assert data["risk_score"] >= 60
    assert len(data["indicators"]) >= 2
    assert len(data["recommendations"]) > 0

    # 2. Fetch report by ref
    ref = data["report_ref"]
    get_rep = client.get(f"/api/due-diligence/report/{ref}")
    assert get_rep.status_code == 200
    assert get_rep.json()["report_ref"] == ref


def test_dashboard_stats():
    res = client.get("/api/dashboard/stats")
    assert res.status_code == 200
    stats = res.json()
    assert "total_properties" in stats
    assert "total_deeds" in stats
    assert "mutation_stats" in stats
    assert "recent_activity" in stats
