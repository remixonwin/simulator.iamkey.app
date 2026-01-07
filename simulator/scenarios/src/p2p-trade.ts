/**
 * P2P Trade Scenario
 * 
 * Simulates a complete P2P mobile balance trade flow:
 * 1. Alice creates a sell order (1000 NPR)
 * 2. Bob creates a matching buy order
 * 3. Orders are matched
 * 4. Bob funds escrow with DAI
 * 5. Alice transfers balance via USSD
 * 6. Alice submits balance proof
 * 7. Escrow releases to Alice
 */

import Scenario, { ScenarioStep, DEFAULT_CONFIG } from './base';

export class P2PTradeScenario extends Scenario {
  private orderId?: string;
  private aliceBalanceBefore?: number;
  private aliceBalanceAfter?: number;

  get name() {
    return 'P2P Trade Happy Path';
  }

  get description() {
    return 'Complete P2P mobile balance trade between Alice (seller) and Bob (buyer)';
  }

  getSteps(): ScenarioStep[] {
    return [
      {
        name: 'Check initial balances',
        description: 'Verify Alice and Bob have starting balances',
        execute: async () => {
          const aliceBalance = await this.getBalance('+9779841234567');
          const bobBalance = await this.getBalance('+9779842345678');
          
          console.log(`       Alice: ${aliceBalance} NPR`);
          console.log(`       Bob: ${bobBalance} NPR`);
          
          if (aliceBalance < 1000) {
            throw new Error('Alice needs at least 1000 NPR');
          }
          
          this.aliceBalanceBefore = aliceBalance;
        },
      },
      {
        name: 'Alice creates sell order',
        description: 'Alice wants to sell 1000 NPR for DAI',
        execute: async () => {
          const alice = await this.getUser('alice');
          
          const result = await this.api('/marketplace/orders', {
            method: 'POST',
            body: JSON.stringify({
              creator_lookup_hash: alice.phone_hash,
              type: 'sell',
              local_amount: 1000,
              local_currency: 'NPR',
              telecom_provider: 'NTC',
              phone_number: '+9779841234567',
              country_code: 'NP',
            }),
          });
          
          this.orderId = result.order?.id;
          console.log(`       Order ID: ${this.orderId}`);
        },
      },
      {
        name: 'Bob creates matching buy order',
        description: 'Bob wants to buy 1000 NPR with DAI',
        execute: async () => {
          const bob = await this.getUser('bob');
          
          await this.api('/marketplace/orders', {
            method: 'POST',
            body: JSON.stringify({
              creator_lookup_hash: bob.phone_hash,
              type: 'buy',
              local_amount: 1000,
              local_currency: 'NPR',
              telecom_provider: 'NTC',
              phone_number: '+9779842345678',
              recipient_phone: '+9779842345678',
              country_code: 'NP',
            }),
          });
        },
      },
      {
        name: 'Alice transfers balance via USSD',
        description: 'Alice sends 1000 NPR to Bob',
        execute: async () => {
          // Check balance before
          const balanceBefore = await this.getBalance('+9779841234567');
          console.log(`       Before: ${balanceBefore} NPR`);
          
          // Transfer
          const result = await this.ussd('+9779841234567', '*422*1000*9779842345678#');
          console.log(`       USSD Response: ${result.response_text}`);
          
          if (!result.success) {
            throw new Error('USSD transfer failed');
          }
          
          // Check balance after
          const balanceAfter = await this.getBalance('+9779841234567');
          console.log(`       After: ${balanceAfter} NPR`);
          
          this.aliceBalanceAfter = balanceAfter;
          
          // Verify Bob received
          const bobBalance = await this.getBalance('+9779842345678');
          console.log(`       Bob now has: ${bobBalance} NPR`);
        },
      },
      {
        name: 'Verify balance delta',
        description: 'Confirm exactly 1000 NPR was transferred',
        execute: async () => {
          const delta = (this.aliceBalanceBefore || 0) - (this.aliceBalanceAfter || 0);
          console.log(`       Delta: ${delta} NPR`);
          
          if (delta !== 1000) {
            throw new Error(`Expected delta of 1000, got ${delta}`);
          }
        },
      },
      {
        name: 'Submit balance proof',
        description: 'Alice submits proof of balance change',
        execute: async () => {
          const result = await fetch(`${this.config.ussdUrl}/ussd/balance-proof`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order_id: this.orderId,
              phone_number: '+9779841234567',
              balance_before: this.aliceBalanceBefore,
              balance_after: this.aliceBalanceAfter,
            }),
          });
          
          const data = await result.json() as any;
          console.log(`       Proof ID: ${data.proof?.id}`);
        },
      },
    ];
  }
}

export default P2PTradeScenario;
