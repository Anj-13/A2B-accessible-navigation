"""Shared paths and service configuration for local and NemoClaw execution."""
import os
from pathlib import Path


BASE_DIR = Path(
    os.getenv(
        "SANDBOX_DIR",
        "/sandbox" if Path("/sandbox").is_dir() else Path(__file__).resolve().parent,
    )
)
DATA_DIR = Path(os.getenv("SANDBOX_DATA_DIR", BASE_DIR / "data"))
MEMORY_FILE = Path(os.getenv("SANDBOX_MEMORY_FILE", BASE_DIR / "memory.json"))
ROUTE_API_BASE_URL = os.getenv("ROUTE_API_BASE_URL", "http://127.0.0.1:3000")
ROUTE_API_TIMEOUT_SECONDS = float(os.getenv("ROUTE_API_TIMEOUT_SECONDS", "5"))
OPENCLAW_COMMAND = os.getenv("OPENCLAW_COMMAND", "openclaw")
