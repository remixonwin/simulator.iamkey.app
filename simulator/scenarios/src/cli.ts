/**
 * Scenario CLI
 * 
 * Run scenarios from command line:
 *   npx tsx src/cli.ts run p2p-trade
 *   npx tsx src/cli.ts run guardian-recovery
 *   npx tsx src/cli.ts list
 */

import { program } from 'commander';
import P2PTradeScenario from './p2p-trade';
import GuardianRecoveryScenario from './guardian-recovery';
import DisputeScenario from './dispute';
import { Scenario } from './base';

const SCENARIOS: Record<string, new () => Scenario> = {
  'p2p-trade': P2PTradeScenario,
  'guardian-recovery': GuardianRecoveryScenario,
  'dispute': DisputeScenario,
};

program
  .name('scenario')
  .description('IAMKey Simulator Scenario Runner')
  .version('1.0.0');

program
  .command('list')
  .description('List available scenarios')
  .action(() => {
    console.log('\n📋 Available Scenarios:\n');
    for (const [key, ScenarioClass] of Object.entries(SCENARIOS)) {
      const instance = new ScenarioClass();
      console.log(`  ${key}`);
      console.log(`    ${instance.description}\n`);
    }
  });

program
  .command('run <name>')
  .description('Run a specific scenario')
  .action(async (name: string) => {
    const ScenarioClass = SCENARIOS[name];
    if (!ScenarioClass) {
      console.error(`❌ Unknown scenario: ${name}`);
      console.log('Run "scenario list" to see available scenarios');
      process.exit(1);
    }

    const scenario = new ScenarioClass();
    const result = await scenario.run();

    console.log('\n' + '='.repeat(50));
    if (result.success) {
      console.log(`✅ Scenario completed successfully in ${result.duration}ms`);
    } else {
      console.log(`❌ Scenario failed: ${result.error}`);
      process.exit(1);
    }
  });

program
  .command('run-all')
  .description('Run all scenarios')
  .action(async () => {
    const results: { name: string; success: boolean; duration: number }[] = [];

    for (const [name, ScenarioClass] of Object.entries(SCENARIOS)) {
      const scenario = new ScenarioClass();
      const result = await scenario.run();
      results.push({ name, success: result.success, duration: result.duration });
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Summary:\n');
    
    let allPassed = true;
    for (const r of results) {
      const status = r.success ? '✅' : '❌';
      console.log(`  ${status} ${r.name} (${r.duration}ms)`);
      if (!r.success) allPassed = false;
    }

    process.exit(allPassed ? 0 : 1);
  });

program.parse();
