#!/bin/bash
set -e

echo "🛑 Stopping IAMKey Blackbox Simulator..."

cd "$(dirname "$0")/.."

# Use .env file if it exists
if [ -f ".env" ]; then
    docker compose --env-file .env down
else
    docker compose down
fi

echo "✅ Simulator stopped."
