import { initDB, all } from '../server/db/db.js';
async function main() {
  await initDB();
  const users = all("SELECT id, email, name, role, agency_id FROM users");
  console.log(users);
}
main();
