#!/bin/bash
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Starting backend..."
cd "$ROOT/backend"
.venv/bin/python -m uvicorn main:app --port 8000 &
BACKEND_PID=$!

echo "Starting Vite..."
cd "$ROOT/frontend"
npm run dev &
VITE_PID=$!

echo "Waiting for Vite..."
until curl -s http://localhost:5173 > /dev/null 2>&1; do sleep 0.5; done

echo "Launching Electron..."
npm run electron

# When Electron closes, kill the others
kill $BACKEND_PID $VITE_PID 2>/dev/null
