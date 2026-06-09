import { initDB, get, all } from '../server/db/db.js';

async function main() {
  await initDB();
  const users = all("SELECT * FROM users");
  console.log('Users:', users);
  const agencies = all("SELECT * FROM agencies");
  console.log('Agencies:', agencies);
}

main().catch(console.error);
