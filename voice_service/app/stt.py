"""Placeholder STT (speech-to-text) interface.

This module provides a simple interface for future STT integrations
(microphone capture, ElevenLabs STT, or other providers). Currently it
returns a placeholder transcription.
"""
from typing import Optional


class STT:
    """Simple STT abstraction.

    TODO: add microphone streaming support and integration with a real STT provider.
    """
    def __init__(self, provider: Optional[str] = None):
        self.provider = provider or "placeholder"

    def transcribe(self, audio_path: str) -> str:
        """Transcribe an audio file and return text.

        Currently a placeholder implementation that returns a stub string.
        """
        # TODO: integrate with a microphone input and a real STT provider
        return f"[transcription placeholder for {audio_path}]"
