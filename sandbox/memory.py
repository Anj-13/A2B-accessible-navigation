import json
import os
from datetime import datetime, timedelta

class MemorySystem:
    def __init__(self):
        self.memory_file = "/sandbox/memory.json"
        self._ensure_file_exists()
    
    def _ensure_file_exists(self):
        if not os.path.exists(self.memory_file):
            with open(self.memory_file, 'w') as f:
                json.dump([], f)
    
    def log_event(self, event_type, content, session_id="bounty_session"):
        with open(self.memory_file, 'r') as f:
            memory = json.load(f)
        
        memory.append({
            "timestamp": datetime.now().isoformat(),
            "event_type": event_type,
            "content": content,
            "session_id": session_id
        })
        
        with open(self.memory_file, 'w') as f:
            json.dump(memory, f, indent=2)
    
    def get_events_since(self, minutes_ago, session_id="bounty_session"):
        cutoff = datetime.now() - timedelta(minutes=minutes_ago)
        
        with open(self.memory_file, 'r') as f:
            memory = json.load(f)
        
        events = []
        for event in memory:
            event_time = datetime.fromisoformat(event["timestamp"])
            if event_time > cutoff and event["session_id"] == session_id:
                events.append(event)
        
        return events
    
    def get_full_session(self, session_id="bounty_session"):
        with open(self.memory_file, 'r') as f:
            memory = json.load(f)
        
        return [e for e in memory if e["session_id"] == session_id]
    
    def log_user_query(self, query, session_id="bounty_session"):
        self.log_event("user_query", {"text": query}, session_id)
    
    def log_agent_response(self, response, session_id="bounty_session"):
        self.log_event("agent_response", {"text": response}, session_id)
    
    def log_decision(self, route_chosen, reason, session_id="bounty_session"):
        self.log_event("decision", {"route": route_chosen, "reason": reason}, session_id)
    
    def clear_session(self, session_id="bounty_session"):
        with open(self.memory_file, 'r') as f:
            memory = json.load(f)
        
        memory = [e for e in memory if e["session_id"] != session_id]
        
        with open(self.memory_file, 'w') as f:
            json.dump(memory, f, indent=2)
