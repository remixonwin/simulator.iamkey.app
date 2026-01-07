/// <reference types="@cloudflare/workers-types" />
import { Hono, Context } from 'hono';
import { ethers } from 'ethers';

type WalletBindings = {
  IAMKEY_KV: KVNamespace;
};

interface WalletRecord {
  lookupHash: string;
  address: string;
  balanceWei: string;
  createdAt: string;
  transactions: WalletTransactionRecord[];
}

interface WalletTransactionRecord {
  id: string;
  from: string;
  to: string;
  amount: string;
  value: string;
  type: 'send' | 'receive' | 'deposit';
  status: 'pending' | 'completed' | 'failed';
  txHash?: string;
  note?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

const walletRouter = new Hono<{ Bindings: WalletBindings }>();

const DEFAULT_BALANCE_WEI = ethers.parseEther('50');

walletRouter.post('/create-account', async (c) => {
  try {
    const body = await c.req.json();
    const lookupHash = normalizeLookup(body?.lookup_hash);
    if (!lookupHash) {
      return c.json({ error: 'Missing lookup_hash' }, 400);
    }

    const record = await fetchWallet(c, lookupHash);
    const account = buildAccountResponse(record);
    return c.json({ account });
  } catch (error: any) {
    console.error('[SIMULATOR][WALLET] create-account error', error);
    return c.json({ error: error.message }, 500);
  }
});

walletRouter.get('/balance', async (c) => {
  try {
    const lookupHash = normalizeLookup(c.req.query('lookup_hash'));
    if (!lookupHash) {
      return c.json({ error: 'Missing lookup_hash' }, 400);
    }

    const record = await fetchWallet(c, lookupHash);
    if (!record) {
      return c.json({ error: 'Account not found' }, 404);
    }

    return c.json(buildAccountResponse(record));
  } catch (error: any) {
    console.error('[SIMULATOR][WALLET] balance error', error);
    return c.json({ error: error.message }, 500);
  }
});

walletRouter.post('/send', async (c) => {
  try {
    const body = await c.req.json();
    const lookupHash = normalizeLookup(body?.lookup_hash);
  const recipient = (body?.to ?? '').toString().trim();
  const amount = (body?.amount ?? '').toString().trim();
  const note = (body?.note ?? '').toString().trim();

  if (!lookupHash || isBlank(recipient)) {
      return c.json({ error: 'Missing lookup_hash or recipient' }, 400);
    }

  if (!isDecimalNumber(amount)) {
      return c.json({ error: 'Invalid amount' }, 400);
    }

    const record = await fetchWallet(c, lookupHash);
    if (!record) {
      return c.json({ error: 'Account not found' }, 404);
    }

    const valueWei = safelyParseEther(amount);
    if (valueWei === null) {
      return c.json({ error: 'Invalid amount format' }, 400);
    }

    const currentBalance = BigInt(record.balanceWei);
    if (valueWei > currentBalance) {
      return c.json({ error: 'Insufficient balance' }, 400);
    }

    record.balanceWei = (currentBalance - valueWei).toString();
    const transaction = buildTransaction({
      from: record.address,
      to: recipient,
      amount,
      valueWei,
      note: isBlank(note) ? undefined : note,
    });

    record.transactions.unshift(transaction);
    await storeWallet(c, record);

    return c.json({ transaction });
  } catch (error: any) {
    console.error('[SIMULATOR][WALLET] send error', error);
    return c.json({ error: error.message }, 500);
  }
});

walletRouter.get('/transactions', async (c) => {
  try {
    const lookupHash = normalizeLookup(c.req.query('lookup_hash'));
    if (!lookupHash) {
      return c.json({ error: 'Missing lookup_hash' }, 400);
    }

    const record = await fetchWallet(c, lookupHash);
    if (!record) {
      return c.json({ error: 'Account not found' }, 404);
    }

    return c.json({ transactions: record.transactions });
  } catch (error: any) {
    console.error('[SIMULATOR][WALLET] transactions error', error);
    return c.json({ error: error.message }, 500);
  }
});

walletRouter.get('/transaction/:txId', async (c) => {
  try {
    const lookupHash = normalizeLookup(c.req.query('lookup_hash'));
    const txId = c.req.param('txId');
    if (!lookupHash || !txId) {
      return c.json({ error: 'Missing lookup_hash or transaction id' }, 400);
    }

    const record = await fetchWallet(c, lookupHash);
    if (!record) {
      return c.json({ error: 'Account not found' }, 404);
    }

    const transaction = record.transactions.find((tx) => tx.id === txId);
    if (!transaction) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    return c.json({ transaction });
  } catch (error: any) {
    console.error('[SIMULATOR][WALLET] transaction error', error);
    return c.json({ error: error.message }, 500);
  }
});

export default walletRouter;

// ===========================================================================
// Helpers
// ===========================================================================

function normalizeLookup(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim().toLowerCase();
}

async function fetchWallet(
  c: Context<{ Bindings: WalletBindings }>,
  lookupHash: string,
): Promise<WalletRecord | null> {
  const existing = await c.env.IAMKEY_KV.get(getWalletKey(lookupHash));
  if (existing) {
    return JSON.parse(existing) as WalletRecord;
  }
  const record = createWalletRecord(lookupHash);
  await storeWallet(c, record);
  return record;
}

async function storeWallet(
  c: Context<{ Bindings: WalletBindings }>,
  record: WalletRecord,
) {
  await c.env.IAMKEY_KV.put(
    getWalletKey(record.lookupHash),
    JSON.stringify(record),
  );
}

function createWalletRecord(lookupHash: string): WalletRecord {
  const address = deriveAddress(lookupHash);
  const createdAt = new Date().toISOString();
  const initialTx = buildTransaction({
    from: address,
    to: address,
    amount: ethers.formatEther(DEFAULT_BALANCE_WEI),
    valueWei: DEFAULT_BALANCE_WEI,
    type: 'deposit',
    note: 'Initial balance',
  });

  return {
    lookupHash,
    address,
    balanceWei: DEFAULT_BALANCE_WEI.toString(),
    createdAt,
    transactions: [initialTx],
  };
}

function buildTransaction({
  from,
  to,
  amount,
  valueWei,
  note,
  type = 'send',
}: {
  from: string;
  to: string;
  amount: string;
  valueWei: bigint;
  note?: string;
  type?: 'send' | 'receive' | 'deposit';
}): WalletTransactionRecord {
  const createdAt = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    from,
    to,
    amount,
    value: valueWei.toString(),
    type,
    status: 'completed',
    txHash: `0x${crypto.randomUUID().replace(/-/g, '')}`,
    note,
    createdAt,
    completedAt: createdAt,
  };
}

function buildAccountResponse(record: WalletRecord) {
  return {
    address: record.address,
    lookupHash: record.lookupHash,
    balance: ethers.formatEther(record.balanceWei),
    balanceWei: record.balanceWei,
    createdAt: record.createdAt,
  };
}

function deriveAddress(lookupHash: string): string {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(lookupHash));
  const address = `0x${hash.slice(-40)}`;
  return ethers.getAddress(address);
}

function getWalletKey(lookupHash: string) {
  return `wallet:${lookupHash}`;
}

function safelyParseEther(value: string): bigint | null {
  try {
    return ethers.parseEther(value);
  } catch (_) {
    return null;
  }
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function isDecimalNumber(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value.trim());
}
