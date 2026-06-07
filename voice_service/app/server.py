"""FastAPI HTTP server for the voice service.

Run with:
    cd voice_service
    python -m app.server

Listens on port 5001.
"""
import tempfile
import os
import logging
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from . import config
from .stt import transcribe
from .llm import generate_response
from .tts import synthesize
from .route_client import get_route_recommendation, format_route_context
from .memory import start_conversation_turn, complete_conversation_turn

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="A2B Voice Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/stt")
async def speech_to_text(file: UploadFile = File(...)):
    """Accept an audio file (webm/mp4/wav) and return its transcription."""
    if not config.validate_api_key(raise_on_missing=False):
        raise HTTPException(status_code=503, detail="ELEVENLABS_API_KEY not configured.")

    # Determine a safe suffix from the content type or filename
    content_type = file.content_type or ""
    if "webm" in content_type or (file.filename or "").endswith(".webm"):
        suffix = ".webm"
    elif "mp4" in content_type or (file.filename or "").endswith(".mp4"):
        suffix = ".mp4"
    elif "wav" in content_type or (file.filename or "").endswith(".wav"):
        suffix = ".wav"
    else:
        suffix = ".webm"  # sensible default for browser recordings

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            content = await file.read()
            tmp.write(content)

        logger.info("Transcribing %d bytes (%s)", len(content), suffix)
        text = transcribe(tmp_path)
        logger.info("Transcript: %r", text)
        return {"transcript": text}
    except Exception as exc:
        logger.error("STT failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


class RespondRequest(BaseModel):
    transcript: str
    destinationId: Optional[str] = None


@app.post("/respond")
async def respond(body: RespondRequest):
    """Accept a voice transcript and return synthesized audio of the AI response."""
    if not config.validate_api_key(raise_on_missing=False):
        raise HTTPException(status_code=503, detail="ELEVENLABS_API_KEY not configured.")

    turn_index = start_conversation_turn(body.transcript)

    route_rec = get_route_recommendation(body.transcript, destination_id=body.destinationId)
    route_context = format_route_context(route_rec)

    reply_text = generate_response(body.transcript, route_context=route_context)
    complete_conversation_turn(turn_index, reply_text)

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
            tmp_path = tmp.name
        synthesize(reply_text, output_path=tmp_path)
        with open(tmp_path, "rb") as f:
            audio_bytes = f.read()
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as exc:
        logger.error("Respond endpoint failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


if __name__ == "__main__":
    uvicorn.run("app.server:app", host="0.0.0.0", port=5001, reload=False)
