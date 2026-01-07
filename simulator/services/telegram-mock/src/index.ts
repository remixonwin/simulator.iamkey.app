/**
 * Mock Telegram Bot API
 * 
 * Simulates Telegram bot interactions for IAMKey verification flow.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

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
  } catch (err) {}
}
setInterval(syncChaos, 5000);

// Chaos Middleware
const chaosMiddleware = async (req: any, res: any, next: any) => {
  if (chaosConfig.latencyMs > 0) {
    await new Promise(resolve => setTimeout(resolve, chaosConfig.latencyMs));
  }
  if (chaosConfig.errorRate > 0 && Math.random() < chaosConfig.errorRate) {
    return res.status(500).json({ error: 'Simulated Chaos Error', simulated: true });
  }
  next();
};

const app = express();
app.use(cors());
app.use(express.json());
app.use(chaosMiddleware);

// Store pending verifications
interface Verification {
  id: string;
  phone_number: string;
  code: string;
  telegram_chat_id: string | null;
  status: 'pending' | 'sent' | 'verified' | 'expired';
  expires_at: Date;
  created_at: Date;
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// =============================================================================
// TELEGRAM BOT API SIMULATION
// =============================================================================

// Simulate /sendMessage (from backend to user)
app.post('/bot:token/sendMessage', async (req: Request, res: Response) => {
  const { chat_id, text, parse_mode } = req.body;

  console.log(`[TELEGRAM] Sending to ${chat_id}: ${text}`);

  // Store the message for dashboard visibility
  await pool.query(
    `INSERT INTO notifications (id, user_id, title, body, type, data)
     SELECT $1, id, 'Telegram Message', $2, 'telegram', $3
     FROM simulated_users WHERE telegram_id = $4`,
    [uuidv4(), text, JSON.stringify({ chat_id, parse_mode }), chat_id]
  );

  res.json({
    ok: true,
    result: {
      message_id: Math.floor(Math.random() * 1000000),
      chat: { id: chat_id },
      text,
      date: Math.floor(Date.now() / 1000),
    },
  });
});

// =============================================================================
// VERIFICATION FLOW
// =============================================================================

// Create verification request (called by backend)
app.post('/verification/create', async (req: Request, res: Response) => {
  const { phone_number, telegram_chat_id } = req.body;

  if (!phone_number) {
    return res.status(400).json({ error: 'phone_number is required' });
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  const id = uuidv4();
  await pool.query(
    `INSERT INTO telegram_verifications (id, phone_number, verification_code, telegram_chat_id, status, expires_at)
     VALUES ($1, $2, $3, $4, 'pending', $5)`,
    [id, phone_number, code, telegram_chat_id || null, expiresAt]
  );

  console.log(`[TELEGRAM] Verification code for ${phone_number}: ${code} (Token: ${id})`);

  res.json({
    success: true,
    message: 'Verification created',
    token: id,
    botUrl: `https://t.me/IamKeyBot?start=${id}`,
    code,
    expires_at: expiresAt.toISOString(),
  });
});

// Check verification status by token
app.get('/verification/status-by-token/:token', async (req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT * FROM telegram_verifications 
     WHERE id = $1 
     ORDER BY created_at DESC LIMIT 1`,
    [req.params.token]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'No verification found' });
  }

  const verification = result.rows[0];

  // Check expiry
  if (new Date(verification.expires_at) < new Date()) {
    if (verification.status === 'pending') {
      await pool.query(
        `UPDATE telegram_verifications SET status = 'expired' WHERE id = $1`,
        [verification.id]
      );
      verification.status = 'expired';
    }
  }

  res.json({ 
    status: verification.status,
    phoneNumber: verification.phone_number,
    verified_at: verification.verified_at
  });
});

// Check verification status
app.get('/verification/status/:phone', async (req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT * FROM telegram_verifications 
     WHERE phone_number = $1 
     ORDER BY created_at DESC LIMIT 1`,
    [req.params.phone]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'No verification found' });
  }

  const verification = result.rows[0];

  // Check expiry
  if (new Date(verification.expires_at) < new Date()) {
    await pool.query(
      `UPDATE telegram_verifications SET status = 'expired' WHERE id = $1`,
      [verification.id]
    );
    verification.status = 'expired';
  }

  res.json({ verification });
});

// Verify code
app.post('/verification/verify', async (req: Request, res: Response) => {
  const { phone_number, code } = req.body;

  if (!phone_number || !code) {
    return res.status(400).json({ error: 'phone_number and code are required' });
  }

  const result = await pool.query(
    `SELECT * FROM telegram_verifications 
     WHERE phone_number = $1 AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
    [phone_number]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'No pending verification found' });
  }

  const verification = result.rows[0];

  if (new Date(verification.expires_at) < new Date()) {
    await pool.query(
      `UPDATE telegram_verifications SET status = 'expired' WHERE id = $1`,
      [verification.id]
    );
    return res.status(400).json({ error: 'Verification expired' });
  }

  if (verification.verification_code !== code) {
    return res.status(400).json({ error: 'Invalid code' });
  }

  await pool.query(
    `UPDATE telegram_verifications SET status = 'verified', verified_at = NOW() WHERE id = $1`,
    [verification.id]
  );

  res.json({ success: true, message: 'Verification successful' });
});

// List all verifications (for dashboard)
app.get('/verifications', async (_req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT * FROM telegram_verifications ORDER BY created_at DESC LIMIT 100`
  );
  res.json({ verifications: result.rows });
});

// =============================================================================
// SIMULATE USER SENDING MESSAGE TO BOT
// =============================================================================

app.post('/simulate/user-message', async (req: Request, res: Response) => {
  const { telegram_id, text } = req.body;

  console.log(`[TELEGRAM] User ${telegram_id} sent: ${text}`);

  // If message looks like a verification code, auto-verify
  if (/^\d{6}$/.test(text.trim())) {
    // Find user by telegram_id
    const userResult = await pool.query(
      `SELECT phone_number FROM simulated_users WHERE telegram_id = $1`,
      [telegram_id]
    );

    if (userResult.rows.length > 0) {
      const phone = userResult.rows[0].phone_number;

      // Try to verify
      const verifyResult = await pool.query(
        `SELECT * FROM telegram_verifications 
         WHERE phone_number = $1 AND verification_code = $2 AND status = 'pending'`,
        [phone, text.trim()]
      );

      if (verifyResult.rows.length > 0) {
        await pool.query(
          `UPDATE telegram_verifications SET status = 'verified', verified_at = NOW() WHERE id = $1`,
          [verifyResult.rows[0].id]
        );
        return res.json({ success: true, action: 'verified' });
      }
    }
  }

  res.json({ success: true, action: 'received' });
});

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', service: 'telegram-mock' });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: String(error) });
  }
});

// =============================================================================
// START SERVER
// =============================================================================

const PORT = parseInt(process.env.PORT || '4001', 10);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`📱 Telegram Mock running on http://0.0.0.0:${PORT}`);
});

export default app;
