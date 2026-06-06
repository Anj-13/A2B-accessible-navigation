"""
Optional FastAPI service — serves the same JSON files for the FRONTEND during local dev.

IMPORTANT: This is a convenience, not load-bearing. The JSON files in ./data are the
source of truth. The agent reads those files directly (see agent_data.py). On demo day
you do NOT need this running for the agent to work — it's only so the website can fetch
data over HTTP locally.

Run locally:
    pip install fastapi uvicorn
    uvicorn serve:app --reload --port 8000

Then:
    GET http://localhost:8000/routes
    GET http://localhost:8000/accessibility
    GET http://localhost:8000/traffic
    GET http://localhost:8000/best-route        (routes + active disruptions applied)
"""
import json
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

DATA_DIR = Path(__file__).parent / "data"

app = FastAPI(title="London Multimodal Route Data (demo)")

# Allow the frontend (any localhost port) to fetch during dev.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load(name: str) -> dict:
    with open(DATA_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/routes")
def get_routes() -> dict:
    return _load("route_data.json")


@app.get("/accessibility")
def get_accessibility() -> dict:
    return _load("accessibility_data.json")


@app.get("/traffic")
def get_traffic() -> dict:
    return _load("traffic_events.json")


@app.get("/best-route")
def best_route() -> dict:
    """Convenience endpoint: annotate each route with any active disruptions
    affecting it, and flag whether the currently-recommended route is impacted."""
    routes = _load("route_data.json")
    traffic = _load("traffic_events.json")

    active = [e for e in traffic.get("events", []) if e.get("active")]
    affected_leg_to_events: dict[str, list] = {}
    for e in active:
        for leg_id in e.get("affected_leg_ids", []):
            affected_leg_to_events.setdefault(leg_id, []).append(e["event_id"])

    for route in routes.get("routes", []):
        impacts = []
        added_delay = 0
        for leg in route.get("legs", []):
            for evt_id in affected_leg_to_events.get(leg.get("leg_id"), []):
                evt = next(x for x in active if x["event_id"] == evt_id)
                impacts.append({
                    "event_id": evt_id,
                    "severity": evt["severity"],
                    "headline": evt["headline"],
                    "delay_min": evt.get("delay_min", 0),
                })
                added_delay += evt.get("delay_min", 0)
        route["active_disruptions"] = impacts
        route["adjusted_duration_min"] = route["total_duration_min"] + added_delay
        route["is_disrupted"] = bool(impacts)

    return routes
