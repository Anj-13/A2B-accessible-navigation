# Voice Service (MVP)

Minimal voice service for the NVIDIA Hack for Impact — accessibility-aware navigation assistant.

This subpackage implements a small Python-based voice subsystem using the official ElevenLabs SDK.
It now includes a lightweight Ollama chat step before TTS so the voice pipeline can act as a local assistant.

## Prerequisites

- Python 3.9+
- An ElevenLabs API key

## Quick Setup

1. Create a virtual environment and activate it:

```bash
python3 -m venv voice_service/.venv
source voice_service/.venv/bin/activate
```

2. Install dependencies:

```bash
python3 -m pip install -r voice_service/requirements.txt
```

3. Copy the example env and set your API key:

```bash
cp voice_service/.env.example voice_service/.env
# then edit .env and set ELEVENLABS_API_KEY
```

4. Configure Ollama if needed:

- `OLLAMA_BASE_URL` defaults to `http://localhost:11434`
- `OLLAMA_MODEL` defaults to `gpt-oss:120b`
- `OLLAMA_TIMEOUT_SECONDS` defaults to `30`
- `ROUTE_API_BASE_URL` defaults to `http://127.0.0.1:3000`

## Usage

- From the repository root:

```bash
source voice_service/.venv/bin/activate
python3 -m voice_service.app.main
```

This will prompt for a user message, save the conversation to `conversation_history.json`, and synthesize `output.mp3`.
The demo calls the route recommendation API first, injects the scored route into
the local Ollama prompt, then synthesizes the response. It falls back gracefully
if either local service is unavailable.

Microphone input:

```bash
python3 -m voice_service.app.main --microphone
```

The default recording window is seven seconds. Override it with:

```bash
python3 -m voice_service.app.main --microphone --record-seconds 10
```

Transcribe an existing audio file:

```bash
python3 -m voice_service.app.main --audio request.wav
```

Typed input remains available through the normal prompt or:

```bash
python3 -m voice_service.app.main --text "Take me to Westminster without stairs"
```

Test the Ollama integration with a local server running:

```bash
python3 -m voice_service.app.main
```

If you want to check the Ollama endpoint before running the demo:

```bash
curl http://127.0.0.1:11434/api/tags
```

For the complete Mac + NVIDIA DGX Spark workflow, see
[`../DEMO_RUNBOOK.md`](../DEMO_RUNBOOK.md).

Notes

- `app/tts.py` uses the official ElevenLabs SDK. If the package is missing, the code will raise a helpful error.
- `app/stt.py` records a WAV from the default microphone and transcribes it
  using ElevenLabs Scribe v2.
- Conversation history is stored in `conversation_history.json` at the `voice_service` root.
- `app/llm.py` uses plain HTTP requests against Ollama and logs connection or JSON errors clearly.

Integration

- Start the route API from the repository root with `npm start`.
- Run the voice service from `voice_service` with `python -m app.main`.
- `app/route_client.py` calls `POST /api/recommend-from-data` and converts the
  route result into authoritative context for Ollama.
