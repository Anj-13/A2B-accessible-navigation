import json
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from app import llm, memory


class ConversationMemoryAndLlmTests(TestCase):
    def _read_history(self, history_file: Path):
        return json.loads(history_file.read_text(encoding="utf-8"))

    def test_history_updates_each_interaction_and_prompt_includes_prior_turns(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            history_file = Path(temp_dir) / "conversation_history.json"

            with patch.object(memory, "HISTORY_FILE", history_file):
                memory.ensure_history_file()

                first_turn = memory.start_conversation_turn("First user message about the route.")
                history = self._read_history(history_file)
                self.assertEqual(len(history), 1)
                self.assertEqual(history[0]["user_message"], "First user message about the route.")
                self.assertEqual(history[0]["assistant_response"], "")

                memory.complete_conversation_turn(first_turn, "First assistant reply.")
                history = self._read_history(history_file)
                self.assertEqual(history[0]["assistant_response"], "First assistant reply.")

                second_turn = memory.start_conversation_turn(
                    "Second user message referencing the earlier station."
                )
                history = self._read_history(history_file)
                self.assertEqual(len(history), 2)
                self.assertEqual(history[1]["user_message"], "Second user message referencing the earlier station.")
                self.assertEqual(history[1]["assistant_response"], "")

                memory.complete_conversation_turn(second_turn, "Second assistant reply.")
                history = self._read_history(history_file)
                self.assertEqual(history[1]["assistant_response"], "Second assistant reply.")

                with patch("app.llm.requests.post") as mock_post:
                    mock_post.return_value.raise_for_status.return_value = None
                    mock_post.return_value.json.return_value = {
                        "message": {"content": "Mock Ollama answer."}
                    }

                    response = llm.generate_response("Where should I go next?")

                self.assertEqual(response, "Mock Ollama answer.")
                payload = mock_post.call_args.kwargs["json"]
                messages = payload["messages"]
                contents = [message["content"] for message in messages]

                self.assertEqual(messages[0]["role"], "system")
                self.assertIn("First user message about the route.", contents)
                self.assertIn("First assistant reply.", contents)
                self.assertIn("Second user message referencing the earlier station.", contents)
                self.assertIn("Second assistant reply.", contents)
                self.assertEqual(contents[-1], "Where should I go next?")

    def test_prompt_context_is_bounded_to_last_five_turns(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            history_file = Path(temp_dir) / "conversation_history.json"

            with patch.object(memory, "HISTORY_FILE", history_file):
                memory.ensure_history_file()

                for index in range(1, 7):
                    turn_index = memory.start_conversation_turn(f"User turn {index}")
                    memory.complete_conversation_turn(turn_index, f"Assistant turn {index}")

                with patch("app.llm.requests.post") as mock_post:
                    mock_post.return_value.raise_for_status.return_value = None
                    mock_post.return_value.json.return_value = {
                        "message": {"content": "Mock Ollama answer."}
                    }

                    llm.generate_response("Current user question")

                payload = mock_post.call_args.kwargs["json"]
                contents = [message["content"] for message in payload["messages"]]

                self.assertNotIn("User turn 1", contents)
                self.assertNotIn("Assistant turn 1", contents)
                for index in range(2, 7):
                    self.assertIn(f"User turn {index}", contents)
                    self.assertIn(f"Assistant turn {index}", contents)
                self.assertEqual(contents[-1], "Current user question")
