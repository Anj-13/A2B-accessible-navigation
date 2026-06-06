import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from planner_agent import PlannerAgent
from route_client import _merge_query_preferences, to_frontend_recommendation


class SandboxIntegrationTests(unittest.TestCase):
    def test_query_accessibility_overrides_stored_defaults(self):
        profile = _merge_query_preferences(
            {"accessibilityRequired": False},
            "Find a route and avoid stairs.",
        )

        self.assertTrue(profile["accessibilityRequired"])

    def test_wheelchair_request_avoids_standard_cycle_route(self):
        profile = _merge_query_preferences(
            {"accessibilityRequired": False},
            "I use a wheelchair.",
        )

        self.assertTrue(profile["accessibilityRequired"])
        self.assertIn("cycle", profile["avoidModes"])

    def test_node_response_maps_to_frontend_shape(self):
        result = to_frontend_recommendation(
            {
                "recommendedRoute": {
                    "id": "route_2",
                    "summary": "Circle line",
                    "mode": "tube",
                    "etaMinutes": 24,
                },
                "shouldReroute": True,
                "rerouteTrigger": "disruption",
                "explanation": "Less affected by disruption.",
            }
        )

        self.assertEqual(result["recommended_route"], "route_2")
        self.assertEqual(result["estimated_time_minutes"], 24)
        self.assertTrue(result["should_reroute"])

    def test_agent_saves_clean_engine_recommendation(self):
        engine_result = {
            "recommendedRoute": {
                "id": "route_2",
                "summary": "Circle line",
                "mode": "tube",
                "etaMinutes": 24,
            },
            "shouldReroute": True,
            "rerouteTrigger": "disruption",
            "explanation": "Less affected by disruption.",
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            agent = PlannerAgent()
            agent.data_dir = temp_dir
            agent.memory.memory_file = str(Path(temp_dir) / "memory.json")
            agent.memory._ensure_file_exists()

            with patch("planner_agent.get_recommendation", return_value=engine_result):
                with patch.object(agent, "_call_llm", return_value="Use the Circle line."):
                    response = agent.process_request("What is the best route?")

            saved = json.loads(
                (Path(temp_dir) / "recommendation.json").read_text("utf-8")
            )
            self.assertEqual(response, "Use the Circle line.")
            self.assertEqual(saved["recommended_route"], "route_2")
            self.assertNotIn("\x1b", json.dumps(saved))


if __name__ == "__main__":
    unittest.main()
