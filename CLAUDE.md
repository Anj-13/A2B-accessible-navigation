# CLAUDE.md — Accessibility-First AI Navigation Assistant

> Working title: **A2B**. This file is the source of truth for Claude Code.
> Read it before writing code so we stay aligned on architecture, ownership boundaries, and the
> design principles that must not be violated. Hackathon project — optimise for a working,
> demoable slice, but never break the non-negotiables in **Design Principles**.

---

## 1. What we're building

An accessibility-first AI navigation assistant for public transport. It uses **local LLM
inference on an NVIDIA DGX Spark** and **voice interaction via ElevenLabs** to give users with
accessibility needs adaptive, real-time, step-free route recommendations — and it keeps watching
the journey, proactively offering a better accessible route if conditions change.

The differentiator is not "fastest route." It is **"best accessible route, continuously
maintained, controlled by voice, with the human always in the loop."**

### One-line pitch (for judges)
> Our frontend collects voice or text requests. ElevenLabs converts speech to text. The request
> goes to GPT-OSS 120B running locally on NVIDIA DGX Spark via Ollama, which interprets user
> intent and accessibility requirements. The AI queries our route engine, which generates
> accessibility-aware journeys. Live transport conditions are monitored throughout; if a better
> accessible route appears, the user can preview and accept it. The response is delivered visually
> and through ElevenLabs voice synthesis.

---

## 2. The problem & user story (Sarah)

Sarah is a wheelchair user travelling across London to a job interview near Baker Street. She says:

> "I need to get to Baker Street. I need a step-free route with lifts and as few changes as possible."

The assistant understands that **accessibility outranks speed**. It returns a route that uses
step-free stations, prioritises lifts/ramps, minimises changes, and gives clear directions.

Mid-journey a lift goes out of service and congestion builds. The system detects it and surfaces:

> "An alternative accessible route is available. It adds one minute but avoids the unavailable lift."

Sarah taps **Preview Route**, confirms, and continues without hitting an accessibility barrier. She
interacts by voice the whole way — *"How much longer until I arrive?"*, *"Is there another step-free
option?"* — and the assistant keeps the journey context.

**Every design decision should be checked against: "Does this help Sarah?"**

---

## 3. Design principles (non-negotiable)

1. **Accessibility-first objective.** The optimisation target is the best *accessible* route, not
   the fastest. Speed is a tiebreaker, never the primary metric.
2. **Human-in-the-loop rerouting.** The system NEVER silently changes an active route. Flow is
   always: notify → preview → user approves → update. No auto-accept.
3. **The AI is an orchestrator, not a calculator.** The LLM interprets intent, explains choices,
   and holds the conversation. It does **not** compute schedules, timetables, or distances — that
   is the route engine's job. (See §6.)
4. **Voice-native.** Any action a user can take should be expressible by voice; typing is a
   fallback, not the primary path.
5. **Continuous monitoring.** A journey is a live object, not a one-shot query. Conditions are
   re-checked for the duration of the trip.
6. **Local-first inference.** Reasoning runs on-device (DGX Spark via Ollama). Do not introduce a
   hosted/cloud LLM dependency without flagging it explicitly.
7. **Graceful degradation.** If voice, the model, or live data is unavailable, the app must still
   return *something* useful (e.g. text fallback, last-known route) rather than failing hard.

---

## 4. System architecture

### High-level flow
```
User
 ↓
Frontend (Maps UI)  ── voice or text input
 ↓
ElevenLabs STT  → text
 ↓
AI Assistant Layer (GPT-OSS 120B on DGX Spark via Ollama)
 ↓
Route Engine + Live Data
 ↓
Accessibility analysis / route scoring
 ↓
Route recommendation
 ↓
ElevenLabs TTS + UI  → voice + visual route output
 ↓
User
```

### Layered view
```
1. User Layer ............. voice or text request
2. ElevenLabs Layer ....... STT in, TTS out                 [OWNED BY ANDREW]
3. Conversation Memory .... conversation_history.json        [OWNED BY ANDREW]
4. AI Reasoning Layer ..... intent + accessibility + dialog  [OWNED BY ANDREW]
5. Route Engine ........... planning, filtering, scoring     [OWNED BY TEAMMATES]
6. Live Monitoring ........ delays, outages, lift status     [OWNED BY TEAMMATES / TBD]
7. User Confirmation ...... notify → preview → approve       [SHARED: AI + Frontend]
```

---

## 5. Tech stack

| Layer            | Technology                                   | Notes |
|------------------|----------------------------------------------|-------|
| Inference hardware | **NVIDIA DGX Spark**                       | Local-only, verified running |
| Model runtime    | **Ollama**                                   | Serves the model over local API |
| LLM              | **GPT-OSS 120B**                             | Reasoning / dialogue model |
| Voice (STT + TTS)| **ElevenLabs**                               | Speech↔text both directions |
| Memory           | `conversation_history.json`                  | Per-session journey context |
| Route engine     | Teammates' service (contract in §6)          | Source/data provider TBD |
| Frontend         | Maps UI (framework TBD)                       | Shows route, preview, notifications |

> If you need exact Ollama / ElevenLabs API details, **verify against live docs** rather than
> assuming — versions and parameters change.

---

## 6. Component contracts

### 6.1 AI Reasoning Layer — what it DOES and does NOT do
**Does:** interpret user intent, extract accessibility requirements, choose between route options,
explain *why* a route was chosen in plain language, drive natural conversation, decide *when* to
suggest a reroute.

**Does NOT:** compute timetables, distances, transfer times, or do graph search. It asks the route
engine for structured options and reasons over them.

**Interface (proposed — confirm with team):**
```
AI → Route Engine request
{
  "origin": "current location | named place",
  "destination": "Baker Street",
  "constraints": {
    "step_free": true,
    "require_lifts": true,
    "max_changes": 1,
    "avoid_station_ids": []        // populated on reroute, e.g. failed lift
  }
}

Route Engine → AI response
{
  "routes": [
    {
      "id": "r_001",
      "summary": "Step-free via ...",
      "changes": 1,
      "duration_min": 34,
      "step_free": true,
      "segments": [ /* legs, stations, lift/ramp flags, directions */ ],
      "accessibility_score": 0.94
    }
  ]
}
```
The AI selects/ranks, wraps the choice in human-friendly explanation, and hands display data to the
frontend + a spoken summary to ElevenLabs TTS.

### 6.2 ElevenLabs Layer
- **In:** user audio → STT → text → AI layer.
- **Out:** AI response text → TTS → audio → user.
- Keep STT/TTS calls isolated behind a thin service so the rest of the app deals only in text.

### 6.3 Conversation Memory (`conversation_history.json`)
Stores enough to answer follow-ups without the user repeating themselves
(*"remind me where I'm going?"*). **Proposed shape:**
```json
{
  "session_id": "uuid",
  "active_journey": {
    "destination": "Baker Street",
    "constraints": { "step_free": true, "require_lifts": true, "max_changes": 1 },
    "current_route_id": "r_001",
    "status": "in_progress"
  },
  "turns": [
    { "role": "user", "text": "I need a step-free route to Baker Street", "ts": "..." },
    { "role": "assistant", "text": "A step-free route has been found...", "ts": "..." }
  ]
}
```
Feed a trimmed/summarised version of `turns` + `active_journey` into the model as context each turn.
Watch the context window — summarise old turns rather than sending everything.

### 6.4 Route Engine (teammates)
Owns: journey planning, accessibility filtering, station info, transport connections, route scoring.
**Treat as a black box behind the contract in §6.1.** Do not reimplement routing in the AI layer.

### 6.5 Live Monitoring
Watches: traffic, delays, accessibility disruptions, lift outages. On a relevant change it flags the
active journey as potentially unsuitable and triggers the AI to evaluate an alternative.
> Data source(s) and polling vs push are **not yet decided** — see Open Questions.

### 6.6 User Confirmation Layer (shared)
Strict sequence, no shortcuts:
```
condition changes → notification → user taps "Preview Route" → user approves → route replaced
```

---

## 7. End-to-end flows

**Happy path:**
`speak request → STT → AI extracts intent + constraints → query route engine → AI ranks & explains
→ TTS summary + UI route → save to memory`

**Reroute path:**
`live monitor detects lift outage → mark journey at-risk → AI requests alt route with
avoid_station_ids → AI judges if alt is genuinely better → notify user → preview → approve →
update active_journey in memory → confirm via voice + UI`

**Follow-up question path:**
`"How much longer?" → STT → AI reads active_journey from memory → (asks route engine for ETA if
needed) → TTS answer` (the AI does not invent the ETA; it sources it).

---

## 8. Proposed repo structure (adjust to reality)
```
/frontend            # Maps UI, preview, notifications
/ai-assistant        # intent parsing, dialogue, route-engine client   [ANDREW]
  /voice             # ElevenLabs STT/TTS wrappers
  /memory            # conversation_history.json read/write + summarisation
  /llm               # Ollama / GPT-OSS 120B client
/route-engine        # teammates' service (or client stub if separate repo)
/monitoring          # live data polling + change detection
CLAUDE.md            # this file
```

---

## 9. Guardrails for Claude Code (read before generating code)

- **Do not** make the LLM compute routes, timetables, or distances. Route the request to the route
  engine and reason over the result.
- **Do not** auto-apply a reroute. Always go through preview → approve.
- **Do not** swap the local model for a cloud API "to make it easier" — local inference on DGX
  Spark is a core part of the pitch. Flag it if you think there's no alternative.
- **Keep voice behind a thin interface** so the app logic is text-only and ElevenLabs is swappable.
- **Mind the context window** — summarise conversation history; don't dump the whole log each turn.
- **Accessibility is the objective function.** When scoring/choosing routes, step-free + lift
  availability + fewer changes beat raw speed.
- **Fail soft.** Every external dependency (voice, model, live data) needs a fallback path.
- **Verify API details against live docs** for Ollama and ElevenLabs rather than guessing.

---

## 10. Open questions / assumptions to validate

These are gaps in the current design — confirm before building on top of them:

1. **Live data source.** Where do delays / lift outages / disruptions come from (TfL Unified API,
   custom feed, mocked for demo)? Polling interval vs webhook/push?
2. **Route engine boundary.** Same repo/process or a separate service? Sync HTTP, or something else?
   Is the §6.1 contract agreed with teammates?
3. **"Current location."** GPS, manual entry, or fixed for the demo?
4. **ETA / "how much longer" source.** Route engine, live monitor, or computed at request time?
5. **Reroute trigger threshold.** What makes an alternative "better enough" to interrupt the user?
   (Avoids a barrier? Saves > X min? Lift confirmed down?)
6. **Notification transport.** In-app only, or push? Voice-announced automatically or on-demand?
7. **Memory lifecycle.** Per-session file vs persistent store; when is `conversation_history.json`
   cleared/rotated; multi-user handling.
8. **Demo scope.** Which parts are real vs mocked for the hackathon (live data is the likeliest
   mock candidate)?

---

*Keep this file updated as decisions are made — it is the contract between the team and Claude Code.*
