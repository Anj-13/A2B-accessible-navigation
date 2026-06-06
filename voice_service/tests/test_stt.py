import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch

from app.stt import STT


class SpeechToTextTests(TestCase):
    def test_missing_audio_file_is_rejected(self):
        with self.assertRaises(FileNotFoundError):
            STT().transcribe("/missing/audio.wav")

    @patch("app.stt.ELEVENLABS_API_KEY", "test-key")
    def test_audio_file_uses_elevenlabs_scribe(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            audio_path = Path(temp_dir) / "audio.wav"
            audio_path.write_bytes(b"fake audio")

            client = MagicMock()
            client.speech_to_text.convert.return_value = SimpleNamespace(
                text="Take me to Westminster."
            )

            with patch.dict(
                "sys.modules",
                {
                    "elevenlabs.client": SimpleNamespace(
                        ElevenLabs=MagicMock(return_value=client)
                    )
                },
            ):
                transcript = STT().transcribe(str(audio_path))

            self.assertEqual(transcript, "Take me to Westminster.")
            kwargs = client.speech_to_text.convert.call_args.kwargs
            self.assertEqual(kwargs["model_id"], "scribe_v2")
