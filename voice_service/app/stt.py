"""ElevenLabs Scribe speech-to-text transcription."""
from elevenlabs import ElevenLabs
from . import config


def transcribe(audio_path: str) -> str:
    """Transcribe an audio file using ElevenLabs Scribe and return the text."""
    config.validate_api_key(raise_on_missing=True)
    client = ElevenLabs(api_key=config.ELEVENLABS_API_KEY)
    with open(audio_path, "rb") as f:
        result = client.speech_to_text.convert(
            audio=f,
            model_id="scribe_v1",
            language_code="en",
        )
    return result.text
