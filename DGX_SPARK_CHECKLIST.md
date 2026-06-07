# DGX Spark Integration Checklist

Everything needed to connect the A2B app to DGX Spark in a new session.
Work through each section top-to-bottom. Each section has a **test command** to confirm it passes before moving on.

---

## 1. Find the DGX Spark address

You need the IP or hostname DGX Spark is reachable on from your machine.

```bash
# Replace <SPARK_IP> with the actual IP throughout this document
ping <SPARK_IP>
```

**What to confirm:** you get replies.

---

## 2. Verify Ollama is running on DGX Spark

The voice service (`voice_service/app/llm.py`) calls Ollama for the conversational assistant.
Default expected port: **11434**.

```bash
curl http://<SPARK_IP>:11434/api/tags
```

**What to confirm:** returns JSON with a `models` array (list of available models).

---

## 3. Confirm the model name

The `.env` currently sets `OLLAMA_MODEL=gpt-oss:120b`.
Check that exact name exists in the models list from step 2.

```bash
curl http://<SPARK_IP>:11434/api/tags | python -m json.tool | grep '"name"'
```

**What to confirm:** `"gpt-oss:120b"` appears.
If the name is different, note the correct name — you'll set it in step 5.

---

## 4. Do a test inference against Ollama

Confirm the model actually responds (not just listed).

```bash
curl http://<SPARK_IP>:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-oss:120b",
    "stream": false,
    "messages": [{"role": "user", "content": "Reply with one word: ready"}]
  }'
```

**What to confirm:** response JSON contains `"message": {"role": "assistant", "content": "..."}`.

---

## 5. Update voice_service/.env

Open `voice_service/.env` and change these two lines:

```
# FROM:
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gpt-oss:120b

# TO:
OLLAMA_BASE_URL=http://<SPARK_IP>:11434
OLLAMA_MODEL=<confirmed model name from step 3>
```

**Test:** restart the voice service and hit its health endpoint.

```bash
cd voice_service
python -m app.server &
curl http://localhost:5001/health
```

**What to confirm:** `{"status": "ok"}`

---

## 6. Test the full voice pipeline (STT → LLM → TTS)

Record a short audio clip or use an existing `.webm` file.

```bash
# Test STT only
curl -F "file=@test.webm" http://localhost:5001/stt

# Test full respond pipeline (LLM + TTS)
curl -X POST http://localhost:5001/respond \
  -H "Content-Type: application/json" \
  -d '{"transcript": "What is the best way to get to Baker Street?", "destinationId": "baker"}' \
  --output response.mp3 && open response.mp3
```

**What to confirm (STT):** `{"transcript": "...some text..."}` — not null.
**What to confirm (respond):** `response.mp3` plays back spoken audio.

---

## 7. Check if Nemoclaw has a separate HTTP endpoint

Nemoclaw may expose its own API endpoint separate from Ollama (e.g. a REST or gRPC service).

```bash
# Common ports to check — ask your team or DGX Spark docs for the actual port
curl http://<SPARK_IP>:8000/health
curl http://<SPARK_IP>:8080/health
curl http://<SPARK_IP>:5000/health
```

**What to confirm:** one of these returns a non-404 response.
Note down: **Nemoclaw base URL**, **endpoint path**, and **request/response format**.

---

## 8. Plug Nemoclaw into the Analyzer Agent

The stub in `server.js` is clearly marked. Find it at:

```
server.js  ~line 216
// Analyzer stub — replaced by Nemoclaw/DGX Spark when available
const selectedId = currentRouteId ?? adaptedRoutes[0].id;
const currentRoute = adaptedRoutes.find((r) => r.id === selectedId) ?? adaptedRoutes[0];
const alternatives = adaptedRoutes.filter((r) => r.id !== currentRoute.id);
const result = recommendRoute({ userProfile, currentRoute, alternativeRoutes: alternatives, ... });
```

Replace this block with an HTTP call to Nemoclaw. The structured prompt format to send is:

```json
{
  "task": "route_selection",
  "user_constraints": {
    "accessibilityRequired": false,
    "prefersFewerTransfers": false,
    "costSensitive": false,
    "preferredModes": [],
    "avoidModes": []
  },
  "candidate_routes": [
    {
      "id": "tfl_journey_0",
      "summary": "Bakerloo line",
      "mode": "tube",
      "eta_minutes": 12,
      "walking_minutes": 4,
      "transfers": 0,
      "step_free": true,
      "lift_status": "working",
      "disruption_minutes": 0,
      "crowding_level": "medium",
      "base_fare": 2.80,
      "legs": [...]
    }
  ],
  "current_route_id": "tfl_journey_0",
  "current_leg_id": null
}
```

**Expected response shape from Nemoclaw:**

```json
{
  "recommended_route_id": "tfl_journey_0",
  "explanation": "Bakerloo line is fastest with step-free access.",
  "should_reroute": false,
  "reroute_trigger": null,
  "scores": { "tfl_journey_0": 14.5, "tfl_journey_1": 22.1 }
}
```

The new code block (replacing the stub) should:
1. POST the structured prompt to Nemoclaw
2. Map `recommended_route_id` → pick that route from `adaptedRoutes` as `recommendedRoute`
3. Map `should_reroute` → `result.shouldReroute`
4. Map `explanation` → `result.explanation`
5. Fall back to `scoreRoute.js` if Nemoclaw is unreachable (keep the current stub as fallback)

---

## 9. Add Nemoclaw URL to server config

Add to `.env` (root of project, or create one if it doesn't exist):

```
NEMOCLAW_BASE_URL=http://<SPARK_IP>:<port>
NEMOCLAW_TIMEOUT_SECONDS=15
```

Then in `server.js` at the top, read it:

```javascript
const NEMOCLAW_BASE_URL = process.env.NEMOCLAW_BASE_URL || "";
const NEMOCLAW_TIMEOUT  = Number(process.env.NEMOCLAW_TIMEOUT_SECONDS || 15) * 1000;
```

---

## 10. End-to-end test with DGX Spark connected

With both backend and voice service running:

```bash
# 1. Start backend
node server.js

# 2. Start voice service (separate terminal)
cd voice_service && python -m app.server

# 3. Test Analyzer Agent end-to-end
curl -X POST http://localhost:3000/api/analyze-route \
  -H "Content-Type: application/json" \
  -d '{
    "fromCoord": [51.5101, -0.1340],
    "destinationId": "baker",
    "transportGroup": "tfl",
    "userProfile": { "accessibilityRequired": false }
  }' | python -m json.tool
```

**What to confirm:**
- Response contains `recommendedRoute` with real TfL data (ETA, legs, line names)
- `explanation` field is populated by Nemoclaw (not the default scoreRoute text)
- `allRoutes` array contains multiple TfL journey options

```bash
# 4. Test the voice respond endpoint (LLM via DGX Spark)
curl -X POST http://localhost:5001/respond \
  -H "Content-Type: application/json" \
  -d '{"transcript": "Is the Bakerloo line step-free?", "destinationId": "baker"}' \
  --output reply.mp3 && open reply.mp3
```

**What to confirm:** spoken reply about Baker Street accessibility using real route context.

---

## Summary table

| # | What | File to change | Env var |
|---|------|---------------|---------|
| 2–4 | Ollama reachable on DGX Spark | — | — |
| 5 | Point voice LLM at DGX Spark | `voice_service/.env` | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |
| 7–8 | Nemoclaw endpoint discovered | — | — |
| 9 | Plug Nemoclaw into Analyzer | `server.js` ~line 216 + root `.env` | `NEMOCLAW_BASE_URL` |
| 10 | Full end-to-end test | — | — |

---

## If Nemoclaw API format is different

The prompt format above is a proposal. If Nemoclaw uses a different input schema:
- The only file to change is `server.js` around line 216
- The `adaptedRoutes` array is already normalized — just re-serialize it however Nemoclaw expects
- The fallback (`recommendRoute` from `scoreRoute.js`) stays in place so the app still works if Nemoclaw is down
