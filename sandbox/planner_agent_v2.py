import json
import os
import subprocess
from memory import MemorySystem

class PlannerAgent:
    def __init__(self):
        self.memory = MemorySystem()
        self.data_dir = "/sandbox/data"
        os.makedirs(self.data_dir, exist_ok=True)
    
    def _load_route_data(self):
        route_file = os.path.join(self.data_dir, "route_options.json")
        if os.path.exists(route_file):
            with open(route_file, 'r') as f:
                return json.load(f)
        return []
    
    def _load_preferences(self):
        prefs_file = os.path.join(self.data_dir, "preferences.json")
        if os.path.exists(prefs_file):
            with open(prefs_file, 'r') as f:
                return json.load(f)
        return {}
    
    def _call_llm(self, prompt):
        try:
            result = subprocess.run(
                ["openclaw", "agent", "--local", "-m", prompt, "--session-id", "planner"],
                capture_output=True,
                text=True,
                timeout=120
            )
            return result.stdout.strip()
        except subprocess.TimeoutExpired:
            return "The model is taking too long to respond. Please try again."
        except Exception as e:
            return f"Error calling LLM: {str(e)}"
    
    def process_request(self, user_query_text):
        # Log the user query to memory
        self.memory.log_user_query(user_query_text)
        
        # Load data from teammates
        routes = self._load_route_data()
        preferences = self._load_preferences()
        
        # Build a conversational prompt (not forcing JSON)
        prompt = f"""You are a London transit planner assistant. Be helpful and conversational.

User request: {user_query_text}

Available routes in London:
{json.dumps(routes, indent=2) if routes else 'No route data loaded yet. Ask the user for origin and destination.'}

User preferences:
{json.dumps(preferences, indent=2) if preferences else 'No preferences set.'}

Provide a helpful, natural response. If you don't have enough information (like origin/destination), ask for it. Be friendly and concise."""
        
        # Get LLM response
        response = self._call_llm(prompt)
        
        # Log and return
        self.memory.log_agent_response(response)
        return response

if __name__ == "__main__":
    agent = PlannerAgent()
    print("=" * 50)
    print("London Transit Planner Agent (Conversational Mode)")
    print("Memory persistence enabled for 71-minute bounty")
    print("=" * 50)
    print("Type 'exit' to quit")
    print("-" * 50)
    
    while True:
        user_input = input("\nYou: ")
        
        if user_input.lower() == 'exit':
            print("Goodbye!")
            break
        
        print("Agent: ", end="", flush=True)
        response = agent.process_request(user_input)
        print(response)
