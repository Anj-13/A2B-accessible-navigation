"""Minimal demo runner for the voice service.

Demonstrates reading a user message, saving conversation history,
sending the message to Ollama, and synthesizing speech.
"""
from pathlib import Path
import logging

from . import config
from .llm import FALLBACK_RESPONSE, generate_response
from .memory import complete_conversation_turn, ensure_history_file, start_conversation_turn
from .tts import synthesize


logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger(__name__)


def main() -> None:
    print("Voice Service pipeline demo")
    # Ensure the history file exists
    ensure_history_file()

    user_message = input("User: ").strip()
    if not user_message:
        print("No input provided. Exiting.")
        return

    # Save the user message before the model call so the turn is recorded immediately.
    turn_index = start_conversation_turn(user_message)
    print("Saved user message to conversation_history.json")

    # Send to Ollama and keep the demo alive even if the local server is unavailable.
    assistant_response = generate_response(user_message)
    if assistant_response == FALLBACK_RESPONSE:
        logger.warning("Using fallback assistant response because Ollama was unavailable.")

    # Store the assistant response in the same turn.
    complete_conversation_turn(turn_index, assistant_response)
    print("Saved assistant response to conversation_history.json")

    # Validate API key before trying to synthesize.
    if not config.validate_api_key(raise_on_missing=False):
        print("Warning: ELEVENLABS_API_KEY not configured. Skipping TTS step.")
        return

    output_file = Path(__file__).resolve().parents[1] / "output.mp3"
    try:
        saved = synthesize(assistant_response, output_path=str(output_file))
        print(f"Synthesized speech saved to: {saved}")
    except Exception as exc:
        print("TTS failed:", exc)


if __name__ == "__main__":
    main()
