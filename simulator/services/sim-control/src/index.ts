import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import util from 'util';

dotenv.config();
const execAsync = util.promisify(exec);

const app = express();
const port = process.env.PORT || 4003;

app.use(cors());
app.use(express.json());

// =============================================================================
// CONFIGURATION
// =============================================================================

const RPC_URL = process.env.RPC_URL || 'http://anvil:8545';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://simulator:simulator@postgres:5432/simulator';
const provider = new ethers.JsonRpcProvider(RPC_URL);
const pool = new Pool({ connectionString: DATABASE_URL });

// Chaos settings (global state for this service)
let chaosConfig = {
  latencyMs: 0,
  errorRate: 0, // 0 to 1
};

// =============================================================================
// TIME MANIPULATION (Anvil Cheat Codes)
// =============================================================================

app.post('/time/fast-forward', async (req, res) => {
  const { seconds } = req.body;
  if (typeof seconds !== 'number') {
    return res.status(400).json({ error: 'seconds must be a number' });
  }

  try {
    // evm_increaseTime: Jump ahead in seconds
    await provider.send('evm_increaseTime', [seconds]);
    // evm_mine: Mine a block to make the time change effective
    await provider.send('evm_mine', []);

    const latestBlock: any = await provider.send('eth_getBlockByNumber', ['latest', false]);
    const newTimestamp = parseInt(latestBlock?.timestamp, 16);
    console.log(`[TIME] Advanced blockchain time by ${seconds} seconds. New timestamp: ${newTimestamp}`);
    res.json({ success: true, message: `Advanced time by ${seconds}s`, newTimestamp });
  } catch (error: any) {
    console.error('[TIME] Failed to advance time:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/time/set-timestamp', async (req, res) => {
  const { timestamp } = req.body; // Unix timestamp in seconds
  if (typeof timestamp !== 'number') {
    return res.status(400).json({ error: 'timestamp must be a number' });
  }

  try {
    await provider.send('evm_setNextBlockTimestamp', [timestamp]);
    await provider.send('evm_mine', []);
    console.log(`[TIME] Set next block timestamp to ${timestamp} and mined block`);
    res.json({ success: true, message: `Set next block timestamp to ${timestamp}` });
  } catch (error: any) {
    console.error('[TIME] Failed to set timestamp:', error);
    res.status(500).json({ error: error.message });
  }
});

// ALIASES for Dashboard Compatibility
app.post('/time/increase', async (req, res) => {
  const { seconds } = req.body;
  if (!seconds) return res.status(400).json({ error: 'seconds required' });
  try {
    await provider.send('evm_increaseTime', [seconds]);
    await provider.send('evm_mine', []);
    const latestBlock = await provider.getBlock('latest');
    res.json({ success: true, newTimestamp: latestBlock?.timestamp });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/time/set', async (req, res) => {
  const { timestamp } = req.body;
  try {
    await provider.send('evm_setNextBlockTimestamp', [timestamp]);
    await provider.send('evm_mine', []);
    res.json({ success: true, timestamp });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/time/current', async (req, res) => {
  try {
    const block: any = await provider.send('eth_getBlockByNumber', ['latest', false]);
    const timestamp = parseInt(block?.timestamp, 16);
    res.json({ timestamp: timestamp || Math.floor(Date.now()/1000) });
  } catch (e: any) {
    console.error('[TIME] Failed to get current timestamp:', e);
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// =============================================================================
// CHAOS INJECTION
// =============================================================================

app.get('/chaos/config', (req, res) => {
  res.json(chaosConfig);
});

app.post('/chaos/config', (req, res) => {
  const { latencyMs, errorRate } = req.body;
  
  if (typeof latencyMs === 'number') chaosConfig.latencyMs = latencyMs;
  if (typeof errorRate === 'number') chaosConfig.errorRate = errorRate;

  console.log('[CHAOS] Updated config:', chaosConfig);
  res.json({ success: true, config: chaosConfig });
});
app.post('/chaos/set', (req, res) => {
    const { service, latencyMs, errorRate } = req.body;
    // Currently we only have global chaos, but let's just log service and set global
    if (typeof latencyMs === 'number') chaosConfig.latencyMs = latencyMs;
    if (typeof errorRate === 'number') chaosConfig.errorRate = errorRate;
    res.json({ success: true, config: chaosConfig });
});

/**
 * Middleware for other mock services to check chaos config
 */
app.get('/chaos/check', (req, res) => {
  res.json(chaosConfig);
});

// =============================================================================
// STATE MANAGEMENT (Snapshots)
// =============================================================================

app.post('/state/snapshot', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    // 1. Snapshot Anvil
    const snapshotId = await provider.send('evm_snapshot', []);
    
    // 2. Snapshot Postgres (using a simple table for this demo, in real world use pg_dump)
    // For this simulator, we might just store the snapshotId in a table
    await pool.query(
      'INSERT INTO scenario_runs (scenario_name, status, result) VALUES ($1, $2, $3)',
      [`snapshot:${name}`, 'completed', JSON.stringify({ snapshotId })]
    );

    console.log(`[STATE] Created snapshot: ${name} (ID: ${snapshotId})`);
    res.json({ success: true, snapshotId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/state/restore', async (req, res) => {
  const { snapshotId } = req.body;
  if (!snapshotId) return res.status(400).json({ error: 'snapshotId is required' });

  try {
    await provider.send('evm_revert', [snapshotId]);
    console.log(`[STATE] Reverted to snapshot: ${snapshotId}`);
    res.json({ success: true, message: `Reverted to snapshot ${snapshotId}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// SCENARIO BRIDGE
// =============================================================================

app.post('/scenarios/trigger', async (req, res) => {
  const { scenarioName } = req.body;
  if (!scenarioName) return res.status(400).json({ error: 'scenarioName is required' });

  try {
    // Run the scenario using tsx
    console.log(`[SCENARIO] Triggering: ${scenarioName}`);
    const { stdout, stderr } = await execAsync(`npx tsx /app/scenarios/src/cli.ts run ${scenarioName}`);
    
    if (stderr && !stdout) {
       console.error(`[SCENARIO] Error: ${stderr}`);
       return res.status(500).json({ error: stderr });
    }

    res.json({ success: true, output: stdout });
  } catch (error: any) {
    console.error(`[SCENARIO] Failed to run ${scenarioName}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// HEALTH & UTILS
// =============================================================================

app.get('/state/snapshots', async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM scenario_runs WHERE scenario_name LIKE 'snapshot:%' ORDER BY started_at DESC");
    const snapshots = result.rows.map(r => ({
      id: JSON.parse(r.result).snapshotId,
      name: r.scenario_name.replace('snapshot:', ''),
      createdAt: r.started_at
    }));
    res.json({ snapshots });
  } catch (e) {
    res.json({ snapshots: [] });
  }
});

app.get('/scenarios/list', async (req, res) => {
  try {
    const { stdout } = await execAsync('ls /app/scenarios/src/scenarios/*.ts');
    const scenarios = stdout.split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => {
        const parts = line.split('/');
        return parts[parts.length - 1].replace('.ts', '');
      });
    res.json({ scenarios });
  } catch (e) {
    res.json({ scenarios: [] });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', chaos: chaosConfig });
});

app.listen(port, () => {
  console.log(`🚀 Sim-Control service running on http://localhost:${port}`);
});
