#!/usr/bin/env python3
"""Test script to verify memory persistence for the bounty"""

from memory import MemorySystem
import time

print("Testing Memory System for 71-Minute Bounty")
print("=" * 50)

mem = MemorySystem()

# Clear previous test session
mem.clear_session("test_session")
print("✓ Cleared previous test session")

# Step 1: Store a test fact
test_fact = "The judge's name is Alex"
mem.log_user_query(test_fact, "test_session")
print(f"✓ Stored: '{test_fact}'")

# Step 2: Store a response
mem.log_agent_response("Hello Alex! I'll remember that.", "test_session")
print("✓ Stored agent response")

# Step 3: Verify it was stored
events = mem.get_full_session("test_session")
print(f"✓ Memory now contains {len(events)} events")

# Step 4: Retrieve and verify
for event in events:
    if event["event_type"] == "user_query" and "Alex" in event["content"]["text"]:
        print("✓ Memory recall successful! The judge's name is stored.")
        break
else:
    print("✗ Memory recall failed!")

print("\nTo test persistence across time, wait 2 minutes and run:")
print("  python3 -c \"from memory import MemorySystem; mem = MemorySystem(); print(mem.get_events_since(1, 'test_session'))\"")