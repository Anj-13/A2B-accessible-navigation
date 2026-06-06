"""Configuration loader for the voice service.

Loads environment variables from `.env` at the `voice_service` root.
Provides a small validation helper for the ElevenLabs API key.
"""
from pathlib import Path
import os
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
_env_path = ROOT / ".env"
load_dotenv(dotenv_path=_env_path)

# Environment-configured values
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
VOICE_NAME = os.getenv("VOICE_NAME", "alloy")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gpt-oss:120b")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "30"))

def validate_api_key(raise_on_missing: bool = False) -> bool:
    """Validate that the ElevenLabs API key is available.

    By default this returns a boolean. If `raise_on_missing` is True a
    ValueError is raised when the key is missing.
    """
    if not ELEVENLABS_API_KEY:
        if raise_on_missing:
            raise ValueError("ELEVENLABS_API_KEY is not set. Copy .env.example → .env and add your key.")
        return False
    return True
