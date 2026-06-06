from unittest import TestCase
from unittest.mock import patch

from app import llm, route_client


class RouteIntegrationTests(TestCase):
    def test_accessibility_profile_is_inferred_from_conversation(self):
        profile = route_client.infer_user_profile(
            "Use the same route as before.",
            conversation_context=[
                {
                    "user_message": "I use a wheelchair and need step-free access.",
                    "assistant_response": "Understood.",
                }
            ],
        )

        self.assertTrue(profile["accessibilityRequired"])

    def test_route_api_result_is_added_to_ollama_prompt(self):
        recommendation = {
            "recommendedRoute": {
                "id": "route_2",
                "summary": "Tube via Circle line",
                "mode": "tube",
                "etaMinutes": 24,
                "walkingMinutes": 6,
                "transfers": 0,
                "stepFree": False,
                "liftAvailable": True,
                "liftStatus": "working",
                "estimatedCost": 3.4,
            },
            "shouldReroute": True,
            "rerouteTrigger": "disruption",
            "explanation": "Less affected by disruption.",
        }
        route_context = route_client.format_route_context(recommendation)
        messages = llm.build_messages(
            "Should I reroute?",
            conversation_context=[],
            route_context=route_context,
        )

        self.assertEqual(messages[1]["role"], "system")
        self.assertIn("route_2", messages[1]["content"])
        self.assertIn("disruption", messages[1]["content"])

    @patch("app.route_client.requests.post")
    def test_route_client_calls_merged_data_endpoint(self, mock_post):
        mock_post.return_value.raise_for_status.return_value = None
        mock_post.return_value.json.return_value = {
            "recommendedRoute": {"id": "route_2"}
        }

        result = route_client.get_route_recommendation("Find the cheapest route")

        self.assertEqual(result["recommendedRoute"]["id"], "route_2")
        self.assertTrue(
            mock_post.call_args.args[0].endswith("/api/recommend-from-data")
        )
        self.assertTrue(
            mock_post.call_args.kwargs["json"]["userProfile"]["costSensitive"]
        )
