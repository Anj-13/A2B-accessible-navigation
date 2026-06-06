#!/bin/bash
echo "=== FULL SESSION MEMORY ==="
echo "Timestamp: $(date)"
echo ""
echo "Memory File Contents:"
echo "---------------------"
cat /sandbox/memory.json 2>/dev/null | python3 -m json.tool || echo "No memory file yet"
echo ""
echo "=== END OF MEMORY ==="
