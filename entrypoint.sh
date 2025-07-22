#!/bin/sh
set -e

if [ -z "$NGROK_AUTHTOKEN" ]; then
  echo "❌ NGROK_AUTHTOKEN environment variable is not set"
  exit 1
fi

echo "🔐 Authenticating ngrok..."
ngrok config add-authtoken "$NGROK_AUTHTOKEN"

echo "🚀 Starting backend in dev mode..."
cd /app/backend && npm run dev &

echo "🚀 Starting frontend in dev mode..."
cd /app/frontend && npm run dev &

# Wait a bit to let backend start
sleep 5

echo "🌐 Starting ngrok tunnel on https://c1r4s7.42beirut.com:3000 ..."
ngrok http https://c1r4s7.42beirut.com:3000 --log=stdout > /tmp/ngrok.log &

# Keep container alive
tail -f /dev/null
