#!/bin/bash
set -e

echo "🚀 Starting IAMKey Blackbox Simulator..."
echo ""

cd "$(dirname "$0")/.."

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check for Docker Compose
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

# Port management: Find available ports and create .env file
echo "🔍 Checking for available ports..."
if [ ! -f ".env" ]; then
    echo "   Creating new .env file with port configuration..."
else
    echo "   Updating existing .env file with available ports..."
fi

if ! ./scripts/find-available-ports.sh; then
    echo "❌ Failed to configure ports. Please check for port conflicts and try again."
    exit 1
fi

# Load environment variables from .env file
set -a
source .env
set +a

echo ""
echo "📦 Building services..."
docker compose --env-file .env build

echo ""
echo "🏃 Starting services..."
docker compose --env-file .env up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Wait for each service
echo "   Checking Anvil (blockchain)..."
until docker compose --env-file .env exec -T anvil cast block-number --rpc-url http://localhost:$ANVIL_PORT &> /dev/null; do
    sleep 1
done
echo "   ✅ Anvil is ready"

echo "   Checking PostgreSQL..."
until docker compose --env-file .env exec -T postgres pg_isready -U simulator -h localhost -p 5432 &> /dev/null; do
    sleep 1
done
echo "   ✅ PostgreSQL is ready"

echo "   Checking USSD Simulator..."
until curl -s http://localhost:$USSD_SIM_PORT/health > /dev/null 2>&1; do
    sleep 1
done
echo "   ✅ USSD Simulator is ready"

echo ""
echo "=========================================="
echo "✅ IAMKey Blackbox Simulator is running!"
echo "=========================================="
echo ""
echo "Services:"
echo "  📊 Dashboard:     http://localhost:$DASHBOARD_PORT"
echo "  🔌 Backend API:   http://localhost:$BACKEND_PORT"
echo "  📱 USSD Sim:      http://localhost:$USSD_SIM_PORT"
echo "  🎮 Sim Control:   http://localhost:$SIM_CONTROL_PORT"
echo "  💬 Telegram Mock: http://localhost:$TELEGRAM_MOCK_PORT"
echo "  🔔 FCM Mock:      http://localhost:$FCM_MOCK_PORT (WS: ws://localhost:$FCM_MOCK_PORT/ws)"
echo "  ⛓️  Anvil RPC:     http://localhost:$ANVIL_PORT"
echo "  🐘 PostgreSQL:    localhost:$POSTGRES_PORT"
echo "  🔴 Redis:         localhost:$REDIS_PORT"
echo ""
echo "Test Users (pre-seeded):"
echo "  Alice: +9779841234567 (5000 NPR)"
echo "  Bob:   +9779842345678 (2500 NPR)"
echo "  Carol: +9779843456789 (Guardian)"
echo "  Dave:  +9779844567890 (Guardian)"
echo "  Eve:   +9779845678901 (Guardian)"
echo ""
echo "To stop: ./scripts/stop-simulator.sh"
echo "To view logs: docker compose logs -f"
