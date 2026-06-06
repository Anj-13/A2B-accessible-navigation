#!/usr/bin/env bash
set -euo pipefail

DGX_HOST="${DGX_HOST:-nvidia@hp-10.local}"
LOCAL_OLLAMA_PORT="${LOCAL_OLLAMA_PORT:-11434}"
REMOTE_OLLAMA_PORT="${REMOTE_OLLAMA_PORT:-11434}"

if command -v lsof >/dev/null 2>&1 &&
   lsof -nP -iTCP:"$LOCAL_OLLAMA_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  printf 'Port %s is already in use.\n' "$LOCAL_OLLAMA_PORT"
  printf 'If Ollama is already reachable, verify it with:\n'
  printf '  curl http://127.0.0.1:%s/api/tags\n' "$LOCAL_OLLAMA_PORT"
  exit 1
fi

printf 'Opening DGX Ollama tunnel\n'
printf '  DGX:   %s\n' "$DGX_HOST"
printf '  Local: http://127.0.0.1:%s\n' "$LOCAL_OLLAMA_PORT"
printf 'Keep this terminal open. Press Ctrl+C to close the tunnel.\n\n'

exec ssh \
  -N \
  -L "${LOCAL_OLLAMA_PORT}:127.0.0.1:${REMOTE_OLLAMA_PORT}" \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  "$DGX_HOST"
