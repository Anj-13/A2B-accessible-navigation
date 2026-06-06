"""
agent_data.py — how the PLANNER AGENT reads the data (no HTTP, just files).

This is the demo-day path. The agent runs in the sandbox and reads the JSON files
directly. Point DATA_DIR at wherever the files live inside the agent's workspace.

Functions return plain Python dicts/lists so the agent can reason over them or you
can serialise them back into a prompt.
"""
import json
from pathlib import Path

# When running inside the OpenClaw sandbox, set this to the path where the data
# files are mounted/copied in the agent workspace. Locally it defaults to ./data.
DATA_DIR = Path(__file__).parent / "data"


def _load(name: str) -> dict:
    with open(DATA_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


def load_routes() -> dict:
    return _load("route_data.json")


def load_accessibility() -> dict:
    return _load("accessibility_data.json")


def load_traffic() -> dict:
    return _load("traffic_events.json")


def analyse_and_recommend(require_step_free: bool = False) -> dict:
    """Core decision helper the agent can call (or replicate in reasoning).

    Returns the recommended route after applying active disruptions and optional
    step-free constraint, plus a human-readable explanation the voice layer can speak.
    """
    routes = load_routes()["routes"]
    traffic = load_traffic()
    accessibility = load_accessibility()
    acc_summary = accessibility["route_accessibility_summary"]

    active = [e for e in traffic["events"] if e.get("active")]
    severe_legs = set()
    for e in active:
        if e["severity"] == "severe":
            severe_legs.update(e.get("affected_leg_ids", []))

    scored = []
    for r in routes:
        legs = {l["leg_id"] for l in r["legs"]}
        disrupted = bool(legs & severe_legs)
        added_delay = sum(
            e.get("delay_min", 0)
            for e in active
            for lid in e.get("affected_leg_ids", [])
            if lid in legs
        )
        step_free_ok = acc_summary.get(r["route_id"], {}).get("fully_step_free", False)
        if require_step_free and not step_free_ok:
            continue
        scored.append({
            "route_id": r["route_id"],
            "summary": r["summary"],
            "primary_mode": r["primary_mode"],
            "base_duration_min": r["total_duration_min"],
            "adjusted_duration_min": r["total_duration_min"] + added_delay,
            "severely_disrupted": disrupted,
            "fully_step_free": step_free_ok,
            "cost_gbp": r.get("monetary_cost_gbp"),
            "co2_grams": r.get("co2_grams"),
        })

    if not scored:
        return {"recommended": None, "explanation": "No route matches the constraints."}

    # Prefer non-disrupted, then shortest adjusted duration.
    scored.sort(key=lambda x: (x["severely_disrupted"], x["adjusted_duration_min"]))
    best = scored[0]

    parts = [f"Best option: {best['summary']} ({best['adjusted_duration_min']} min)."]
    disrupted_originals = [s for s in scored if s["severely_disrupted"]]
    if disrupted_originals:
        d = disrupted_originals[0]
        parts.append(
            f"Note: {d['summary']} is hit by a severe delay, so it's been deprioritised."
        )
    if require_step_free:
        parts.append("Filtered to fully step-free routes as requested.")

    return {"recommended": best, "alternatives": scored[1:], "explanation": " ".join(parts)}


if __name__ == "__main__":
    print("=== Default recommendation ===")
    print(json.dumps(analyse_and_recommend(), indent=2))
    print("\n=== Step-free required ===")
    print(json.dumps(analyse_and_recommend(require_step_free=True), indent=2))
