import os
import sys
import tempfile
import json
import pytest

os.environ["LANDTECH_DB"] = os.path.join(tempfile.mkdtemp(), "cpp_test.db")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from fastapi.testclient import TestClient
from main import app
import cpp_bridge

client = TestClient(app)


def test_cpp_engine_available():
    info = cpp_bridge.get_engine_info()
    assert isinstance(info["cpp_accelerated"], bool)
    assert "Engine" in info["engine_version"]
    if info["cpp_accelerated"]:
        assert "C++" in info["engine_version"]


def test_cpp_fuzzy_match():
    # Identical strings
    assert cpp_bridge.fuzzy_match("ঢাকা", "ঢাকা") == 100.0
    assert cpp_bridge.fuzzy_match("LandGuard", "LandGuard") == 100.0

    # Slight variation in Bengali name (e.g. মোহাম্মদ vs মুহাম্মদ)
    score_slight = cpp_bridge.fuzzy_match("মোহাম্মদ রফিকুল ইসলাম", "মুহাম্মদ রফিকুল ইসলাম")
    assert 80.0 <= score_slight < 100.0

    # Totally different strings
    score_diff = cpp_bridge.fuzzy_match("মোহাম্মদ রফিক", "ভুল ব্যক্তি")
    assert score_diff < 50.0
    assert cpp_bridge.fuzzy_match("", "") == 0.0
    assert cpp_bridge.fuzzy_match("   ", "ঢাকা") == 0.0
    assert cpp_bridge.fuzzy_match("Abdul   Karim", "abdul karim") == 100.0
    assert cpp_bridge.fuzzy_match("আব্দুল করিম ১২৩", "আব্দুল করিম 123") == 100.0


def test_python_fallback_works_when_native_library_is_unavailable(monkeypatch):
    monkeypatch.setattr(cpp_bridge, "_is_available", False)
    monkeypatch.setattr(cpp_bridge, "_cpp_lib", None)

    assert cpp_bridge.is_cpp_available() is False
    assert cpp_bridge.fuzzy_match("আব্দুল করিম", "আব্দুল করিম") == 100.0
    result = cpp_bridge.detect_fraud_graph([
        {"seller": "A", "buyer": "B", "parcel_id": "P-1"},
        {"seller": "B", "buyer": "A", "parcel_id": "P-1"},
    ])
    assert result["has_cycle"] is True
    benchmark = cpp_bridge.run_benchmark(10)
    assert benchmark["status"] == "native_benchmark_unavailable"
    assert benchmark["cpp_engine"] is None
    assert benchmark["python_comparison"]["operations_tested"] == 10


def test_cpp_fraud_graph_cycle_detection():
    # Cartel circular wash-sale: A -> B -> C -> A
    transfers = [
        {"seller": "আবুল কাশেম", "buyer": "রফিকুল ইসলাম", "parcel_id": "P-101", "plot_id": "P-101", "sale_date": "2025-01-01", "deed_no": "D-1"},
        {"seller": "রফিকুল ইসলাম", "buyer": "সালাম সরকার", "parcel_id": "P-101", "plot_id": "P-101", "sale_date": "2025-01-15", "deed_no": "D-2"},
        {"seller": "সালাম সরকার", "buyer": "আবুল কাশেম", "parcel_id": "P-101", "plot_id": "P-101", "sale_date": "2025-02-01", "deed_no": "D-3"},
    ]
    res = cpp_bridge.detect_fraud_graph(transfers)
    assert res["has_cycle"] is True
    assert res["cycle_count"] >= 1
    assert any("আবুল কাশেম" in c and "রফিকুল ইসলাম" in c for c in res["cycles"])
    assert res["fraud_risk_score"] is None
    assert res["risk_score_status"] == "NOT_CALCULATED"
    assert res["anomalies"][0]["type"] == "POTENTIAL_OWNERSHIP_CYCLE"


def test_cpp_fraud_graph_double_sale():
    # Seller sells same plot to two different buyers
    transfers = [
        {"seller": "জহিরুল হক", "buyer": "ক্রেতা ১", "parcel_id": "P-999", "plot_id": "PLOT-999", "sale_date": "2025-01-01", "deed_no": "X-1"},
        {"seller": "জহিরুল হক", "buyer": "ক্রেতা ২", "parcel_id": "P-999", "plot_id": "PLOT-999", "sale_date": "2025-02-01", "deed_no": "X-2"},
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
    assert data["cpp_accelerated"] == cpp_bridge.is_cpp_available()


def test_api_benchmark():
    res = client.get("/api/benchmark?operations=2000")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in {"success", "native_benchmark_unavailable"}
    assert "python_comparison" in data
    if data["status"] == "success":
        assert data["score_checksum_match"] is True
        assert data["cpp_engine"]["throughput_ops_per_sec"] > 0


def test_api_fraud_detect_graph():
    payload = [
        {"seller": "পার্থ", "buyer": "অনুপম", "parcel_id": "X-1", "plot_id": "X-1", "sale_date": "2025-01-01"},
        {"seller": "অনুপম", "buyer": "পার্থ", "parcel_id": "X-1", "plot_id": "X-1", "sale_date": "2025-01-10"}
    ]
    res = client.post("/api/fraud/detect-graph", json=payload)
    assert res.status_code == 200
    assert res.json()["has_cycle"] is True


def test_cpp_graph_does_not_connect_distinct_parcels():
    transfers = [
        {"seller": "A", "buyer": "B", "parcel_id": "PARCEL-A"},
        {"seller": "B", "buyer": "A", "parcel_id": "PARCEL-B"},
    ]
    result = cpp_bridge.detect_fraud_graph(transfers)
    assert result["has_cycle"] is False
    assert result["fraud_risk_score"] is None


def test_cpp_graph_requires_stable_parcel_scope():
    result = cpp_bridge.detect_fraud_graph([
        {"seller": "A", "buyer": "B", "plot_id": "88"},
        {"seller": "B", "buyer": "A", "plot_id": "88"},
    ])
    assert result["has_cycle"] is False
    assert result["unscoped_transfers_count"] == 2


def test_cpp_graph_uses_calendar_dates_and_configured_window():
    transfers = [
        {"seller": "A", "buyer": "B", "parcel_id": "LEAP", "sale_date": "2024-02-28"},
        {"seller": "B", "buyer": "C", "parcel_id": "LEAP", "sale_date": "2024-02-29"},
    ]
    assert len(cpp_bridge.detect_fraud_graph(transfers, rapid_transfer_window_days=1)["rapid_transfers"]) == 1
    assert cpp_bridge.detect_fraud_graph(transfers, rapid_transfer_window_days=0)["rapid_transfers"] == []
    invalid_date = [
        {"seller": "A", "buyer": "B", "parcel_id": "INVALID", "sale_date": "2023-02-29"},
        {"seller": "B", "buyer": "C", "parcel_id": "INVALID", "sale_date": "2023-03-01"},
    ]
    assert cpp_bridge.detect_fraud_graph(invalid_date)["rapid_transfers"] == []


def test_cpp_json_parser_handles_escaping_and_rejects_malformed_input():
    result = cpp_bridge.detect_fraud_graph([
        {"seller": 'A "quoted"', "buyer": "B", "parcel_id": "Q", "deed_no": "D\\Q"},
        {"seller": "B", "buyer": 'A "quoted"', "parcel_id": "Q", "deed_no": "D2"},
    ])
    assert result["has_cycle"] is True
    assert 'A "quoted"' in result["cycles"][0]
    if cpp_bridge.is_cpp_available() and hasattr(cpp_bridge._cpp_lib, "bhumi_detect_fraud_graph_with_options"):
        pointer = cpp_bridge._cpp_lib.bhumi_detect_fraud_graph(b'[{"seller":}]')
        malformed = json.loads(cpp_bridge._read_owned_string(pointer))
        assert malformed["error"] == "invalid transfer JSON"


def test_cpp_search_is_honestly_linear_and_only_searches_supported_fields():
    records = [
        {"deed_no": "D-1", "plot_id": "P-1", "notes": "secret phrase"},
        {"deed_no": "D-2", "plot_id": "P-2", "mouza": 'Mouza "North"'},
    ]
    result = cpp_bridge.fast_search(records, "D-", limit=50)
    assert result["count"] == 2
    assert result["algorithm"] == "Linear JSON scan O(N)"
    assert cpp_bridge.fast_search(records, "secret phrase")["count"] == 0
    assert cpp_bridge.fast_search(records, "")["count"] == 0


def test_cpp_benchmark_uses_the_same_fuzzy_workload():
    if not cpp_bridge.is_cpp_available() or not hasattr(cpp_bridge._cpp_lib, "bhumi_run_fuzzy_benchmark"):
        return
    result = cpp_bridge.run_benchmark(1000)
    assert result["status"] == "success"
    assert result["score_checksum_match"] is True
    assert result["cpp_engine"]["iterations"] == result["python_comparison"]["operations_tested"] == 1000
    assert result["cpp_bridge"]["iterations"] == 1000
    assert result["cpp_bridge"]["score_checksum_match"] is True
    assert result["cpp_bridge_speedup_vs_python"]
