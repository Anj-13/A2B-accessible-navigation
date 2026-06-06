import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch

from app import tts


class TextToSpeechTests(TestCase):
    @patch("app.tts.ELEVENLABS_API_KEY", "test-key")
    @patch("app.tts.ELEVENLABS_VOICE_ID", "documented-voice-id")
    def test_configured_voice_id_avoids_voice_listing_permission(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "output.mp3"
            client = MagicMock()
            client.text_to_speech.convert.return_value = [b"audio"]

            def fake_save(audio, path):
                Path(path).write_bytes(b"".join(audio))

            with patch.dict(
                "sys.modules",
                {
                    "elevenlabs": SimpleNamespace(
                        ElevenLabs=MagicMock(return_value=client),
                        save=fake_save,
                    )
                },
            ):
                saved = tts.synthesize("Hello", str(output_path))

            self.assertEqual(saved, str(output_path))
            client.voices.get_all.assert_not_called()
            self.assertEqual(
                client.text_to_speech.convert.call_args.kwargs["voice_id"],
                "documented-voice-id",
            )
            self.assertEqual(output_path.read_bytes(), b"audio")
