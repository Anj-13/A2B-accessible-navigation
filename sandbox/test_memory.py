#!/usr/bin/env python3
"""Test script to verify memory persistence for the bounty"""

from memory import MemorySystem
import tempfile
from pathlib import Path

print("Testing Memory System for 71-Minute Bounty")
print("=" * 50)

with tempfile.TemporaryDirectory() as temp_dir:
    memory_file = Path(temp_dir) / "memory.json"
    mem = MemorySystem(memory_file=memory_file)

    test_fact = "The judge's name is Alex"
    mem.log_user_query(test_fact, "test_session")
    print(f"✓ Stored: '{test_fact}'")

    mem.log_agent_response("Hello Alex! I'll remember that.", "test_session")
    print("✓ Stored agent response")

    events = mem.get_full_session("test_session")
    print(f"✓ Memory now contains {len(events)} events")

    if any(
        event["event_type"] == "user_query"
        and "Alex" in event["content"]["text"]
        for event in events
    ):
        print("✓ Memory recall successful! The judge's name is stored.")
    else:
        raise SystemExit("✗ Memory recall failed!")

print("\nMemory persistence checks passed without modifying demo memory.")
