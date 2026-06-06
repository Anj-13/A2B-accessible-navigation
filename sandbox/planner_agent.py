import json
import os
import subprocess
from memory import MemorySystem

class PlannerAgent:
    def __init__(self):
        self.memory = MemorySystem()
        self.data_dir = "/sandbox/data"
        self._ensure_directories()
    
    def _ensure_directories(self):
        """Make sure data directory exists"""
        os.makedirs(self.data_dir, exist_ok=True)
    
    def _load_route_data(self):
        """Load route data from teammate (Data Person)"""
        route_file = os.path.join(self.data_dir, "route_options.json")
        if os.path.exists(route_file):
            with open(route_file, 'r') as f:
                return json.load(f)
        return []
    
    def _load_preferences(self):
        """Load user preferences from teammate (Route Logic Person)"""
        prefs_file = os.path.join(self.data_dir, "preferences.json")
        if os.path.exists(prefs_file):
            with open(prefs_file, 'r') as f:
                return json.load(f)
        return {}
    
    def _save_recommendation(self, recommendation):
        """Save recommendation for Frontend Person"""
        rec_file = os.path.join(self.data_dir, "recommendation.json")
        with open(rec_file, 'w') as f:
            json.dump(recommendation, f, indent=2)
    
    def _call_llm(self, prompt):
        """Call the local LLM (gpt-oss:120b) via OpenClaw"""
        try:
            # Use openclaw agent command
            result = subprocess.run(
                ["openclaw", "agent", "--local", "-m", prompt, "--session-id", "planner"],
                capture_output=True,
                text=True,
                timeout=60
            )
            return result.stdout.strip()
        except subprocess.TimeoutExpired:
            return "The model is taking too long to respond. Please try again."
        except Exception as e:
            return f"Error calling LLM: {str(e)}"
    
    def process_request(self, user_query_text):
        """Main entry point for handling user requests"""
        
        # Step 1: Log the user query to memory
        self.memory.log_user_query(user_query_text)
        
        # Step 2: Load data from teammates
        routes = self._load_route_data()
        preferences = self._load_preferences()
        
        # Step 3: Build prompt for LLM
        prompt = f"""
You are a London transit planner agent. Analyze the request and available routes.

USER REQUEST: {user_query_text}

AVAILABLE ROUTES:
{json.dumps(routes, indent=2)}

USER PREFERENCES:
{json.dumps(preferences, indent=2)}

Based on this information, provide:
1. The best route recommendation
2. Estimated travel time
3. Why this route is best (considering preferences)
4. Any accessibility notes (step-free access, etc.)

Respond in this JSON format only:
{{
    "recommended_route": "route name/id",
    "estimated_time_minutes": number,
    "reason": "explanation",
    "accessibility_notes": "notes here",
    "alternative_routes": ["route1", "route2"]
}}
"""
        
        # Step 4: Get LLM response
        llm_response = self._call_llm(prompt)
        
        # Step 5: Parse response (handle both JSON and plain text)
        try:
            recommendation = json.loads(llm_response)
        except json.JSONDecodeError:
            # If LLM didn't return JSON, wrap it
            recommendation = {
                "recommended_route": "unknown",
                "estimated_time_minutes": 0,
                "reason": llm_response,
                "accessibility_notes": "Check with station staff",
                "alternative_routes": []
            }
        
        # Step 6: Log the decision
        self.memory.log_decision(
            recommendation.get("recommended_route", "unknown"),
            recommendation.get("reason", "No reason provided")
        )
        
        # Step 7: Save for frontend
        self._save_recommendation(recommendation)
        
        # Step 8: Generate response text for ElevenLabs
        response_text = self._generate_response_text(recommendation)
        self.memory.log_agent_response(response_text)
        
        return response_text
    
    def _generate_response_text(self, recommendation):
        """Convert recommendation to natural language for voice output"""
        route = recommendation.get("recommended_route", "the recommended route")
        time = recommendation.get("estimated_time_minutes", "unknown")
        reason = recommendation.get("reason", "It's the best option available.")
        notes = recommendation.get("accessibility_notes", "")
        
        text = f"I recommend {route}. Estimated travel time is {time} minutes. {reason}"
        if notes and notes != "Check with station staff":
            text += f" {notes}"
        
        return text
    
    def recall_conversation(self, minutes_ago):
        """For judge testing - recall what was discussed"""
        events = self.memory.get_events_since(minutes_ago)
        if not events:
            return f"No conversation events found in the last {minutes_ago} minutes."
        
        summary = f"Here's what happened in the last {minutes_ago} minutes:\n"
        for event in events:
            if event["event_type"] == "user_query":
                summary += f"- User asked: {event['content']['text']}\n"
            elif event["event_type"] == "agent_response":
                summary += f"- I responded: {event['content']['text']}\n"
            elif event["event_type"] == "decision":
                summary += f"- Decision made: {event['content']['route']} - {event['content']['reason']}\n"
        
        return summary

# Run as a simple interface
if __name__ == "__main__":
    agent = PlannerAgent()
    print("Planner Agent Ready. Type 'exit' to quit.")
    print("Type 'recall X' to see what happened X minutes ago.")
    print("-" * 50)
    
    while True:
        user_input = input("\nYou: ")
        
        if user_input.lower() == 'exit':
            break
        
        if user_input.lower().startswith('recall '):
            try:
                minutes = int(user_input.split()[1])
                print(agent.recall_conversation(minutes))
            except:
                print("Usage: recall <minutes>")
            continue
        
        response = agent.process_request(user_input)
        print(f"Agent: {response}")