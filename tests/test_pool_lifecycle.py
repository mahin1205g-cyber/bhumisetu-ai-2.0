import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
import engine


def test_close_pool_stops_workers_with_connection_timeout_budget(monkeypatch):
    closed_with = []

    class Pool:
        def close(self, timeout):
            closed_with.append(timeout)

    monkeypatch.setattr(engine, "_pool", Pool())

    engine.close_pool()

    assert closed_with == [12.0]
    assert engine._pool is None
