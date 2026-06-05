import { initDB, get, all } from '../server/db/db.js';

async function main() {
  await initDB();
  const user = get("SELECT * FROM users WHERE email = 'admin@inmotech.es'");
  console.log('User:', user);
  if (user) {
    const agency = get("SELECT * FROM agencies WHERE id = @id", { id: user.agency_id });
    console.log('Agency:', agency);
    const subs = all("SELECT * FROM subscriptions WHERE agency_id = @agency_id", { agency_id: user.agency_id });
    console.log('Subscriptions:', subs);
  }
}

main().catch(console.error);
