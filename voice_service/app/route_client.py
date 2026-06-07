"""Client for the local route recommendation API."""
from __future__ import annotations

import json
import logging
from typing import Dict, List, Optional

import requests

from .config import ROUTE_API_BASE_URL, ROUTE_API_TIMEOUT_SECONDS

logger = logging.getLogger(__name__)


def infer_user_profile(
    user_message: str,
    conversation_context: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, object]:
    """Infer a small deterministic route profile from the conversation."""
    prior_messages = [
        str(turn.get("user_message", ""))
        for turn in (conversation_context or [])
    ]
    text = " ".join([*prior_messages, user_message]).lower()

    accessibility_terms = (
        "wheelchair",
        "step-free",
        "step free",
        "no stairs",
        "can't use stairs",
        "cannot use stairs",
        "accessible",
        "lift",
    )
    profile: Dict[str, object] = {
        "accessibilityRequired": any(term in text for term in accessibility_terms),
        "prefersFewerTransfers": any(
            term in text
            for term in ("fewer transfers", "fewer changes", "no changes", "direct")
        ),
        "costSensitive": any(
            term in text for term in ("cheap", "cheapest", "low cost", "save money")
        ),
    }

    preferred_modes = []
    mode_terms = {
        "cycle": ("cycle", "cycling", "bike", "bicycle"),
        "car": ("car", "drive", "driving", "taxi"),
        "bus": ("bus",),
        "tube": ("tube", "underground"),
        "train": ("train", "rail"),
        "walk": ("walk", "walking"),
    }
    for mode, terms in mode_terms.items():
        if any(term in text for term in terms):
            preferred_modes.append(mode)

    if preferred_modes:
        profile["preferredModes"] = preferred_modes

    return profile


def get_route_recommendation(
    user_message: str,
    conversation_context: Optional[List[Dict[str, str]]] = None,
    current_route_id: Optional[str] = None,
    destination_id: Optional[str] = None,
) -> Optional[Dict[str, object]]:
    """Call the route engine and return None if it is unavailable."""
    url = f"{ROUTE_API_BASE_URL.rstrip('/')}/api/recommend-from-data"
    payload: Dict[str, object] = {
        "userProfile": infer_user_profile(user_message, conversation_context),
    }
    if current_route_id:
        payload["currentRouteId"] = current_route_id
    if destination_id:
        payload["destinationId"] = destination_id

    try:
        response = requests.post(
            url,
            json=payload,
            timeout=ROUTE_API_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("Route API response was not an object.")
        return data
    except (requests.exceptions.RequestException, ValueError) as exc:
        logger.warning("Route API unavailable at %s: %s", url, exc)
        return None


def format_route_context(recommendation: Optional[Dict[str, object]]) -> Optional[str]:
    """Format route-engine output as authoritative context for the LLM."""
    if not recommendation:
        return None

    route = recommendation.get("recommendedRoute") or {}
    context = {
        "recommended_route_id": route.get("id"),
        "summary": route.get("summary"),
        "mode": route.get("mode"),
        "eta_minutes": route.get("etaMinutes"),
        "walking_minutes": route.get("walkingMinutes"),
        "transfers": route.get("transfers"),
        "step_free": route.get("stepFree"),
        "lift_available": route.get("liftAvailable"),
        "lift_status": route.get("liftStatus"),
        "estimated_cost": route.get("estimatedCost"),
        "should_reroute": recommendation.get("shouldReroute"),
        "reroute_trigger": recommendation.get("rerouteTrigger"),
        "explanation": recommendation.get("explanation"),
    }
    return json.dumps(context, ensure_ascii=False)
