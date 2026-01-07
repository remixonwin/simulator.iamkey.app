#!/bin/bash
set -e

echo "🔄 Resetting simulator state..."

cd "$(dirname "$0")/.."

# Stop services
docker compose down -v

# Remove volumes
docker volume rm iamkey-simulator_postgres_data 2>/dev/null || true
docker volume rm iamkey-simulator_contract_artifacts 2>/dev/null || true

echo "✅ State reset. Run ./scripts/start-simulator.sh to start fresh."
