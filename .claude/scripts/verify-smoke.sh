#!/usr/bin/env bash
# .claude/scripts/verify-smoke.sh
# Smoke-checks dev server: starts on a random port, hits health + index, cleans up.
# Usage: bash .claude/scripts/verify-smoke.sh

set -uo pipefail

EXIT_CODE=0
PORT=""

cleanup() {
  if [ -n "$PORT" ]; then
    lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true
    echo "Dev server stopped"
  fi
  exit $EXIT_CODE
}
trap cleanup EXIT INT TERM

# Detect timeout command (gtimeout on macOS via coreutils, timeout on Linux)
if command -v gtimeout &>/dev/null; then
  TIMEOUT_CMD="gtimeout"
elif command -v timeout &>/dev/null; then
  TIMEOUT_CMD="timeout"
else
  TIMEOUT_CMD=""
fi

start_dev() {
  local port=$1
  local log=$2
  if [ -n "$TIMEOUT_CMD" ]; then
    $TIMEOUT_CMD 15 pnpm dev --port "$port" > "$log" 2>&1 &
  else
    pnpm dev --port "$port" > "$log" 2>&1 &
  fi
  echo $!
}

PORT=$((RANDOM % 2000 + 4000))
LOG="/tmp/dev.$PORT.log"

DEV_PID=$(start_dev "$PORT" "$LOG")
sleep 3

# Check for port conflict or early crash
if grep -q EADDRINUSE "$LOG" 2>/dev/null || ! kill -0 "$DEV_PID" 2>/dev/null; then
  PORT=$((RANDOM % 2000 + 4000))
  LOG="/tmp/dev.$PORT.log"
  DEV_PID=$(start_dev "$PORT" "$LOG")
  sleep 3
fi

echo "--- Dev server on port $PORT (PID $DEV_PID) ---"

echo "--- Health check ---"
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/health" 2>&1) || true
echo "HTTP $HEALTH"
if [ "$HEALTH" != "200" ]; then EXIT_CODE=1; fi

echo "--- Main page ---"
MAIN=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/" 2>&1) || true
echo "HTTP $MAIN"
# Accept 2xx and 3xx (302 redirect to login is expected for auth-protected apps)
if [[ ! "$MAIN" =~ ^[23] ]]; then EXIT_CODE=1; fi
