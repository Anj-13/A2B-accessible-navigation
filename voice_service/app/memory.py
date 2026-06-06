"""Simple conversation memory backed by a JSON file.

Stores entries with timestamp, user message, and assistant response.
"""
from pathlib import Path
import json
from datetime import datetime, timezone
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
HISTORY_FILE = ROOT / "conversation_history.json"


def _load_history() -> List[Dict[str, Any]]:
    ensure_history_file()
    try:
        with HISTORY_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        data = []

    if not isinstance(data, list):
        data = []
    return data


def _write_history(data: List[Dict[str, Any]]) -> None:
    with HISTORY_FILE.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def get_recent_conversation_turns(limit: int = 5) -> List[Dict[str, str]]:
    """Return the most recent completed conversation turns.

    The voice pipeline injects only these turns into the Ollama prompt so the
    local context window stays small and hackathon-friendly.
    """
    if limit <= 0:
        return []

    recent_turns: List[Dict[str, str]] = []
    for entry in _load_history()[-limit:]:
        if not isinstance(entry, dict):
            continue

        user_message = str(entry.get("user_message", "")).strip()
        assistant_response = str(entry.get("assistant_response", "")).strip()
        if not user_message and not assistant_response:
            continue

        recent_turns.append(
            {
                "user_message": user_message,
                "assistant_response": assistant_response,
            }
        )

    return recent_turns

def ensure_history_file() -> None:
    """Create the history file with an empty list if it doesn't exist."""
    if not HISTORY_FILE.exists():
        HISTORY_FILE.write_text("[]", encoding="utf-8")


def start_conversation_turn(user_message: str) -> int:
    """Persist the user message before the model call and return the turn index."""
    data = _load_history()
    data.append(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_message": user_message,
            "assistant_response": "",
        }
    )
    _write_history(data)
    return len(data) - 1


def complete_conversation_turn(turn_index: int, assistant_response: str) -> None:
    """Update an existing turn with the assistant response."""
    data = _load_history()
    if 0 <= turn_index < len(data):
        entry = data[turn_index]
        if isinstance(entry, dict):
            entry["assistant_response"] = assistant_response
            data[turn_index] = entry
            _write_history(data)


def save_conversation(user_message: str, assistant_response: str) -> None:
    """Append a conversation entry to the history file.

    Each entry contains an ISO timestamp, the user message, and the assistant response.
    """
    data = _load_history()
    data.append(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_message": user_message,
            "assistant_response": assistant_response,
        }
    )
    _write_history(data)
