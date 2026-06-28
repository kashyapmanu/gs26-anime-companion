#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if [ ! -f server/.env ]; then
  echo "Missing server/.env. Copy server/.env.example and fill in your API keys first:"
  echo "  cp server/.env.example server/.env"
  exit 1
fi

npm install

BACKEND_PORT=3005
WEB_PORT=3006

export PORT="$BACKEND_PORT"
export BACKEND_PORT

cleanup() {
  echo "Shutting down..."
  kill $server_pid $web_pid 2>/dev/null || true
  wait $server_pid $web_pid 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting backend on port $BACKEND_PORT..."
npm -w server run dev &
server_pid=$!

echo "Starting frontend on port $WEB_PORT..."
npm -w web run dev -- --port "$WEB_PORT" --strictPort &
web_pid=$!

echo
echo "Backend  : http://localhost:$BACKEND_PORT"
echo "Frontend : http://localhost:$WEB_PORT"
echo "Press Ctrl+C to stop both services."
wait
