#!/bin/bash

# Port Discovery Script for IAMKey Simulator
# Finds available ports starting from default values

# Default ports configuration
DEFAULT_PORTS=(
    "ANVIL_PORT=8545"
    "POSTGRES_PORT=5432"
    "REDIS_PORT=6379"
    "BACKEND_PORT=3000"
    "USSD_SIM_PORT=4000"
    "SIM_CONTROL_PORT=4003"
    "TELEGRAM_MOCK_PORT=4001"
    "FCM_MOCK_PORT=4002"
    "DASHBOARD_PORT=5173"
)

# Array to track ports assigned in this run
ASSIGNED_PORTS=()

# Function to check if a port is available
is_port_available() {
    local port=$1
    # Try ss first (more reliable for system-wide listeners)
    # Match :port followed by whitespace
    if ss -H -tunl | grep -qE ":$port\s"; then
        return 1  # Port is in use
    fi
    # Fallback to lsof
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 1  # Port is in use
    fi
    
    # Also check if we already assigned this port in the current script run
    for assigned in "${ASSIGNED_PORTS[@]}"; do
        if [ "$assigned" == "$port" ]; then
            return 1
        fi
    done

    return 0  # Port is available
}

# Function to find next available port starting from given port
# Stores result in GLOBAL_AVAILABLE_PORT
find_available_port() {
    local start_port=$1
    local current_port=$start_port

    while ! is_port_available $current_port; do
        ((current_port++))
        # Prevent infinite loop by limiting search to 100 ports
        if [ $((current_port - start_port)) -gt 100 ]; then
            echo "Error: Could not find available port starting from $start_port" >&2
            return 1
        fi
    done

    ASSIGNED_PORTS+=($current_port)
    GLOBAL_AVAILABLE_PORT=$current_port
}

# Main logic
echo "# IAMKey Simulator Port Configuration" > .env
echo "# Generated on $(date)" >> .env
echo "" >> .env

for port_config in "${DEFAULT_PORTS[@]}"; do
    var_name=$(echo $port_config | cut -d'=' -f1)
    default_port=$(echo $port_config | cut -d'=' -f2)

    find_available_port $default_port

    if [ $? -eq 0 ]; then
        echo "$var_name=$GLOBAL_AVAILABLE_PORT" >> .env
        echo "✓ $var_name: $GLOBAL_AVAILABLE_PORT (default: $default_port)"
    else
        echo "✗ Failed to find available port for $var_name starting from $default_port" >&2
        exit 1
    fi
done

echo ""
echo "Port configuration saved to .env"
echo "Run 'docker-compose --env-file .env up' to use these ports"
