#!/bin/bash
# Quick script to start the planner agent

echo "========================================="
echo "London Transit Planner Agent"
echo "Memory persistence enabled for bounty"
echo "========================================="
echo ""

# Show current memory size
if[ -f /sandbox/memory.json ]; then
    MEMORY_COUNT=$(python3 -c "import json; print(len(json.load(open('/sandbox/memory.json'))))")
     echo "📝 Memory contains $MEMORY_COUNT events"
else
    echo "📝 No memory file yet. Starting fresh."
fi

echo ""
echo "Starting planner agent..."
echo "Type 'exit' to quit, 'recall X' to see last X minutes"
echo ""

# Run the agent
python3 /sandbox/planner_agent.py