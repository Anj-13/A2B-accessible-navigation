# A2B Demo Runbook

This is the recommended demo-day setup:

- The A2B frontend, route API, microphone, and ElevenLabs client run on the Mac.
- Ollama and `gpt-oss:120b` run on the NVIDIA DGX Spark.
- An SSH tunnel exposes DGX Ollama at `http://127.0.0.1:11434` on the Mac.

This keeps the browser and microphone local. The DGX connection is the only
remote dependency to troubleshoot on demo day.

## Tonight

From the repository root:

```bash
python3 -m venv voice_service/.venv
source voice_service/.venv/bin/activate
python3 -m pip install -r voice_service/requirements.txt
npm test
npm run demo:check
```

Confirm `voice_service/.env` contains the ElevenLabs key. Never commit that
file; it is ignored by Git.

## Tomorrow: Start The Demo

Use four VS Code terminals and keep the first three running.

### Terminal 1: DGX Tunnel

```bash
npm run demo:dgx
```

The default host is `nvidia@hp-10.local`. Override it when necessary:

```bash
DGX_HOST=nvidia@<DGX-IP> npm run demo:dgx
```

Verify the tunnel:

```bash
curl http://127.0.0.1:11434/api/tags
```

### Terminal 2: A2B App

```bash
npm start
```

Open `http://127.0.0.1:3000`. Do not use Live Server.

### Terminal 3: Final Check

```bash
source voice_service/.venv/bin/activate
npm run demo:check
```

The check should report zero failures. A warning is acceptable only when it
describes a service that you intentionally have not started.

### Terminal 4: Voice Demo

Use typed input for the most reliable recording:

```bash
source voice_service/.venv/bin/activate
python3 -m voice_service.app.main --text \
  "I need a step-free route with lifts and fewer changes."
```

Use the microphone for the live interaction:

```bash
source voice_service/.venv/bin/activate
python3 -m voice_service.app.main --microphone --record-seconds 8
```

The response is printed, stored in `voice_service/conversation_history.json`,
and synthesized to `voice_service/output.mp3`.

## 2-Minute Recording Script

### 0:00-0:20 | Problem

"Public transport apps often optimize only for speed. A route that looks best
on paper can be unusable when a passenger needs step-free access, working
lifts, less walking, or fewer changes."

Show the A2B home screen.

### 0:20-0:45 | Product

"A2B is an accessibility-aware journey assistant. The user can choose a
destination and transport mode, then state accessibility needs before the
route is scored."

Select a destination, turn accessibility needs on, and choose Underground.

### 0:45-1:15 | Intelligence

"Our deterministic route engine combines journey time, disruption, crowding,
walking, transfers, fares, lift status, ramps, and step-free access. It can
reject the nominal fastest route when it is unsuitable."

Show the route card, accessibility badges, confidence, and reroute explanation.

### 1:15-1:40 | NVIDIA

"The conversational layer runs with `gpt-oss:120b` through Ollama on an NVIDIA
DGX Spark. The scored route is supplied as authoritative context, so the model
explains the recommendation instead of inventing one."

Run the typed or microphone voice prompt and play `voice_service/output.mp3`.

### 1:40-2:00 | Impact

"A2B helps people make journeys they can actually complete. It keeps
accessibility preferences in conversation memory and can reroute when a lift,
station, line, or road becomes unavailable."

End on the route screen or arrival screen.

## Fast Fallbacks

- DGX hostname fails: use its IP with `DGX_HOST=nvidia@<DGX-IP>`.
- SSH works but Ollama does not: on the DGX run
  `curl http://127.0.0.1:11434/api/tags`.
- Model is absent: on the DGX run `ollama pull gpt-oss:120b`.
- Microphone fails: use `--text`; the same route, memory, Ollama, and TTS
  pipeline still runs.
- ElevenLabs fails: show the printed response and continue the UI demo.
- Map tiles fail: the app falls back to a route line; keep narrating.
- Port 3000 is busy: run `lsof -nP -iTCP:3000 -sTCP:LISTEN`, stop the old
  process, then rerun `npm start`.

## Before Recording

- Close notifications, email, and unrelated browser tabs.
- Increase terminal and browser zoom so text is readable.
- Clear sensitive terminal history and never show `.env`.
- Use the typed prompt once before recording to warm the model.
- Record one clean end-to-end take, then capture close-up UI shots if needed.
- Confirm the GitHub repository is public or accessible to the judges and that
  the latest commit contains this runbook.
