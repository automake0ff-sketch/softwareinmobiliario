import { initDB, get, all } from '../server/db/db.js';
import { AgentOrchestrator } from '../server/services/agent-orchestrator.js';
import { ActionExecutor } from '../server/services/action-executor.js';
import { getAgentSystemPrompt } from '../server/agents/index.js';
import { callOpenRouter } from '../server/services/openrouter.js';

async function main() {
  console.log('Initializing DB...');
  await initDB();

  console.log('Querying an agent...');
  const agent = get('SELECT * FROM ai_agents LIMIT 1');
  console.log('Agent found:', agent);

  if (!agent) {
    console.log('No agents found in DB!');
    return;
  }

  console.log('Querying a lead...');
  const lead = get('SELECT * FROM leads LIMIT 1');
  console.log('Lead found:', lead);

  if (!lead) {
    console.log('No leads found in DB!');
    return;
  }

  console.log('Simulating AgentOrchestrator execution...');
  try {
    const orchestrator = new AgentOrchestrator(agent.agency_id);
    const agencyData = await orchestrator.loadAgency();
    console.log('Agency data loaded:', agencyData);

    const ctx = orchestrator.buildContext(lead, agencyData, 'manual', { last_message: 'Hola' });
    console.log('Context built successfully:', ctx);

    console.log('Running agent...');
    const result = await orchestrator.runAgent(agent.type, ctx, lead);
    console.log('Result:', result);
  } catch (error) {
    console.error('CRITICAL ERROR DURING RUN:', error);
  }
}

main().catch(console.error);
