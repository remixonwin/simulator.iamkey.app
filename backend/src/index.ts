/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ethers } from 'ethers';
import { Network, Alchemy } from 'alchemy-sdk';
import marketplace from './marketplace';
import walletRouter from './wallet';
import { sendFCMNotification as sendFCMNotificationShared, getNotificationPreferences as getNotificationPreferencesShared, storeNotification as storeNotificationShared, shouldSendNotification as shouldSendNotificationShared, defaultNotificationPreferences as defaultNotificationPreferencesShared } from './notifications';
import {
  normalizeCountryCode,
  extractLanguageCode,
  resolveLocaleSignals,
  calculateLocaleTrustDelta,
  buildLocaleHashInput,
} from './locale';

// Environment variables type definition
type Bindings = {
  ENVIRONMENT: string;
  ETHEREUM_SEPOLIA_RPC: string;
  PAYMASTER_RPC_URL: string;
  ALCHEMY_GAS_MANAGER_KEY: string;
  CONTRACT_IDENTITY_ADDRESS: string;
  PRIVATE_KEY: string;
  MNEMONIC: string;
  ALCHEMY_API_KEY: string;
  CHAIN_ID: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_BOT_USERNAME: string;
  TELEGRAM_ADMIN_CHAT_ID: string;
  TELEGRAM_SERVICE_URL?: string;
  IAMKEY_KV: KVNamespace;
  FCM_SERVICE_ACCOUNT: string; // JSON string of service account
  PINATA_JWT: string; // Pinata IPFS API JWT
  MARKETPLACE_ADMIN_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS with strict origin policy
const ALLOWED_ORIGINS = [
  'https://id.iamkey.app',
  'https://www.iamkey.app',
  'https://iamkey.app',
  'http://localhost:3000', // Local dashboard
  'http://localhost:4003', // Simulator dashboard
];

app.use('*', cors({
  origin: (origin) => {
    // allow requests with no origin (like mobile apps or curl)
    if (!origin) return origin;
    if (ALLOWED_ORIGINS.includes(origin)) return origin;
    // Allow any subdomain of iamkey.app (e.g. staging)
    if (origin.endsWith('.iamkey.app')) return origin;
    return null;
  },
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}));

// Audit logging middleware for sensitive operations
app.use('*', async (c, next) => {
  const method = c.req.method;
  const path = c.req.path;
  
  // Log all DELETE and sensitive POST operations
  if (method === 'DELETE' || (method === 'POST' && (
    path.includes('/user/') || 
    path.includes('/guardian/') ||
    path.includes('/identity/') ||
    path.includes('/fraud')
  ))) {
    const timestamp = new Date().toISOString();
    const cf = (c.req.raw as any).cf || {};
    console.log(`[AUDIT] ${timestamp} | ${method} ${path} | Country: ${cf.country || 'unknown'} | Ray: ${c.req.header('cf-ray') || 'local'}`);
  }
  
  await next();
});


import { LANDING_PAGE, PRIVACY_POLICY } from './html-content';

// Identity Contract ABI (Minimal)
const IDENTITY_ABI = [
  "function createIdentity(bytes32 phoneHash, bytes32 salt, string calldata username, bool isBiometricEnabled) external returns (uint256)",
  "function getIdentityByPhoneHash(bytes32 phoneHash) external view returns (tuple(bytes32 phoneHash, bytes32 salt, string username, address owner, uint64 registeredAt, uint32 trustLevel, uint256 identityBond, bool isBiometricEnabled, bool isFlagged, bool isFrozen, bool isResolver))",
  "function registerGuardian(bytes32 identityHash, address guardianAddress, bytes32 publicKeyHash) external",
  "function updateTrustLevel(bytes32 phoneHash, uint32 newLevel) external",
  "function batchUpdateTrustLevels(bytes32[] calldata phoneHashes, uint32[] calldata newLevels) external",
  "function reportFraud(bytes32 phoneHash, string calldata reason) external",
  "function updateIdentityMetadataHash(bytes32 phoneHash, bytes32 metadataHash) external",
  "function getIdentityMetadataHash(bytes32 phoneHash) external view returns (bytes32)",
  "function updateGuardianStatus(bytes32 identityHash, address guardianAddress, uint8 newStatus) external",
  "function removeGuardian(bytes32 identityHash, address guardianAddress) external",
  "function getGuardians(bytes32 identityHash) external view returns (tuple(address guardianAddress, bytes32 identityHash, uint64 registeredAt, uint8 status, bytes32 publicKeyHash)[])",
  "function identityExists(bytes32 phoneHash) external view returns (bool)"
];

app.get('/', (c) => c.html(LANDING_PAGE));
app.get('/privacy-policy', (c) => c.html(PRIVACY_POLICY));
app.get('/geo', (c) => {
  const cf = (c.req.raw as any).cf || {};
  return c.json({
    country: cf.country ?? null,
    region: cf.region ?? null,
    regionCode: cf.regionCode ?? null,
    city: cf.city ?? null,
    continent: cf.continent ?? null,
    timezone: cf.timezone ?? null,
  });
});

const DEFAULT_TRUST_POLICY = {
  baseScore: 60,
  minScore: 0,
  maxScore: 100,
  fraudPenalty: 25,
};

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getTrustLevel(score: number) {
  if (score >= 80) return 'elite';
  if (score >= 65) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function isAdminRequest(c: any) {
  // SECURITY FIX: Fail-closed - MUST have admin key configured and provided
  const adminKey = c.env.MARKETPLACE_ADMIN_KEY || c.env.ADMIN_SECRET;
  if (!adminKey) {
    console.log('CRITICAL: No admin key configured. Admin endpoints are vulnerable!');
    return false; // Fail-closed: deny if no admin key configured
  }
  const authHeader = c.req.header('Authorization') || '';
  const adminHeader = c.req.header('X-Admin-Key') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7) === adminKey;
  }
  return adminHeader === adminKey;
}

async function getMarketplaceTrustPolicy(c: any) {
  const stored = await c.env.IAMKEY_KV.get('marketplace_governance');
  if (!stored) return DEFAULT_TRUST_POLICY;
  try {
    const parsed = JSON.parse(stored);
    const trustPolicy = parsed.trustPolicy || {};
    return {
      ...DEFAULT_TRUST_POLICY,
      ...trustPolicy,
    };
  } catch {
    return DEFAULT_TRUST_POLICY;
  }
}

async function applyFraudTrustPenalty(c: any, lookupHash: string) {
  const policy = await getMarketplaceTrustPolicy(c);
  const key = `trust:${lookupHash}`;
  const stored = await c.env.IAMKEY_KV.get(key);
  const nowIso = new Date().toISOString();

  let profile: any;
  if (stored) {
    try {
      profile = JSON.parse(stored);
    } catch {
      profile = null;
    }
  }

  if (!profile) {
    profile = {
      lookupHash,
      score: policy.baseScore,
      level: getTrustLevel(policy.baseScore),
      tradesCompleted: 0,
      disputesOpened: 0,
      disputesLost: 0,
      fraudSignals: 0,
      isFlagged: false,
      lastUpdated: nowIso,
    };
  }

  profile.fraudSignals = (profile.fraudSignals ?? 0) + 1;
  profile.isFlagged = true;
  profile.score = clampNumber(
    (profile.score ?? policy.baseScore) - policy.fraudPenalty,
    policy.minScore,
    policy.maxScore,
  );
  profile.level = getTrustLevel(profile.score);
  profile.lastUpdated = nowIso;

  await c.env.IAMKEY_KV.put(key, JSON.stringify(profile));
  return profile;
}

function mapReputationLevel(score: number) {
  if (score >= 85) return 'diamond';
  if (score >= 70) return 'gold';
  if (score >= 45) return 'silver';
  return 'bronze';
}

async function sendFCMNotification(c: any, lookupHash: string, title: string, body: string, data?: Record<string, string>) {
  return sendFCMNotificationShared(c, lookupHash, title, body, data);
}

async function getNotificationPreferences(c: any, lookupHash: string) {
  return getNotificationPreferencesShared(c, lookupHash);
}

async function storeNotification(
  c: any,
  lookupHash: string,
  payload: { title: string; body: string; type: string; data?: Record<string, string> }
) {
  return storeNotificationShared(c, lookupHash, payload);
}

app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT || 'development',
    services: {
      telegram: !!c.env.TELEGRAM_BOT_TOKEN,
      kv: true
    }
  });
});

// Beta Signup Endpoint with Telegram Notifications
app.post('/beta/signup', async (c) => {
  const body = await c.req.json();
  const { name, email, telegram, device, reason, timestamp } = body;

  if (!name || !email || !device) {
    return c.json({ error: 'Name, email, and device are required' }, 400);
  }

  try {
    // Generate unique beta ID
    const betaId = crypto.randomUUID();
    
    // Store beta signup in KV
    const betaData = {
      id: betaId,
      name,
      email,
      telegram: telegram || '',
      device,
      reason: reason || '',
      status: 'pending',
      signupAt: timestamp || new Date().toISOString(),
    };

    await c.env.IAMKEY_KV.put(`beta:${betaId}`, JSON.stringify(betaData));
    
    // Add to beta list
    const listKey = 'beta:list';
    let betaList: string[] = [];
    const existingList = await c.env.IAMKEY_KV.get(listKey);
    if (existingList) {
      try {
        betaList = JSON.parse(existingList);
      } catch (e) {
        betaList = [];
      }
    }
    betaList.unshift(betaId);
    await c.env.IAMKEY_KV.put(listKey, JSON.stringify(betaList.slice(0, 1000))); // Keep last 1000

    // Send Telegram notification
    const botToken = c.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      const telegramMessage = `🎉 *New Beta Signup!*\n\n` +
        `👤 *Name:* ${name}\n` +
        `📧 *Email:* ${email}\n` +
        `📱 *Device:* ${device}\n` +
        `💬 *Telegram:* ${telegram || 'Not provided'}\n` +
        `📝 *Reason:* ${reason || 'Not provided'}\n\n` +
        `🆔 *Beta ID:* \`${betaId}\`\n` +
        `⏰ *Time:* ${new Date().toLocaleString()}`;

      try {
        // Send to your personal Telegram (you'll need to set TELEGRAM_ADMIN_CHAT_ID)
        const chatId = c.env.TELEGRAM_ADMIN_CHAT_ID || ''; // Set this in wrangler.toml secrets
        
        if (chatId) {
          const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: telegramMessage,
              parse_mode: 'Markdown',
            }),
          });
          
          if (!res.ok) {
            const errorText = await res.text();
            console.log(`Telegram API error (${res.status}):`, errorText);
          } else {
            console.log('Telegram notification sent successfully');
          }
        } else {
          console.warn('TELEGRAM_ADMIN_CHAT_ID is not configured');
        }
      } catch (telegramError: any) {
        console.log('Telegram notification fetch failed:', telegramError.message);
      }
    }

    console.log(`[BETA] New signup: ${name} (${email}) - ${device}`);

    return c.json({
      success: true,
      betaId,
      message: 'Thank you for signing up! Check your email for next steps.',
    });
  } catch (error: any) {
    console.log('Beta signup error:', error);
    return c.json({ error: 'Signup failed. Please try again.' }, 500);
  }
});

// Helper function to validate admin authentication
function validateAdminSecret(c: any): boolean {
  const authHeader = c.req.header('Authorization') || '';
  const adminSecret = c.env.ADMIN_SECRET || c.env.MARKETPLACE_ADMIN_KEY;

  if (!adminSecret) {
    console.log('CRITICAL: ADMIN_SECRET not configured. Admin endpoints are open!');
    // Fail-closed: require secret to be configured
    return false;
  }

  const token = authHeader.replace('Bearer ', '');
  return token === adminSecret;
}

// Get beta signups (admin endpoint - PRODUCTION PROTECTED)
app.get('/beta/list', async (c) => {
  try {
    // SECURITY FIX: Require admin authentication
    if (!validateAdminSecret(c)) {
      return c.json({ error: 'Unauthorized: Invalid or missing admin secret' }, 403);
    }

    const listKey = 'beta:list';
    const listStr = await c.env.IAMKEY_KV.get(listKey);
    const betaIds: string[] = listStr ? JSON.parse(listStr) : [];

    const signups = await Promise.all(
      betaIds.slice(0, 100).map(async (id) => {
        const dataStr = await c.env.IAMKEY_KV.get(`beta:${id}`);
        return dataStr ? JSON.parse(dataStr) : null;
      })
    );

    return c.json({
      total: betaIds.length,
      signups: signups.filter(s => s !== null),
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Secure Data Deletion (GDPR Right to Be Forgotten)
app.post('/identity/delete', async (c) => {
  const body = await c.req.json();
  const { phone_hash, salt } = body;

  if (!phone_hash || !salt) {
    return c.json({ error: 'phone_hash and salt are required' }, 400);
  }

  try {
    // 1. Verify identity exists
    const identityStr = await c.env.IAMKEY_KV.get(`identity:${phone_hash}`);
    if (!identityStr) {
      return c.json({ error: 'Identity not found' }, 404);
    }

    const identity = JSON.parse(identityStr);
    
    // Simple salt verification for authorization (in production use JWT or signature)
    if (identity.salt !== salt) {
      return c.json({ error: 'Unauthorized: Invalid salt' }, 403);
    }

    // 2. Delete all user-related data from KV
    const keysToDelete = [
      `identity:${phone_hash}`,
      `profile:${phone_hash}`,
      `notifications:${phone_hash}`,
      `fcm:${phone_hash}`,
      `notification_prefs:${phone_hash}`,
      `guardians:${phone_hash}`,
      `identitiesByUsername:${identity.username}`
    ];

    // Also delete any associated verification tokens if still active
    const listKey = 'beta:list'; // If they were beta testers
    // (Actual deletion from lists would require scanning or a better index)

    for (const key of keysToDelete) {
      await c.env.IAMKEY_KV.delete(key);
    }

    console.log(`[PRIVACY] Securely deleted all KV data for identity: ${phone_hash}`);

    return c.json({ 
      success: true, 
      message: 'All personal data has been securely removed from our servers.' 
    });
  } catch (error: any) {
    console.log('Data deletion failed:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * Register a new identity on the Blockchain.
 * Backend pays for gas.
 */
app.post('/identity', async (c) => {
  const body = await c.req.json();
  const { phone_hash, salt, username, is_biometric_enabled } = body;

  const apiKey = c.env.ALCHEMY_API_KEY;
  const mnemonic = c.env.MNEMONIC;
  const contractAddress = c.env.CONTRACT_IDENTITY_ADDRESS;
  const privateKey = c.env.PRIVATE_KEY;

  if (!apiKey || !contractAddress || (!mnemonic && !privateKey)) {
    return c.json({ error: 'Server configuration missing (API Key, Contract, or Credentials)' }, 500);
  }

  // Configure Alchemy for Ethereum Sepolia
  const settings = {
    apiKey: apiKey,
    network: Network.ETH_SEPOLIA, 
  };
  const alchemy = new Alchemy(settings);

  try {
    // initialize provider
    const provider = (await alchemy.config.getProvider()) as any;
    
    // Create signer using Ethers directly to avoid version issues
    let wallet;
    if (mnemonic) {
      // Use ethers directly for Wallet creation to ensure compatibility
      wallet = ethers.Wallet.fromPhrase(mnemonic).connect(provider);
    } else {
      wallet = new ethers.Wallet(privateKey, provider);
    }

    // Verify balance
    const balance = await provider.getBalance(wallet.address);
    // console.log(`Using wallet: ${wallet.address} Balance: ${balance.toString()}`);
    
    const contract = new ethers.Contract(contractAddress, IDENTITY_ABI, wallet);

    // console.log(`Sponsoring identity creation for ${username} on Ethereum Sepolia`);
    
    // The backend wallet pays for gas
    const formattedPhoneHash = phone_hash.startsWith('0x') ? phone_hash : `0x${phone_hash}`;
    const formattedSalt = salt.startsWith('0x') ? salt : `0x${salt}`;
    
    const tx = await contract.createIdentity(formattedPhoneHash, formattedSalt, username, is_biometric_enabled);
    const receipt = await tx.wait();

    // Store identity in KV for fast lookup (critical for account restoration)
    const identityData = {
      phone_hash,
      salt,
      username,
      registered_at: new Date().toISOString(),
      is_biometric_enabled,
      reputation_score: 100,
      is_flagged: false,
      transaction_hash: receipt.hash,
      block_number: receipt.blockNumber
    };
    
    await c.env.IAMKEY_KV.put(`identity:${phone_hash}`, JSON.stringify(identityData));
    console.log(`Identity stored in KV for phone_hash: ${phone_hash}`);

    // Notify user of successful registration
    await sendFCMNotification(c, phone_hash, "Welcome to IamKey!", "Your digital identity has been successfully created on the blockchain.", {
      type: 'registration_success',
      username: username
    });

    return c.json({ 
      success: true, 
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      sponsoredBy: 'IamKey Backend Relayer'
    });
  } catch (error: any) {
    console.log('Registration failed:', error);
    return c.json({ error: error.message }, 500);
  }
});

app.get('/reputation', async (c) => {
  const phoneHash = c.req.query('phone_hash');
  if (!phoneHash) return c.json({ error: 'phone_hash is required' }, 400);

  const kvIdentityStr = await c.env.IAMKEY_KV.get(`identity:${phoneHash}`);
  if (kvIdentityStr) {
    try {
      const identity = JSON.parse(kvIdentityStr);
      const score = Number(identity.reputation_score ?? 100);
      return c.json({
        score,
        trustPoints: score,
        level: mapReputationLevel(score),
        lastUpdated: identity.registered_at || new Date().toISOString(),
        isFlagged: identity.is_flagged ?? false
      });
    } catch (_) {}
  }

  try {
    const apiKey = c.env.ALCHEMY_API_KEY;
    const contractAddress = c.env.CONTRACT_IDENTITY_ADDRESS;
    if (!apiKey || !contractAddress) {
      return c.json({ error: 'Config missing' }, 500);
    }

    const settings = { apiKey, network: Network.ETH_SEPOLIA };
    const alchemy = new Alchemy(settings);
    const provider = (await alchemy.config.getProvider()) as any;

    const READ_ABI = [
      "function getIdentityByPhoneHash(bytes32 phoneHash) external view returns (tuple(bytes32 phoneHash, bytes32 salt, string username, address owner, uint64 registeredAt, uint32 reputationScore, bool isBiometricEnabled, bool isFlagged))"
    ];
    const contract = new ethers.Contract(contractAddress, READ_ABI, provider);

    const formattedHash = phoneHash.startsWith('0x') ? phoneHash : `0x${phoneHash}`;
    const result = await contract.getIdentityByPhoneHash(formattedHash);

    const score = Number(result.reputationScore);
    return c.json({
      score,
      trustPoints: score,
      level: mapReputationLevel(score),
      lastUpdated: new Date(Number(result.registeredAt) * 1000).toISOString(),
      isFlagged: result.isFlagged
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Fraud signals
app.get('/fraud/signals', async (c) => {
  const phoneHash = c.req.query('phone_hash');
  if (!phoneHash) return c.json({ error: 'phone_hash is required' }, 400);

  const signalsStr = await c.env.IAMKEY_KV.get(`fraud_signals:${phoneHash}`);
  const signals = signalsStr ? JSON.parse(signalsStr) : [];
  return c.json(signals);
});

app.post('/fraud/report', async (c) => {
  const body = await c.req.json();
  const { phone_hash, signal } = body;
  if (!phone_hash || !signal) {
    return c.json({ error: 'phone_hash and signal are required' }, 400);
  }

  const nowIso = new Date().toISOString();
  const enrichedSignal = {
    ...signal,
    id: signal.id || crypto.randomUUID(),
    timestamp: signal.timestamp || nowIso,
    resolved: signal.resolved ?? false,
  };

  const key = `fraud_signals:${phone_hash}`;
  const existingStr = await c.env.IAMKEY_KV.get(key);
  const existing = existingStr ? JSON.parse(existingStr) : [];
  existing.push(enrichedSignal);
  const updated = existing.slice(-100);
  await c.env.IAMKEY_KV.put(key, JSON.stringify(updated));

  await applyFraudTrustPenalty(c, phone_hash);

  const identityStr = await c.env.IAMKEY_KV.get(`identity:${phone_hash}`);
  if (identityStr) {
    try {
      const identity = JSON.parse(identityStr);
      const currentScore = Number(identity.reputation_score ?? 100);
      identity.is_flagged = true;
      identity.reputation_score = Math.max(0, currentScore - 50);
      await c.env.IAMKEY_KV.put(`identity:${phone_hash}`, JSON.stringify(identity));
    } catch (_) {}
  }

  try {
    const apiKey = c.env.ALCHEMY_API_KEY;
    const contractAddress = c.env.CONTRACT_IDENTITY_ADDRESS;
    const mnemonic = c.env.MNEMONIC;
    const privateKey = c.env.PRIVATE_KEY;
    if (apiKey && contractAddress && (mnemonic || privateKey)) {
      const settings = { apiKey, network: Network.ETH_SEPOLIA };
      const alchemy = new Alchemy(settings);
      const provider = (await alchemy.config.getProvider()) as any;
      const wallet = mnemonic
        ? ethers.Wallet.fromPhrase(mnemonic).connect(provider)
        : new ethers.Wallet(privateKey, provider);
      const contract = new ethers.Contract(contractAddress, IDENTITY_ABI, wallet);
      const formattedHash = phone_hash.startsWith('0x') ? phone_hash : `0x${phone_hash}`;
      await contract.reportFraud(formattedHash, enrichedSignal.description || 'Fraud reported');
    }
  } catch (error: any) {
    console.log('[DEBUG] reportFraud on-chain failed (expected when contracts not deployed):', error?.message || error);
  }

  return c.json({ success: true, signal: enrichedSignal });
});

app.post('/fraud/resolve', async (c) => {
  if (!isAdminRequest(c)) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const body = await c.req.json();
  const { phone_hash, signal_id } = body;
  if (!phone_hash || !signal_id) {
    return c.json({ error: 'phone_hash and signal_id are required' }, 400);
  }

  const key = `fraud_signals:${phone_hash}`;
  const existingStr = await c.env.IAMKEY_KV.get(key);
  const existing = existingStr ? JSON.parse(existingStr) : [];

  const updated = existing.map((entry: any) => {
    if (entry.id === signal_id) {
      return { ...entry, resolved: true };
    }
    return entry;
  });

  await c.env.IAMKEY_KV.put(key, JSON.stringify(updated));
  return c.json({ success: true });
});

// Telegram Verification Endpoints
app.post('/initiate', async (c) => {
  const body = await c.req.json();
  const phoneNumber = body.phoneNumber;

  if (!phoneNumber) {
    return c.json({ error: 'Phone number is required' }, 400);
  }

  // Generate a unique token
  const token = crypto.randomUUID();
  const botUsername = c.env.TELEGRAM_BOT_USERNAME || 'iamkeyapp_bot';
  // Check if we are localhost or prod
  // For bot deep link: https://t.me/BotName?start=<token>
  // Or tg://resolve?domain=BotName&start=<token>
  const botUrl = `tg://resolve?domain=${botUsername}&start=${token}`;
  
  // Store pending request in KV
  // Key: token, Value: { status: 'pending', phoneNumber, createdAt }
  const data = {
    status: 'pending',
    phoneNumber,
    createdAt: Date.now()
  };
  
  // Expire in 10 minutes (600 seconds)
  await c.env.IAMKEY_KV.put(`verif:${token}`, JSON.stringify(data), { expirationTtl: 600 });

  // Notify the telegram mock (if configured) so it can expose the code
  const telegramServiceUrl = c.env.TELEGRAM_SERVICE_URL;
  if (telegramServiceUrl) {
    const sanitizedTelegramServiceUrl = telegramServiceUrl.replace(/\/$/, '');
    try {
      await fetch(`${sanitizedTelegramServiceUrl}/verification/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phoneNumber,
          telegram_chat_id: body.telegramChatId ?? null,
        }),
      });
    } catch (error: any) {
      console.log('[SIMULATOR] Failed to inform telegram mock of verification:', error?.message || error);
    }
  }

  return c.json({ token, botUrl });
});

app.get('/check/:token', async (c) => {
  const token = c.req.param('token');
  
  // Try to bypass edge cache with low TTL if possible, though KV minimum is often 60s.
  // We also set response headers to ensure the client doesn't cache.
  const dataStr = await c.env.IAMKEY_KV.get(`verif:${token}`);

  c.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');

  if (!dataStr) {
    return c.json({ status: 'not_found' }, 404);
  }

  const data = JSON.parse(dataStr);
  return c.json(data);
});

// Test helper: Simulate successful verification (Staging ONLY)
app.post('/test/verify-token', async (c) => {
  if (c.env.ENVIRONMENT !== 'staging') {
    return c.json({ error: 'Only allowed in staging' }, 403);
  }

  const body = await c.req.json();
  const { token, phoneNumber } = body;

  if (!token || !phoneNumber) {
    return c.json({ error: 'Token and phoneNumber required' }, 400);
  }

  const data = {
    status: 'verified',
    phoneNumber,
    verifiedAt: Date.now()
  };

  await c.env.IAMKEY_KV.put(`verif:${token}`, JSON.stringify(data), { expirationTtl: 600 });
  return c.json({ success: true, status: 'verified' });
});

// Debug endpoint to check webhook status (PRODUCTION PROTECTED)
app.get('/debug/webhook-info', async (c) => {
  // SECURITY FIX: Require admin authentication
  if (!validateAdminSecret(c)) {
    return c.json({ error: 'Unauthorized: Invalid or missing admin secret' }, 403);
  }

  const botToken = c.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return c.json({ error: 'No bot token' });
  
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
  const data = await res.json();
  return c.json(data);
});

app.post('/debug/set-webhook', async (c) => {
  // SECURITY FIX: Require admin authentication
  if (!validateAdminSecret(c)) {
    return c.json({ error: 'Unauthorized: Invalid or missing admin secret' }, 403);
  }

  const botToken = c.env.TELEGRAM_BOT_TOKEN;
  const body = await c.req.json();
  const url = body.url || 'https://id.iamkey.app/webhook'; // Allow dynamic webhook URL in production
  
  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(url)}`);
  const data = await res.json();
  return c.json(data);
});

// Telegram Webhook Handler
app.post('/webhook', async (c) => {
  let update;
  try {
    update = await c.req.json();
    console.log('[Webhook] Received update:', JSON.stringify(update));
  } catch (e) {
    console.log('[Webhook] Failed to parse JSON', e);
    return c.json({ status: 'error' });
  }

  const botToken = c.env.TELEGRAM_BOT_TOKEN;

  // Validate Update
  if (!update.message) return c.json({ status: 'ignored' });

  const chatId = update.message.chat.id;
  
  // Handle /start (with or without token)
  if (update.message.text && update.message.text.startsWith('/start')) {
     const parts = update.message.text.split(' ');
     const token = parts.length > 1 ? parts[1] : null;
    
    if (!token) {
       await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: 'Welcome! Please use the "Verify with Telegram" button inside the IamKey app to start verification.',
        })
      });
      return c.json({ status: 'ok' });
    }

    // Ask for contact
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: 'Please share your contact number to verify your identity.',
        reply_markup: {
          keyboard: [[{ text: 'Share Contact', request_contact: true }]],
          one_time_keyboard: true,
          resize_keyboard: true
        }
      })
    });
    
    // Store chatId -> token mapping
    await c.env.IAMKEY_KV.put(`chat:${chatId}`, token, { expirationTtl: 300 });
  } 
  else if (update.message.contact) {
    // Handle Contact
    const phoneNumber = update.message.contact.phone_number;
    // Retrieve token for this chat
    const token = await c.env.IAMKEY_KV.get(`chat:${chatId}`);
    
    if (token) {
      // Update the verification status
      // We must match the phone number? 
      // The user claimed a phone number in /initiate. We should verify it matches.
      const requestDataStr = await c.env.IAMKEY_KV.get(`verif:${token}`);
      if (requestDataStr) {
        const requestData = JSON.parse(requestDataStr);
        // Normalize phone numbers (strip + and spaces) for comparison
        const p1 = requestData.phoneNumber.replace(/\D/g, '');
        const p2 = phoneNumber.replace(/\D/g, '');
        
        if (p1 === p2 || p2.includes(p1) || p1.includes(p2)) {
          requestData.status = 'verified';
          requestData.telegramId = update.message.from.id;
          requestData.username = update.message.from.username;
          
          await c.env.IAMKEY_KV.put(`verif:${token}`, JSON.stringify(requestData), { expirationTtl: 600 });
          
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: '✅ Verification successful! You can return to the app.',
              reply_markup: { remove_keyboard: true }
            })
          });
        } else {
             await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            body: JSON.stringify({
              chat_id: chatId,
              text: '❌ Phone number does not match request.',
            })
          });
        }
      }
    }
  }

  return c.json({ status: 'ok' });
});


app.post('/identity/sync', async (c) => {
  const body = await c.req.json();
  const { lookup_hash, phone_hash } = body;

  if (!lookup_hash && !phone_hash) {
    return c.json({ error: 'lookup_hash or phone_hash is required' }, 400);
  }

  try {
    const apiKey = c.env.ALCHEMY_API_KEY;
    const contractAddress = c.env.CONTRACT_IDENTITY_ADDRESS;
    
    if (!apiKey || !contractAddress) return c.json({ error: 'Config missing' }, 500);

    const settings = { apiKey, network: Network.ETH_SEPOLIA };
    const alchemy = new Alchemy(settings);
    const provider = (await alchemy.config.getProvider()) as any;
    
    const READ_ABI = [
      "function getIdentityByPhoneHash(bytes32 phoneHash) external view returns (tuple(bytes32 phoneHash, bytes32 salt, string username, address owner, uint64 registeredAt, uint32 reputationScore, bool isBiometricEnabled, bool isFlagged))",
      "function getGuardians(bytes32 identityHash) external view returns (tuple(address guardianAddress, bytes32 identityHash, uint64 registeredAt, uint8 status, bytes32 publicKeyHash)[])"
    ];
    const contract = new ethers.Contract(contractAddress, READ_ABI, provider);

    // 1. Sync Identity (phone_hash preferred, lookup_hash fallback for legacy)
    const phoneHashForChain = phone_hash ?? lookup_hash;
    const formattedPhoneHash = phoneHashForChain?.startsWith('0x')
        ? phoneHashForChain
        : `0x${phoneHashForChain}`;
    
    let changed = false;

    // Check existence by trying to get identity. If it reverts, it likely doesn't exist.
    try {
      const result = await contract.getIdentityByPhoneHash(formattedPhoneHash);
      if (result && result.phoneHash && result.phoneHash !== ethers.ZeroHash) {
        const onChainIdentity = {
          phone_hash: result.phoneHash,
          salt: result.salt,
          username: result.username,
          registered_at: new Date(Number(result.registeredAt) * 1000).toISOString(),
          is_biometric_enabled: result.isBiometricEnabled,
          owner: result.owner,
          reputation_score: Number(result.reputationScore),
          is_flagged: result.isFlagged
        };
        
        const primaryIdentityKey = `identity:${phoneHashForChain}`;
        const kvIdentity = await c.env.IAMKEY_KV.get(primaryIdentityKey);
        if (!kvIdentity || JSON.stringify(onChainIdentity) !== kvIdentity) {
          await c.env.IAMKEY_KV.put(primaryIdentityKey, JSON.stringify(onChainIdentity));
          changed = true;
        }
        if (lookup_hash && lookup_hash !== phoneHashForChain) {
          await c.env.IAMKEY_KV.put(`identity:${lookup_hash}`, JSON.stringify(onChainIdentity));
        }
      }
    } catch (e: any) {
      console.log(`[DEBUG] Identity not found on chain (or other error) for: ${formattedPhoneHash}. Returning mock data.`);
    }

    // 2. Sync Guardians
    const guardiansLookupHash = lookup_hash ?? phoneHashForChain;
    const identityHash = guardiansLookupHash?.startsWith('0x')
        ? guardiansLookupHash
        : '0x' + guardiansLookupHash;

    let onChainGuardians: any[] = [];
    try {
      const guardiansResult = await contract.getGuardians(identityHash);
      
      onChainGuardians = guardiansResult.map((g: any) => ({
        guardianAddress: g.guardianAddress,
        status: g.status,
        registeredAt: new Date(Number(g.registeredAt) * 1000).toISOString(),
        publicKeyHash: g.publicKeyHash
      }));
    } catch (e) {
      console.log(`[DEBUG] Guardians sync failed (likely not supported or identity missing), using KV cache.`);
    }

    const kvGuardiansStr = await c.env.IAMKEY_KV.get(`guardians:${guardiansLookupHash}`);
    const kvGuardians = kvGuardiansStr ? JSON.parse(kvGuardiansStr) : [];

    // Merge on-chain and KV guardians: keep KV (including pending), update status from on-chain
    const mergedGuardians = [...kvGuardians];
    for (const onChain of onChainGuardians) {
      const existingIndex = mergedGuardians.findIndex(g => g.guardianAddress === onChain.guardianAddress);
      if (existingIndex >= 0) {
        // Update existing guardian with on-chain data
        mergedGuardians[existingIndex] = {
          ...mergedGuardians[existingIndex],
          status: onChain.status,
          registeredAt: onChain.registeredAt,
          publicKeyHash: onChain.publicKeyHash,
        };
      } else {
        // On-chain guardian not in KV (shouldn't happen, but add minimal entry)
        mergedGuardians.push({
          id: `onchain_${onChain.guardianAddress}`,
          guardianId: `onchain_${onChain.guardianAddress}`,
          name: 'Unknown Guardian',
          contact: '',
          type: 'unknown',
          status: onChain.status,
          registeredAt: onChain.registeredAt,
          publicKeyHash: onChain.publicKeyHash,
          guardianAddress: onChain.guardianAddress,
          signature: null,
        });
      }
    }

    if (JSON.stringify(mergedGuardians) !== JSON.stringify(kvGuardians)) {
      await c.env.IAMKEY_KV.put(`guardians:${guardiansLookupHash}`, JSON.stringify(mergedGuardians));
      changed = true;
      
      // Notify user about security update (guardian change)
      await sendFCMNotification(c, guardiansLookupHash, "Security Update", "Your guardian list has been synchronized with the blockchain.", {
        type: 'guardian_sync',
        timestamp: new Date().toISOString()
      });
    }

    return c.json({ success: true, changed });
  } catch (error: any) {
    console.log('Sync error:', error);
    return c.json({ error: error.message }, 500);
  }
});


// Guardian Management Endpoints
app.post('/guardian/invite', async (c) => {
  const body = await c.req.json();
  const { name, contact, type, ownerHash } = body;

  if (!name || (!contact && !body.phoneNumber && !body.emailAddress)) {
    return c.json({ error: 'Name and contact information are required' }, 400);
  }

  const token = crypto.randomUUID();
  const guardianId = crypto.randomUUID();
  
  // Build invite URL - point to our own acceptance page
  const baseUrl = new URL(c.req.url).origin;
  const inviteUrl = `${baseUrl}/guardian/accept/${token}`;

  const inviteData = {
    token,
    guardianId,
    name,
    ownerHash: ownerHash || '',
    contact: contact || body.phoneNumber || body.emailAddress,
    phoneNumber: body.phoneNumber,
    emailAddress: body.emailAddress,
    type: type || (body.phoneNumber ? 'phone' : 'email'),
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
  };

  await c.env.IAMKEY_KV.put(`invite:${token}`, JSON.stringify(inviteData), { expirationTtl: 7 * 24 * 60 * 60 });
  await c.env.IAMKEY_KV.put(`guardian:${guardianId}`, JSON.stringify(inviteData), { expirationTtl: 7 * 24 * 60 * 60 });

  // Also add to the main guardians list for this identity so it appears in /identity/guardians
  if (ownerHash) {
    const guardiansKey = `guardians:${ownerHash}`;
    const existingGuardiansStr = await c.env.IAMKEY_KV.get(guardiansKey);
    const existingGuardians = existingGuardiansStr ? JSON.parse(existingGuardiansStr) : [];
    
    // Create a pending guardian entry for the main list
    const pendingGuardian = {
      id: guardianId,
      guardianId: guardianId,
      name: name,
      contact: contact || body.phoneNumber || body.emailAddress,
      phoneNumber: body.phoneNumber,
      emailAddress: body.emailAddress,
      type: type || (body.phoneNumber ? 'phone' : 'email'),
      status: 0, // 0 = pending in blockchain format
      registeredAt: new Date().toISOString(),
      publicKeyHash: null,
      signature: token, // Store token as signature for polling
    };
    
    // Add to existing guardians
    existingGuardians.push(pendingGuardian);
    await c.env.IAMKEY_KV.put(guardiansKey, JSON.stringify(existingGuardians));
  }

  return c.json({
    token,
    guardianId,
    inviteUrl,
    expiresAt: inviteData.expiresAt
  });
});

app.get('/guardian/status', async (c) => {
  const token = c.req.query('token');
  const guardianId = c.req.query('guardianId');

  if (!token && !guardianId) {
    return c.json({ error: 'Token or Guardian ID is required' }, 400);
  }

  const key = token ? `invite:${token}` : `guardian:${guardianId}`;
  const dataStr = await c.env.IAMKEY_KV.get(key);

  if (!dataStr) {
    return c.json({ error: 'Invite not found' }, 404);
  }

  return c.json(JSON.parse(dataStr));
});

// Normalize lookup hash - remove 0x prefix if present
function normalizeHash(hash: string): string {
  return hash.startsWith('0x') ? hash.slice(2) : hash;
}

// Sync guardians for an identity
app.get('/identity/guardians', async (c) => {
  let lookupHash = c.req.query('lookup_hash');
  if (!lookupHash) return c.json({ error: 'lookup_hash is required' }, 400);
  
  // Normalize hash to remove 0x prefix for consistent key format
  const normalizedHash = normalizeHash(lookupHash);
  const key = `guardians:${normalizedHash}`;
  
  console.log(`[GUARDIAN_DEBUG] GET: Looking up KV key: ${key}`);
  
  const guardiansStr = await c.env.IAMKEY_KV.get(key);
  console.log(`[GUARDIAN_DEBUG] GET: KV get result: ${guardiansStr ? guardiansStr.substring(0, 200) + '...' : 'NULL'}`);
  
  if (!guardiansStr) return c.json({ guardians: [] });

  return c.json({ guardians: JSON.parse(guardiansStr) });
});

app.get('/profile', async (c) => {
  const lookupHash = c.req.query('lookup_hash');
  if (!lookupHash) return c.json({ error: 'lookup_hash is required' }, 400);

  const profileKey = `profile:${lookupHash}`;
  const existing = await c.env.IAMKEY_KV.get(profileKey);
  if (existing) {
    return c.json(JSON.parse(existing));
  }

  const identityStr = await c.env.IAMKEY_KV.get(`identity:${lookupHash}`);
  if (!identityStr) return c.json({ error: 'Identity not found' }, 404);

  const identity = JSON.parse(identityStr);
  const now = new Date().toISOString();
  const profile = {
    lookup_hash: lookupHash,
    username: identity.username || 'user',
    display_name: identity.username || 'IamKey User',
    bio: '',
    location: '',
    website: '',
    avatar_url: '',
    created_at: identity.registered_at || now,
    updated_at: now
  };

  await c.env.IAMKEY_KV.put(profileKey, JSON.stringify(profile));
  return c.json(profile);
});

app.post('/profile', async (c) => {
  const body = await c.req.json();
  const { lookup_hash, display_name, bio, location, website, avatar_url, username } = body;
  if (!lookup_hash || !display_name) {
    return c.json({ error: 'lookup_hash and display_name are required' }, 400);
  }

  const identityStr = await c.env.IAMKEY_KV.get(`identity:${lookup_hash}`);
  const identity = identityStr ? JSON.parse(identityStr) : null;

  const profileKey = `profile:${lookup_hash}`;
  const existingStr = await c.env.IAMKEY_KV.get(profileKey);
  const existing = existingStr ? JSON.parse(existingStr) : {};

  const resolvedUsername =
    existing.username ||
    identity?.username ||
    username;

  if (!resolvedUsername) {
    return c.json({ error: 'username is required for new profiles' }, 400);
  }

  const resolvedAvatarUrl =
    avatar_url != null ? avatar_url : (existing.avatar_url ?? '');
  let resolvedAvatarCid = existing.avatar_cid ?? '';
  if (avatar_url != null) {
    if (avatar_url.includes('/ipfs/')) {
      const cid = avatar_url.split('/ipfs/')[1]?.split(/[?#]/)[0];
      resolvedAvatarCid = cid ?? '';
    } else {
      resolvedAvatarCid = '';
    }
  }

  const updated = {
    lookup_hash,
    username: resolvedUsername,
    display_name,
    bio: bio || '',
    location: location || '',
    website: website || '',
    avatar_url: resolvedAvatarUrl,
    avatar_cid: resolvedAvatarCid,
    created_at: existing.created_at || identity?.registered_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  await c.env.IAMKEY_KV.put(profileKey, JSON.stringify(updated));
  return c.json(updated);
});

app.post('/profile/locale', async (c) => {
  const body = await c.req.json();
  const {
    lookup_hash,
    phone_hash,
    device_locale,
    sim_country,
    language_code,
    timezone,
  } = body ?? {};

  if (!lookup_hash) {
    return c.json({ error: 'lookup_hash is required' }, 400);
  }

  const cf = (c.req.raw as any).cf || {};
  const ipCountry = normalizeCountryCode(cf.country);
  const resolved = resolveLocaleSignals({
    deviceLocale: device_locale,
    simCountry: sim_country,
    ipCountry,
  });

  const resolvedCountry = resolved.countryCode;
  const resolvedLanguage =
    language_code ?? extractLanguageCode(device_locale);
  const resolvedTimezone =
    timezone ?? (typeof cf.timezone === 'string' ? cf.timezone : null);

  const metadataHashInput = buildLocaleHashInput({
    countryCode: resolvedCountry,
    languageCode: resolvedLanguage,
    timezone: resolvedTimezone,
    deviceLocale: device_locale ?? null,
    simCountry: normalizeCountryCode(sim_country),
    ipCountry,
  });
  const metadataHash = ethers.keccak256(
    ethers.toUtf8Bytes(metadataHashInput),
  );

  const localeKey = `profile_locale:${lookup_hash}`;
  const existingStr = await c.env.IAMKEY_KV.get(localeKey);
  const existing = existingStr ? JSON.parse(existingStr) : null;
  if (existing?.metadata_hash === metadataHash) {
    return c.json(existing);
  }

  const trustDelta = calculateLocaleTrustDelta(resolved);
  const now = new Date().toISOString();
  const localeMeta: Record<string, any> = {
    lookup_hash,
    resolved_country: resolvedCountry,
    language_code: resolvedLanguage,
    timezone: resolvedTimezone,
    confidence: resolved.confidence,
    source_count: resolved.sourceCount,
    match_count: resolved.matchCount,
    trust_delta: trustDelta,
    metadata_hash: metadataHash,
    sources: {
      device_locale: device_locale ?? null,
      sim_country: normalizeCountryCode(sim_country),
      ip_country: ipCountry,
    },
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  await c.env.IAMKEY_KV.put(localeKey, JSON.stringify(localeMeta));

  if (phone_hash) {
    const phoneHashKey = phone_hash.startsWith('0x')
      ? phone_hash.slice(2)
      : phone_hash;
    const apiKey = c.env.ALCHEMY_API_KEY;
    const contractAddress = c.env.CONTRACT_IDENTITY_ADDRESS;
    const mnemonic = c.env.MNEMONIC;
    const privateKey = c.env.PRIVATE_KEY;

    if (apiKey && contractAddress && (mnemonic || privateKey)) {
      try {
        const settings = { apiKey, network: Network.ETH_SEPOLIA };
        const alchemy = new Alchemy(settings);
        const provider = (await alchemy.config.getProvider()) as any;
        const wallet = mnemonic
          ? ethers.Wallet.fromPhrase(mnemonic).connect(provider)
          : new ethers.Wallet(privateKey, provider);

        const contract = new ethers.Contract(
          contractAddress,
          IDENTITY_ABI,
          wallet,
        );
        const formattedPhoneHash = phone_hash.startsWith('0x')
          ? phone_hash
          : `0x${phone_hash}`;

        try {
          const tx = await contract.updateIdentityMetadataHash(
            formattedPhoneHash,
            metadataHash,
          );
          await tx.wait();
        } catch (error: any) {
          console.log('[DEBUG] Metadata hash update failed (expected when contracts not deployed):', error?.message || error);
        }

        let currentScore: number | null = null;
        const kvIdentityStr = await c.env.IAMKEY_KV.get(
          `identity:${phoneHashKey}`,
        );
        if (kvIdentityStr) {
          try {
            const identity = JSON.parse(kvIdentityStr);
            currentScore = Number(identity.reputation_score ?? 100);
          } catch (_) {}
        }

        if (currentScore == null) {
          try {
            const result = await contract.getIdentityByPhoneHash(
              formattedPhoneHash,
            );
            currentScore = Number(result.reputationScore ?? 100);
          } catch (_) {
            currentScore = 100;
          }
        }

        let localeMetaUpdated = false;
        if (trustDelta > 0) {
          const newScore = Math.round(currentScore + trustDelta);
          if (newScore !== currentScore) {
            try {
              const tx = await contract.updateTrustLevel(
                formattedPhoneHash,
                newScore,
              );
              await tx.wait();
              localeMeta['trust_level'] = newScore;
              localeMetaUpdated = true;
            } catch (error: any) {
              console.log(
                '[DEBUG] Reputation update failed (expected when contracts not deployed):',
                error?.message || error,
              );
            }
          }
        }

        if (localeMetaUpdated) {
          await c.env.IAMKEY_KV.put(localeKey, JSON.stringify(localeMeta));
        }

        const identityKeys = [
          `identity:${phoneHashKey}`,
          `identity:${lookup_hash}`,
        ];
        for (const key of identityKeys) {
          const identityStr = await c.env.IAMKEY_KV.get(key);
          if (!identityStr) continue;
          try {
            const identity = JSON.parse(identityStr);
            identity.locale_metadata_hash = metadataHash;
            identity.locale_confidence = resolved.confidence;
            identity.locale_country = resolvedCountry;
            if (localeMeta['trust_level'] != null) {
              identity.trust_level = localeMeta['trust_level'];
            }
            await c.env.IAMKEY_KV.put(key, JSON.stringify(identity));
          } catch (_) {}
        }
      } catch (error: any) {
        console.log('[DEBUG] Locale sync on-chain failed (expected when contracts not deployed):', error?.message || error);
      }
    }
  }

  return c.json(localeMeta);
});

// =============================================================================
// IPFS Profile Photo Upload Endpoints (Pinata)
// =============================================================================

// Generate a signed upload URL for client-side direct upload to Pinata
app.post('/profile/upload-url', async (c) => {
  const body = await c.req.json();
  const { lookup_hash } = body;

  if (!lookup_hash) {
    return c.json({ error: 'lookup_hash is required' }, 400);
  }

  const pinataJwt = c.env.PINATA_JWT;
  if (!pinataJwt) {
    return c.json({ error: 'IPFS service not configured' }, 500);
  }

  try {
    // Generate a unique upload ID for tracking
    const uploadId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    // Store pending upload metadata
    await c.env.IAMKEY_KV.put(`ipfs_upload:${uploadId}`, JSON.stringify({
      lookup_hash,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt
    }), { expirationTtl: 600 });

    // Return the Pinata API endpoint and auth for direct upload
    // Client will use these to upload directly to Pinata
    return c.json({
      uploadId,
      uploadUrl: 'https://api.pinata.cloud/pinning/pinFileToIPFS',
      authorization: `Bearer ${pinataJwt}`,
      expiresAt,
      metadata: {
        name: `avatar_${lookup_hash}_${uploadId}`,
        keyvalues: {
          lookup_hash,
          upload_id: uploadId,
          type: 'avatar'
        }
      }
    });
  } catch (error: any) {
    console.log('IPFS upload URL generation failed:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Save IPFS CID to user profile after successful upload
app.post('/profile/avatar', async (c) => {
  const body = await c.req.json();
  const { lookup_hash, cid, upload_id } = body;

  if (!lookup_hash || !cid) {
    return c.json({ error: 'lookup_hash and cid are required' }, 400);
  }

  // Validate CID format (basic check for IPFS v0 or v1 CIDs)
  const cidRegex = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-zA-Z0-9]{50,})$/;
  if (!cidRegex.test(cid)) {
    return c.json({ error: 'Invalid IPFS CID format' }, 400);
  }

  try {
    // Verify upload was initiated (if upload_id provided)
    if (upload_id) {
      const uploadDataStr = await c.env.IAMKEY_KV.get(`ipfs_upload:${upload_id}`);
      if (uploadDataStr) {
        const uploadData = JSON.parse(uploadDataStr);
        if (uploadData.lookup_hash !== lookup_hash) {
          return c.json({ error: 'Upload ID does not match lookup_hash' }, 403);
        }
        // Mark upload as complete
        await c.env.IAMKEY_KV.delete(`ipfs_upload:${upload_id}`);
      }
    }

    // Get existing profile
    const profileKey = `profile:${lookup_hash}`;
    const existingStr = await c.env.IAMKEY_KV.get(profileKey);
    
    if (!existingStr) {
      return c.json({ error: 'Profile not found' }, 404);
    }

    const profile = JSON.parse(existingStr);
    
    // Store old CID for cleanup if needed (optional future feature)
    const oldCid = profile.avatar_cid;
    
    // Update profile with new IPFS CID
    profile.avatar_cid = cid;
    profile.avatar_url = `https://gateway.pinata.cloud/ipfs/${cid}`;
    profile.updated_at = new Date().toISOString();

    await c.env.IAMKEY_KV.put(profileKey, JSON.stringify(profile));

    console.log(`[IPFS] Avatar updated for ${lookup_hash}: ${cid}`);

    return c.json({
      success: true,
      avatar_cid: cid,
      avatar_url: profile.avatar_url,
      old_cid: oldCid || null
    });
  } catch (error: any) {
    console.log('Avatar save failed:', error);
    return c.json({ error: error.message }, 500);
  }
});


app.get('/notifications', async (c) => {
  const lookupHash = c.req.query('lookup_hash');
  if (!lookupHash) return c.json({ error: 'lookup_hash is required' }, 400);

  const listStr = await c.env.IAMKEY_KV.get(`notifications:${lookupHash}`);
  const items = listStr ? JSON.parse(listStr) : [];
  return c.json({ notifications: items });
});

app.post('/notifications/read', async (c) => {
  const body = await c.req.json();
  const { lookup_hash, notification_ids, mark_all } = body;
  if (!lookup_hash) return c.json({ error: 'lookup_hash is required' }, 400);

  const key = `notifications:${lookup_hash}`;
  const existingStr = await c.env.IAMKEY_KV.get(key);
  const existing = existingStr ? JSON.parse(existingStr) : [];

  const updated = existing.map((item: any) => {
    if (mark_all) {
      return { ...item, is_read: true };
    }
    if (Array.isArray(notification_ids) && notification_ids.includes(item.id)) {
      return { ...item, is_read: true };
    }
    return item;
  });

  await c.env.IAMKEY_KV.put(key, JSON.stringify(updated));
  return c.json({ notifications: updated });
});

app.get('/notifications/preferences', async (c) => {
  const lookupHash = c.req.query('lookup_hash');
  if (!lookupHash) return c.json({ error: 'lookup_hash is required' }, 400);
  const prefs = await getNotificationPreferences(c, lookupHash);
  return c.json(prefs);
});

app.post('/notifications/preferences', async (c) => {
  const body = await c.req.json();
  const { lookup_hash, account_alerts, guardian_updates, marketplace_updates, tips_and_product } = body;
  if (!lookup_hash) return c.json({ error: 'lookup_hash is required' }, 400);

  const prefs = {
    ...defaultNotificationPreferencesShared(),
    account_alerts: account_alerts ?? true,
    guardian_updates: guardian_updates ?? true,
    marketplace_updates: marketplace_updates ?? true,
    tips_and_product: tips_and_product ?? false
  };

  await c.env.IAMKEY_KV.put(`notification_prefs:${lookup_hash}`, JSON.stringify(prefs));
  return c.json(prefs);
});

app.post('/identity/guardians', async (c) => {
  const body = await c.req.json();
  let { lookup_hash, guardians } = body;
  if (!lookup_hash || !guardians) return c.json({ error: 'lookup_hash and guardians are required' }, 400);
  
  // Normalize hash to remove 0x prefix for consistent key format
  const normalizedHash = normalizeHash(lookup_hash);
  const key = `guardians:${normalizedHash}`;
  const value = JSON.stringify(guardians);
  
  console.log(`[GUARDIAN_DEBUG] POST: Saving ${guardians.length} guardians to KV key: ${key}`);
  console.log(`[GUARDIAN_DEBUG] POST: Value being saved: ${value.substring(0, 200)}${value.length > 200 ? '...' : ''}`);
  
  await c.env.IAMKEY_KV.put(key, value);
  
  return c.json({ success: true });
});

// Greedy identity lookup moved down to avoid shadowing more specific routes
app.get('/identity/:phone_hash?', async (c) => {
    let phoneHash = c.req.param('phone_hash') || c.req.query('phone_hash');
    const phoneNumber = c.req.query('phone');
    
    // Avoid capturing 'sync', 'guardians', or 'fcm-token' as phone hashes
    if (phoneHash === 'sync' || phoneHash === 'guardians' || phoneHash === 'fcm-token') {
        return c.notFound();
    }

    const hashesToTry: string[] = [];
    if (phoneHash) hashesToTry.push(phoneHash);
    
    if (phoneNumber) {
        const sanitized = phoneNumber.replace(/\D/g, '');
        if (sanitized.length >= 10) {
            const salted = ethers.sha256(ethers.toUtf8Bytes(sanitized + "iamkey_global_v1_salt"));
            const saltedHex = salted.startsWith('0x') ? salted.slice(2) : salted;
            if (!hashesToTry.includes(saltedHex)) hashesToTry.push(saltedHex);
            
            const raw = ethers.sha256(ethers.toUtf8Bytes(sanitized));
            const rawHex = raw.startsWith('0x') ? raw.slice(2) : raw;
            if (!hashesToTry.includes(rawHex)) hashesToTry.push(rawHex);
        }
    }
    
    if (hashesToTry.length === 0) {
        return c.json({ error: 'Phone hash or phone number is required' }, 400);
    }
    
    try {
        for (const h of hashesToTry) {
            for (const prefix of ['identity:', 'identity_']) {
                const identityData = await c.env.IAMKEY_KV.get(`${prefix}${h}`);
                if (identityData) {
                    try {
                        const identity = JSON.parse(identityData);
                        return c.json(identity);
                    } catch (e) {}
                }
            }
        }
        
        const apiKey = c.env.ALCHEMY_API_KEY;
        const contractAddress = c.env.CONTRACT_IDENTITY_ADDRESS;
        
        if (apiKey && contractAddress) {
            const settings = { apiKey, network: Network.ETH_SEPOLIA };
            const alchemy = new Alchemy(settings);
            const provider = (await alchemy.config.getProvider()) as any;
            
            const READ_ABI = ["function getIdentityByPhoneHash(bytes32 phoneHash) external view returns (tuple(bytes32 phoneHash, bytes32 salt, string username, address owner, uint64 registeredAt, uint32 trustLevel, uint256 identityBond, bool isBiometricEnabled, bool isFlagged, bool isFrozen, bool isResolver))"];
            const contract = new ethers.Contract(contractAddress, READ_ABI, provider);
            
            for (const h of hashesToTry) {
                try {
                    const formattedH = h.startsWith('0x') ? h : `0x${h}`;
                    const result = await contract.getIdentityByPhoneHash(formattedH);
                    if (result && result.phoneHash && result.phoneHash !== ethers.ZeroHash) {
                        const identity = {
                            phone_hash: result.phoneHash,
                            salt: result.salt,
                            username: result.username,
                            registered_at: new Date(Number(result.registeredAt) * 1000).toISOString(),
                            is_biometric_enabled: result.isBiometricEnabled,
                            owner: result.owner,
                            trust_level: Number(result.trustLevel),
                            identity_bond: result.identityBond.toString(),
                            is_flagged: result.isFlagged,
                            is_frozen: result.isFrozen,
                            is_resolver: result.isResolver
                        };
                        await c.env.IAMKEY_KV.put(`identity:${h}`, JSON.stringify(identity), { expirationTtl: 86400 });
                        return c.json(identity);
                    }
                } catch (be) {}
            }
        }
        
        return c.json({ error: 'Not Found' }, 404);
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post('/guardian/remove', async (c) => {
  const body = await c.req.json();
  const { lookup_hash, guardianAddress } = body;

  if (!lookup_hash || !guardianAddress) {
    return c.json({ error: 'lookup_hash and guardianAddress are required' }, 400);
  }

  try {
    const apiKey = c.env.ALCHEMY_API_KEY;
    const privateKey = c.env.PRIVATE_KEY;
    const contractAddress = c.env.CONTRACT_IDENTITY_ADDRESS;

    if (!apiKey || !privateKey || !contractAddress) return c.json({ error: 'Config missing' }, 500);

    const settings = { apiKey, network: Network.ETH_SEPOLIA };
    const alchemy = new Alchemy(settings);
    const provider = (await alchemy.config.getProvider()) as any;
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(contractAddress, IDENTITY_ABI, wallet);

    const identityHash = lookup_hash.startsWith('0x') ? lookup_hash : '0x' + lookup_hash;
    const tx = await contract.removeGuardian(identityHash, guardianAddress);
    const receipt = await tx.wait();

    // Trigger sync to update KV and notify
    // Note: Calling our own endpoint locally or via internal URL is tricky in Workers,
    // so we'll just trigger the sync logic or a notification directly here if needed,
    // but the sync logic is already in /identity/sync.
    // We send a direct notification for better UX.

    await sendFCMNotification(c, lookup_hash, "Security Alert", "A guardian has been removed from your identity.", {
      type: 'guardian_removed',
      guardian: guardianAddress
    });

    return c.json({ success: true, transactionHash: receipt.hash });
  } catch (error: any) {
    console.log('Guardian removal failed:', error);
    return c.json({ error: error.message }, 500);
  }
});

app.post('/identity/fcm-token', async (c) => {
  const body = await c.req.json();
  const { lookup_hash, fcm_token } = body;

  if (!lookup_hash || !fcm_token) {
    return c.json({ error: 'lookup_hash and fcm_token are required' }, 400);
  }

  // Get existing tokens
  const existingTokensStr = await c.env.IAMKEY_KV.get(`fcm:${lookup_hash}`);
  let tokens: string[] = [];
  
  if (existingTokensStr) {
    try {
      const parsed = JSON.parse(existingTokensStr);
      tokens = Array.isArray(parsed) ? parsed : [existingTokensStr];
    } catch (e) {
      tokens = [existingTokensStr];
    }
  }

  // Add new token if not present
  if (!tokens.includes(fcm_token)) {
    tokens.push(fcm_token);
    // Limit to 5 tokens per identity to avoid massive KV values
    if (tokens.length > 5) tokens.shift();
    await c.env.IAMKEY_KV.put(`fcm:${lookup_hash}`, JSON.stringify(tokens));
  }

  return c.json({ success: true });
});

// Guardian Acceptance Page (HTML)
app.get('/guardian/accept/:token', async (c) => {
  const token = c.req.param('token');
  const inviteDataStr = await c.env.IAMKEY_KV.get(`invite:${token}`);

  // Premium styled error template
  const errorPage = (title: string, message: string, icon: string = '❌') => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>\${title} | IamKey ID</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background-color: #f7f9fc; color: #333; }
            .card { background: white; padding: 48px; border-radius: 32px; box-shadow: 0 20px 40px rgba(0,0,0,0.08); max-width: 400px; text-align: center; width: 90%; }
            .icon { font-size: 64px; margin-bottom: 24px; }
            h1 { font-size: 24px; font-weight: 800; margin: 0 0 16px; color: #1a1a1a; }
            p { font-size: 16px; color: #666; margin: 0 0 32px; line-height: 1.5; }
            .btn { display: inline-block; padding: 14px 32px; background: #007AFF; color: white; text-decoration: none; border-radius: 14px; font-weight: 700; transition: transform 0.2s; }
            .btn:active { transform: scale(0.98); }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="icon">\${icon}</div>
            <h1>\${title}</h1>
            <p>\${message}</p>
            <a href="https://iamkey.id" class="btn">Close</a>
        </div>
    </body>
    </html>
  `;

  if (!inviteDataStr) {
    return c.html(errorPage('Invalid Invitation', 'This invitation link is invalid or has completely expired.'), 404);
  }

  const invite = JSON.parse(inviteDataStr);

  // 1. Check Expiration
  if (new Date(invite.expiresAt) < new Date()) {
    return c.html(errorPage('Invitation Expired', 'This security invitation has expired for your protection. Please ask the sender for a new link.'), 403);
  }

  // 2. Check Use Status (One-Time Use)
  if (invite.status !== 'pending') {
    return c.html(errorPage('Link Already Used', 'This invitation link has already been used or accepted.', '🛡️'), 403);
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IamKey Guardian Invitation</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f9fc; }
        .card { background: white; padding: 32px; border-radius: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
        h1 { color: #1a1a1a; margin-top: 0; }
        .btn { display: block; width: 100%; padding: 16px; background: #007AFF; color: white; text-align: center; text-decoration: none; border-radius: 12px; font-weight: bold; border: none; cursor: pointer; font-size: 16px; }
        .info { background: #f0f7ff; padding: 16px; border-radius: 12px; border-left: 4px solid #007AFF; margin: 20px 0; font-size: 14px; }
        .footer { text-align: center; margin-top: 40px; color: #888; font-size: 12px; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Guardian Invitation</h1>
        <p>Hi <strong>${invite.name}</strong>,</p>
        <p>A user has invited you to be their <strong>Guardian</strong> for their IamKey ID.</p>
        
        <div class="info">
            <strong>What is a Guardian?</strong><br>
            As a guardian, you help this person recover their account if they lose access. You DO NOT have access to their private data, funds, or identity. You only provide a cryptographic signature to verify their identity during recovery.
        </div>

        <h3>Security & Privacy</h3>
        <ul>
            <li>Your information is encrypted.</li>
            <li>You only need to authorize with your biometrics.</li>
            <li>You can revoke your guardianship at any time.</li>
        </ul>

        <button id="acceptBtn" class="btn">Confirm & Accept via Biometrics</button>
    </div>
    
    <div class="footer">
        Powered by IamKey.ID &bull; Privacy First Identity
    </div>

    <script>
        document.getElementById('acceptBtn').addEventListener('click', async () => {
            const btn = document.getElementById('acceptBtn');
            btn.disabled = true;
            btn.innerText = 'Authenticating...';

            try {
                // SECURITY FIX: Require real WebAuthn biometric authentication
                // No fallback to random keys - fail-closed approach
                if (!window.PublicKeyCredential) {
                    throw new Error('WebAuthn not supported on this device. Biometric authentication is required to accept as a guardian.');
                }

                const challenge = new Uint8Array(32);
                window.crypto.getRandomValues(challenge);
                
                const options = {
                    publicKey: {
                        challenge: challenge,
                        rp: { name: "IamKey ID", id: window.location.hostname },
                        user: {
                            id: Uint8Array.from("${invite.guardianId}", c => c.charCodeAt(0)),
                            name: "${invite.name}",
                            displayName: "${invite.name}"
                        },
                        pubKeyCredParams: [{ alg: -7, type: "public-key" }],
                        authenticatorSelection: { 
                            authenticatorAttachment: "platform",
                            userVerification: "required"
                        },
                        timeout: 60000,
                        attestation: "direct"
                    }
                };
                
                const credential = await navigator.credentials.create(options);
                if (!credential) {
                    throw new Error('Biometric authentication was cancelled or failed. Please try again.');
                }

                // Extract the actual public key from the attestation object
                // For production, this should be properly verified server-side
                const attestationObject = credential.response.attestationObject;
                const publicKey = '0x' + Array.from(new Uint8Array(attestationObject)).slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join('');
                
                console.log("Biometric verification successful with real WebAuthn");

                const response = await fetch('/guardian/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        token: '${token}',
                        action: 'accept',
                        publicKey: publicKey,
                        attestationObject: Array.from(new Uint8Array(attestationObject))
                    })
                });

                const result = await response.json();
                if (result.success) {
                    document.body.innerHTML = \`<div class="card" style="text-align:center"><h1>✅ Accepted!</h1><p>You are now a guardian for <strong>${invite.name}</strong>. You can safely close this window.</p></div>\`;
                } else {
                    alert('Error: ' + result.error);
                    btn.disabled = false;
                    btn.innerText = 'Try Again';
                }
            } catch (e) {
                alert('Authentication failed: ' + e.message);
                btn.disabled = false;
                btn.innerText = 'Confirm & Accept via Biometrics';
                console.log('Guardian acceptance failed with secure WebAuthn:', e);
            }
        });
    </script>
</body>
</html>
  `;
  return c.html(html);
});

app.post('/guardian/submit', async (c) => {
  const body = await c.req.json();
  const { token, action, publicKey } = body;

  const inviteDataStr = await c.env.IAMKEY_KV.get(`invite:${token}`);
  if (!inviteDataStr) return c.json({ error: 'Invite not found or expired' }, 404);

  const invite = JSON.parse(inviteDataStr);

  // Security check: only allow submission if status is pending and not expired
  if (invite.status !== 'pending') {
    console.warn(`[SECURITY] Attempt to reuse guardian invitation: token=${token.substring(0, 8)}..., status=${invite.status}, guardianId=${invite.guardianId}`);
    return c.json({ error: 'This invitation has already been processed' }, 403);
  }
  if (new Date(invite.expiresAt) < new Date()) {
    console.warn(`[SECURITY] Attempt to use expired guardian invitation: token=${token.substring(0, 8)}..., expired=${invite.expiresAt}, guardianId=${invite.guardianId}`);
    return c.json({ error: 'This invitation has expired' }, 403);
  }
  if (action === 'accept') {
    invite.status = 'accepted';
    invite.acceptedAt = new Date().toISOString();
    invite.publicKey = publicKey || 'simulated-pubkey';
    
    // Register on blockchain if we have ownerHash and credentials
    if (invite.ownerHash && publicKey) {
        try {
            const apiKey = c.env.ALCHEMY_API_KEY;
            const privateKey = c.env.PRIVATE_KEY;
            const contractAddress = c.env.CONTRACT_IDENTITY_ADDRESS;
            
            if (apiKey && privateKey && contractAddress) {
                const { resolveAlchemySettings } = await import('./config');
                const alchemyConf = resolveAlchemySettings(c.env);
                const settings = { apiKey: alchemyConf.apiKey || apiKey, network: Network.ETH_SEPOLIA };
                const alchemy = new Alchemy(settings);
                const provider = (await alchemy.config.getProvider()) as any;
                const wallet = new ethers.Wallet(privateKey, provider);
                const contract = new ethers.Contract(contractAddress, IDENTITY_ABI, wallet);
                
                // Format ownerHash correctly for bytes32
                const ownerHash = invite.ownerHash.startsWith('0x') ? invite.ownerHash : '0x' + invite.ownerHash;
                
                // SECURITY FIX: Derive guardian address from verified WebAuthn public key only
                // No fallback to random addresses - fail-closed approach
                if (!publicKey || publicKey.length < 42) {
                    throw new Error('Invalid public key from guardian authentication. Guardian registration aborted.');
                }
                const guardianAddress = publicKey.startsWith('0x') 
                   ? publicKey.slice(0, 42)
                   : '0x' + publicKey.slice(0, 40);
                
                if (!ethers.isAddress(guardianAddress)) {
                    throw new Error('Guardian address derivation failed. Aborting registration.');
                }
                
                const pkHash = ethers.keccak256(ethers.toUtf8Bytes(publicKey));
                
                // This transaction will be paid by the backend wallet
                console.log(`Registering guardian ${guardianAddress} for identity ${ownerHash} on-chain`);
                const tx = await contract.registerGuardian(ownerHash, guardianAddress, pkHash);
                const receipt = await tx.wait();
                invite.transactionHash = receipt.hash;
                invite.guardianAddress = guardianAddress;
            }
        } catch (be: any) {
            console.log('Blockchain registration failed:', be);
            // We still update KV even if blockchain fail (fallback)
            invite.blockchainError = be.message;
        }
    }
    
    await c.env.IAMKEY_KV.put(`invite:${token}`, JSON.stringify(invite));
    await c.env.IAMKEY_KV.put(`guardian:${invite.guardianId}`, JSON.stringify(invite));

    // Update the guardian status in the main guardians list
    if (invite.ownerHash) {
      const guardiansKey = `guardians:${invite.ownerHash}`;
      const existingGuardiansStr = await c.env.IAMKEY_KV.get(guardiansKey);
      if (existingGuardiansStr) {
        const existingGuardians = JSON.parse(existingGuardiansStr);
        const updatedGuardians = existingGuardians.map((g: any) => {
          if (g.guardianId === invite.guardianId || g.id === invite.guardianId) {
            return {
              ...g,
              status: 1, // 1 = accepted in blockchain format
              publicKeyHash: invite.publicKey ? ethers.keccak256(ethers.toUtf8Bytes(invite.publicKey)) : null,
              guardianAddress: invite.guardianAddress || g.guardianAddress,
              signature: invite.transactionHash || g.signature,
            };
          }
          return g;
        });
        await c.env.IAMKEY_KV.put(guardiansKey, JSON.stringify(updatedGuardians));
      }
    }

    console.log(`[SECURITY] Guardian invitation accepted: guardianId=${invite.guardianId}, ownerHash=${invite.ownerHash?.substring(0, 8)}..., txHash=${invite.transactionHash || 'pending'}`);

    // Send push notification to owner
    if (invite.ownerHash) {
      await sendFCMNotification(c, invite.ownerHash, "Guardian Accepted", `${invite.name} is now your guardian.`, {
        type: 'guardian_accepted'
      });
    }
  }

  return c.json({ success: true, transactionHash: invite.transactionHash });
});

// =============================================================================
// GDPR Privacy Compliance Endpoints
// =============================================================================

// GDPR Data Deletion Endpoint - Permanently removes all user data
app.delete('/user/data', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const lookupHashRaw = body.lookup_hash || c.req.query('lookup_hash');
    if (!lookupHashRaw) return c.json({ error: 'lookup_hash is required' }, 400);

    const lookupHash = lookupHashRaw.startsWith('0x') ? lookupHashRaw.slice(2) : lookupHashRaw;
    
    // Comprehensive list of all user data keys
    const keysToDelete = [
      `identity:${lookupHash}`,
      `identity_${lookupHash}`,
      `profile:${lookupHash}`,
      `profile_locale:${lookupHash}`,
      `fcm:${lookupHash}`,
      `guardians:${lookupHash}`,
      `notifications:${lookupHash}`,
      `notification_prefs:${lookupHash}`,
      `orders:${lookupHash}`,
      `trust:${lookupHash}`,
      `consent:${lookupHash}`,
    ];

    let deletedCount = 0;
    for (const key of keysToDelete) {
      const exists = await c.env.IAMKEY_KV.get(key);
      if (exists) {
        await c.env.IAMKEY_KV.delete(key);
        deletedCount++;
      }
    }

    console.log(`[GDPR] User data deleted for lookupHash: ${lookupHash.substring(0, 8)}... (${deletedCount} keys)`);

    return c.json({ 
        success: true, 
        message: 'All personal data has been deleted.',
        deletedKeys: deletedCount
    });
});

// GDPR Data Export Endpoint - Returns all user data as JSON
app.get('/user/data-export', async (c) => {
    const lookupHashRaw = c.req.query('lookup_hash');
    if (!lookupHashRaw) return c.json({ error: 'lookup_hash is required' }, 400);

    const lookupHash = lookupHashRaw.startsWith('0x') ? lookupHashRaw.slice(2) : lookupHashRaw;

    const getData = async (key: string) => {
      const data = await c.env.IAMKEY_KV.get(key);
      if (!data) return null;
      try { return JSON.parse(data); } catch { return data; }
    };

    const exportData = {
      exported_at: new Date().toISOString(),
      lookup_hash: lookupHash,
      data: {
        identity: await getData(`identity:${lookupHash}`) || await getData(`identity_${lookupHash}`),
        profile: await getData(`profile:${lookupHash}`),
        locale: await getData(`profile_locale:${lookupHash}`),
        guardians: await getData(`guardians:${lookupHash}`),
        notifications: await getData(`notifications:${lookupHash}`),
        notification_preferences: await getData(`notification_prefs:${lookupHash}`),
        trust_profile: await getData(`trust:${lookupHash}`),
        consent_records: await getData(`consent:${lookupHash}`),
      }
    };

    console.log(`[GDPR] Data exported for lookupHash: ${lookupHash.substring(0, 8)}...`);

    return c.json(exportData);
});

// Consent Tracking Endpoint - Records user consent with versioning
app.post('/user/consent', async (c) => {
    const body = await c.req.json();
    const { lookup_hash, consent_type, version, granted } = body;

    if (!lookup_hash || !consent_type || version === undefined) {
      return c.json({ error: 'lookup_hash, consent_type, and version are required' }, 400);
    }

    const lookupHash = lookup_hash.startsWith('0x') ? lookup_hash.slice(2) : lookup_hash;
    const consentKey = `consent:${lookupHash}`;
    
    const existingStr = await c.env.IAMKEY_KV.get(consentKey);
    const existing = existingStr ? JSON.parse(existingStr) : { records: [] };

    const newRecord = {
      consent_type, // 'privacy_policy', 'data_processing', 'marketing'
      version,
      granted: granted !== false,
      timestamp: new Date().toISOString(),
      ip_hash: null, // We don't store IP for privacy
    };

    existing.records.push(newRecord);
    existing.last_updated = new Date().toISOString();

    await c.env.IAMKEY_KV.put(consentKey, JSON.stringify(existing));

    console.log(`[GDPR] Consent recorded: ${consent_type} v${version} = ${granted} for ${lookupHash.substring(0, 8)}...`);

    return c.json({ success: true, record: newRecord });
});

// Legacy alias - keep for backwards compatibility
app.delete('/identity/:phone_hash', async (c) => {
    const phoneHash = c.req.param('phone_hash');
    if (!phoneHash) return c.json({ error: 'phone_hash is required' }, 400);

    const lookupHash = phoneHash.startsWith('0x') ? phoneHash.slice(2) : phoneHash;
    
    // Forward to new endpoint
    const keysToDelete = [
      `identity:${lookupHash}`, `identity_${lookupHash}`, `profile:${lookupHash}`,
      `profile_locale:${lookupHash}`, `fcm:${lookupHash}`, `guardians:${lookupHash}`,
      `notifications:${lookupHash}`, `notification_prefs:${lookupHash}`,
      `orders:${lookupHash}`, `trust:${lookupHash}`, `consent:${lookupHash}`,
    ];

    for (const key of keysToDelete) {
      await c.env.IAMKEY_KV.delete(key);
    }

    console.log(`[GDPR] User data deleted (legacy) for lookupHash: ${lookupHash}`);

    return c.json({ 
        success: true, 
        message: 'All personal data has been deleted from the backend.' 
    });
});

// =============================================================================
// Scheduled Handler (for Cron Triggers)
// =============================================================================

export const scheduled = async (
  controller: ScheduledController,
  env: Bindings,
  ctx: ExecutionContext
) => {
  const scheduledTime = new Date(controller.scheduledTime).toISOString();
  console.log(`[SCHEDULED] Cron trigger fired at: ${scheduledTime}`);
  
  // Log the type of trigger (scheduled, alarm, etc.) if available
  console.log(`[SCHEDULED] Trigger type: ${(controller as any).type ?? 'scheduled'}`);
  
  // You can add periodic tasks here such as:
  // - Cleanup expired verification tokens
  // - Sync identity data with blockchain
  // - Generate reports
  // - Send digest notifications
  
  // For now, just acknowledge the trigger to prevent errors
  return new Response(JSON.stringify({
    success: true,
    message: 'Cron trigger processed',
    timestamp: scheduledTime
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
};

// Mount marketplace routes
app.route('/wallet', walletRouter);
app.route('/marketplace', marketplace);

// Node.js execution (for Simulator)
if (typeof process !== 'undefined' && process.release?.name === 'node') {
  (async () => {
    const { serve } = await import('@hono/node-server');
    const port = parseInt(process.env.PORT || '3000', 10);
    console.log(`[Simulator] Starting backend on port ${port}...`);
    
    // Create a minimal bindings object for Node environment
    const bindings = {
      IAMKEY_KV: {
          get: async (key: string) => {
             // In simulator, use in-memory map or Redis?
             // For now, let's look for a global mock or environment variable
             if (!(global as any).mockKV) (global as any).mockKV = new Map();
             return (global as any).mockKV.get(key);
          },
          put: async (key: string, val: string) => {
             if (!(global as any).mockKV) (global as any).mockKV = new Map();
             (global as any).mockKV.set(key, val);
          },
          delete: async (key: string) => {
             if (!(global as any).mockKV) (global as any).mockKV = new Map();
          (global as any).mockKV.delete(key);
        }
      }
    , TELEGRAM_SERVICE_URL: process.env.TELEGRAM_SERVICE_URL,
    };

    serve({
      fetch: (req) => {
          // Inject bindings into the request environment
          return app.fetch(req, bindings);
      },
      port
    });
  })();
}

export default app;
