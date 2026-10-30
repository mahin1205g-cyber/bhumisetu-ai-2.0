"""Vercel entrypoint.

Vercel's Python runtime looks for a FastAPI instance named ``app`` in a
supported entrypoint (``app.py``, ``index.py``, ``server.py``, ``main.py``,
...). The real application lives in ``backend/main.py``; this module puts
``backend/`` on ``sys.path`` (so its flat ``import engine`` / ``import
cpp_bridge`` imports resolve) and re-exports the app.
"""

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"

for entry in (str(BACKEND_DIR), str(ROOT_DIR)):
    if entry not in sys.path:
        sys.path.insert(0, entry)

from backend.main import app  # noqa: E402,F401
