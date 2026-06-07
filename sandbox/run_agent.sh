#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMORY_FILE="${SANDBOX_MEMORY_FILE:-$SCRIPT_DIR/memory.json}"
# Quick script to start the planner agent

echo "========================================="
echo "London Transit Planner Agent"
echo "Memory persistence enabled for bounty"
echo "========================================="
echo ""

# Show current memory size
if [ -f "$MEMORY_FILE" ]; then
    MEMORY_COUNT=$(python3 -c "import json; print(len(json.load(open('$MEMORY_FILE'))))")
    echo "Memory contains $MEMORY_COUNT events"
else
    echo "No memory file yet. Starting fresh."
fi

echo ""
echo "Starting planner agent..."
echo "Type 'exit' to quit, 'recall X' to see last X minutes"
echo ""

# Run the agent
PYTHONPATH="$SCRIPT_DIR" python3 "$SCRIPT_DIR/planner_agent.py"
