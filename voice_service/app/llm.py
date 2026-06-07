"""Minimal Ollama client for the voice assistant pipeline.

This module uses plain HTTP requests against a local Ollama server and falls
back gracefully when the server is unavailable.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

import requests

from .config import OLLAMA_BASE_URL, OLLAMA_MODEL, OLLAMA_TIMEOUT_SECONDS
from .memory import get_recent_conversation_turns

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a concise accessibility-aware navigation assistant for London. "
    "Be helpful, direct, and practical."
)
FALLBACK_RESPONSE = (
    "I am having trouble reaching the local planner right now, but I saved your message. "
    "Please try again in a moment."
)

MAX_CONTEXT_TURNS = 5


def build_messages(
    user_message: str,
    conversation_context: Optional[List[Dict[str, str]]] = None,
    max_context_turns: int = MAX_CONTEXT_TURNS,
    route_context: Optional[str] = None,
) -> List[Dict[str, str]]:
    """Build the Ollama chat payload from bounded memory plus the live user message.

    Memory is injected here: we take the latest completed turns from local history,
    convert them into chat messages, and append the current user prompt last.
    Only a small trailing window is included so the context stays bounded.
    """
    recent_turns = conversation_context if conversation_context is not None else get_recent_conversation_turns(limit=max_context_turns)
    messages: List[Dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]

    if route_context:
        messages.append(
            {
                "role": "system",
                "content": (
                    "Authoritative route-engine result follows. Use these facts "
                    "for the answer, do not invent a different route, and explain "
                    f"rerouting clearly: {route_context}"
                ),
            }
        )

    for turn in recent_turns[-max_context_turns:]:
        user_text = str(turn.get("user_message", "")).strip()
        assistant_text = str(turn.get("assistant_response", "")).strip()

        if user_text:
            messages.append({"role": "user", "content": user_text})
        if assistant_text:
            messages.append({"role": "assistant", "content": assistant_text})

    messages.append({"role": "user", "content": user_message})
    return messages


def generate_response(
    user_message: str,
    conversation_context: Optional[List[Dict[str, str]]] = None,
    route_context: Optional[str] = None,
) -> str:
    """Send the latest user message to Ollama and return the assistant response.

    The `conversation_context` argument can be supplied by tests or future
    callers, but by default we inject the latest local memory here.
    """
    url = f"{OLLAMA_BASE_URL.rstrip('/')}/api/chat"
    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": build_messages(
            user_message,
            conversation_context=conversation_context,
            route_context=route_context,
        ),
    }

    try:
        response = requests.post(url, json=payload, timeout=OLLAMA_TIMEOUT_SECONDS)
        response.raise_for_status()
        data = response.json()
        message = (data.get("message") or {}).get("content", "").strip()
        if not message:
            logger.error("Ollama returned an empty message from %s using model %s", url, OLLAMA_MODEL)
            return FALLBACK_RESPONSE
        return message
    except requests.exceptions.RequestException as exc:
        logger.warning(
            "Ollama unavailable at %s with model %s: %s",
            url,
            OLLAMA_MODEL,
            exc,
        )
    except ValueError as exc:
        logger.warning(
            "Ollama returned invalid JSON from %s with model %s: %s",
            url,
            OLLAMA_MODEL,
            exc,
        )

    return FALLBACK_RESPONSE
