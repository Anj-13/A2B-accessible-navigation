#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VOICE_DIR="$ROOT_DIR/voice_service"
ENV_FILE="$VOICE_DIR/.env"
VOICE_PYTHON="$VOICE_DIR/.venv/bin/python"
FAILURES=0
WARNINGS=0

pass() {
  printf '[PASS] %s\n' "$1"
}

warn() {
  printf '[WARN] %s\n' "$1"
  WARNINGS=$((WARNINGS + 1))
}

fail() {
  printf '[FAIL] %s\n' "$1"
  FAILURES=$((FAILURES + 1))
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

printf 'A2B demo preflight\n'
printf 'Repository: %s\n\n' "$ROOT_DIR"

if command_exists node; then
  NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
  if [ "$NODE_MAJOR" -ge 18 ]; then
    pass "Node.js $(node --version)"
  else
    fail "Node.js 18+ is required; found $(node --version)"
  fi
else
  fail "Node.js is not installed"
fi

if command_exists npm; then
  pass "npm $(npm --version)"
else
  fail "npm is not installed"
fi

if command_exists python3; then
  pass "Python $(python3 --version 2>&1 | sed 's/^Python //')"
else
  fail "python3 is not installed"
fi

if command_exists curl; then
  pass "curl is available"
else
  fail "curl is not installed"
fi

if [ -f "$ENV_FILE" ]; then
  pass "voice_service/.env exists"
  ELEVENLABS_VALUE="$(
    sed -n 's/^ELEVENLABS_API_KEY=//p' "$ENV_FILE" | head -n 1
  )"
  if [ -n "$ELEVENLABS_VALUE" ] &&
     [ "$ELEVENLABS_VALUE" != "your_elevenlabs_api_key_here" ]; then
    pass "ELEVENLABS_API_KEY is configured"
  else
    fail "ELEVENLABS_API_KEY is missing or still a placeholder"
  fi
else
  fail "voice_service/.env is missing; copy voice_service/.env.example"
fi

if [ -x "$VOICE_PYTHON" ]; then
  pass "Voice virtual environment exists"
  if "$VOICE_PYTHON" \
    -c 'import dotenv, elevenlabs, numpy, requests, sounddevice' \
    >/dev/null 2>&1; then
    pass "Voice service Python dependencies are installed"
  else
    fail "Voice dependencies are missing; run: voice_service/.venv/bin/python -m pip install -r voice_service/requirements.txt"
  fi
else
  fail "Voice virtual environment is missing; run: python3 -m venv voice_service/.venv"
fi

if curl --silent --fail --max-time 2 http://127.0.0.1:3000/health >/dev/null 2>&1; then
  pass "A2B server is running at http://127.0.0.1:3000"
else
  warn "A2B server is not running; start it with: npm start"
fi

OLLAMA_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-gpt-oss:120b}"
OLLAMA_TAGS="$(curl --silent --fail --max-time 3 "$OLLAMA_URL/api/tags" 2>/dev/null || true)"

if [ -n "$OLLAMA_TAGS" ]; then
  pass "Ollama is reachable at $OLLAMA_URL"
  if printf '%s' "$OLLAMA_TAGS" | grep -Fq "\"$OLLAMA_MODEL\""; then
    pass "Ollama model $OLLAMA_MODEL is available"
  else
    warn "Ollama is reachable, but $OLLAMA_MODEL was not found"
  fi
else
  warn "Ollama is not reachable at $OLLAMA_URL; run: npm run demo:dgx"
fi

if git -C "$ROOT_DIR" diff --quiet &&
   git -C "$ROOT_DIR" diff --cached --quiet; then
  pass "Git worktree has no uncommitted tracked changes"
else
  warn "Git worktree has uncommitted changes"
fi

printf '\nSummary: %s failure(s), %s warning(s)\n' "$FAILURES" "$WARNINGS"

if [ "$FAILURES" -gt 0 ]; then
  exit 1
fi

printf 'Local demo prerequisites are ready. Warnings may only require starting services.\n'
