"""Text-to-speech integration using the official ElevenLabs SDK.

This module keeps imports lazy so the package can be imported without the SDK
installed (useful for lightweight checks or CI). If the SDK is missing the
functions will raise an explanatory error when called.
"""
from pathlib import Path
from typing import Optional
from .config import ELEVENLABS_API_KEY, VOICE_NAME


def synthesize(text: str, output_path: Optional[str] = None, voice_name: Optional[str] = None) -> str:
    """Synthesize `text` to an MP3 file using ElevenLabs.

    Returns the path to the saved audio file.
    """
    if output_path is None:
        output_path = Path(__file__).resolve().parents[1] / "output.mp3"
    else:
        output_path = Path(output_path)

    try:
        # Lazy import of the official SDK
        from elevenlabs import ElevenLabs, save
    except Exception as exc:  # pragma: no cover - depends on environment
        raise RuntimeError("elevenlabs SDK is not installed. Install with: pip install elevenlabs") from exc

    if not ELEVENLABS_API_KEY:
        raise RuntimeError("ELEVENLABS_API_KEY is not configured. See .env.example")

    client = ElevenLabs(api_key=ELEVENLABS_API_KEY)

    voice_to_use = voice_name or VOICE_NAME
    voice_id = _resolve_voice_id(client, voice_to_use)

    # `convert` returns an iterator of audio bytes that the SDK `save` helper can write
    audio = client.text_to_speech.convert(
        voice_id=voice_id,
        text=text,
        model_id="eleven_multilingual_v2",
        output_format="mp3_44100_128",
    )
    save(audio, str(output_path))
    return str(output_path)


def _resolve_voice_id(client, voice_name: str) -> str:
    """Resolve a configured voice name to a voice ID.

    Falls back to the first available voice if the configured name is not found.
    """
    try:
        voices_response = client.voices.get_all()
        voices = getattr(voices_response, "voices", [])
    except Exception as exc:
        raise RuntimeError("Unable to load ElevenLabs voices to resolve a voice ID.") from exc

    for voice in voices:
        if getattr(voice, "name", "").lower() == voice_name.lower():
            return voice.voice_id

    if voices:
        return voices[0].voice_id

    raise RuntimeError("No ElevenLabs voices were returned for the configured API key.")
