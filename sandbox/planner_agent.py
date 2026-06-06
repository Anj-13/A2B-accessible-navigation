import json
import os
import re
import subprocess

from config import DATA_DIR, OPENCLAW_COMMAND
from memory import MemorySystem
from route_client import get_recommendation, to_frontend_recommendation


ANSI_ESCAPE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


class PlannerAgent:
    def __init__(self):
        self.memory = MemorySystem()
        self.data_dir = str(DATA_DIR)
        os.makedirs(self.data_dir, exist_ok=True)

    def _load_preferences(self):
        prefs_file = os.path.join(self.data_dir, "preferences.json")
        if not os.path.exists(prefs_file):
            return {}
        with open(prefs_file, "r", encoding="utf-8") as file:
            data = json.load(file)
        return data if isinstance(data, dict) else {}

    def _save_recommendation(self, recommendation):
        rec_file = os.path.join(self.data_dir, "recommendation.json")
        with open(rec_file, "w", encoding="utf-8") as file:
            json.dump(recommendation, file, indent=2, ensure_ascii=False)

    def _call_llm(self, prompt):
        try:
            result = subprocess.run(
                [
                    OPENCLAW_COMMAND,
                    "agent",
                    "--local",
                    "-m",
                    prompt,
                    "--session-id",
                    "planner",
                ],
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode != 0:
                return ""
            return self._clean_openclaw_output(result.stdout)
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return ""

    @staticmethod
    def _clean_openclaw_output(output):
        clean = ANSI_ESCAPE.sub("", output)
        lines = []
        for line in clean.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith(("[proxy]", "[plugins]", "[agent/")):
                continue
            if set(stripped) <= set("│┌┐└┘─ "):
                continue
            lines.append(stripped)
        return "\n".join(lines).strip()

    def process_request(self, user_query_text):
        self.memory.log_user_query(user_query_text)
        preferences = self._load_preferences()

        try:
            engine_result = get_recommendation(
                preferences,
                user_query=user_query_text,
            )
            recommendation = to_frontend_recommendation(engine_result)
        except RuntimeError as exc:
            recommendation = {
                "recommended_route": "unavailable",
                "summary": "Route service unavailable",
                "estimated_time_minutes": 0,
                "should_reroute": False,
                "reroute_trigger": "route_api_unavailable",
                "reason": str(exc),
            }

        self._save_recommendation(recommendation)
        self.memory.log_decision(
            recommendation["recommended_route"],
            recommendation["reason"],
        )

        prompt = f"""You are a concise London navigation assistant.

User request: {user_query_text}

The deterministic route engine returned:
{json.dumps(recommendation, indent=2)}

Explain this result naturally in no more than three sentences. Treat the route
engine as authoritative. Do not invent another route or travel time."""

        response = self._call_llm(prompt) or self._generate_response_text(
            recommendation
        )
        self.memory.log_agent_response(response)
        return response

    @staticmethod
    def _generate_response_text(recommendation):
        if recommendation["recommended_route"] == "unavailable":
            return "The route service is temporarily unavailable. Please try again."

        reroute_text = (
            " I recommend changing route."
            if recommendation.get("should_reroute")
            else ""
        )
        return (
            f"I recommend {recommendation.get('summary')} with an estimated "
            f"travel time of {recommendation.get('estimated_time_minutes')} minutes."
            f"{reroute_text} {recommendation.get('reason')}"
        ).strip()

    def recall_conversation(self, minutes_ago):
        events = self.memory.get_events_since(minutes_ago)
        if not events:
            return f"No conversation events found in the last {minutes_ago} minutes."

        return json.dumps(events, indent=2)


def run_interactive():
    agent = PlannerAgent()
    print("Planner Agent Ready. Type 'exit' to quit.")
    print("Type 'recall X' to see what happened X minutes ago.")

    while True:
        user_input = input("\nYou: ").strip()
        if user_input.lower() == "exit":
            break
        if user_input.lower().startswith("recall "):
            try:
                print(agent.recall_conversation(int(user_input.split()[1])))
            except (IndexError, ValueError):
                print("Usage: recall <minutes>")
            continue
        print(f"Agent: {agent.process_request(user_input)}")


if __name__ == "__main__":
    run_interactive()
