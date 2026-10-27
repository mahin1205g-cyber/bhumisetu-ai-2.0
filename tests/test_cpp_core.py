import os
import sys
import tempfile
import pytest

os.environ["LANDTECH_DB"] = os.path.join(tempfile.mkdtemp(), "cpp_test.db")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from fastapi.testclient import TestClient
from main import app
import cpp_bridge

client = TestClient(app)


def test_cpp_engine_available():
    info = cpp_bridge.get_engine_info()
    assert info["cpp_accelerated"] is True
    assert "BhumiSathi" in info["engine_version"]
    assert "C++" in info["engine_version"]


def test_cpp_fuzzy_match():
    # Identical strings
    assert cpp_bridge.fuzzy_match("ঢাকা", "ঢাকা") == 100.0
    assert cpp_bridge.fuzzy_match("LandGuard", "LandGuard") == 100.0

    # Slight variation in Bengali name (e.g. মোহাম্মদ vs মুহাম্মদ)
    score_slight = cpp_bridge.fuzzy_match("মোহাম্মদ রফিকুল ইসলাম", "মুহাম্মদ রফিকুল ইসলাম")
    assert score_slight >= 90.0

    # Totally different strings
    score_diff = cpp_bridge.fuzzy_match("মোহাম্মদ রফিক", "ভুল ব্যক্তি")
    assert score_diff < 50.0


def test_cpp_fraud_graph_cycle_detection():
    # Cartel circular wash-sale: A -> B -> C -> A
    transfers = [
        {"seller": "আবুল কাশেম", "buyer": "রফিকুল ইসলাম", "plot_id": "P-101", "sale_date": "2025-01-01"},
        {"seller": "রফিকুল ইসলাম", "buyer": "সালাম সরকার", "plot_id": "P-101", "sale_date": "2025-01-15"},
        {"seller": "সালাম সরকার", "buyer": "আবুল কাশেম", "plot_id": "P-101", "sale_date": "2025-02-01"},
    ]
    res = cpp_bridge.detect_fraud_graph(transfers)
    assert res["has_cycle"] is True
    assert res["cycle_count"] >= 1
    assert any("আবুল কাশেম" in c and "রফিকুল ইসলাম" in c for c in res["cycles"])
    assert res["fraud_risk_score"] >= 50
    assert "C++" in res["engine"]


def test_cpp_fraud_graph_double_sale():
    # Seller sells same plot to two different buyers
    transfers = [
        {"seller": "জহিরুল হক", "buyer": "ক্রেতা ১", "plot_id": "PLOT-999", "sale_date": "2025-01-01"},
        {"seller": "জহিরুল হক", "buyer": "ক্রেতা ২", "plot_id": "PLOT-999", "sale_date": "2025-02-01"},
    ]
    res = cpp_bridge.detect_fraud_graph(transfers)
    assert len(res["double_sales"]) >= 1
    assert "PLOT-999" in res["double_sales"][0]


def test_api_engine_status():
    res = client.get("/api/engine/status")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "online"
    assert data["cpp_accelerated"] is True
    assert "GCC" in data["compiler"]


def test_api_benchmark():
    res = client.get("/api/benchmark?operations=2000")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "cpp_engine" in data
    assert "speedup_factor" in data
    assert data["cpp_engine"]["throughput_ops_per_sec"] > 10000


def test_api_fraud_detect_graph():
    payload = [
        {"seller": "পার্থ", "buyer": "অনুপম", "plot_id": "X-1", "sale_date": "2025-01-01"},
        {"seller": "অনুপম", "buyer": "পার্থ", "plot_id": "X-1", "sale_date": "2025-01-10"}
    ]
    res = client.post("/api/fraud/detect-graph", json=payload)
    assert res.status_code == 200
    assert res.json()["has_cycle"] is True
