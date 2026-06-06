"""Minimal demo runner for the voice service.

Demonstrates reading a user message, saving conversation history,
sending the message to Ollama, and synthesizing speech.
"""
from pathlib import Path
import argparse
import logging

from . import config
from .llm import FALLBACK_RESPONSE, generate_response
from .memory import (
    complete_conversation_turn,
    ensure_history_file,
    get_recent_conversation_turns,
    start_conversation_turn,
)
from .route_client import format_route_context, get_route_recommendation
from .stt import STT
from .tts import synthesize


logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger(__name__)


def parse_args():
    parser = argparse.ArgumentParser(description="Voice route assistant demo")
    input_group = parser.add_mutually_exclusive_group()
    input_group.add_argument(
        "--microphone",
        action="store_true",
        help="Record from the default microphone and transcribe with ElevenLabs.",
    )
    input_group.add_argument(
        "--audio",
        help="Transcribe an existing audio file with ElevenLabs.",
    )
    input_group.add_argument(
        "--text",
        help="Use the supplied text without recording audio.",
    )
    parser.add_argument(
        "--record-seconds",
        type=float,
        default=config.STT_RECORD_SECONDS,
        help="Microphone recording duration.",
    )
    return parser.parse_args()


def get_user_message(args) -> str:
    if args.microphone:
        return STT().listen(duration_seconds=args.record_seconds)
    if args.audio:
        return STT().transcribe(args.audio)
    if args.text is not None:
        return args.text.strip()
    try:
        return input("User: ").strip()
    except EOFError:
        return ""


def main() -> None:
    args = parse_args()
    print("Voice Service pipeline demo")
    # Ensure the history file exists
    ensure_history_file()

    try:
        user_message = get_user_message(args)
    except Exception as exc:
        print(f"Audio input failed: {exc}")
        print("Falling back to typed input.")
        try:
            user_message = input("User: ").strip()
        except EOFError:
            user_message = ""

    if not user_message:
        print("No input provided. Exiting.")
        return
    print(f"Transcript: {user_message}")

    conversation_context = get_recent_conversation_turns()

    # Save the user message before external calls so the turn is recorded immediately.
    turn_index = start_conversation_turn(user_message)
    print("Saved user message to conversation_history.json")

    recommendation = get_route_recommendation(
        user_message,
        conversation_context=conversation_context,
    )
    route_context = format_route_context(recommendation)
    if recommendation:
        print(
            "Route engine selected:",
            recommendation.get("recommendedRoute", {}).get("id"),
        )
    else:
        logger.warning("Continuing without route-engine context.")

    # Send the scored route result to Ollama and keep the demo alive if unavailable.
    assistant_response = generate_response(
        user_message,
        conversation_context=conversation_context,
        route_context=route_context,
    )
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
