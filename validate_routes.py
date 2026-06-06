"""
Validates route_data.json against the schema contract in datashape.js.
Run: python validate_routes.py
"""

import json
import math
import os
import sys

ROUTE_MODES = {"walk", "bus", "tube", "train", "mixed"}
LIFT_STATUSES = {"working", "out_of_service", "unknown"}
CROWDING_LEVELS = {"low", "medium", "high"}

# Mirrors FIELD_ALIASES in datashape.js exactly.
FIELD_ALIASES = {
    "eta_minutes": "etaMinutes",
    "walking_minutes": "walkingMinutes",
    "step_free": "stepFree",
    "lift_available": "liftAvailable",
    "lift_status": "liftStatus",
    "ramp_available": "rampAvailable",
    "disruption_minutes": "disruptionMinutes",
    "traffic_delay_minutes": "disruptionMinutes",
    "crowding_level": "crowdingLevel",
    "uses_train": "usesTrain",
    "base_fare": "baseFare",
    "peak_fare": "peakFare",
    "off_peak_fare": "offPeakFare",
    "estimated_cost": "estimatedCost",
    "is_peak_time": "isPeakTime",
}

REQUIRED_ROUTE_FIELDS = [
    "id",
    "etaMinutes",
    "walkingMinutes",
    "transfers",
    "stepFree",
    "liftAvailable",
    "liftStatus",
    "rampAvailable",
    "disruptionMinutes",
    "crowdingLevel",
    "usesTrain",
    "baseFare",
    "peakFare",
    "offPeakFare",
]

_NON_NEGATIVE_NUMBERS = [
    "etaMinutes", "walkingMinutes", "transfers", "disruptionMinutes",
    "baseFare", "peakFare", "offPeakFare", "estimatedCost",
]

_BOOLEANS = ["stepFree", "liftAvailable", "rampAvailable", "usesTrain", "isPeakTime"]


def _apply_aliases(route: dict) -> dict:
    out = dict(route)
    for alias, canonical in FIELD_ALIASES.items():
        if canonical not in out and alias in out:
            out[canonical] = out[alias]
    return out


def normalize_route(route: dict) -> dict:
    n = _apply_aliases(route)
    n.setdefault("summary", n.get("id"))
    n.setdefault("mode", "train" if n.get("usesTrain") else "mixed")
    n.setdefault("disruptionMinutes", 0)
    n.setdefault("crowdingLevel", "low")
    n.setdefault("liftStatus", "unknown")
    n.setdefault("estimatedCost", n.get("offPeakFare", n.get("baseFare")))
    n.setdefault("isPeakTime", False)
    return n


def validate_route(route: dict) -> list:
    errors = []

    for field in REQUIRED_ROUTE_FIELDS:
        if route.get(field) is None:
            errors.append(f"Missing required field: {field}")

    route_id = route.get("id")
    if route_id is not None and (not isinstance(route_id, str) or not route_id.strip()):
        errors.append("id must be a non-empty string")

    for field in _NON_NEGATIVE_NUMBERS:
        val = route.get(field)
        if val is not None:
            if isinstance(val, bool) or not isinstance(val, (int, float)) or not math.isfinite(val) or val < 0:
                errors.append(f"{field} must be a non-negative finite number")

    for field in _BOOLEANS:
        val = route.get(field)
        if val is not None and not isinstance(val, bool):
            errors.append(f"{field} must be a boolean")

    mode = route.get("mode")
    if mode is not None and mode not in ROUTE_MODES:
        errors.append(f"mode must be one of: {', '.join(sorted(ROUTE_MODES))}")

    lift_status = route.get("liftStatus")
    if lift_status is not None and lift_status not in LIFT_STATUSES:
        errors.append(f"liftStatus must be one of: {', '.join(sorted(LIFT_STATUSES))}")

    crowding = route.get("crowdingLevel")
    if crowding is not None and crowding not in CROWDING_LEVELS:
        errors.append(f"crowdingLevel must be one of: {', '.join(sorted(CROWDING_LEVELS))}")

    return errors


def main():
    data_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "route_data.json")
    with open(data_path, encoding="utf-8") as f:
        data = json.load(f)

    routes = data.get("routes", [])
    if not routes:
        print("ERROR: no routes found in route_data.json")
        sys.exit(1)

    failures = 0
    for route in routes:
        label = route.get("route_id") or route.get("id") or "unknown"
        normalized = normalize_route(route)
        errors = validate_route(normalized)

        if errors:
            failures += 1
            print(f"FAIL  {label}")
            for err in errors:
                print(f"        {err}")
        else:
            print(f"PASS  {label}  —  {normalized.get('summary', '')}")

    print()
    if failures == 0:
        print(f"All {len(routes)} routes passed.")
    else:
        print(f"{failures}/{len(routes)} route(s) failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
