"""Safe optional bridge to the Bhumisathi C++ core.

Native and Python implementations share input limits, normalization, and result shapes.
The Python path remains available when the native library cannot be loaded.
"""

import ctypes
import datetime as _datetime
import json
import math
import os
import statistics
import time
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional


_DLL_DIR = Path(__file__).parent / "cpp_engine"
_DEFAULT_DLL_PATH = _DLL_DIR / "libbhumisathi_v3.dll"
_LEGACY_DLL_PATH = _DLL_DIR / "libbhumisathi.dll"
_DEFAULT_SO_PATH = _DLL_DIR / "libbhumisathi.so"
_MAX_JSON_BYTES = 2 * 1024 * 1024
_MAX_TRANSFER_COUNT = 50000
_MAX_FUZZY_BYTES = 4096
_MAX_QUERY_BYTES = 512
_MAX_SEARCH_RESULTS = 100
_MAX_ANOMALIES = 500
_MAX_CYCLES = 100
_BENCHMARK_PAIRS = (
    ("মোহাম্মদ রফিকুল ইসলাম", "মুহাম্মদ রফিকুল ইসলাম"),
    ("Abdul Karim", "abdul   karim"),
    ("আব্দুল করিম ১২৩", "আব্দুল করিম 123"),
)

_cpp_lib = None
_is_available = False
_engine_name = "Pure Python Engine (Fallback)"
_loaded_library_path: Optional[str] = None


def _read_owned_string(pointer: int) -> Optional[str]:
    if not pointer or not _cpp_lib:
        return None
    try:
        return ctypes.string_at(pointer).decode("utf-8")
    finally:
        _cpp_lib.bhumi_free_string(pointer)


def _load_lib() -> None:
    global _cpp_lib, _is_available, _engine_name, _loaded_library_path
    configured = os.environ.get("BHUMI_CPP_LIBRARY", "").strip()
    if configured:
        candidates = [Path(configured)]
    elif os.name == "nt":
        candidates = [_DEFAULT_DLL_PATH, _LEGACY_DLL_PATH]
    else:
        candidates = [_DEFAULT_SO_PATH]

    for candidate in candidates:
        if not candidate.is_file():
            continue
        try:
            if hasattr(os, "add_dll_directory"):
                try:
                    os.add_dll_directory(str(candidate.resolve().parent))
                except OSError:
                    pass
            library = ctypes.CDLL(str(candidate))
            library.bhumi_version.argtypes = []
            library.bhumi_version.restype = ctypes.c_char_p
            library.bhumi_fuzzy_match.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
            library.bhumi_fuzzy_match.restype = ctypes.c_double
            library.bhumi_detect_fraud_graph.argtypes = [ctypes.c_char_p]
            library.bhumi_detect_fraud_graph.restype = ctypes.c_void_p
            if hasattr(library, "bhumi_detect_fraud_graph_with_options"):
                library.bhumi_detect_fraud_graph_with_options.argtypes = [ctypes.c_char_p, ctypes.c_int]
                library.bhumi_detect_fraud_graph_with_options.restype = ctypes.c_void_p
            library.bhumi_fast_search.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int]
            library.bhumi_fast_search.restype = ctypes.c_void_p
            if hasattr(library, "bhumi_run_fuzzy_benchmark"):
                library.bhumi_run_fuzzy_benchmark.argtypes = [ctypes.c_int]
                library.bhumi_run_fuzzy_benchmark.restype = ctypes.c_void_p
            library.bhumi_run_benchmark.argtypes = [ctypes.c_int]
            library.bhumi_run_benchmark.restype = ctypes.c_void_p
            library.bhumi_free_string.argtypes = [ctypes.c_void_p]
            library.bhumi_free_string.restype = None

            version = library.bhumi_version()
            if not version:
                continue
            version_text = version.decode("utf-8", errors="replace")
            if "C++ Core Engine v3.0" not in version_text:
                # The v2 DLL has incompatible graph/search semantics; keep the
                # safe Python implementation active until the v3 ABI is built.
                continue
            _cpp_lib = library
            _is_available = True
            _engine_name = version_text
            _loaded_library_path = str(candidate.resolve())
            return
        except Exception as exc:  # Native loading must never prevent Python fallback.
            _cpp_lib = None
            _is_available = False
            _loaded_library_path = None
            _engine_name = f"Pure Python Engine (native load failed: {exc})"


_load_lib()


def is_cpp_available() -> bool:
    return _is_available


def get_engine_info() -> Dict[str, Any]:
    return {
        "cpp_accelerated": _is_available,
        "engine_version": _engine_name,
        "dll_path": _loaded_library_path,
        "compiler": "build metadata unavailable" if _is_available else "CPython",
    }


def _normalize_match_text(value: str) -> str:
    text = unicodedata.normalize("NFC", str(value))
    output: List[str] = []
    pending_space = False
    for character in text:
        if character.isspace():
            if output:
                pending_space = True
            continue
        if pending_space:
            output.append(" ")
            pending_space = False
        codepoint = ord(character)
        if "A" <= character <= "Z":
            character = chr(codepoint + 32)
        elif 0x09E6 <= codepoint <= 0x09EF:
            character = chr(ord("0") + codepoint - 0x09E6)
        output.append(character)
    return "".join(output)


def _python_fuzzy_match(left: str, right: str) -> float:
    normalized_left = _normalize_match_text(left)
    normalized_right = _normalize_match_text(right)
    if not normalized_left or not normalized_right:
        return 0.0
    if len(normalized_left.encode("utf-8")) > _MAX_FUZZY_BYTES or len(normalized_right.encode("utf-8")) > _MAX_FUZZY_BYTES:
        return 0.0
    a = [ord(character) for character in normalized_left]
    b = [ord(character) for character in normalized_right]
    if len(a) < len(b):
        a, b = b, a
    previous = list(range(len(b) + 1))
    for i, left_codepoint in enumerate(a, 1):
        current = [i]
        for j, right_codepoint in enumerate(b, 1):
            current.append(min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + (left_codepoint != right_codepoint),
            ))
        previous = current
    score = (1.0 - previous[-1] / max(len(a), len(b))) * 100.0
    return math.floor(max(0.0, min(100.0, score)) * 100.0 + 0.5) / 100.0


def fuzzy_match(s1: str, s2: str) -> float:
    """Normalized UTF-8 codepoint similarity, not proof of identity or ownership."""
    left = _normalize_match_text(s1)
    right = _normalize_match_text(s2)
    if not left or not right:
        return 0.0
    left_bytes = left.encode("utf-8")
    right_bytes = right.encode("utf-8")
    if len(left_bytes) > _MAX_FUZZY_BYTES or len(right_bytes) > _MAX_FUZZY_BYTES:
        return 0.0
    if _is_available and _cpp_lib:
        try:
            return float(_cpp_lib.bhumi_fuzzy_match(left_bytes, right_bytes))
        except Exception:
            pass
    return _python_fuzzy_match(left, right)


def _as_text(value: Any) -> str:
    if value is None or isinstance(value, bool):
        return ""
    if isinstance(value, (str, int, float)):
        return str(value)
    return ""


def _record_value(record: dict, first: str, second: str) -> str:
    value = _as_text(record.get(first))
    return value if value else _as_text(record.get(second))


def _parcel_key(record: dict) -> str:
    explicit = _as_text(record.get("parcel_id"))
    if explicit:
        return "parcel:" + f"{len(explicit.encode('utf-8'))}:{explicit}"
    plot_id = _as_text(record.get("plot_id"))
    district = _record_value(record, "district_id", "district")
    upazila = _record_value(record, "upazila_id", "upazila")
    mouza = _record_value(record, "mouza_id", "mouza")
    if not (plot_id and district and upazila and mouza):
        return ""
    division = _record_value(record, "division_id", "division")
    values = (division, district, upazila, mouza, plot_id)
    return "location:" + "".join(f"{len(value.encode('utf-8'))}:{value}" for value in values)


def _party_key(record: dict, side: str) -> str:
    party_id = _as_text(record.get(f"{side}_id"))
    if party_id:
        return "id:" + f"{len(party_id.encode('utf-8'))}:{party_id}"
    name = _as_text(record.get(side))
    if name:
        return "name:" + f"{len(name.encode('utf-8'))}:{name}"
    return ""


def _transfer_ref(record: dict, index: int) -> str:
    return _as_text(record.get("transfer_id")) or _as_text(record.get("deed_no")) or f"input[{index}]"


def _graph_error(message: str, window_days: int) -> dict:
    return {
        "error": message,
        "has_cycle": False,
        "cycle_count": 0,
        "cycles": [],
        "double_sales": [],
        "rapid_transfers": [],
        "anomalies": [],
        "fraud_risk_score": None,
        "risk_score_status": "NOT_CALCULATED",
        "rapid_transfer_window_days": window_days,
        "execution_time_us": 0,
    }


def _fallback_graph(transfers: List[dict], window_days: int) -> dict:
    started = time.perf_counter_ns()
    if len(transfers) > _MAX_TRANSFER_COUNT:
        return _graph_error("transfer count exceeds configured limit", window_days)
    normalized: List[dict] = []
    parties = set()
    by_parcel: Dict[str, List[dict]] = defaultdict(list)
    by_seller: Dict[Any, List[dict]] = defaultdict(list)
    unscoped = 0
    for index, original in enumerate(transfers):
        if not isinstance(original, dict):
            return _graph_error("transfer items must be objects", window_days)
        record = {
            "seller": _as_text(original.get("seller")),
            "seller_id": _as_text(original.get("seller_id")),
            "buyer": _as_text(original.get("buyer")),
            "buyer_id": _as_text(original.get("buyer_id")),
            "parcel_id": _as_text(original.get("parcel_id")),
            "plot_id": _as_text(original.get("plot_id")),
            "district_id": _as_text(original.get("district_id")),
            "district": _as_text(original.get("district")),
            "upazila_id": _as_text(original.get("upazila_id")),
            "upazila": _as_text(original.get("upazila")),
            "mouza_id": _as_text(original.get("mouza_id")),
            "mouza": _as_text(original.get("mouza")),
            "division_id": _as_text(original.get("division_id")),
            "division": _as_text(original.get("division")),
            "sale_date": _as_text(original.get("sale_date")),
            "deed_no": _as_text(original.get("deed_no")),
            "transfer_id": _as_text(original.get("transfer_id")),
            "_index": index,
        }
        record["_ref"] = _transfer_ref(record, index)
        record["_parcel"] = _parcel_key(record)
        record["_seller_key"] = _party_key(record, "seller")
        record["_buyer_key"] = _party_key(record, "buyer")
        if record["_seller_key"]:
            parties.add(record["_seller_key"])
        if record["_buyer_key"]:
            parties.add(record["_buyer_key"])
        if record["_parcel"]:
            by_parcel[record["_parcel"]].append(record)
            if record["_seller_key"] and record["_buyer_key"]:
                by_seller[(record["_parcel"], record["_seller_key"])].append(record)
        else:
            unscoped += 1
        if any(len(_as_text(record.get(key)).encode("utf-8")) > 1024 for key in (
            "seller", "buyer", "parcel_id", "plot_id", "sale_date", "deed_no", "transfer_id"
        )) or len(record["_parcel"].encode("utf-8")) > 2048:
            return _graph_error("transfer field exceeds configured limit", window_days)
        normalized.append(record)

    cycles: List[str] = []
    double_sales: List[str] = []
    rapid_transfers: List[str] = []
    anomalies: List[dict] = []
    seen_cycles = set()
    for parcel, records in by_parcel.items():
        labels: List[str] = []
        identifiers: Dict[str, int] = {}
        adjacency: List[List[tuple]] = []
        for record in records:
            seller_key = record["_seller_key"]
            buyer_key = record["_buyer_key"]
            if not seller_key or not buyer_key:
                continue
            for key, label in ((seller_key, record["seller"]), (buyer_key, record["buyer"])):
                if key not in identifiers:
                    identifiers[key] = len(labels)
                    labels.append(label)
                    adjacency.append([])
            if seller_key != buyer_key:
                adjacency[identifiers[seller_key]].append((identifiers[buyer_key], record["_ref"]))
        state = [0] * len(labels)
        for root in range(len(labels)):
            if state[root]:
                continue
            frames = [[root, 0, ""]]
            state[root] = 1
            while frames and len(cycles) < _MAX_CYCLES:
                node, next_edge, parent_ref = frames[-1]
                if next_edge >= len(adjacency[node]):
                    state[node] = 2
                    frames.pop()
                    continue
                destination, reference = adjacency[node][next_edge]
                frames[-1][1] += 1
                if state[destination] == 0:
                    state[destination] = 1
                    frames.append([destination, 0, reference])
                elif state[destination] == 1:
                    start = next((i for i, frame in enumerate(frames) if frame[0] == destination), None)
                    if start is None:
                        continue
                    cycle_labels = [labels[frame[0]] for frame in frames[start:]] + [labels[destination]]
                    cycle_text = " -> ".join(cycle_labels)
                    signature = parcel + "#" + "|".join(cycle_labels)
                    if signature not in seen_cycles:
                        seen_cycles.add(signature)
                        cycles.append(cycle_text)
                        if len(anomalies) < _MAX_ANOMALIES:
                            refs = [frame[2] for frame in frames[start + 1:] if frame[2]] + [reference]
                            anomalies.append({
                                "type": "POTENTIAL_OWNERSHIP_CYCLE",
                                "parcel_id": parcel,
                                "explanation": "Name or party identifiers form a directed cycle for this parcel; review the referenced transfers. This is an anomaly signal, not a fraud finding.",
                                "identity_basis": "stable_party_id_or_name",
                                "evidence_refs": refs,
                            })
            if len(cycles) >= _MAX_CYCLES:
                break

    for (parcel, seller_key), records in by_seller.items():
        buyers: Dict[str, List[dict]] = defaultdict(list)
        for record in records:
            buyers[record["_buyer_key"]].append(record)
        if len(buyers) < 2:
            continue
        sample = records[0]
        buyer_names = [items[0]["buyer"] for items in buyers.values()]
        refs = [record["_ref"] for record in records]
        text = (f"Seller '{sample['seller']}' has transfer records for parcel '{sample['plot_id']}' "
                f"to multiple buyers ({', '.join(buyer_names)}); review chronology, cancellation, and title sequence.")
        double_sales.append(text)
        if len(anomalies) < _MAX_ANOMALIES:
            anomalies.append({
                "type": "POTENTIAL_DOUBLE_SALE",
                "parcel_id": parcel,
                "explanation": "The same seller is recorded with multiple buyers for one parcel. Verify the deed sequence and any cancellation before drawing conclusions.",
                "identity_basis": "seller_id" if sample["seller_id"] else "seller_name",
                "evidence_refs": refs,
            })

    if window_days > 0:
        for parcel, records in by_parcel.items():
            dated = []
            for record in records:
                raw_date = record["sale_date"]
                try:
                    if len(raw_date) != 10:
                        continue
                    parsed_date = _datetime.date.fromisoformat(raw_date)
                    dated.append((parsed_date, record))
                except (TypeError, ValueError):
                    continue
            dated.sort(key=lambda item: (item[0], item[1]["_index"]))
            for (prior_date, prior), (current_date, current) in zip(dated, dated[1:]):
                gap = (current_date - prior_date).days
                if not prior["_buyer_key"] or prior["_buyer_key"] != current["_seller_key"] or not (0 <= gap <= window_days):
                    continue
                text = (f"Parcel '{prior['plot_id']}' has a recorded ownership handoff after {gap} days "
                        f"({prior['sale_date']} to {current['sale_date']}).")
                rapid_transfers.append(text)
                if len(anomalies) < _MAX_ANOMALIES:
                    anomalies.append({
                        "type": "RAPID_TRANSFER_OBSERVATION",
                        "parcel_id": parcel,
                        "explanation": text + " This is an anomaly indicator, not proof of fraud.",
                        "identity_basis": "party_id_sequence" if current["seller_id"] else "party_name_sequence",
                        "evidence_refs": [prior["_ref"], current["_ref"]],
                    })

    elapsed_us = max(0, (time.perf_counter_ns() - started) // 1000)
    return {
        "engine": "Python Fallback Fraud Engine",
        "has_cycle": bool(cycles),
        "cycle_count": len(cycles),
        "cycles": cycles,
        "double_sales": double_sales,
        "rapid_transfers": rapid_transfers,
        "anomalies": anomalies,
        "fraud_risk_score": None,
        "risk_score_status": "NOT_CALCULATED",
        "rapid_transfer_window_days": window_days,
        "parties_count": len(parties),
        "transfers_count": len(normalized),
        "scoped_transfers_count": len(normalized) - unscoped,
        "unscoped_transfers_count": unscoped,
        "execution_time_us": elapsed_us,
    }


def detect_fraud_graph(
    transfers: List[Dict[str, Any]], rapid_transfer_window_days: int = 30
) -> Dict[str, Any]:
    """Detect parcel-scoped anomaly observations, never a fraud/legal conclusion."""
    try:
        window_days = max(0, min(int(rapid_transfer_window_days), 3650))
    except (TypeError, ValueError):
        window_days = 30
    if not isinstance(transfers, list):
        return _graph_error("transfers must be a list", window_days)
    try:
        payload = json.dumps(transfers, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    except (TypeError, ValueError):
        return _graph_error("transfers contain non-JSON values", window_days)
    if len(payload) > _MAX_JSON_BYTES or len(transfers) > _MAX_TRANSFER_COUNT:
        return _graph_error("transfer payload exceeds configured limits", window_days)
    if _is_available and _cpp_lib:
        try:
            if hasattr(_cpp_lib, "bhumi_detect_fraud_graph_with_options"):
                pointer = _cpp_lib.bhumi_detect_fraud_graph_with_options(payload, window_days)
            else:
                pointer = _cpp_lib.bhumi_detect_fraud_graph(payload)
            raw = _read_owned_string(pointer)
            if raw:
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    return parsed
        except Exception:
            pass
    return _fallback_graph(transfers, window_days)


def fast_search(records: List[Dict[str, Any]], query: str, limit: int = 25) -> Dict[str, Any]:
    """Linear search over plot_id, khatian_no, deed_no, and mouza fields."""
    if not isinstance(records, list):
        return {"error": "records must be a list", "algorithm": "Linear JSON scan O(N)", "count": 0, "results": []}
    query_text = str(query or "").strip()
    try:
        result_limit = max(0, min(int(limit), _MAX_SEARCH_RESULTS))
    except (TypeError, ValueError):
        result_limit = 25
    if len(query_text.encode("utf-8")) > _MAX_QUERY_BYTES:
        return {"error": "query exceeds configured limit", "algorithm": "Linear JSON scan O(N)", "count": 0, "results": []}
    try:
        payload = json.dumps(records, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    except (TypeError, ValueError):
        return {"error": "records contain non-JSON values", "algorithm": "Linear JSON scan O(N)", "count": 0, "results": []}
    if len(payload) > _MAX_JSON_BYTES:
        return {"error": "records exceed configured limit", "algorithm": "Linear JSON scan O(N)", "count": 0, "results": []}
    folded_query = query_text.translate(str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"))
    if _is_available and _cpp_lib:
        try:
            pointer = _cpp_lib.bhumi_fast_search(payload, query_text.encode("utf-8"), result_limit)
            raw = _read_owned_string(pointer)
            if raw:
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    return parsed
        except Exception:
            pass
    started = time.perf_counter_ns()
    matches = []
    keys = ("plot_id", "khatian_no", "deed_no", "mouza")
    if folded_query and result_limit:
        for record in records:
            if not isinstance(record, dict):
                continue
            if any(folded_query in _as_text(record.get(key)).translate(
                str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz")
            ) for key in keys):
                matches.append(record)
                if len(matches) >= result_limit:
                    break
    elapsed_us = max(0, (time.perf_counter_ns() - started) // 1000)
    return {
        "engine": "Python Fallback Search",
        "algorithm": "Linear JSON scan O(N)",
        "query": query_text,
        "count": len(matches),
        "time_us": elapsed_us,
        "time_ms": elapsed_us / 1000.0,
        "results": matches,
    }


def _run_python_benchmark(operations: int) -> Dict[str, Any]:
    started = time.perf_counter_ns()
    checksum = 0.0
    for index in range(operations):
        left, right = _BENCHMARK_PAIRS[index % len(_BENCHMARK_PAIRS)]
        checksum += _python_fuzzy_match(left, right)
    elapsed_ns = max(1, time.perf_counter_ns() - started)
    return {
        "iterations": operations,
        "elapsed_ms": elapsed_ns / 1_000_000.0,
        "operations_per_sec": operations * 1_000_000_000.0 / elapsed_ns,
        "score_checksum": checksum,
    }


def _run_cpp_bridge_benchmark(operations: int) -> Dict[str, Any]:
    """Measure the public Python-to-ctypes path, including per-call bridge work."""
    started = time.perf_counter_ns()
    checksum = 0.0
    for index in range(operations):
        left, right = _BENCHMARK_PAIRS[index % len(_BENCHMARK_PAIRS)]
        checksum += fuzzy_match(left, right)
    elapsed_ns = max(1, time.perf_counter_ns() - started)
    return {
        "iterations": operations,
        "elapsed_ms": elapsed_ns / 1_000_000.0,
        "operations_per_sec": operations * 1_000_000_000.0 / elapsed_ns,
        "score_checksum": checksum,
    }


def run_benchmark(num_operations: int = 20000) -> Dict[str, Any]:
    """Measure identical fuzzy workloads in native C++, Python, and per-call ctypes."""
    try:
        operations = max(1, min(int(num_operations), 50000))
    except (TypeError, ValueError):
        operations = 20000
    python_runs = [_run_python_benchmark(operations) for _ in range(3)]
    python_elapsed = statistics.median(item["elapsed_ms"] for item in python_runs)
    python_rate = operations * 1000.0 / max(python_elapsed, 0.000001)
    python_checksum = python_runs[1]["score_checksum"]

    cpp_runs: List[dict] = []
    if _is_available and _cpp_lib and hasattr(_cpp_lib, "bhumi_run_fuzzy_benchmark"):
        for _ in range(3):
            try:
                pointer = _cpp_lib.bhumi_run_fuzzy_benchmark(operations)
                raw = _read_owned_string(pointer)
                if raw:
                    result = json.loads(raw)
                    if isinstance(result, dict) and "elapsed_ms" in result:
                        cpp_runs.append(result)
            except Exception:
                cpp_runs = []
                break

    if not cpp_runs:
        return {
            "status": "native_benchmark_unavailable",
            "operations_requested": operations,
            "cpp_engine": None,
            "cpp_bridge": None,
            "python_comparison": {
                "operations_tested": operations,
                "median_elapsed_ms": round(python_elapsed, 4),
                "operations_per_sec": round(python_rate, 2),
                "score_checksum": python_checksum,
            },
            "speedup_factor": None,
            "verdict": "The native library must be rebuilt with the Phase 4 benchmark entry point before C++ speed can be compared.",
        }

    cpp_elapsed = statistics.median(float(item["elapsed_ms"]) for item in cpp_runs)
    cpp_rate = operations * 1000.0 / max(cpp_elapsed, 0.000001)
    cpp_checksum = float(cpp_runs[1].get("score_checksum", 0.0))
    bridge_runs = [_run_cpp_bridge_benchmark(operations) for _ in range(3)]
    bridge_elapsed = statistics.median(item["elapsed_ms"] for item in bridge_runs)
    bridge_rate = operations * 1000.0 / max(bridge_elapsed, 0.000001)
    bridge_checksum = bridge_runs[1]["score_checksum"]
    speedup = python_elapsed / max(cpp_elapsed, 0.000001)
    bridge_speedup = python_elapsed / max(bridge_elapsed, 0.000001)
    return {
        "status": "success",
        "operations_requested": operations,
        "cpp_engine": {
            "engine": _engine_name,
            "workload": "normalized UTF-8 Levenshtein fuzzy_match",
            "iterations": operations,
            "median_elapsed_ms": round(cpp_elapsed, 4),
            "throughput_ops_per_sec": round(cpp_rate, 2),
            "score_checksum": cpp_checksum,
        },
        "cpp_bridge": {
            "path": "Python normalization + UTF-8 encoding + per-call ctypes",
            "iterations": operations,
            "median_elapsed_ms": round(bridge_elapsed, 4),
            "throughput_ops_per_sec": round(bridge_rate, 2),
            "score_checksum": bridge_checksum,
            "score_checksum_match": abs(bridge_checksum - python_checksum) <= max(0.01, operations * 0.0001),
        },
        "python_comparison": {
            "algorithm": "same normalized UTF-8 Levenshtein fuzzy_match",
            "operations_tested": operations,
            "median_elapsed_ms": round(python_elapsed, 4),
            "operations_per_sec": round(python_rate, 2),
            "score_checksum": python_checksum,
        },
        "score_checksum_match": abs(cpp_checksum - python_checksum) <= max(0.01, operations * 0.0001),
        "speedup_factor": f"{speedup:.2f}x for this workload on this host",
        "cpp_engine_speedup_vs_python": f"{speedup:.2f}x",
        "cpp_bridge_speedup_vs_python": f"{bridge_speedup:.2f}x",
        "verdict": "Native throughput and the end-to-end per-call ctypes path are measured for normalized name matching; this is not a registry-scale capacity claim.",
    }
