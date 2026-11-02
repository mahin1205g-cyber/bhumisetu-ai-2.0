import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import engine


class FakeResult:
    def __init__(self, rows=None, value=None):
        self.rows = rows or []
        self.value = value

    def fetchone(self):
        return {"n": self.value}

    def fetchall(self):
        return self.rows

    def __iter__(self):
        return iter(self.rows)


class FakeConnection:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql):
        query = " ".join(sql.split())
        if query == "SELECT COUNT(*) n FROM properties":
            return FakeResult(value=7)
        if query == "SELECT COUNT(*) n FROM deeds":
            return FakeResult(value=12)
        if query == "SELECT COUNT(*) n FROM deed_verifications":
            return FakeResult(value=4)
        if query.startswith("SELECT status, COUNT(*) n FROM mutation_applications"):
            return FakeResult(rows=[{"status": "Draft", "n": 1}, {"status": "Submitted", "n": 2}])
        if query.startswith("SELECT risk_level, COUNT(*) n FROM records"):
            return FakeResult(rows=[{"risk_level": "high", "n": 2}, {"risk_level": "low", "n": 3}])
        if "risk_level = 'high'" in query:
            return FakeResult(value=1)
        if "risk_level = 'medium'" in query:
            return FakeResult(value=2)
        if query == "SELECT COUNT(*) n FROM due_diligence_reports":
            return FakeResult(value=5)
        if query.startswith("SELECT * FROM audit_logs"):
            return FakeResult(rows=[{"id": 9, "action": "test"}])
        raise AssertionError(f"Unexpected dashboard query: {query}")


def test_dashboard_stats_uses_one_connection_and_returns_all_sections(monkeypatch):
    connection_calls = []
    monkeypatch.setattr(engine, "init", lambda: None)
    monkeypatch.setattr(engine, "conn", lambda: connection_calls.append(True) or FakeConnection())

    result = engine.dashboard_stats()

    assert len(connection_calls) == 1
    assert result["total_properties"] == 7
    assert result["total_deeds"] == 12
    assert result["total_verifications"] == 4
    assert result["mutation_stats"]["total"] == 3
    assert result["mutation_stats"]["pending"] == 2
    assert result["record_risk_stats"] == {"total": 5, "high": 2, "medium": 0, "low": 3}
    assert result["due_diligence_stats"] == {"total": 5, "high": 1, "medium": 2}
    assert result["recent_activity"] == [{"id": 9, "action": "test"}]
