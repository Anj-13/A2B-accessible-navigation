"""Microphone recording and ElevenLabs speech-to-text integration."""
from __future__ import annotations

from pathlib import Path
from typing import Optional
import wave

from .config import (
    ELEVENLABS_API_KEY,
    STT_LANGUAGE_CODE,
    STT_MODEL,
    STT_RECORD_SECONDS,
    STT_SAMPLE_RATE,
)


class STT:
    """Record audio or transcribe an existing file with ElevenLabs Scribe."""

    def __init__(
        self,
        model_id: str = STT_MODEL,
        language_code: Optional[str] = STT_LANGUAGE_CODE,
    ):
        self.model_id = model_id
        self.language_code = language_code

    def record_microphone(
        self,
        output_path: Optional[str] = None,
        duration_seconds: float = STT_RECORD_SECONDS,
        sample_rate: int = STT_SAMPLE_RATE,
    ) -> str:
        """Record a mono 16-bit WAV file from the default microphone."""
        try:
            import sounddevice as sd
        except ImportError as exc:
            raise RuntimeError(
                "Microphone support is not installed. Run: "
                "pip install -r requirements.txt"
            ) from exc

        if duration_seconds <= 0:
            raise ValueError("duration_seconds must be greater than zero.")

        path = Path(
            output_path
            or Path(__file__).resolve().parents[1] / "microphone_input.wav"
        )
        path.parent.mkdir(parents=True, exist_ok=True)

        print(f"Recording for {duration_seconds:g} seconds. Speak now...")
        frames = int(duration_seconds * sample_rate)
        try:
            input_device = sd.query_devices(kind="input")
            if not input_device:
                raise RuntimeError("No microphone input device is available.")
            audio = sd.rec(
                frames,
                samplerate=sample_rate,
                channels=1,
                dtype="int16",
            )
            sd.wait()
        except Exception as exc:
            raise RuntimeError(
                "Microphone recording failed. Check macOS System Settings > "
                "Privacy & Security > Microphone and allow access for your "
                "terminal or VS Code, then restart that application."
            ) from exc

        with wave.open(str(path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(audio.tobytes())

        return str(path)

    def transcribe(self, audio_path: str) -> str:
        """Transcribe an audio file using ElevenLabs Scribe v2."""
        path = Path(audio_path)
        if not path.is_file():
            raise FileNotFoundError(f"Audio file not found: {path}")
        if not ELEVENLABS_API_KEY:
            raise RuntimeError("ELEVENLABS_API_KEY is not configured.")

        try:
            from elevenlabs.client import ElevenLabs
        except ImportError as exc:
            raise RuntimeError(
                "ElevenLabs SDK is not installed. Run: "
                "pip install -r requirements.txt"
            ) from exc

        client = ElevenLabs(api_key=ELEVENLABS_API_KEY)
        with path.open("rb") as audio_file:
            transcription = client.speech_to_text.convert(
                file=audio_file,
                model_id=self.model_id,
                tag_audio_events=False,
                language_code=self.language_code,
                diarize=False,
            )

        text = str(getattr(transcription, "text", "")).strip()
        if not text:
            raise RuntimeError("ElevenLabs returned an empty transcription.")
        return text

    def listen(
        self,
        output_path: Optional[str] = None,
        duration_seconds: float = STT_RECORD_SECONDS,
    ) -> str:
        """Record from the microphone and return the transcript."""
        audio_path = self.record_microphone(
            output_path=output_path,
            duration_seconds=duration_seconds,
        )
        return self.transcribe(audio_path)


def transcribe(audio_path: str) -> str:
    """Module-level wrapper so server.py can do: from .stt import transcribe."""
    return STT().transcribe(audio_path)
