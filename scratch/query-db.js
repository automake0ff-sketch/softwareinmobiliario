import { initDB, all } from '../server/db/db.js';

async function main() {
  await initDB();
  console.log('--- AGENCIES ---');
  console.log(all('SELECT * FROM agencies'));
  console.log('--- USERS ---');
  console.log(all('SELECT id, email, name, role, agency_id FROM users'));
  console.log('--- AI AGENTS ---');
  console.log(all('SELECT id, agency_id, type, name, status, is_active FROM ai_agents'));
}

main().catch(console.error);
