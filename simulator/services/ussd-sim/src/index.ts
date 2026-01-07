/**
 * USSD Simulator - Virtual Telecom Network
 * 
 * Simulates mobile balance check and transfer operations
 * for IAMKey P2P marketplace testing.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());
// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://simulator:simulator@localhost:5432/simulator',
});

// Chaos config state
let chaosConfig = { latencyMs: 0, errorRate: 0 };
const SIM_CONTROL_URL = process.env.SIM_CONTROL_URL || 'http://sim-control:4003';

// Periodically sync chaos config
async function syncChaos() {
  try {
    const res = await fetch(`${SIM_CONTROL_URL}/chaos/check`);
    if (res.ok) {
      chaosConfig = (await res.json()) as { latencyMs: number; errorRate: number };
    }
  } catch (err) {
    // console.error('Failed to sync chaos config');
  }
}
setInterval(syncChaos, 5000);

// Chaos Middleware
const chaosMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // 1. Simulate Latency
  if (chaosConfig.latencyMs > 0) {
    await new Promise(resolve => setTimeout(resolve, chaosConfig.latencyMs));
  }

  // 2. Simulate Random Errors
  if (chaosConfig.errorRate > 0 && Math.random() < chaosConfig.errorRate) {
    return res.status(500).json({ 
      error: 'Chaos Injection: Simulated service error',
      simulated: true 
    });
  }

  next();
};

app.use(chaosMiddleware);

// =============================================================================
// TYPES
// =============================================================================

interface VirtualPhone {
  id: string;
  phone_number: string;
  provider: string;
  country_code: string;
  balance: number;
  currency: string;
  user_id: string | null;
  pin: string;
  is_active: boolean;
}

interface USSDTransaction {
  id: string;
  phone_number: string;
  type: 'balance_check' | 'transfer_out' | 'transfer_in' | 'topup';
  amount: number | null;
  counterparty: string | null;
  ussd_code: string;
  response_text: string;
  created_at: Date;
}

interface DialRequest {
  phone_number: string;
  ussd_code: string;
  pin?: string;
}

interface DialResponse {
  success: boolean;
  response_text: string;
  session_id?: string;
  balance?: number;
  transaction_id?: string;
}

// =============================================================================
// PROVIDER CONFIGURATIONS
// =============================================================================

interface ProviderConfig {
  code: string;
  name: string;
  country_code: string;
  currency: string;
  balance_check_pattern: RegExp;
  transfer_pattern: RegExp;
  balance_response_template: string;
  transfer_success_template: string;
  transfer_fail_template: string;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  NTC: {
    code: 'NTC',
    name: 'Nepal Telecom',
    country_code: 'NP',
    currency: 'NPR',
    balance_check_pattern: /^\*400#$/,
    transfer_pattern: /^\*422\*(\d+)\*(\d+)#$/,
    balance_response_template: 'Your balance is Rs. {balance}. Thank you for using NTC.',
    transfer_success_template: 'Rs. {amount} transferred to {recipient}. New balance: Rs. {balance}',
    transfer_fail_template: 'Transfer failed: {reason}',
  },
  NCELL: {
    code: 'NCELL',
    name: 'Ncell',
    country_code: 'NP',
    currency: 'NPR',
    balance_check_pattern: /^\*101#$/,
    transfer_pattern: /^\*17122\*(\d+)\*(\d+)#$/,
    balance_response_template: 'Ncell Balance: Rs. {balance}',
    transfer_success_template: 'Transferred Rs. {amount} to {recipient}. Balance: Rs. {balance}',
    transfer_fail_template: 'Transfer failed: {reason}',
  },
  MTN: {
    code: 'MTN',
    name: 'MTN Nigeria',
    country_code: 'NG',
    currency: 'NGN',
    balance_check_pattern: /^\*310#$/,
    transfer_pattern: /^\*321\*(\d+)\*(\d+)\*\d{4}#$/,
    balance_response_template: 'Your MTN balance is NGN {balance}',
    transfer_success_template: 'NGN {amount} sent to {recipient}. Balance: NGN {balance}',
    transfer_fail_template: 'Transfer failed: {reason}',
  },
  AIRTEL_NG: {
    code: 'AIRTEL_NG',
    name: 'Airtel Nigeria',
    country_code: 'NG',
    currency: 'NGN',
    balance_check_pattern: /^\*310#$/,
    transfer_pattern: /^\*432\*(\d+)\*(\d+)#$/,
    balance_response_template: 'Airtel Balance: NGN {balance}',
    transfer_success_template: 'NGN {amount} transferred to {recipient}. Balance: NGN {balance}',
    transfer_fail_template: 'Transfer failed: {reason}',
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function getPhone(phoneNumber: string): Promise<VirtualPhone | null> {
  const result = await pool.query(
    'SELECT * FROM virtual_phones WHERE phone_number = $1',
    [phoneNumber]
  );
  return result.rows[0] || null;
}

async function updateBalance(phoneNumber: string, newBalance: number): Promise<void> {
  await pool.query(
    'UPDATE virtual_phones SET balance = $1, updated_at = NOW() WHERE phone_number = $2',
    [newBalance, phoneNumber]
  );
}

async function logTransaction(
  phoneNumber: string,
  type: string,
  amount: number | null,
  counterparty: string | null,
  ussdCode: string,
  responseText: string
): Promise<string> {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO ussd_transactions (id, phone_number, type, amount, counterparty, ussd_code, response_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, phoneNumber, type, amount, counterparty, ussdCode, responseText]
  );
  return id;
}

function formatResponse(template: string, vars: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(`{${key}}`, String(value));
  }
  return result;
}

// =============================================================================
// USSD DIAL ENDPOINT
// =============================================================================

app.post('/ussd/dial', async (req: Request, res: Response) => {
  const { phone_number, ussd_code, pin }: DialRequest = req.body;

  if (!phone_number || !ussd_code) {
    return res.status(400).json({ success: false, response_text: 'Missing phone_number or ussd_code' });
  }

  const phone = await getPhone(phone_number);
  if (!phone) {
    return res.status(404).json({ success: false, response_text: 'Phone number not registered' });
  }

  if (!phone.is_active) {
    return res.status(403).json({ success: false, response_text: 'Phone is deactivated' });
  }

  const provider = PROVIDERS[phone.provider];
  if (!provider) {
    return res.status(500).json({ success: false, response_text: 'Unknown provider' });
  }

  // Check for balance inquiry
  if (provider.balance_check_pattern.test(ussd_code)) {
    const responseText = formatResponse(provider.balance_response_template, {
      balance: phone.balance.toFixed(2),
    });

    const txId = await logTransaction(
      phone_number,
      'balance_check',
      null,
      null,
      ussd_code,
      responseText
    );

    return res.json({
      success: true,
      response_text: responseText,
      balance: phone.balance,
      transaction_id: txId,
    });
  }

  // Check for transfer
  const transferMatch = ussd_code.match(provider.transfer_pattern);
  if (transferMatch) {
    const amount = parseFloat(transferMatch[1]);
    const recipient = transferMatch[2];

    // Validate PIN if provided/required
    if (pin && pin !== phone.pin) {
      return res.status(401).json({
        success: false,
        response_text: formatResponse(provider.transfer_fail_template, { reason: 'Invalid PIN' }),
      });
    }

    // Check sufficient balance
    if (phone.balance < amount) {
      const responseText = formatResponse(provider.transfer_fail_template, {
        reason: 'Insufficient balance',
      });
      await logTransaction(phone_number, 'transfer_out', amount, recipient, ussd_code, responseText);
      return res.status(400).json({ success: false, response_text: responseText });
    }

    // Find recipient phone
    const recipientPhone = await getPhone(recipient.startsWith('+') ? recipient : `+${recipient}`);
    
    // Debit sender
    const newBalance = phone.balance - amount;
    await updateBalance(phone_number, newBalance);

    // Credit recipient if exists in simulator
    if (recipientPhone && recipientPhone.provider === phone.provider) {
      await updateBalance(recipientPhone.phone_number, recipientPhone.balance + amount);
      await logTransaction(
        recipientPhone.phone_number,
        'transfer_in',
        amount,
        phone_number,
        '',
        `Received ${phone.currency} ${amount} from ${phone_number}`
      );
    }

    const responseText = formatResponse(provider.transfer_success_template, {
      amount: amount.toFixed(2),
      recipient,
      balance: newBalance.toFixed(2),
    });

    const txId = await logTransaction(
      phone_number,
      'transfer_out',
      amount,
      recipient,
      ussd_code,
      responseText
    );

    return res.json({
      success: true,
      response_text: responseText,
      balance: newBalance,
      transaction_id: txId,
    });
  }

  // Unknown USSD code
  return res.status(400).json({
    success: false,
    response_text: 'Invalid USSD code. Please check and try again.',
  });
});

// =============================================================================
// PHONE MANAGEMENT ENDPOINTS
// =============================================================================

// List all virtual phones
app.get('/ussd/phones', async (_req: Request, res: Response) => {
  const result = await pool.query(
    'SELECT id, phone_number, provider, country_code, balance, currency, user_id, is_active, created_at FROM virtual_phones ORDER BY phone_number'
  );
  res.json({ phones: result.rows });
});

// Get single phone
app.get('/ussd/phones/:phone', async (req: Request, res: Response) => {
  const phone = await getPhone(req.params.phone);
  if (!phone) {
    return res.status(404).json({ error: 'Phone not found' });
  }
  // Don't expose PIN
  const { pin, ...safePhone } = phone;
  res.json({ phone: safePhone });
});

// Create new virtual phone
app.post('/ussd/phones', async (req: Request, res: Response) => {
  const { phone_number, provider, country_code, balance = 0, currency, user_id, pin = '1234' } = req.body;

  if (!phone_number || !provider || !country_code || !currency) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const id = uuidv4();
  await pool.query(
    `INSERT INTO virtual_phones (id, phone_number, provider, country_code, balance, currency, user_id, pin)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, phone_number, provider, country_code, balance, currency, user_id, pin]
  );

  res.status(201).json({
    phone: { id, phone_number, provider, country_code, balance, currency, user_id, is_active: true },
  });
});

// Admin: Top up balance
app.post('/ussd/topup', async (req: Request, res: Response) => {
  const { phone_number, amount } = req.body;

  if (!phone_number || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid phone_number or amount' });
  }

  const phone = await getPhone(phone_number);
  if (!phone) {
    return res.status(404).json({ error: 'Phone not found' });
  }

  const newBalance = phone.balance + amount;
  await updateBalance(phone_number, newBalance);

  await logTransaction(
    phone_number,
    'topup',
    amount,
    null,
    '',
    `Admin top-up: ${phone.currency} ${amount}`
  );

  res.json({ success: true, new_balance: newBalance });
});

// Get transaction history
app.get('/ussd/transactions/:phone', async (req: Request, res: Response) => {
  const result = await pool.query(
    'SELECT * FROM ussd_transactions WHERE phone_number = $1 ORDER BY created_at DESC LIMIT 100',
    [req.params.phone]
  );
  res.json({ transactions: result.rows });
});

// =============================================================================
// BALANCE PROOF ENDPOINTS (For Marketplace Integration)
// =============================================================================

app.post('/ussd/balance-proof', async (req: Request, res: Response) => {
  const { order_id, phone_number, balance_before, balance_after } = req.body;

  if (!order_id || !phone_number || balance_before === undefined || balance_after === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const delta = balance_before - balance_after;
  const id = uuidv4();

  await pool.query(
    `INSERT INTO balance_proofs (id, order_id, phone_number, balance_before, balance_after, delta)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, order_id, phone_number, balance_before, balance_after, delta]
  );

  res.status(201).json({
    proof: { id, order_id, phone_number, balance_before, balance_after, delta, verified: false },
  });
});

app.get('/ussd/balance-proof/:order_id', async (req: Request, res: Response) => {
  const result = await pool.query(
    'SELECT * FROM balance_proofs WHERE order_id = $1',
    [req.params.order_id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Proof not found' });
  }

  res.json({ proof: result.rows[0] });
});

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', service: 'ussd-sim', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: String(error) });
  }
});

// =============================================================================
// START SERVER
// =============================================================================

const PORT = parseInt(process.env.PORT || '4000', 10);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 USSD Simulator running on http://0.0.0.0:${PORT}`);
  console.log(`   Supported providers: ${Object.keys(PROVIDERS).join(', ')}`);
});

export default app;
