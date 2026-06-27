#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if [ ! -f server/.env ]; then
  echo "Missing server/.env. Copy server/.env.example and fill in your API keys first:"
  echo "  cp server/.env.example server/.env"
  exit 1
fi

npm install

cleanup() {
  echo "Shutting down..."
  kill $server_pid $web_pid 2>/dev/null || true
  wait $server_pid $web_pid 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting backend..."
npm -w server run dev &
server_pid=$!

echo "Starting frontend..."
npm -w web run dev &
web_pid=$!

echo "Both services are starting. Press Ctrl+C to stop."
wait
