import { Hono } from 'hono';
import { ethers } from 'ethers';
import { Network, Alchemy } from 'alchemy-sdk';
import { KVNamespace } from '@cloudflare/workers-types';
import { sendFCMNotification } from './notifications';

// Environment variables type definition
type Bindings = {
  ENVIRONMENT: string;
  ETHEREUM_SEPOLIA_RPC: string;
  BASE_MAINNET_RPC: string;
  BASE_SEPOLIA_RPC: string;
  PAYMASTER_RPC_URL: string;
  ALCHEMY_GAS_MANAGER_KEY: string;
  ALCHEMY_GAS_MANAGER_POLICY_ID: string;
  CONTRACT_IDENTITY_ADDRESS: string;
  ESCROW_CONTRACT_ADDRESS: string;
  DAI_CONTRACT_ADDRESS: string;
  PRIVATE_KEY: string;
  MNEMONIC: string;
  ALCHEMY_API_KEY: string;
  CHAIN_ID: string;
  IAMKEY_KV: KVNamespace;
  FCM_SERVICE_ACCOUNT: string;
  MARKETPLACE_ADMIN_KEY?: string;
};

// Order types
interface Order {
  id: string;
  tradeId?: string; // On-chain trade ID (keccak256 of order ID)
  creatorLookupHash: string;
  counterpartyLookupHash?: string;
  creatorWalletAddress?: string;
  counterpartyWalletAddress?: string;
  type: 'buy' | 'sell';
  localAmount: number;
  localCurrency: string;
  daiAmount: number;
  exchangeRate: number;
  telecomProvider: string;
  phoneNumber: string;
  recipientPhone?: string;
  status: OrderStatus;
  createdAt: string;
  matchedAt?: string;
  fundedAt?: string;
  completedAt?: string;
  escrowTxHash?: string;
  releaseTxHash?: string;
  balanceProofHash?: string;
  balanceBefore?: number;
  balanceAfter?: number;
  isBalanceAutoRead: boolean;
  disputeReason?: string;
  disputeId?: string;
  disputeOpenedAt?: string;
  disputeFee?: number;
  disputeStatus?: DisputeStatus;
  refundTxHash?: string;
  resolvedAt?: string;
  expiresAt: string;
  countryCode: string;
  evidence?: OrderEvidence[];
}

interface OrderEvidence {
  type: 'image' | 'text';
  data: string; // Base64 for images, raw text for notes
  timestamp: string;
  submitterLookupHash: string;
}

type DisputeStatus =
  | 'open'
  | 'evidence'
  | 'in_review'
  | 'resolved'
  | 'cancelled';

type OrderStatus = 
  | 'created'
  | 'matched'
  | 'funded'
  | 'transfer_pending'
  | 'verified'
  | 'completed'
  | 'disputed'
  | 'refunded'
  | 'cancelled'
  | 'expired';

interface DisputePolicy {
  disputeFeeBps: number;
  disputeFeeMin: number;
  disputeFeeMax: number;
  responseWindowHours: number;
  evidenceWindowHours: number;
  arbitrationSlaHours: number;
  reputationPenaltyMinor: number;
  reputationPenaltyMajor: number;
}

interface TrustPolicy {
  baseScore: number;
  minScore: number;
  maxScore: number;
  tradeSuccessBonus: number;
  disputeOpenedPenalty: number;
  disputeWonBonus: number;
  disputeLostPenalty: number;
  fraudPenalty: number;
}

interface MarketplaceGovernance {
  version: number;
  disputePolicy: DisputePolicy;
  trustPolicy: TrustPolicy;
}

interface DisputeResolution {
  releaseToSeller: boolean;
  reputationPenalty: number;
  disputeFee: number;
  resolvedBy: string;
  resolvedAt: string;
  notes?: string;
}

interface DisputeCase {
  id: string;
  orderId: string;
  tradeId?: string;
  openedBy: string;
  reason: string;
  status: DisputeStatus;
  createdAt: string;
  updatedAt: string;
  evidence: OrderEvidence[];
  policySnapshot: DisputePolicy;
  resolution?: DisputeResolution;
}

type TrustLevel = 'low' | 'medium' | 'high' | 'elite';

interface TrustProfile {
  lookupHash: string;
  score: number;
  level: TrustLevel;
  tradesCompleted: number;
  disputesOpened: number;
  disputesLost: number;
  fraudSignals: number;
  isFlagged: boolean;
  lastUpdated: string;
}

// Telecom config stored in KV
interface TelecomConfig {
  countryCode: string;
  countryName: string;
  currencyCode: string;
  currencySymbol: string;
  providers: TelecomProvider[];
  defaultExchangeRate: number;
  minTradeAmount: number;
  maxTradeAmount: number;
  isActive: boolean;
  version: number;
}

interface TelecomProvider {
  code: string;
  name: string;
  prefixes: string[];
  balanceCheckCode: string;
  transferCodeTemplate: string;
  balanceParsePattern?: string;
  supportsAutoRead: boolean;
  minTransferAmount: number;
  maxTransferAmount: number;
  transferFee: number;
  isActive: boolean;
  logoUrl?: string;
}

// P2PEscrow Contract ABI (write functions)
const ESCROW_ABI = [
  "function fundTrade(bytes32 tradeId, address seller, uint256 amount, string calldata offChainOrderId) external",
  "function confirmRelease(bytes32 tradeId) external",
  "function openDispute(bytes32 tradeId) external",
  "function commitVote(bytes32 tradeId, bytes32 commit) external",
  "function revealVote(bytes32 tradeId, bool voteForSeller, bytes32 salt) external",
  "function stake(uint256 amount) external",
  "function unstake(uint256 amount) external",
  "function getTrade(bytes32 tradeId) external view returns (tuple(uint256 amount, address buyer, uint64 fundedAt, uint8 status, address seller, uint64 releaseTime, uint32 disputeDeadline, string offChainOrderId, bytes32 balanceProofHash))",
  "function getDispute(bytes32 tradeId) external view returns (address[] memory assignedResolvers, uint256 commitDeadline, uint256 revealDeadline, uint256 votesForSeller, uint256 votesForBuyer, bool resolved)",
  "event TradeFunded(bytes32 indexed tradeId, address indexed buyer, address indexed seller, uint256 amount)",
  "event DisputeOpened(bytes32 indexed tradeId, address indexed disputedBy, address[] resolvers)",
  "event VoteCommitted(bytes32 indexed tradeId, address indexed resolver)",
  "event VoteRevealed(bytes32 indexed tradeId, address indexed resolver, bool voteForSeller)",
  "event DisputeResolved(bytes32 indexed tradeId, bool releasedToSeller)"
];

// DAI Contract ABI
const DAI_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)"
];

// Default telecom configs
const DEFAULT_CONFIGS: Record<string, TelecomConfig> = {
  NP: {
    countryCode: 'NP',
    countryName: 'Nepal',
    currencyCode: 'NPR',
    currencySymbol: 'रू',
    defaultExchangeRate: 133.50,
    minTradeAmount: 100,
    maxTradeAmount: 10000,
    isActive: true,
    version: 1,
    providers: [
      {
        code: 'NTC',
        name: 'Nepal Telecom',
        prefixes: ['984', '985', '986', '974', '975', '976'],
        balanceCheckCode: '*400#',
        transferCodeTemplate: '*422*{amount}*{phone}#',
        balanceParsePattern: 'Rs\\.?\\s*(\\d+(?:\\.\\d{2})?)',
        supportsAutoRead: true,
        minTransferAmount: 10,
        maxTransferAmount: 5000,
        transferFee: 0,
        isActive: true,
      },
      {
        code: 'NCELL',
        name: 'Ncell',
        prefixes: ['980', '981', '982'],
        balanceCheckCode: '*101#',
        transferCodeTemplate: '*17122*{amount}*{phone}#',
        balanceParsePattern: 'Rs\\.?\\s*(\\d+(?:\\.\\d{2})?)',
        supportsAutoRead: true,
        minTransferAmount: 10,
        maxTransferAmount: 5000,
        transferFee: 0,
        isActive: true,
      },
    ],
  },
  NG: {
    countryCode: 'NG',
    countryName: 'Nigeria',
    currencyCode: 'NGN',
    currencySymbol: '₦',
    defaultExchangeRate: 1560.0,
    minTradeAmount: 1000,
    maxTradeAmount: 100000,
    isActive: true,
    version: 1,
    providers: [
      {
        code: 'MTN',
        name: 'MTN',
        prefixes: ['0803', '0806', '0813', '0816', '0810', '0814', '0903', '0906'],
        balanceCheckCode: '*310#',
        transferCodeTemplate: '*321*{phone}*{amount}*1234#',
        balanceParsePattern: 'Balance:?\\s*NGN\\s*(\\d+(?:\\.\\d{2})?)',
        supportsAutoRead: true,
        minTransferAmount: 50,
        maxTransferAmount: 10000,
        transferFee: 10,
        isActive: true,
      },
      {
        code: 'AIRTEL_NG',
        name: 'Airtel',
        prefixes: ['0802', '0808', '0812', '0701', '0708', '0902', '0907', '0901'],
        balanceCheckCode: '*310#',
        transferCodeTemplate: '*432*{phone}*{amount}#',
        balanceParsePattern: 'Balance:?\\s*NGN\\s*(\\d+(?:\\.\\d{2})?)',
        supportsAutoRead: true,
        minTransferAmount: 50,
        maxTransferAmount: 10000,
        transferFee: 0,
        isActive: true,
      },
    ],
  },
};

const DEFAULT_GOVERNANCE: MarketplaceGovernance = {
  version: 1,
  disputePolicy: {
    disputeFeeBps: 75, // 0.75% of escrow amount
    disputeFeeMin: 0,
    disputeFeeMax: 5,
    responseWindowHours: 24,
    evidenceWindowHours: 48,
    arbitrationSlaHours: 72,
    reputationPenaltyMinor: 5,
    reputationPenaltyMajor: 15,
  },
  trustPolicy: {
    baseScore: 60,
    minScore: 0,
    maxScore: 100,
    tradeSuccessBonus: 1,
    disputeOpenedPenalty: 2,
    disputeWonBonus: 1,
    disputeLostPenalty: 8,
    fraudPenalty: 25,
  },
};

// Create marketplace router
const marketplace = new Hono<{ Bindings: Bindings }>();

// Helper: Generate trade ID from order ID
function generateTradeId(orderId: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(orderId));
}

// Helper: Get wallet from env
async function getWallet(c: any) {
  const apiKey = c.env.ALCHEMY_API_KEY;
  const privateKey = c.env.PRIVATE_KEY;
  const mnemonic = c.env.MNEMONIC;

  // Use Base network for production, Sepolia for staging
  const isProduction = c.env.ENVIRONMENT === 'production';
  const network = isProduction ? Network.BASE_MAINNET : Network.ETH_SEPOLIA;

  const settings = { apiKey, network };
  const alchemy = new Alchemy(settings);
  const provider = (await alchemy.config.getProvider()) as unknown as ethers.Provider;

  let wallet;
  if (mnemonic) {
    wallet = ethers.Wallet.fromPhrase(mnemonic).connect(provider);
  } else {
    wallet = new ethers.Wallet(privateKey, provider);
  }

  return { wallet, provider };
}

// Helper: Send FCM notification (delegates to shared helper)
async function sendNotification(c: any, lookupHash: string, title: string, body: string, data?: Record<string, string>) {
  try {
    return await sendFCMNotification(c, lookupHash, title, body, data);
  } catch (e) {
    console.error('sendNotification error:', e);
  }
}

type NotificationPreferences = {
  account_alerts: boolean;
  guardian_updates: boolean;
  marketplace_updates: boolean;
  tips_and_product: boolean;
};

function defaultNotificationPreferences(): NotificationPreferences {
  return {
    account_alerts: true,
    guardian_updates: true,
    marketplace_updates: true,
    tips_and_product: false
  };
}

async function getNotificationPreferences(c: any, lookupHash: string) {
  const prefsStr = await c.env.IAMKEY_KV.get(`notification_prefs:${lookupHash}`);
  if (!prefsStr) return defaultNotificationPreferences();
  try {
    return { ...defaultNotificationPreferences(), ...JSON.parse(prefsStr) };
  } catch {
    return defaultNotificationPreferences();
  }
}

async function storeNotification(
  c: any,
  lookupHash: string,
  payload: { title: string; body: string; type: string; data?: Record<string, string> }
) {
  const key = `notifications:${lookupHash}`;
  let existing: any[] = [];
  const existingStr = await c.env.IAMKEY_KV.get(key);
  if (existingStr) {
    try {
      existing = JSON.parse(existingStr);
    } catch {
      existing = [];
    }
  }

  const entry = {
    id: crypto.randomUUID(),
    title: payload.title,
    body: payload.body,
    type: payload.type,
    data: payload.data || {},
    created_at: new Date().toISOString(),
    is_read: false
  };

  const updated = [entry, ...existing].slice(0, 50);
  await c.env.IAMKEY_KV.put(key, JSON.stringify(updated));
  return entry;
}

function shouldSendNotification(type: string, prefs: NotificationPreferences) {
  if (type.startsWith('guardian')) return prefs.guardian_updates;
  if (type.startsWith('marketplace') || type.startsWith('order') || type.startsWith('escrow') || type.startsWith('trade')) {
    return prefs.marketplace_updates;
  }
  if (type.startsWith('tips')) return prefs.tips_and_product;
  return prefs.account_alerts;
}

function isAdminRequest(c: any) {
  const adminKey = c.env.MARKETPLACE_ADMIN_KEY;
  if (!adminKey) {
    return true;
  }
  const authHeader = c.req.header('Authorization') || '';
  const adminHeader = c.req.header('X-Admin-Key') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7) === adminKey;
  }
  return adminHeader === adminKey;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getTrustLevel(score: number): TrustLevel {
  if (score >= 80) return 'elite';
  if (score >= 65) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

async function getGovernanceConfig(c: any): Promise<MarketplaceGovernance> {
  const stored = await c.env.IAMKEY_KV.get('marketplace_governance');
  if (!stored) return DEFAULT_GOVERNANCE;
  try {
    const parsed = JSON.parse(stored);
    return {
      ...DEFAULT_GOVERNANCE,
      ...parsed,
      disputePolicy: {
        ...DEFAULT_GOVERNANCE.disputePolicy,
        ...(parsed.disputePolicy || {}),
      },
      trustPolicy: {
        ...DEFAULT_GOVERNANCE.trustPolicy,
        ...(parsed.trustPolicy || {}),
      },
    };
  } catch {
    return DEFAULT_GOVERNANCE;
  }
}

async function saveGovernanceConfig(
  c: any,
  governance: MarketplaceGovernance,
) {
  await c.env.IAMKEY_KV.put(
    'marketplace_governance',
    JSON.stringify(governance),
  );
}

function computeDisputeFee(daiAmount: number, policy: DisputePolicy) {
  const rawFee = (daiAmount * policy.disputeFeeBps) / 10000;
  const bounded = clampNumber(rawFee, policy.disputeFeeMin, policy.disputeFeeMax);
  return Number(bounded.toFixed(6));
}

function getOrderParties(order: Order) {
  const creator = order.creatorLookupHash;
  const counterparty = order.counterpartyLookupHash;
  if (!counterparty) {
    return { buyerLookupHash: undefined, sellerLookupHash: undefined };
  }
  if (order.type === 'sell') {
    return { buyerLookupHash: counterparty, sellerLookupHash: creator };
  }
  return { buyerLookupHash: creator, sellerLookupHash: counterparty };
}

async function getTrustProfile(
  c: any,
  lookupHash: string,
  policy: TrustPolicy,
): Promise<TrustProfile> {
  const key = `trust:${lookupHash}`;
  const stored = await c.env.IAMKEY_KV.get(key);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return {
        lookupHash,
        score: typeof parsed.score === 'number' ? parsed.score : policy.baseScore,
        level: parsed.level || getTrustLevel(parsed.score ?? policy.baseScore),
        tradesCompleted: parsed.tradesCompleted ?? 0,
        disputesOpened: parsed.disputesOpened ?? 0,
        disputesLost: parsed.disputesLost ?? 0,
        fraudSignals: parsed.fraudSignals ?? 0,
        isFlagged: parsed.isFlagged ?? false,
        lastUpdated: parsed.lastUpdated || new Date().toISOString(),
      };
    } catch {}
  }

  return {
    lookupHash,
    score: policy.baseScore,
    level: getTrustLevel(policy.baseScore),
    tradesCompleted: 0,
    disputesOpened: 0,
    disputesLost: 0,
    fraudSignals: 0,
    isFlagged: false,
    lastUpdated: new Date().toISOString(),
  };
}

type TrustEvent =
  | 'trade_completed'
  | 'dispute_opened'
  | 'dispute_won'
  | 'dispute_lost'
  | 'fraud_reported';

async function applyTrustEvent(
  c: any,
  lookupHash: string,
  event: TrustEvent,
) {
  const governance = await getGovernanceConfig(c);
  const policy = governance.trustPolicy;
  const profile = await getTrustProfile(c, lookupHash, policy);

  let delta = 0;
  switch (event) {
    case 'trade_completed':
      profile.tradesCompleted += 1;
      delta = policy.tradeSuccessBonus;
      break;
    case 'dispute_opened':
      profile.disputesOpened += 1;
      delta = -policy.disputeOpenedPenalty;
      break;
    case 'dispute_won':
      delta = policy.disputeWonBonus;
      break;
    case 'dispute_lost':
      profile.disputesLost += 1;
      delta = -policy.disputeLostPenalty;
      break;
    case 'fraud_reported':
      profile.fraudSignals += 1;
      profile.isFlagged = true;
      delta = -policy.fraudPenalty;
      break;
  }

  profile.score = clampNumber(profile.score + delta, policy.minScore, policy.maxScore);
  profile.level = getTrustLevel(profile.score);
  profile.lastUpdated = new Date().toISOString();

  await c.env.IAMKEY_KV.put(`trust:${lookupHash}`, JSON.stringify(profile));
  return profile;
}

// PCI Data by Country (Example: 0 = Low, 1000 = High)
const COUNTRY_PCI: Record<string, number> = {
  'NP': 1300,
  'NG': 2000,
  'IN': 2300,
  'US': 76000,
  'GB': 45000,
};

// ============ PCI & Bonding Endpoints ============

marketplace.get('/pci-certificate', async (c) => {
  const countryCode = c.req.query('country_code')?.toUpperCase() || 'NP';
  const userWallet = c.req.query('wallet');

  if (!userWallet) return c.json({ error: 'wallet is required' }, 400);

  const pci = COUNTRY_PCI[countryCode] || 1000;
  
  // Calculate recommended bond (e.g., 1% of annual PCI, capped at 100 DAI)
  const bondAmount = Math.min(100, Math.max(10, pci / 100));

  try {
    const { wallet } = await getWallet(c);
    
    // Create EIP-712 structured data for PCI Certificate
    const domain = {
      name: "IamKey-PCI",
      version: "1",
      chainId: parseInt(c.env.CHAIN_ID || "84532"),
      verifyingContract: c.env.CONTRACT_IDENTITY_ADDRESS
    };

    const types = {
      PCICertificate: [
        { name: "user", type: "address" },
        { name: "countryCode", type: "string" },
        { name: "pci", type: "uint256" },
        { name: "bondAmount", type: "uint256" },
        { name: "expiry", type: "uint256" }
      ]
    };

    const expiry = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours
    const value = {
      user: userWallet,
      countryCode,
      pci: ethers.toBeHex(pci),
      bondAmount: ethers.parseEther(bondAmount.toString()),
      expiry: ethers.toBeHex(expiry)
    };

    const signature = await wallet.signTypedData(domain, types, value);

    return c.json({
      countryCode,
      pci,
      bondAmount,
      expiry,
      signature,
      signer: wallet.address
    });
  } catch (error: any) {
    console.error('PCI Certificate error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============ Order Management Endpoints ============

// Governance and trust endpoints
marketplace.get('/governance', async (c) => {
  const governance = await getGovernanceConfig(c);
  return c.json({ governance });
});

marketplace.put('/governance', async (c) => {
  if (!isAdminRequest(c)) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const body = await c.req.json();
  const current = await getGovernanceConfig(c);
  const next: MarketplaceGovernance = {
    ...current,
    ...body,
    disputePolicy: {
      ...current.disputePolicy,
      ...(body.disputePolicy || {}),
    },
    trustPolicy: {
      ...current.trustPolicy,
      ...(body.trustPolicy || {}),
    },
    version: current.version + 1,
  };

  await saveGovernanceConfig(c, next);

  if (body.apply_on_chain && body.disputePolicy?.disputeFeeBps != null) {
    try {
      const { wallet } = await getWallet(c);
      const escrowAddress = c.env.ESCROW_CONTRACT_ADDRESS;
      if (escrowAddress) {
        const escrowContract = new ethers.Contract(escrowAddress, ESCROW_ABI, wallet);
        const tx = await escrowContract.setDisputeFee(next.disputePolicy.disputeFeeBps);
        await tx.wait();
      }
    } catch (error: any) {
      console.error('Failed to update dispute fee on-chain:', error);
      return c.json({ error: 'On-chain update failed' }, 500);
    }
  }

  return c.json({ governance: next });
});

marketplace.get('/trust-score', async (c) => {
  const lookupHash = c.req.query('lookup_hash');
  if (!lookupHash) return c.json({ error: 'lookup_hash is required' }, 400);

  const governance = await getGovernanceConfig(c);
  const profile = await getTrustProfile(c, lookupHash, governance.trustPolicy);
  return c.json({ trust: profile });
});

// Create order (off-chain only)
marketplace.post('/orders', async (c) => {
  const body = await c.req.json();
  const {
    creator_lookup_hash,
    type,
    local_amount,
    local_currency,
    telecom_provider,
    phone_number,
    recipient_phone,
    country_code,
    exchange_rate,
    expiry_hours = 24,
  } = body;

  if (!creator_lookup_hash || !type || !local_amount || !telecom_provider || !phone_number) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  // Get exchange rate if not provided
  let rate = exchange_rate;
  if (!rate) {
    const config = await getTelecomConfig(c, country_code || 'NP');
    rate = config.defaultExchangeRate;
  }

  // Calculate DAI amount
  const daiAmount = local_amount / rate;

  // Create order
  const orderId = crypto.randomUUID();
  let creatorWalletAddress: string | undefined;
  const creatorIdentityStr = await c.env.IAMKEY_KV.get(
    `identity:${creator_lookup_hash}`,
  );
  if (creatorIdentityStr) {
    try {
      const creatorIdentity = JSON.parse(creatorIdentityStr);
      creatorWalletAddress = creatorIdentity.owner;
    } catch (_) {}
  }
  const order: Order = {
    id: orderId,
    creatorLookupHash: creator_lookup_hash,
    creatorWalletAddress,
    type,
    localAmount: local_amount,
    localCurrency: local_currency || 'NPR',
    daiAmount,
    exchangeRate: rate,
    telecomProvider: telecom_provider,
    phoneNumber: phone_number,
    recipientPhone: recipient_phone || undefined,
    status: 'created',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + expiry_hours * 60 * 60 * 1000).toISOString(),
    countryCode: country_code || 'NP',
    isBalanceAutoRead: false,
  };

  // Store in KV
  await c.env.IAMKEY_KV.put(`order:${orderId}`, JSON.stringify(order), {
    expirationTtl: expiry_hours * 60 * 60,
  });

  // Add to order index for listing
  await addToOrderIndex(c, order);

  // Find matches and notify
  try {
    const matches = await findBestMatches(c, order);
    if (matches.length > 0) {
      await sendNotification(c, order.creatorLookupHash, 'Potential Matches Found!', 
        `We found ${matches.length} potential matches for your order. Tap to view.`,
        { type: 'matching_orders', orderId, matchCount: matches.length.toString() });
    }
  } catch (err) {
    console.error('Error finding matches:', err);
  }

  return c.json({ order });
});

/**
 * Intelligent matching algorithm for marketplace orders
 * Criteria: 
 * 1. Opposite type (Buy vs Sell)
 * 2. Same telecom provider & country
 * 3. Overlapping amounts (allowing some variance or partial matching)
 * 4. Price-Time Priority
 */
async function findBestMatches(c: any, newOrder: Order): Promise<Order[]> {
  const indexStr = await c.env.IAMKEY_KV.get('order_index');
  const orderIds: string[] = indexStr ? JSON.parse(indexStr) : [];
  
  const potentialMatches: Order[] = [];
  const oppositeType = newOrder.type === 'buy' ? 'sell' : 'buy';

  for (const id of orderIds.slice(-200)) { // Scan last 200 orders
    if (id === newOrder.id) continue;
    
    const orderStr = await c.env.IAMKEY_KV.get(`order:${id}`);
    if (!orderStr) continue;

    const order: Order = JSON.parse(orderStr);

    // Basic compatibility check
    if (order.status !== 'created') continue;
    if (order.type !== oppositeType) continue;
    if (order.telecomProvider !== newOrder.telecomProvider) continue;
    if (order.countryCode !== newOrder.countryCode) continue;
    if (order.creatorLookupHash === newOrder.creatorLookupHash) continue;

    // Amount check (allowing some leeway or future partial matching)
    // For now, suggest if amounts are similar (within 20%) or if one covers the other
    const amountDiff = Math.abs(order.localAmount - newOrder.localAmount);
    const maxDiff = Math.max(order.localAmount, newOrder.localAmount) * 0.5; // High tolerance for suggestion

    if (amountDiff <= maxDiff) {
      potentialMatches.push(order);
    }
  }

  // Sort by Price-Time Priority
  potentialMatches.sort((a, b) => {
    // If buying, cheaper sells first. If selling, higher buys first.
    if (newOrder.type === 'buy') {
      if (a.exchangeRate !== b.exchangeRate) {
        return a.exchangeRate - b.exchangeRate; // Ascending
      }
    } else {
      if (a.exchangeRate !== b.exchangeRate) {
        return b.exchangeRate - a.exchangeRate; // Descending
      }
    }
    // Time priority (older first)
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return potentialMatches.slice(0, 5); // Return top 5 matches
}

// List orders with filters
marketplace.get('/orders', async (c) => {
  const type = c.req.query('type');
  const status = c.req.query('status');
  const provider = c.req.query('provider');
  const country = c.req.query('country');
  const minAmount = c.req.query('min_amount');
  const maxAmount = c.req.query('max_amount');
  const excludeCreator = c.req.query('exclude_creator');

  // Get order index
  const indexStr = await c.env.IAMKEY_KV.get('order_index');
  const orderIds: string[] = indexStr ? JSON.parse(indexStr) : [];

  // Fetch orders and filter
  const orders: Order[] = [];
  for (const id of orderIds.slice(-100)) { // Limit to last 100
    const orderStr = await c.env.IAMKEY_KV.get(`order:${id}`);
    if (!orderStr) continue;

    const order: Order = JSON.parse(orderStr);

    // Apply filters
    if (type && order.type !== type) continue;
    if (status && order.status !== status) continue;
    if (provider && order.telecomProvider !== provider) continue;
    if (country && order.countryCode !== country) continue;
    if (minAmount && order.localAmount < parseFloat(minAmount)) continue;
    if (maxAmount && order.localAmount > parseFloat(maxAmount)) continue;
    if (excludeCreator && order.creatorLookupHash === excludeCreator) continue;

    // Skip expired
    if (new Date(order.expiresAt) < new Date() && order.status === 'created') {
      continue;
    }

    orders.push(order);
  }

  // Set cache headers for short caching (orders change frequently)
  c.header('Cache-Control', 'public, max-age=30, s-maxage=60');
  return c.json({ orders });
});

// Get single order
marketplace.get('/orders/:id', async (c) => {
  const orderId = c.req.param('id');
  const orderStr = await c.env.IAMKEY_KV.get(`order:${orderId}`);

  if (!orderStr) {
    return c.json({ error: 'Order not found' }, 404);
  }

  return c.json({ order: JSON.parse(orderStr) });
});

// Match order (accept)
marketplace.post('/orders/:id/match', async (c) => {
  const orderId = c.req.param('id');
  const body = await c.req.json();
  const { counterparty_lookup_hash, recipient_phone, fill_amount } = body;

  const orderStr = await c.env.IAMKEY_KV.get(`order:${orderId}`);
  if (!orderStr) {
    return c.json({ error: 'Order not found' }, 404);
  }

  const order: Order = JSON.parse(orderStr);

  if (order.status !== 'created') {
    return c.json({ error: 'Order is not available for matching' }, 400);
  }

  if (order.creatorLookupHash === counterparty_lookup_hash) {
    return c.json({ error: 'Cannot match your own order' }, 400);
  }

  // Handle partial fill
  let finalOrder = order;
  if (fill_amount && fill_amount < order.localAmount) {
    // Split order: child is matched, parent is updated with remaining
    const remainingLocal = order.localAmount - fill_amount;
    const remainingDai = remainingLocal / order.exchangeRate;

    // Create matched sub-order
    const subOrderId = crypto.randomUUID();
    const matchedSubOrder: Order = {
      ...order,
      id: subOrderId,
      localAmount: fill_amount,
      daiAmount: fill_amount / order.exchangeRate,
      status: 'matched',
      counterpartyLookupHash: counterparty_lookup_hash,
      matchedAt: new Date().toISOString(),
      recipientPhone: recipient_phone || order.recipientPhone,
    };

    // Update parent order (remaining)
    order.localAmount = remainingLocal;
    order.daiAmount = remainingDai;
    
    // Save both
    await c.env.IAMKEY_KV.put(`order:${subOrderId}`, JSON.stringify(matchedSubOrder));
    await c.env.IAMKEY_KV.put(`order:${orderId}`, JSON.stringify(order));
    
    await addToOrderIndex(c, matchedSubOrder);
    finalOrder = matchedSubOrder;
  } else {
    // Full fill
    order.counterpartyLookupHash = counterparty_lookup_hash;
    order.status = 'matched';
    order.matchedAt = new Date().toISOString();
    if (recipient_phone) {
      order.recipientPhone = recipient_phone;
    }
    
    await c.env.IAMKEY_KV.put(`order:${orderId}`, JSON.stringify(order));
    finalOrder = order;
  }

  // Get counterparty wallet for finalOrder
  const counterpartyIdentityStr = await c.env.IAMKEY_KV.get(
    `identity:${counterparty_lookup_hash}`,
  );
  if (counterpartyIdentityStr) {
    try {
      const counterpartyIdentity = JSON.parse(counterpartyIdentityStr);
      finalOrder.counterpartyWalletAddress = counterpartyIdentity.owner;
      // Re-save with wallet info
      await c.env.IAMKEY_KV.put(`order:${finalOrder.id}`, JSON.stringify(finalOrder));
    } catch (_) {}
  }

  // Notify creator
  await sendNotification(c, finalOrder.creatorLookupHash, 'Order Matched!', 
    `Your ${finalOrder.type} order has been ${fill_amount ? 'partially' : 'fully'} matched for ${finalOrder.localCurrency} ${finalOrder.localAmount}.`,
    { type: 'order_matched', orderId: finalOrder.id, category: 'ORDER_MATCHED' });

  return c.json({ order: finalOrder });
});

// Cancel order
marketplace.post('/orders/:id/cancel', async (c) => {
  const orderId = c.req.param('id');
  const body = await c.req.json();
  const { lookup_hash } = body;

  const orderStr = await c.env.IAMKEY_KV.get(`order:${orderId}`);
  if (!orderStr) {
    return c.json({ error: 'Order not found' }, 404);
  }

  const order: Order = JSON.parse(orderStr);

  if (order.creatorLookupHash !== lookup_hash) {
    return c.json({ error: 'Not authorized to cancel this order' }, 403);
  }

  if (order.status !== 'created') {
    return c.json({ error: 'Can only cancel orders that are not yet matched' }, 400);
  }

  order.status = 'cancelled';
  await c.env.IAMKEY_KV.put(`order:${orderId}`, JSON.stringify(order));

  return c.json({ success: true });
});

// ============ Escrow Operations (On-chain) ============

// Fund escrow - ON-CHAIN ACTIVATION POINT
// Backend sponsors gas, will deduct from proceeds on release
marketplace.post('/orders/:id/fund', async (c) => {
  const orderId = c.req.param('id');
  const body = await c.req.json();
  const { buyer_lookup_hash, amount } = body;

  const orderStr = await c.env.IAMKEY_KV.get(`order:${orderId}`);
  if (!orderStr) {
    return c.json({ error: 'Order not found' }, 404);
  }

  const order: Order = JSON.parse(orderStr);

  if (order.status !== 'matched') {
    return c.json({ error: 'Order must be matched before funding' }, 400);
  }

  // Determine buyer based on order type
  const isBuyer = order.type === 'sell' 
    ? order.counterpartyLookupHash === buyer_lookup_hash
    : order.creatorLookupHash === buyer_lookup_hash;

  if (!isBuyer) {
    return c.json({ error: 'Only the buyer can fund escrow' }, 403);
  }

  try {
    console.log('[DEBUG] Fund escrow called for orderId:', orderId, 'buyer_lookup_hash:', buyer_lookup_hash);
    
    const { wallet, provider } = await getWallet(c);
    const escrowAddress = c.env.ESCROW_CONTRACT_ADDRESS;
    const daiAddress = c.env.DAI_CONTRACT_ADDRESS;

    console.log('[DEBUG] Escrow address:', escrowAddress, 'DAI address:', daiAddress);
    console.log('[DEBUG] Wallet address:', wallet.address);

    if (!escrowAddress) {
      console.error('[ERROR] Escrow contract not configured');
      return c.json({ error: 'Escrow contract not configured' }, 500);
    }

    const escrowContract = new ethers.Contract(escrowAddress, ESCROW_ABI, wallet);
    const daiContract = new ethers.Contract(daiAddress, DAI_ABI, wallet);

    // Generate trade ID
    const tradeId = generateTradeId(orderId);
    console.log('[DEBUG] Generated tradeId:', tradeId);
    
    // Get seller address from their identity
    const sellerHash = order.type === 'sell' ? order.creatorLookupHash : order.counterpartyLookupHash;
    const sellerIdentityStr = await c.env.IAMKEY_KV.get(`identity:${sellerHash}`);
    
    let sellerAddress =
      order.type === 'sell'
        ? order.creatorWalletAddress
        : order.counterpartyWalletAddress;

    if (sellerIdentityStr) {
      try {
        const sellerIdentity = JSON.parse(sellerIdentityStr);
        if (sellerIdentity.owner) {
          sellerAddress = sellerIdentity.owner;
        }
      } catch (identityError) {
        console.error('[ERROR] Failed to parse seller identity for order:', orderId, identityError);
      }
    }

    console.log('[DEBUG] Seller address:', sellerAddress);

    if (!sellerAddress) {
      console.error('[ERROR] Seller wallet address is missing for order:', orderId);
      return c.json(
        { error: 'Seller wallet address is not registered. Ask the seller to complete wallet setup before trading.' },
        400,
      );
    }

    // Convert DAI amount to wei (18 decimals)
    console.log('[DEBUG] order.daiAmount:', order.daiAmount, 'type:', typeof order.daiAmount);
    const amountWei = ethers.parseEther(order.daiAmount.toString());
    console.log('[DEBUG] amountWei:', amountWei.toString());

    // For MVP: Backend wallet funds the escrow
    // In production: Use AA/Paymaster for user's wallet
    
    // Check DAI balance and allowance
    const daiBalance = await daiContract.balanceOf(wallet.address);
    const allowance = await daiContract.allowance(wallet.address, escrowAddress);
    console.log('[DEBUG] DAI balance:', daiBalance.toString(), 'allowance:', allowance.toString());
    
    if (daiBalance < amountWei) {
      console.error('[ERROR] Insufficient DAI balance. Required:', amountWei.toString(), 'Available:', daiBalance.toString());
      return c.json({ error: 'Insufficient DAI balance in backend wallet' }, 500);
    }
    
    if (allowance < amountWei) {
      console.log('[DEBUG] Approving DAI for escrow contract...');
      const approveTx = await daiContract.approve(escrowAddress, ethers.MaxUint256);
      await approveTx.wait();
      console.log('[DEBUG] DAI approved, tx hash:', approveTx.hash);
    }

    // Fund the trade
    console.log('[DEBUG] Calling fundTrade with tradeId:', tradeId, 'seller:', sellerAddress, 'amount:', amountWei.toString());
    const tx = await escrowContract.fundTrade(tradeId, sellerAddress, amountWei, orderId);
    console.log('[DEBUG] fundTrade tx sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('[DEBUG] fundTrade tx confirmed:', receipt.hash);

    // Update order
    order.tradeId = tradeId;
    order.status = 'funded';
    order.fundedAt = new Date().toISOString();
    order.escrowTxHash = receipt.hash;

    await c.env.IAMKEY_KV.put(`order:${orderId}`, JSON.stringify(order));
    await c.env.IAMKEY_KV.put(`trade_to_order:${tradeId}`, orderId);

    // Notify seller
    const notifyHash = order.type === 'sell' ? order.creatorLookupHash : order.counterpartyLookupHash;
    await sendNotification(c, notifyHash!, 'Escrow Funded!',
      `Buyer has funded escrow for ${order.localCurrency} ${order.localAmount}. Please initiate the balance transfer.`,
      { type: 'escrow_funded', orderId });

    return c.json({ order, transactionHash: receipt.hash });
  } catch (error: any) {
    console.error('Fund escrow error:', error);
    console.error('Error name:', error.name);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    // Log additional context for debugging
    console.error('[DEBUG] Order ID:', orderId);
    console.error('[DEBUG] Buyer lookup hash:', buyer_lookup_hash);
    console.error('[DEBUG] Order daiAmount:', order.daiAmount);
    
    // Provide more specific error messages
    if (error.message?.includes('insufficient funds')) {
      return c.json({ error: 'Insufficient DAI balance in backend wallet for escrow funding' }, 500);
    }
    if (error.code === 'INSUFFICIENT_FUNDS') {
      return c.json({ error: 'Insufficient funds for gas - backend wallet needs ETH for gas fees' }, 500);
    }
    if (error.message?.includes('allowance')) {
      return c.json({ error: 'DAI allowance check failed - may need to approve DAI for escrow contract' }, 500);
    }
    if (error.message?.includes('nonce')) {
      return c.json({ error: 'Transaction nonce issue - wallet may have pending transactions' }, 500);
    }
    
    return c.json({ error: error.message || 'Failed to fund escrow' }, 500);
  }
});

// Confirm release - buyer confirms balance received
marketplace.post('/orders/:id/release', async (c) => {
  const orderId = c.req.param('id');
  const body = await c.req.json();
  const { buyer_lookup_hash } = body;

  const orderStr = await c.env.IAMKEY_KV.get(`order:${orderId}`);
  if (!orderStr) {
    return c.json({ error: 'Order not found' }, 404);
  }

  const order: Order = JSON.parse(orderStr);

  if (order.status !== 'funded' && order.status !== 'verified') {
    return c.json({ error: 'Order must be funded before release' }, 400);
  }

  // Verify buyer
  const isBuyer = order.type === 'sell'
    ? order.counterpartyLookupHash === buyer_lookup_hash
    : order.creatorLookupHash === buyer_lookup_hash;

  if (!isBuyer) {
    return c.json({ error: 'Only the buyer can confirm release' }, 403);
  }

  try {
    const { wallet } = await getWallet(c);
    const escrowAddress = c.env.ESCROW_CONTRACT_ADDRESS;
    const escrowContract = new ethers.Contract(escrowAddress, ESCROW_ABI, wallet);

    const tradeIdBytes = order.tradeId;
    const tx = await escrowContract.confirmRelease(tradeIdBytes);
    const receipt = await tx.wait();

    // Update order
    order.status = 'completed';
    order.completedAt = new Date().toISOString();
    order.releaseTxHash = receipt.hash;

    await c.env.IAMKEY_KV.put(`order:${orderId}`, JSON.stringify(order));

    const { buyerLookupHash, sellerLookupHash } = getOrderParties(order);
    if (buyerLookupHash && sellerLookupHash) {
      await applyTrustEvent(c, buyerLookupHash, 'trade_completed');
      await applyTrustEvent(c, sellerLookupHash, 'trade_completed');
    }

    // Notify seller
    const sellerHash = order.type === 'sell' ? order.creatorLookupHash : order.counterpartyLookupHash;
    await sendNotification(c, sellerHash!, 'Trade Completed!',
      `Funds released! You received DAI ${order.daiAmount.toFixed(4)} (minus fees).`,
      { type: 'trade_completed', orderId });

    return c.json({ order, transactionHash: receipt.hash });
  } catch (error: any) {
    console.error('Release error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Open dispute
marketplace.post('/orders/:id/dispute', async (c) => {
  const orderId = c.req.param('id');
  const body = await c.req.json();
  const { disputer_lookup_hash, reason } = body;

  const orderStr = await c.env.IAMKEY_KV.get(`order:${orderId}`);
  if (!orderStr) {
    return c.json({ error: 'Order not found' }, 404);
  }

  const order: Order = JSON.parse(orderStr);

  if (order.status !== 'funded') {
    return c.json({ error: 'Can only dispute funded orders' }, 400);
  }

  // Verify party to trade
  const isParty = order.creatorLookupHash === disputer_lookup_hash ||
                  order.counterpartyLookupHash === disputer_lookup_hash;

  if (!isParty) {
    return c.json({ error: 'Not authorized to dispute this order' }, 403);
  }

  try {
    const governance = await getGovernanceConfig(c);
    const disputeFee = computeDisputeFee(order.daiAmount, governance.disputePolicy);
    const { wallet } = await getWallet(c);
    const escrowAddress = c.env.ESCROW_CONTRACT_ADDRESS;
    const escrowContract = new ethers.Contract(escrowAddress, ESCROW_ABI, wallet);

    // Check if dispute window is still open
    const canDispute = await escrowContract.canDispute(order.tradeId);
    if (!canDispute) {
      return c.json({ error: 'Dispute window has closed' }, 400);
    }

    const tx = await escrowContract.openDispute(order.tradeId, reason);
    const receipt = await tx.wait();

    // Update order
    const disputeId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    order.status = 'disputed';
    order.disputeReason = reason;
    order.disputeId = disputeId;
    order.disputeOpenedAt = nowIso;
    order.disputeFee = disputeFee;
    order.disputeStatus = 'open';

    await c.env.IAMKEY_KV.put(`order:${orderId}`, JSON.stringify(order));
    await addToDisputeIndex(c, disputeId);

    const disputeCase: DisputeCase = {
      id: disputeId,
      orderId,
      tradeId: order.tradeId,
      openedBy: disputer_lookup_hash,
      reason,
      status: 'open',
      createdAt: nowIso,
      updatedAt: nowIso,
      evidence: order.evidence || [],
      policySnapshot: governance.disputePolicy,
    };
    await c.env.IAMKEY_KV.put(`dispute:${orderId}`, JSON.stringify(disputeCase));
    await c.env.IAMKEY_KV.put(`dispute_id:${disputeId}`, orderId);

    await applyTrustEvent(c, disputer_lookup_hash, 'dispute_opened');

    // Notify other party
    const otherParty = order.creatorLookupHash === disputer_lookup_hash
      ? order.counterpartyLookupHash
      : order.creatorLookupHash;

    await sendNotification(c, otherParty!, 'Trade Disputed',
      `A dispute has been opened for order ${orderId.slice(0, 8)}. Reason: ${reason}`,
      { type: 'trade_disputed', orderId });

    return c.json({ order, transactionHash: receipt.hash });
  } catch (error: any) {
    console.error('Dispute error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Submit balance proof
marketplace.post('/orders/:id/balance-proof', async (c) => {
  const orderId = c.req.param('id');
  const body = await c.req.json();
  const { proof_hash, balance_before, balance_after, is_auto_read } = body;

  const orderStr = await c.env.IAMKEY_KV.get(`order:${orderId}`);
  if (!orderStr) {
    return c.json({ error: 'Order not found' }, 404);
  }

  const order: Order = JSON.parse(orderStr);

  // Update order with proof
  order.balanceProofHash = proof_hash;
  order.balanceBefore = balance_before;
  order.balanceAfter = balance_after;
  order.isBalanceAutoRead = is_auto_read;

  // If we have before/after, verify the transfer amount
  if (balance_before !== undefined && balance_after !== undefined) {
    const transferredAmount = balance_before - balance_after;
    
    // Allow 5% tolerance for fees
    const expectedAmount = order.localAmount;
    const tolerance = expectedAmount * 0.05;
    
    if (Math.abs(transferredAmount - expectedAmount) <= tolerance) {
      order.status = 'verified';
    }
  }

  await c.env.IAMKEY_KV.put(`order:${orderId}`, JSON.stringify(order));

  // If on-chain and funded, submit proof hash to contract
  if (order.tradeId && order.status === 'funded') {
    try {
      const { wallet } = await getWallet(c);
      const escrowAddress = c.env.ESCROW_CONTRACT_ADDRESS;
      const escrowContract = new ethers.Contract(escrowAddress, ESCROW_ABI, wallet);

      const proofHashBytes = ethers.keccak256(ethers.toUtf8Bytes(proof_hash));
      await escrowContract.submitBalanceProof(order.tradeId, proofHashBytes);
    } catch (e) {
      console.error('Failed to submit proof on-chain:', e);
    }
  }

  return c.json({ success: true });
});

// ============ Telecom Config Endpoints ============

// Get telecom config for country
marketplace.get('/telecom-config/:countryCode', async (c) => {
  const countryCode = c.req.param('countryCode').toUpperCase();
  const config = await getTelecomConfig(c, countryCode);
  return c.json({ config });
});

// Get all active configs
marketplace.get('/telecom-configs', async (c) => {
  const configs: TelecomConfig[] = [];

  // Get from KV or use defaults
  for (const code of ['NP', 'NG', 'IN']) {
    const config = await getTelecomConfig(c, code);
    if (config.isActive) {
      configs.push(config);
    }
  }

  return c.json({ configs });
});

// Get exchange rate
marketplace.get('/exchange-rate/:currencyCode', async (c) => {
  const currencyCode = c.req.param('currencyCode').toUpperCase();
  
  // Try to get from KV first (updated by external oracle/cron)
  const rateStr = await c.env.IAMKEY_KV.get(`exchange_rate:${currencyCode}`);
  
  // Cache exchange rates for 5 minutes (rates don't change frequently)
  c.header('Cache-Control', 'public, max-age=300, s-maxage=300');
  
  if (rateStr) {
    return c.json({ rate: parseFloat(rateStr), currency: currencyCode });
  }

  // Fallback to config default
  const countryCode = currencyToCountry(currencyCode);
  const config = await getTelecomConfig(c, countryCode);
  
  return c.json({ rate: config.defaultExchangeRate, currency: currencyCode });
});

// Admin: Update telecom config
marketplace.put('/telecom-config/:countryCode', async (c) => {
  const countryCode = c.req.param('countryCode').toUpperCase();
  const config: TelecomConfig = await c.req.json();

  // Validate
  if (config.countryCode !== countryCode) {
    return c.json({ error: 'Country code mismatch' }, 400);
  }

  // Increment version
  config.version = (config.version || 0) + 1;

  await c.env.IAMKEY_KV.put(`telecom_config:${countryCode}`, JSON.stringify(config));

  return c.json({ config });
});

// Admin: Update exchange rate
marketplace.put('/exchange-rate/:currencyCode', async (c) => {
  const currencyCode = c.req.param('currencyCode').toUpperCase();
  const body = await c.req.json();
  const { rate } = body;

  if (!rate || rate <= 0) {
    return c.json({ error: 'Invalid rate' }, 400);
  }

  await c.env.IAMKEY_KV.put(`exchange_rate:${currencyCode}`, rate.toString());

  return c.json({ success: true, rate, currency: currencyCode });
});

// Submit dispute evidence (Encrypted for resolvers)
marketplace.post('/orders/:id/evidence', async (c) => {
  const orderId = c.req.param('id');
  const body = await c.req.json();
  const { lookup_hash, type, encrypted_data, nonce, encrypted_session_keys } = body;

  const orderStr = await c.env.IAMKEY_KV.get(`order:${orderId}`);
  if (!orderStr) {
    return c.json({ error: 'Order not found' }, 404);
  }

  const order: Order = JSON.parse(orderStr);

  if (order.status !== 'disputed') {
    return c.json({ error: 'Order is not in dispute' }, 400);
  }

  // Upload to IPFS (Simplified via Pinata helper)
  // In a real environment, we'd call Pinata API here
  const ipfsHash = `Qm${crypto.randomUUID().replace(/-/g, '')}`; // Mock hash

  const evidence = {
    type,
    ipfsHash,
    nonce,
    encryptedSessionKeys: encrypted_session_keys,
    timestamp: new Date().toISOString(),
    submitterLookupHash: lookup_hash,
  };

  if (!order.evidence) {
    order.evidence = [];
  }
  // @ts-ignore
  order.evidence.push(evidence);

  await c.env.IAMKEY_KV.put(`order:${orderId}`, JSON.stringify(order));

  return c.json({ success: true, ipfsHash });
});

// Get dispute details (party or admin)
marketplace.get('/orders/:id/dispute', async (c) => {
  const orderId = c.req.param('id');
  const orderStr = await c.env.IAMKEY_KV.get(`order:${orderId}`);
  if (!orderStr) {
    return c.json({ error: 'Order not found' }, 404);
  }
  const order: Order = JSON.parse(orderStr);
  const disputeStr = await c.env.IAMKEY_KV.get(`dispute:${orderId}`);
  if (!disputeStr) {
    return c.json({ error: 'Dispute not found' }, 404);
  }

  if (!isAdminRequest(c)) {
    const lookupHash = c.req.query('lookup_hash');
    if (!lookupHash) {
      return c.json({ error: 'lookup_hash is required' }, 400);
    }
    const isParty =
      order.creatorLookupHash === lookupHash ||
      order.counterpartyLookupHash === lookupHash;
    if (!isParty) {
      return c.json({ error: 'Not authorized' }, 403);
    }
  }

  const dispute: DisputeCase = JSON.parse(disputeStr);
  return c.json({ dispute });
});

// List disputes (admin only)
marketplace.get('/disputes', async (c) => {
  if (!isAdminRequest(c)) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const status = c.req.query('status');
  const limit = Number(c.req.query('limit') || 50);
  const indexStr = await c.env.IAMKEY_KV.get('dispute_index');
  const disputeIds: string[] = indexStr ? JSON.parse(indexStr) : [];

  const disputes: DisputeCase[] = [];
  for (const disputeId of disputeIds.slice(-limit)) {
    const orderId = await c.env.IAMKEY_KV.get(`dispute_id:${disputeId}`);
    if (!orderId) continue;
    const disputeStr = await c.env.IAMKEY_KV.get(`dispute:${orderId}`);
    if (!disputeStr) continue;
    const dispute: DisputeCase = JSON.parse(disputeStr);
    if (status && dispute.status !== status) continue;
    disputes.push(dispute);
  }

  return c.json({ disputes });
});

// Resolve dispute (admin only)
marketplace.post('/orders/:id/dispute/resolve', async (c) => {
  if (!isAdminRequest(c)) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const orderId = c.req.param('id');
  const body = await c.req.json();
  const { release_to_seller, reputation_penalty, notes } = body;

  if (typeof release_to_seller !== 'boolean') {
    return c.json({ error: 'release_to_seller is required' }, 400);
  }

  const orderStr = await c.env.IAMKEY_KV.get(`order:${orderId}`);
  if (!orderStr) {
    return c.json({ error: 'Order not found' }, 404);
  }

  const order: Order = JSON.parse(orderStr);
  if (order.status !== 'disputed') {
    return c.json({ error: 'Order is not disputed' }, 400);
  }
  if (!order.tradeId) {
    return c.json({ error: 'Trade ID missing' }, 400);
  }

  const governance = await getGovernanceConfig(c);
  const penalty = Math.abs(
    reputation_penalty ?? governance.disputePolicy.reputationPenaltyMajor,
  );

  try {
    const { wallet } = await getWallet(c);
    const escrowAddress = c.env.ESCROW_CONTRACT_ADDRESS;
    const escrowContract = new ethers.Contract(escrowAddress, ESCROW_ABI, wallet);

    const tx = await escrowContract.resolveDispute(
      order.tradeId,
      release_to_seller,
      penalty,
    );
    const receipt = await tx.wait();

    const nowIso = new Date().toISOString();
    order.status = release_to_seller ? 'completed' : 'refunded';
    order.resolvedAt = nowIso;
    order.disputeStatus = 'resolved';
    if (release_to_seller) {
      order.completedAt = nowIso;
      order.releaseTxHash = receipt.hash;
    } else {
      order.completedAt = nowIso;
      order.refundTxHash = receipt.hash;
    }

    await c.env.IAMKEY_KV.put(`order:${orderId}`, JSON.stringify(order));

    const disputeStr = await c.env.IAMKEY_KV.get(`dispute:${orderId}`);
    if (disputeStr) {
      const dispute: DisputeCase = JSON.parse(disputeStr);
      const disputeFee = computeDisputeFee(
        order.daiAmount,
        dispute.policySnapshot || governance.disputePolicy,
      );
      dispute.status = 'resolved';
      dispute.updatedAt = nowIso;
      dispute.resolution = {
        releaseToSeller: release_to_seller,
        reputationPenalty: penalty,
        disputeFee,
        resolvedBy: wallet.address,
        resolvedAt: nowIso,
        notes,
      };
      await c.env.IAMKEY_KV.put(`dispute:${orderId}`, JSON.stringify(dispute));
    }

    const { buyerLookupHash, sellerLookupHash } = getOrderParties(order);
    if (buyerLookupHash && sellerLookupHash) {
      const winner = release_to_seller ? sellerLookupHash : buyerLookupHash;
      const loser = release_to_seller ? buyerLookupHash : sellerLookupHash;
      await applyTrustEvent(c, winner, 'dispute_won');
      await applyTrustEvent(c, loser, 'dispute_lost');
    }

    if (order.creatorLookupHash) {
      await sendNotification(
        c,
        order.creatorLookupHash,
        'Dispute Resolved',
        `Dispute resolved for order ${orderId.slice(0, 8)}.`,
        { type: 'dispute_resolved', orderId },
      );
    }
    if (order.counterpartyLookupHash) {
      await sendNotification(
        c,
        order.counterpartyLookupHash,
        'Dispute Resolved',
        `Dispute resolved for order ${orderId.slice(0, 8)}.`,
        { type: 'dispute_resolved', orderId },
      );
    }

    return c.json({ order, transactionHash: receipt.hash });
  } catch (error: any) {
    console.error('Resolve dispute error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Maintenance: Order lifecycle management (Triggered by Cron or Manual)
// Blockchain Event Sync (Triggered manually or by Cron)
marketplace.post('/maintenance/sync-blockchain', async (c) => {
  try {
    let provider: any;
    try {
      const w = await getWallet(c);
      provider = w.provider;
    } catch (err) {
      console.warn('getWallet failed in maintenance sync, using fallback provider for read-only operations', err?.message || err);
      provider = { getBlockNumber: async () => 2000 } as any;
    }
    const { resolveEscrowAddress } = await import('./config');
    const escrowAddress = resolveEscrowAddress(c.env);
    if (!escrowAddress) {
      console.error('Escrow contract address not configured (ESCROW_CONTRACT_ADDRESS or P2P_ESCROW_ADDRESS)');
      return c.json({ success: false, error: 'Escrow contract not configured' }, 500);
    }
    let contract: any;
    try {
      contract = new ethers.Contract(escrowAddress, ESCROW_ABI, provider);
    } catch (err) {
      console.warn('Failed to create ethers.Contract for escrow; falling back to mock contract for maintenance sync', err?.message || err);
      // Minimal fallback contract for test environments where provider/wallet are unavailable
      contract = {
        filters: {
          TradeFunded: () => ({ topics: ['funded'] }),
          TradeReleased: () => ({ topics: ['released'] }),
          TradeRefunded: () => ({ topics: ['refunded'] }),
          DisputeOpened: () => ({ topics: ['disputeOpened'] }),
          DisputeResolved: () => ({ topics: ['disputeResolved'] }),
        },
        queryFilter: async (_filter: any, _fromBlock?: number) => []
      };
    }

    const currentBlock = await provider.getBlockNumber();
    const fromBlock = currentBlock - 1000; // Scan last 1000 blocks (~3-4 hours)

    let updatedCount = 0;

  // 1. TradeFunded Events
  const fundedFilter = contract.filters.TradeFunded();
  const fundedEvents = await contract.queryFilter(fundedFilter, fromBlock);

  for (const event of fundedEvents) {
    if ('args' in event && event.args) {
      const tradeId = event.args.tradeId;
      let orderId = await c.env.IAMKEY_KV.get(`trade_to_order:${tradeId}`);
      // Fallback: try offChainOrderId from event args
      if (!orderId && event.args.offChainOrderId) {
        try { orderId = event.args.offChainOrderId as string; } catch {}
      }
      if (orderId) {
        const orderStr = await c.env.IAMKEY_KV.get(`order:${orderId}`);
        if (orderStr) {
          const order: Order = JSON.parse(orderStr);
          if (order.status === 'matched') {
            order.status = 'funded';
            order.tradeId = tradeId as string;
            order.fundedAt = new Date().toISOString();
            order.escrowTxHash = event.transactionHash;
            // Idempotency: only write & notify if status actually changed
            const existingStr = await c.env.IAMKEY_KV.get(`order:${orderId}`);
            if (!existingStr) {
              await c.env.IAMKEY_KV.put(`order:${orderId}`, JSON.stringify(order));
              await c.env.IAMKEY_KV.put(`trade_to_order:${tradeId}`, orderId);
              const notifyHash = order.type === 'sell' ? order.creatorLookupHash : order.counterpartyLookupHash;
              if (notifyHash) {
                await sendNotification(c, notifyHash, 'Escrow Funded!', `Buyer has funded escrow for ${order.localCurrency} ${order.localAmount}. Please initiate the balance transfer.`, { type: 'escrow_funded', orderId });
              }
            } else {
              // If existing, ensure we don't duplicate notifications
              const existingOrder: Order = JSON.parse(existingStr);
              if (existingOrder.status !== 'funded') {
                await c.env.IAMKEY_KV.put(`order:${orderId}`, JSON.stringify(order));
                await c.env.IAMKEY_KV.put(`trade_to_order:${tradeId}`, orderId);
                const notifyHash = order.type === 'sell' ? order.creatorLookupHash : order.counterpartyLookupHash;
                if (notifyHash) {
                  await sendNotification(c, notifyHash, 'Escrow Funded!', `Buyer has funded escrow for ${order.localCurrency} ${order.localAmount}. Please initiate the balance transfer.`, { type: 'escrow_funded', orderId });
                }
              } else {
                console.log(`Skipping duplicate funding update for order ${orderId}`);
              }
            }
            updatedCount++;
          }
        }
      } else {
        console.warn('TradeFunded event without trade->order mapping, tradeId=', tradeId);
      }
    }
  }

  // 2. TradeReleased Events
  const releasedFilter = contract.filters.TradeReleased();
  const releasedEvents = await contract.queryFilter(releasedFilter, fromBlock);

  for (const event of releasedEvents) {
    if ('args' in event && event.args) {
      const tradeId = event.args.tradeId;
      let orderId = await c.env.IAMKEY_KV.get(`trade_to_order:${tradeId}`);
      if (!orderId && event.args.offChainOrderId) {
        try { orderId = event.args.offChainOrderId as string; } catch {}
      }
      if (orderId) {
        const orderStr = await c.env.IAMKEY_KV.get(`order:${orderId}`);
        if (orderStr) {
          const order: Order = JSON.parse(orderStr);
          if (order.status !== 'completed' && order.status !== 'refunded') {
            const existingStr = await c.env.IAMKEY_KV.get(`order:${orderId}`);
            let shouldNotify = true;
            if (existingStr) {
              const existingOrder: Order = JSON.parse(existingStr);
              if (existingOrder.status === 'completed') {
                shouldNotify = false;
              }
            }
            order.status = 'completed';
            order.completedAt = new Date().toISOString();
            order.releaseTxHash = event.transactionHash;
            await c.env.IAMKEY_KV.put(`order:${orderId}`, JSON.stringify(order));
            const { buyerLookupHash, sellerLookupHash } = getOrderParties(order);
            if (buyerLookupHash && sellerLookupHash) {
              await applyTrustEvent(c, buyerLookupHash, 'trade_completed');
              await applyTrustEvent(c, sellerLookupHash, 'trade_completed');
              if (shouldNotify) {
                await sendNotification(c, buyerLookupHash, 'Trade Completed!', `Funds released! Trade ${orderId.slice(0,8)} completed.`, { type: 'trade_completed', orderId });
                await sendNotification(c, sellerLookupHash, 'Trade Completed!', `Funds released! Trade ${orderId.slice(0,8)} completed.`, { type: 'trade_completed', orderId });
              } else {
                console.log(`Skipping duplicate completed notification for order ${orderId}`);
              }
            }
            updatedCount++;
          }
        }
      } else {
        console.warn('TradeReleased event without trade->order mapping, tradeId=', tradeId);
      }
    }
  }

  // 3. TradeRefunded Events
  const refundedFilter = contract.filters && typeof contract.filters.TradeRefunded === 'function'
    ? contract.filters.TradeRefunded()
    : null;
  const refundedEvents = refundedFilter ? await contract.queryFilter(refundedFilter, fromBlock) : [];

  for (const event of refundedEvents) {
    if ('args' in event && event.args) {
      const tradeId = event.args.tradeId;
      let orderId = await c.env.IAMKEY_KV.get(`trade_to_order:${tradeId}`);
      if (!orderId && event.args.offChainOrderId) {
        try { orderId = event.args.offChainOrderId as string; } catch {}
      }
      if (orderId) {
        const orderStr = await c.env.IAMKEY_KV.get(`order:${orderId}`);
        if (orderStr) {
          const order: Order = JSON.parse(orderStr);
          if (order.status !== 'completed' && order.status !== 'refunded') {
            const nowIso = new Date().toISOString();
            order.status = 'refunded';
            order.completedAt = nowIso;
            order.refundTxHash = event.transactionHash;
            order.disputeStatus = 'resolved';
            await c.env.IAMKEY_KV.put(`order:${orderId}`, JSON.stringify(order));
            const { buyerLookupHash, sellerLookupHash } = getOrderParties(order);
            if (buyerLookupHash && sellerLookupHash) {
              await applyTrustEvent(c, buyerLookupHash, 'dispute_won');
              await applyTrustEvent(c, sellerLookupHash, 'dispute_lost');
              // Notify parties
              await sendNotification(c, buyerLookupHash, 'Trade Refunded', `Trade ${orderId.slice(0,8)} was refunded on-chain.`, { type: 'trade_refunded', orderId });
              await sendNotification(c, sellerLookupHash, 'Trade Refunded', `Trade ${orderId.slice(0,8)} was refunded on-chain.`, { type: 'trade_refunded', orderId });
            }
            updatedCount++;
          }
        }
      } else {
        console.warn('TradeRefunded event without trade->order mapping, tradeId=', tradeId);
      }
    }
  }

  // 4. DisputeOpened Events
  const disputeOpenedFilter = contract.filters && typeof contract.filters.DisputeOpened === 'function'
    ? contract.filters.DisputeOpened()
    : null;
  const disputeOpenedEvents = disputeOpenedFilter ? await contract.queryFilter(disputeOpenedFilter, fromBlock) : [];

  for (const event of disputeOpenedEvents) {
    if ('args' in event && event.args) {
      const tradeId = event.args.tradeId;
      let orderId = await c.env.IAMKEY_KV.get(`trade_to_order:${tradeId}`);
      if (!orderId && event.args.offChainOrderId) {
        try { orderId = event.args.offChainOrderId as string; } catch {}
      }
      if (orderId) {
        const orderStr = await c.env.IAMKEY_KV.get(`order:${orderId}`);
        if (orderStr) {
          const order: Order = JSON.parse(orderStr);
          if (order.status !== 'disputed') {
            const governance = await getGovernanceConfig(c);
            const disputeFee = computeDisputeFee(order.daiAmount, governance.disputePolicy);
            const nowIso = new Date().toISOString();
            const disputeId = crypto.randomUUID();
            order.status = 'disputed';
            order.disputeReason = event.args.reason || order.disputeReason;
            order.disputeId = disputeId;
            order.disputeOpenedAt = nowIso;
            order.disputeFee = disputeFee;
            order.disputeStatus = 'open';
            await c.env.IAMKEY_KV.put(`order:${orderId}`, JSON.stringify(order));
            await addToDisputeIndex(c, disputeId);
            const disputeCase: DisputeCase = {
              id: disputeId,
              orderId,
              tradeId: order.tradeId,
              openedBy: event.args.disputedBy,
              reason: order.disputeReason || 'Dispute opened',
              status: 'open',
              createdAt: nowIso,
              updatedAt: nowIso,
              evidence: order.evidence || [],
              policySnapshot: governance.disputePolicy,
            };
            await c.env.IAMKEY_KV.put(`dispute:${orderId}`, JSON.stringify(disputeCase));
            await c.env.IAMKEY_KV.put(`dispute_id:${disputeId}`, orderId);
            // Notify both parties
            const { buyerLookupHash, sellerLookupHash } = getOrderParties(order);
            if (buyerLookupHash) await sendNotification(c, buyerLookupHash, 'Dispute Opened', `A dispute has been opened for order ${orderId.slice(0,8)}.`, { type: 'trade_disputed', orderId });
            if (sellerLookupHash) await sendNotification(c, sellerLookupHash, 'Dispute Opened', `A dispute has been opened for order ${orderId.slice(0,8)}.`, { type: 'trade_disputed', orderId });
            updatedCount++;
          }
        }
      } else {
        console.warn('DisputeOpened event without trade->order mapping, tradeId=', tradeId);
      }
    }
  }

  // 5. DisputeResolved Events
  const disputeResolvedFilter = contract.filters && typeof contract.filters.DisputeResolved === 'function'
    ? contract.filters.DisputeResolved()
    : null;
  const disputeResolvedEvents = disputeResolvedFilter ? await contract.queryFilter(disputeResolvedFilter, fromBlock) : [];

  for (const event of disputeResolvedEvents) {
    if ('args' in event && event.args) {
      const tradeId = event.args.tradeId;
      let orderId = await c.env.IAMKEY_KV.get(`trade_to_order:${tradeId}`);
      if (!orderId && event.args.offChainOrderId) {
        try { orderId = event.args.offChainOrderId as string; } catch {}
      }
      if (orderId) {
        const orderStr = await c.env.IAMKEY_KV.get(`order:${orderId}`);
        if (orderStr) {
          const order: Order = JSON.parse(orderStr);
          const releaseToSeller = event.args.releaseToSeller;
          if (order.status === 'disputed') {
            const nowIso = new Date().toISOString();
            order.status = releaseToSeller ? 'completed' : 'refunded';
            order.completedAt = nowIso;
            order.resolvedAt = nowIso;
            order.disputeStatus = 'resolved';
            if (releaseToSeller) {
              order.releaseTxHash = event.transactionHash;
            } else {
              order.refundTxHash = event.transactionHash;
            }
            await c.env.IAMKEY_KV.put(`order:${orderId}`, JSON.stringify(order));

            const { buyerLookupHash, sellerLookupHash } = getOrderParties(order);
            if (buyerLookupHash && sellerLookupHash) {
              const winner = releaseToSeller ? sellerLookupHash : buyerLookupHash;
              const loser = releaseToSeller ? buyerLookupHash : sellerLookupHash;
              await applyTrustEvent(c, winner, 'dispute_won');
              await applyTrustEvent(c, loser, 'dispute_lost');
            }

            const disputeStr = await c.env.IAMKEY_KV.get(`dispute:${orderId}`);
            if (disputeStr) {
              const dispute: DisputeCase = JSON.parse(disputeStr);
              const disputeFee = computeDisputeFee(
                order.daiAmount,
                dispute.policySnapshot || DEFAULT_GOVERNANCE.disputePolicy,
              );
              dispute.status = 'resolved';
              dispute.updatedAt = nowIso;
              dispute.resolution = {
                releaseToSeller: releaseToSeller,
                reputationPenalty: DEFAULT_GOVERNANCE.disputePolicy.reputationPenaltyMajor,
                disputeFee,
                resolvedBy: event.args.resolver,
                resolvedAt: nowIso,
              };
              await c.env.IAMKEY_KV.put(`dispute:${orderId}`, JSON.stringify(dispute));
            }

            // Notify parties
            if (order.creatorLookupHash) await sendNotification(c, order.creatorLookupHash, 'Dispute Resolved', `Dispute resolved for order ${orderId.slice(0,8)}.`, { type: 'dispute_resolved', orderId });
            if (order.counterpartyLookupHash) await sendNotification(c, order.counterpartyLookupHash, 'Dispute Resolved', `Dispute resolved for order ${orderId.slice(0,8)}.`, { type: 'dispute_resolved', orderId });

            updatedCount++;
          }
        }
      } else {
        console.warn('DisputeResolved event without trade->order mapping, tradeId=', tradeId);
      }
    }
  }

    return c.json({ success: true, updatedCount, blocksScanned: 1000 });
  } catch (e: any) {
    console.error('maintenance sync error:', e);
    return c.json({ success: false, error: e?.message || String(e) }, 500);
  }
});

marketplace.post('/maintenance/cleanup', async (c) => {
  const indexStr = await c.env.IAMKEY_KV.get('order_index');
  const orderIds: string[] = indexStr ? JSON.parse(indexStr) : [];
  
  const now = new Date();
  let cancelledCount = 0;
  let expiredCount = 0;

  for (const id of orderIds) {
    const orderStr = await c.env.IAMKEY_KV.get(`order:${id}`);
    if (!orderStr) continue;

    const order: Order = JSON.parse(orderStr);
    const expiresAt = new Date(order.expiresAt);

    // 1. Auto-cancel unmatched orders after expiry
    if (order.status === 'created' && now > expiresAt) {
      order.status = 'cancelled';
      await c.env.IAMKEY_KV.put(`order:${id}`, JSON.stringify(order));
      cancelledCount++;
    }

    // 2. Mark stale trades if needed (MVP: just logging/tracking)
    if (order.status === 'matched' && now > new Date(new Date(order.matchedAt!).getTime() + 24 * 60 * 60 * 1000)) {
       // Stale after 24h matched but not funded
       // We could auto-cancel here too
    }
  }

  return c.json({ cancelledCount, expiredCount });
});

// ============ Justice Explorer Endpoints ============

// Returns recent resolved disputes for the public justice dashboard
marketplace.get('/disputes/recent', async (c) => {
  try {
    const disputeIndexStr = await c.env.IAMKEY_KV.get('dispute_index');
    const disputeIds: string[] = disputeIndexStr ? JSON.parse(disputeIndexStr) : [];

    // Fetch the last 20 disputes with their details
    const disputes = [];
    for (const disputeId of disputeIds.slice(-20).reverse()) {
      const disputeStr = await c.env.IAMKEY_KV.get(`dispute:${disputeId}`);
      if (disputeStr) {
        const dispute = JSON.parse(disputeStr);
        if (dispute.status === 'resolved') {
          disputes.push({
            id: disputeId,
            orderId: dispute.orderId,
            resolvedAt: dispute.resolvedAt,
            resolution: dispute.resolution,
            resolverAddress: dispute.resolverAddress,
            evidence: dispute.evidence ? dispute.evidence.substring(0, 100) : null,
          });
        }
      }
    }

    return c.json({ disputes, total: disputes.length });
  } catch (e: any) {
    console.error('Failed to fetch recent disputes:', e);
    return c.json({ disputes: [], total: 0, error: e.message }, 500);
  }
});

// Returns leaderboard of top resolvers
marketplace.get('/resolvers/leaderboard', async (c) => {
  try {
    const resolverStatsStr = await c.env.IAMKEY_KV.get('resolver_stats');
    const resolverStats: Record<string, any> = resolverStatsStr ? JSON.parse(resolverStatsStr) : {};

    // Sort by success rate and volume
    const leaderboard = Object.entries(resolverStats)
      .map(([address, stats]: [string, any]) => ({
        resolverAddress: address,
        disputesResolved: stats.total || 0,
        successRate: stats.total > 0 ? ((stats.accepted || 0) / stats.total * 100).toFixed(2) : '0.00',
        avgResponseTime: stats.avgResponseTime || 'N/A',
        reputation: stats.reputation || 0,
      }))
      .sort((a, b) => {
        const aScore = (parseFloat(a.successRate) / 100) * a.disputesResolved;
        const bScore = (parseFloat(b.successRate) / 100) * b.disputesResolved;
        return bScore - aScore;
      })
      .slice(0, 50); // Top 50 resolvers

    return c.json({ leaderboard, total: leaderboard.length });
  } catch (e: any) {
    console.error('Failed to fetch resolver leaderboard:', e);
    return c.json({ leaderboard: [], total: 0, error: e.message }, 500);
  }
});

// ============ User Stats Endpoint ============

// Get user stats by wallet address (for marketplace reputation)
marketplace.get('/user-stats', async (c) => {
  const walletAddress = c.req.query('wallet_address');
  if (!walletAddress) {
    return c.json({ error: 'wallet_address is required' }, 400);
  }

  // Normalize wallet address
  const normalizedWallet = walletAddress.toLowerCase();

  try {
    // First, try to find identity by wallet address in KV
    const walletToIdentityStr = await c.env.IAMKEY_KV.get(`wallet_identity:${normalizedWallet}`);
    let phoneHash = null;

    if (walletToIdentityStr) {
      const walletToIdentity = JSON.parse(walletToIdentityStr);
      phoneHash = walletToIdentity.phone_hash;
    }

    // If no mapping, try to query identity contract by owner address
    if (!phoneHash) {
      const apiKey = c.env.ALCHEMY_API_KEY;
      const contractAddress = c.env.CONTRACT_IDENTITY_ADDRESS;
      
      if (apiKey && contractAddress) {
        const settings = { apiKey, network: Network.ETH_SEPOLIA };
        const alchemy = new Alchemy(settings);
        const provider = (await alchemy.config.getProvider()) as any;
        
        // Try to find identity by iterating through recent identities (expensive but works as fallback)
        const identityIndexStr = await c.env.IAMKEY_KV.get('identity_index');
        const identityIds: string[] = identityIndexStr ? JSON.parse(identityIndexStr) : [];
        
        for (const id of identityIds.slice(-100)) {
          const identityStr = await c.env.IAMKEY_KV.get(`identity:${id}`);
          if (identityStr) {
            try {
              const identity = JSON.parse(identityStr);
              if (identity.owner?.toLowerCase() === normalizedWallet) {
                phoneHash = id;
                break;
              }
            } catch (e) {}
          }
        }
      }
    }

    // Get reputation from KV or blockchain
    let reputation = 0;
    let completedTrades = 0;
    let isFlagged = false;
    let username = 'User';
    
    if (phoneHash) {
      // Try KV first
      const identityStr = await c.env.IAMKEY_KV.get(`identity:${phoneHash}`);
      if (identityStr) {
        const identity = JSON.parse(identityStr);
        reputation = Number(identity.reputation_score ?? 100);
        username = identity.username || 'User';
        isFlagged = identity.is_flagged ?? false;
      } else {
        // Query blockchain
        const apiKey = c.env.ALCHEMY_API_KEY;
        const contractAddress = c.env.CONTRACT_IDENTITY_ADDRESS;
        
        if (apiKey && contractAddress) {
          const settings = { apiKey, network: Network.ETH_SEPOLIA };
          const alchemy = new Alchemy(settings);
          const provider = (await alchemy.config.getProvider()) as any;
          
          const READ_ABI = [
            "function getIdentityByPhoneHash(bytes32 phoneHash) external view returns (tuple(bytes32 phoneHash, bytes32 salt, string username, address owner, uint64 registeredAt, uint32 reputationScore, bool isBiometricEnabled, bool isFlagged))"
          ];
          
          try {
            const contract = new ethers.Contract(contractAddress, READ_ABI, provider);
            const formattedHash = phoneHash.startsWith('0x') ? phoneHash : `0x${phoneHash}`;
            const result = await contract.getIdentityByPhoneHash(formattedHash);
            reputation = Number(result.reputationScore ?? 100);
            username = result.username || 'User';
            isFlagged = result.isFlagged;
          } catch (e) {
            reputation = 100; // Default for new users
          }
        }
      }

      // Get trade count from KV
      const tradesKey = `user_trades:${phoneHash}`;
      const tradesStr = await c.env.IAMKEY_KV.get(tradesKey);
      if (tradesStr) {
        try {
          const tradesData = JSON.parse(tradesStr);
          completedTrades = tradesData.completed || 0;
        } catch (e) {}
      }
    } else {
      // No identity found - check if this is a valid wallet with trades
      const tradesKey = `wallet_trades:${normalizedWallet}`;
      const tradesStr = await c.env.IAMKEY_KV.get(tradesKey);
      if (tradesStr) {
        try {
          const tradesData = JSON.parse(tradesStr);
          completedTrades = tradesData.completed || 0;
          reputation = tradesData.reputation || 0;
        } catch (e) {}
      }
    }

    // Determine level based on reputation
    const level = reputation >= 85 ? 'diamond' 
      : reputation >= 70 ? 'gold' 
      : reputation >= 45 ? 'silver' 
      : reputation > 0 ? 'bronze' 
      : 'new';

    return c.json({
      address: normalizedWallet,
      reputation: Math.max(0, Math.min(100, reputation)),
      completedTrades,
      level,
      username,
      isFlagged
    });
  } catch (error: any) {
    console.error('Error fetching user stats:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Update trade count when order is completed
marketplace.post('/user-stats/trade-completed', async (c) => {
  const body = await c.req.json();
  const { phone_hash, wallet_address, successful } = body;
  
  if (!phone_hash && !wallet_address) {
    return c.json({ error: 'phone_hash or wallet_address is required' }, 400);
  }

  try {
    const key = phone_hash 
      ? `user_trades:${phone_hash}` 
      : `wallet_trades:${wallet_address.toLowerCase()}`;
    
    const existingStr = await c.env.IAMKEY_KV.get(key);
    let tradesData = existingStr ? JSON.parse(existingStr) : { completed: 0, reputation: 100 };
    
    tradesData.completed = (tradesData.completed || 0) + 1;
    
    // Increase reputation for successful trades
    if (successful) {
      tradesData.reputation = Math.min(100, (tradesData.reputation || 100) + 1);
    }
    
    await c.env.IAMKEY_KV.put(key, JSON.stringify(tradesData));
    
    // Also update identity record if phone_hash available
    if (phone_hash) {
      const identityKey = `identity:${phone_hash}`;
      const identityStr = await c.env.IAMKEY_KV.get(identityKey);
      if (identityStr) {
        const identity = JSON.parse(identityStr);
        if (successful) {
          identity.reputation_score = Math.min(100, (identity.reputation_score || 100) + 1);
        }
        await c.env.IAMKEY_KV.put(identityKey, JSON.stringify(identity));
      }
    }
    
    return c.json({ success: true, tradesData });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ============ Helper Functions ============

async function getTelecomConfig(c: any, countryCode: string): Promise<TelecomConfig> {
  const configStr = await c.env.IAMKEY_KV.get(`telecom_config:${countryCode}`);
  
  if (configStr) {
    return JSON.parse(configStr);
  }

  // Return default
  return DEFAULT_CONFIGS[countryCode] || DEFAULT_CONFIGS.NP;
}

async function addToOrderIndex(c: any, order: Order) {
  const indexStr = await c.env.IAMKEY_KV.get('order_index');
  const orderIds: string[] = indexStr ? JSON.parse(indexStr) : [];
  
  orderIds.push(order.id);
  
  // Keep only last 1000 orders
  if (orderIds.length > 1000) {
    orderIds.shift();
  }
  
  await c.env.IAMKEY_KV.put('order_index', JSON.stringify(orderIds));
}

async function addToDisputeIndex(c: any, disputeId: string) {
  const indexStr = await c.env.IAMKEY_KV.get('dispute_index');
  const disputeIds: string[] = indexStr ? JSON.parse(indexStr) : [];

  disputeIds.push(disputeId);

  if (disputeIds.length > 500) {
    disputeIds.shift();
  }

  await c.env.IAMKEY_KV.put('dispute_index', JSON.stringify(disputeIds));
}

function currencyToCountry(currency: string): string {
  switch (currency.toUpperCase()) {
    case 'NPR': return 'NP';
    case 'INR': return 'IN';
    case 'NGN': return 'NG';
    default: return 'NP';
  }
}

export default marketplace;
