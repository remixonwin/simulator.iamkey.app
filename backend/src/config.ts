type BindingsLike = any;

function resolveEscrowAddress(env: BindingsLike) {
  // Prefer explicit ESCROW_CONTRACT_ADDRESS, fallback to legacy P2P_ESCROW_ADDRESS
  return env.ESCROW_CONTRACT_ADDRESS || env.P2P_ESCROW_ADDRESS || null;
}

function resolveAlchemySettings(env: BindingsLike) {
  const apiKey = env.ALCHEMY_API_KEY || env.ALCHEMY_GAS_MANAGER_KEY || null;
  const isProduction = env.ENVIRONMENT === 'production';
  const network = isProduction ? 'base' : 'sepolia';
  return { apiKey, network };
}

function requireEnvKeys(env: BindingsLike, keys: string[]) {
  const missing: string[] = [];
  for (const k of keys) {
    if (!env[k]) missing.push(k);
  }
  if (missing.length) {
    throw new Error(`Missing required env keys: ${missing.join(', ')}`);
  }
}

export { resolveEscrowAddress, resolveAlchemySettings, requireEnvKeys };
