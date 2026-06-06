"""Route-engine client used inside the NemoClaw sandbox."""
import json
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from config import ROUTE_API_BASE_URL, ROUTE_API_TIMEOUT_SECONDS


def _profile_from_preferences(preferences: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "accessibilityRequired": bool(
            preferences.get("wheelchair_access_required")
            or preferences.get("avoid_stairs")
            or preferences.get("accessibilityRequired")
        ),
        "prefersFewerTransfers": bool(
            preferences.get("prefers_fewer_transfers")
            or preferences.get("prefersFewerTransfers")
        ),
        "costSensitive": bool(
            preferences.get("cost_sensitive")
            or preferences.get("costSensitive")
        ),
        **(
            {"preferredModes": preferences["preferred_modes"]}
            if preferences.get("preferred_modes")
            else {}
        ),
        **(
            {"avoidModes": preferences["avoid_modes"]}
            if preferences.get("avoid_modes")
            else {}
        ),
    }


def _merge_query_preferences(
    profile: Dict[str, Any],
    user_query: Optional[str],
) -> Dict[str, Any]:
    text = (user_query or "").lower()
    wheelchair_required = "wheelchair" in text
    if any(
        term in text
        for term in (
            "wheelchair",
            "step-free",
            "step free",
            "avoid stairs",
            "no stairs",
            "can't use stairs",
            "cannot use stairs",
            "accessible",
            "lift",
        )
    ):
        profile["accessibilityRequired"] = True

    if wheelchair_required:
        avoid_modes = set(profile.get("avoidModes", []))
        avoid_modes.add("cycle")
        profile["avoidModes"] = sorted(avoid_modes)

    if any(
        term in text
        for term in ("fewer transfers", "fewer changes", "no changes", "direct")
    ):
        profile["prefersFewerTransfers"] = True

    if any(term in text for term in ("cheap", "cheapest", "low cost", "save money")):
        profile["costSensitive"] = True

    return profile


def get_recommendation(
    preferences: Optional[Dict[str, Any]] = None,
    current_route_id: Optional[str] = None,
    user_query: Optional[str] = None,
) -> Dict[str, Any]:
    """Call the route API and return its JSON response."""
    payload: Dict[str, Any] = {
        "userProfile": _merge_query_preferences(
            _profile_from_preferences(preferences or {}),
            user_query,
        ),
    }
    if current_route_id:
        payload["currentRouteId"] = current_route_id

    request = Request(
        f"{ROUTE_API_BASE_URL.rstrip('/')}/api/recommend-from-data",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=ROUTE_API_TIMEOUT_SECONDS) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Route API returned HTTP {exc.code}: {detail}") from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError(
            f"Route API unavailable at {ROUTE_API_BASE_URL}: {exc}"
        ) from exc

    if not isinstance(result, dict):
        raise RuntimeError("Route API returned an invalid response.")
    return result


def to_frontend_recommendation(result: Dict[str, Any]) -> Dict[str, Any]:
    """Convert the Node response to the sandbox/frontend legacy shape."""
    route = result.get("recommendedRoute") or {}
    return {
        "recommended_route": route.get("id", "unknown"),
        "summary": route.get("summary", "Unknown route"),
        "mode": route.get("mode"),
        "estimated_time_minutes": route.get("etaMinutes", 0),
        "walking_minutes": route.get("walkingMinutes"),
        "transfers": route.get("transfers"),
        "estimated_cost": route.get("estimatedCost"),
        "step_free": route.get("stepFree"),
        "lift_available": route.get("liftAvailable"),
        "lift_status": route.get("liftStatus"),
        "should_reroute": result.get("shouldReroute", False),
        "reroute_trigger": result.get("rerouteTrigger"),
        "reason": result.get("explanation", "Best available route."),
        "scores": result.get("scores", {}),
        "confidence": result.get("confidence"),
    }
