/**
 * Dispute Resolution Scenario
 * 
 * Simulates a P2P trade dispute flow:
 * 1. Trade is funded in escrow
 * 2. Buyer claims seller didn't send balance
 * 3. Dispute is opened
 * 4. Resolvers are assigned
 * 5. Resolvers vote (commit-reveal)
 * 6. Dispute is resolved
 */

import Scenario, { ScenarioStep } from './base';

export class DisputeScenario extends Scenario {
  private tradeId?: string;
  private disputeId?: string;

  get name() {
    return 'Trade Dispute Resolution';
  }

  get description() {
    return 'Complete dispute flow with resolver voting and settlement';
  }

  getSteps(): ScenarioStep[] {
    return [
      {
        name: 'Setup trade in disputed state',
        description: 'Create a trade that will be disputed',
        execute: async () => {
          const tradeId = crypto.randomUUID();
          this.tradeId = tradeId;
          
          await this.pool.query(
            `INSERT INTO marketplace_orders (id, trade_id, creator_user_id, counterparty_user_id, type, 
             local_amount, local_currency, dai_amount, exchange_rate, telecom_provider, phone_number, 
             status, expires_at)
             VALUES ($1, $2, 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002',
             'sell', 1000, 'NPR', 7.49, 133.50, 'NTC', '+9779841234567', 'funded', NOW() + INTERVAL '24 hours')`,
            [tradeId, `0x${tradeId.replace(/-/g, '')}`]
          );
          
          console.log(`       Trade ID: ${tradeId}`);
        },
      },
      {
        name: 'Buyer opens dispute',
        description: 'Bob claims balance was not received',
        execute: async () => {
          const disputeId = crypto.randomUUID();
          this.disputeId = disputeId;
          
          await this.pool.query(
            `INSERT INTO disputes (id, order_id, opened_by, reason, status)
             VALUES ($1, $2, 'b0000000-0000-0000-0000-000000000002', 
             'Seller did not transfer mobile balance', 'open')`,
            [disputeId, this.tradeId]
          );
          
          await this.pool.query(
            `UPDATE marketplace_orders SET status = 'disputed', dispute_status = 'open' WHERE id = $1`,
            [this.tradeId]
          );
          
          console.log(`       Dispute ID: ${disputeId}`);
        },
      },
      {
        name: 'Assign resolver',
        description: 'Frank is selected as resolver',
        execute: async () => {
          // In real scenario, resolvers would be selected from staked pool
          console.log(`       Assigned: Frank (resolver)`);
          console.log(`       Commit deadline: ${new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()}`);
        },
      },
      {
        name: 'Collect evidence',
        description: 'Both parties submit evidence',
        execute: async () => {
          // Seller submits USSD transaction logs
          const sellerEvidence = await this.pool.query(
            `SELECT * FROM ussd_transactions WHERE phone_number = '+9779841234567' 
             AND type = 'transfer_out' ORDER BY created_at DESC LIMIT 5`
          );
          
          console.log(`       Seller evidence: ${sellerEvidence.rows.length} USSD transactions`);
          console.log(`       Buyer evidence: Screenshot of balance showing no increase`);
        },
      },
      {
        name: 'Resolver votes',
        description: 'Frank reviews evidence and votes',
        execute: async () => {
          // Simulate commit-reveal voting
          const voteForSeller = true; // Based on USSD evidence showing transfer
          
          console.log(`       Frank votes: ${voteForSeller ? 'For Seller' : 'For Buyer'}`);
          console.log(`       Reason: USSD logs show transfer was completed`);
        },
      },
      {
        name: 'Resolve dispute',
        description: 'Execute resolution based on votes',
        execute: async () => {
          await this.pool.query(
            `UPDATE disputes SET status = 'resolved', 
             resolved_in_favor_of = 'a0000000-0000-0000-0000-000000000001',
             resolution_notes = 'Evidence shows transfer was completed',
             resolved_at = NOW()
             WHERE id = $1`,
            [this.disputeId]
          );
          
          await this.pool.query(
            `UPDATE marketplace_orders SET status = 'completed', dispute_status = 'resolved' WHERE id = $1`,
            [this.tradeId]
          );
          
          console.log(`       ✅ Resolved in favor of: Alice (seller)`);
          console.log(`       Escrow released to seller`);
        },
      },
    ];
  }
}

export default DisputeScenario;
