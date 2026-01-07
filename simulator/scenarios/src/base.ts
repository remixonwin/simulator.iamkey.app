/**
 * Scenario Orchestration Engine
 * 
 * Base classes and utilities for running multi-step simulation scenarios.
 */

import { Pool } from 'pg';
import { ethers } from 'ethers';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface SimulatorConfig {
  databaseUrl: string;
  backendUrl: string;
  ussdUrl: string;
  telegramUrl: string;
  fcmUrl: string;
  rpcUrl: string;
  privateKeys: string[];
}

export const DEFAULT_CONFIG: SimulatorConfig = {
  databaseUrl: process.env.DATABASE_URL || 'postgres://simulator:simulator@postgres:5432/simulator',
  backendUrl: process.env.BACKEND_URL || 'http://backend:3000',
  ussdUrl: process.env.USSD_URL || 'http://ussd-sim:4000',
  telegramUrl: process.env.TELEGRAM_URL || 'http://telegram-mock:4001',
  fcmUrl: process.env.FCM_URL || 'http://fcm-mock:4002',
  rpcUrl: process.env.RPC_URL || 'http://anvil:8545',
  privateKeys: [
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // Alice
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // Bob
    '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // Carol
    '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', // Dave
    '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a', // Eve
  ],
};

// =============================================================================
// SCENARIO BASE CLASS
// =============================================================================

export interface ScenarioStep {
  name: string;
  description: string;
  execute: () => Promise<void>;
}

export interface ScenarioResult {
  success: boolean;
  duration: number;
  steps: {
    name: string;
    success: boolean;
    duration: number;
    error?: string;
  }[];
  error?: string;
}

export abstract class Scenario {
  protected config: SimulatorConfig;
  protected pool: Pool;
  protected provider: ethers.JsonRpcProvider;
  protected wallets: ethers.Wallet[];

  constructor(config: SimulatorConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.pool = new Pool({ connectionString: config.databaseUrl });
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallets = config.privateKeys.map(pk => new ethers.Wallet(pk, this.provider));
  }

  abstract get name(): string;
  abstract get description(): string;
  abstract getSteps(): ScenarioStep[];

  async setup(): Promise<void> {
    // Override in subclass for custom setup
  }

  async teardown(): Promise<void> {
    await this.pool.end();
  }

  async run(): Promise<ScenarioResult> {
    const startTime = Date.now();
    const steps = this.getSteps();
    const results: ScenarioResult['steps'] = [];

    console.log(`\n🎬 Running scenario: ${this.name}`);
    console.log(`   ${this.description}\n`);

    try {
      await this.setup();

      for (const step of steps) {
        const stepStart = Date.now();
        console.log(`   ▶ ${step.name}...`);

        try {
          await step.execute();
          results.push({
            name: step.name,
            success: true,
            duration: Date.now() - stepStart,
          });
          console.log(`     ✅ Done (${Date.now() - stepStart}ms)`);
        } catch (error: any) {
          results.push({
            name: step.name,
            success: false,
            duration: Date.now() - stepStart,
            error: error.message,
          });
          console.error(`     ❌ Failed: ${error.message}`);
          throw error;
        }
      }

      await this.teardown();

      return {
        success: true,
        duration: Date.now() - startTime,
        steps: results,
      };
    } catch (error: any) {
      await this.teardown();
      return {
        success: false,
        duration: Date.now() - startTime,
        steps: results,
        error: error.message,
      };
    }
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  protected async api(path: string, options?: RequestInit): Promise<any> {
    const res = await fetch(`${this.config.backendUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    return res.json();
  }

  protected async ussd(phoneNumber: string, code: string): Promise<any> {
    const res = await fetch(`${this.config.ussdUrl}/ussd/dial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: phoneNumber, ussd_code: code }),
    });
    return res.json();
  }

  protected async getBalance(phoneNumber: string): Promise<number> {
    const res = await fetch(`${this.config.ussdUrl}/ussd/phones/${phoneNumber}`);
    const data = await res.json() as any;
    return data.phone?.balance || 0;
  }

  protected async createVerification(phoneNumber: string): Promise<string> {
    const res = await fetch(`${this.config.telegramUrl}/verification/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: phoneNumber }),
    });
    const data = await res.json() as any;
    return data.code;
  }

  protected async verifyPhone(phoneNumber: string, code: string): Promise<boolean> {
    const res = await fetch(`${this.config.telegramUrl}/verification/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: phoneNumber, code }),
    });
    const data = await res.json() as any;
    return data.success;
  }

  protected async getUser(username: string): Promise<any> {
    const result = await this.pool.query(
      'SELECT * FROM simulated_users WHERE username = $1',
      [username]
    );
    return result.rows[0];
  }

  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default Scenario;
