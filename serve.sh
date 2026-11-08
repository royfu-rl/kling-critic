#!/usr/bin/env bash
# One-command dev server for the KAT-Coder blog.
#
#   ./serve.sh            build + serve on :8000, open browser
#   ./serve.sh 9000       use port 9000
#   ./serve.sh --no-build just serve (skip rebuild)
#
# Why a server (not double-click): deepswe/index.html loads ES modules and
# fetch()es JSON from artifacts/. Both are blocked under file://, so the
# embedded Visual Analysis Tool renders blank. Serving over HTTP fixes it.
#
# Idempotent: whatever is already holding the port gets killed first, so
# re-running never lands you on a stale server serving the previous build.
set -euo pipefail

cd "$(dirname "$0")"

# Anaconda python — the bare `python` on PATH is a Windows Store stub that
# does nothing in a non-interactive shell.
PY="/c/Users/roy/anaconda3/python.exe"
[ -x "$PY" ] || PY="python"

PORT=8001
BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    [0-9]*)     PORT="$arg" ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

if [ "$BUILD" -eq 1 ]; then
  # The chart is assembled from charts/src/** + data/tag-system.json, and build.py
  # inlines whatever bytes are on disk. Without this step an edit to a partial or to
  # the taxonomy silently ships the previous chart.
  if command -v node >/dev/null 2>&1; then
    echo ">> generating charts ..."
    node tools/gen-chart.mjs || exit 1
  else
    echo ">> node not found — skipping chart generation (charts/*.html may be stale)" >&2
  fi
  echo ">> building index.html ..."
  "$PY" build.py
fi

# Free the port before binding it. Git Bash has no lsof, so fall back to
# netstat + taskkill; on mac/Linux lsof is the reliable one.
free_port() {
  local port="$1" pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      echo ">> killing process(es) on port ${port}: $pids"
      kill $pids 2>/dev/null || true
      sleep 1
      pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
      [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
    fi
  elif command -v netstat >/dev/null 2>&1 && command -v taskkill >/dev/null 2>&1; then
    pids="$(netstat -ano 2>/dev/null | grep -E "[:.]${port}[[:space:]]+.*LISTENING" \
            | awk '{print $NF}' | sort -u || true)"
    for pid in $pids; do
      echo ">> killing pid ${pid} on port ${port}"
      taskkill //F //PID "$pid" >/dev/null 2>&1 || true
    done
    [ -n "$pids" ] && sleep 1
  fi
}
free_port "$PORT"

URL="http://localhost:${PORT}/index.html"
echo ">> serving on ${URL}  (Ctrl-C to stop)"

# Open the browser shortly after the server comes up (background).
( sleep 1; start "" "$URL" 2>/dev/null || true ) &

exec "$PY" -m http.server "$PORT"

