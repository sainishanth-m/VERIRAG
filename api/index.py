"""Vercel Python Serverless entrypoint exposing the FastAPI application."""

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.main import app

__all__ = ["app"]
