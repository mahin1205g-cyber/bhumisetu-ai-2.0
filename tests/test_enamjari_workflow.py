import os
import sys
import tempfile
import pytest

os.environ["LANDTECH_DB"] = os.path.join(tempfile.mkdtemp(), "enamjari_workflow_test.db")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from fastapi.testclient import TestClient
from main import app
import engine

client = TestClient(app)


def test_complete_enamjari_lifecycle_and_rbac():
    # 0. Seed database and login users
    client.post("/api/seed")

    citizen_login = client.post("/api/auth/login", json={
        "identifier": "citizen@landguard.gov.bd",
        "password": "demo123"
    }).json()
    citizen_token = citizen_login["token"]

    officer_login = client.post("/api/auth/login", json={
        "identifier": "officer@landguard.gov.bd",
        "password": "demo123"
    }).json()
    officer_token = officer_login["token"]

    # 1. Citizen submits a new e-Namjari application
    apply_res = client.post(
        "/api/mutation/apply",
        json={
            "applicant_name": "মোঃ আনোয়ারুল ইসলাম",
            "applicant_nid": "19882692518000777",
            "applicant_phone": "01819998877",
            "applicant_address": "মিরপুর-১০, ঢাকা",
            "district": "ঢাকা",
            "upazila": "মিরপুর",
            "mouza": "পাইকপাড়া",
            "jl_no": "১০২",
            "khatian_type": "BS",
            "khatian_no": "BS-1049",
            "plot_no": "DHK-MIR-005",
            "land_area": 4.25,
            "land_class": "বাড়ি",
            "ownership_source": "ক্রয়সূত্রে",
            "deed_no": "D-9988",
            "deed_date": "2024-02-15",
            "supporting_docs": ["মূল সাফ-কবলা দলিল", "খারিজ খতিয়ান"]
        },
        headers={"Authorization": f"Bearer {citizen_token}"}
    )
    assert apply_res.status_code == 200
    app_data = apply_res.json()
    tracking_no = app_data["tracking_no"]
    assert tracking_no.startswith("MUT-2026-DHK-")
    assert app_data["status"] == "Submitted"

    # 2. Citizen tries to approve own application -> Must be 403 Forbidden!
    forbidden_res = client.post(
        "/api/mutation/action",
        json={
            "tracking_no": tracking_no,
            "new_status": "Approved",
            "remarks": "Citizen trying to approve own application"
        },
        headers={"Authorization": f"Bearer {citizen_token}"}
    )
    assert forbidden_res.status_code == 403

    # 3. Officer starts review
    start_rev = client.post(
        f"/api/mutation/start-review/{tracking_no}",
        headers={"Authorization": f"Bearer {officer_token}"}
    )
    assert start_rev.status_code == 200
    assert start_rev.json()["status"] == "Under Review"

    # 4. Officer requests correction
    req_corr = client.post(
        "/api/mutation/action",
        json={
            "tracking_no": tracking_no,
            "new_status": "Correction Required",
            "remarks": "দয়া করে বায়া দলিলের স্ক্যান কপি ও হালনাগাদ খাজনার দাখিলা সংযুক্ত করুন।",
            "correction_details": "বায়া দলিলের স্পষ্ট স্ক্যান কপি অনুপস্থিত"
        },
        headers={"Authorization": f"Bearer {officer_token}"}
    )
    assert req_corr.status_code == 200
    corr_data = req_corr.json()
    assert corr_data["status"] == "Correction Required"

    # 5. Citizen resubmits with corrections
    resubmit_res = client.post(
        f"/api/mutation/{tracking_no}/resubmit",
        json={
            "applicant_phone": "01819998877",
            "supporting_docs": ["মূল সাফ-কবলা দলিল", "খারিজ খতিয়ান", "বায়া দলিল (পরিশোধিত)"],
            "correction_notes": "বায়া দলিলের স্পষ্ট কপি আপলোড করা হলো।"
        },
        headers={"Authorization": f"Bearer {citizen_token}"}
    )
    assert resubmit_res.status_code == 200
    resub_data = resubmit_res.json()
    assert resub_data["status"] == "Resubmitted"

    # 6. Officer reviews again and Approves
    approve_res = client.post(
        "/api/mutation/action",
        json={
            "tracking_no": tracking_no,
            "new_status": "Approved",
            "remarks": "সংশোধিত বায়া দলিল সন্তোষজনক। নামজারি প্রস্তাব অনুমোদন করা হলো।"
        },
        headers={"Authorization": f"Bearer {officer_token}"}
    )
    assert approve_res.status_code == 200
    final_data = approve_res.json()
    assert final_data["status"] == "Approved"

    # 7. Check full timeline
    track_final = client.get(f"/api/mutation/track/{tracking_no}").json()
    assert track_final["status"] == "Approved"
    # Timeline should have: Submitted, Under Review, Correction Required, Resubmitted, Approved (5 events)
    assert len(track_final["timeline"]) >= 5
