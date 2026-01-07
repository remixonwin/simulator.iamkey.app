#!/bin/bash
set -e

echo "🔗 Deploying contracts to Anvil..."

# Wait for Anvil to be ready
export FOUNDRY_DISABLE_NIGHTLY_WARNING=true

until cast block-number --rpc-url $RPC_URL > /dev/null 2>&1; do
  echo "Waiting for Anvil..."
  sleep 1
done

echo "✅ Anvil is ready"

# Compile contracts first
echo "🔨 Compiling contracts..."
forge build --force

export RUST_BACKTRACE=1

# Helper function to extract deployed address from forge create output
extract_address() {
  grep -oP 'Deployed to: \K0x[a-fA-F0-9]{40}' || echo ""
}

# Deploy Mock DAI Token first
echo "📜 Deploying Mock DAI..."
DAI_OUTPUT=$(forge create \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  contracts/MockDAI.sol:MockDAI 2>&1) || { echo "Deployment failed"; echo "$DAI_OUTPUT"; exit 1; }

echo "$DAI_OUTPUT"

DAI_ADDRESS=$(echo "$DAI_OUTPUT" | extract_address)
if [ -z "$DAI_ADDRESS" ]; then
  echo "❌ Failed to deploy MockDAI - could not extract address"
  exit 1
fi
echo "   DAI deployed to: $DAI_ADDRESS"

# Deploy Identity Contract
echo "📜 Deploying IdentityContract..."
IDENTITY_OUTPUT=$(forge create \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  contracts/IdentityContract.sol:IdentityContract \
  --constructor-args 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 $DAI_ADDRESS 2>&1) || { echo "Deployment failed"; echo "$IDENTITY_OUTPUT"; exit 1; }

echo "$IDENTITY_OUTPUT"

IDENTITY_ADDRESS=$(echo "$IDENTITY_OUTPUT" | extract_address)
if [ -z "$IDENTITY_ADDRESS" ]; then
  echo "❌ Failed to deploy IdentityContract - could not extract address"
  exit 1
fi
echo "   IdentityContract deployed to: $IDENTITY_ADDRESS"

# Deploy P2P Escrow Contract
echo "📜 Deploying P2PEscrow..."
ESCROW_OUTPUT=$(forge create \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  contracts/P2PEscrow.sol:P2PEscrow \
  --constructor-args $DAI_ADDRESS $IDENTITY_ADDRESS 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 2>&1) || { echo "Deployment failed"; echo "$ESCROW_OUTPUT"; exit 1; }

echo "$ESCROW_OUTPUT"

ESCROW_ADDRESS=$(echo "$ESCROW_OUTPUT" | extract_address)
if [ -z "$ESCROW_ADDRESS" ]; then
  echo "❌ Failed to deploy P2PEscrow - could not extract address"
  exit 1
fi
echo "   P2PEscrow deployed to: $ESCROW_ADDRESS"

# Mint DAI to test accounts
echo "💰 Minting DAI to test accounts..."
for i in {0..9}; do
  ACCOUNT=$(cast wallet address --private-key $(cast wallet derive-private-key "test test test test test test test test test test test junk" $i))
  cast send --rpc-url $RPC_URL --private-key $PRIVATE_KEY $DAI_ADDRESS "mint(address,uint256)" $ACCOUNT 100000000000000000000000
  echo "   Minted 100,000 DAI to $ACCOUNT"
done

# Save deployment info
mkdir -p /app/artifacts
cat > /app/artifacts/deployment.json << EOF
{
  "network": "anvil-local",
  "chainId": 31337,
  "contracts": {
    "DAI": "$DAI_ADDRESS",
    "IdentityContract": "$IDENTITY_ADDRESS",
    "P2PEscrow": "$ESCROW_ADDRESS"
  },
  "deployer": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo ""
echo "✅ Deployment complete!"
echo "   📄 Deployment info saved to /app/artifacts/deployment.json"
echo ""
cat /app/artifacts/deployment.json
echo "Script finished. Exiting."
exit 0
