import crypto from 'crypto';
import { run, initDB } from './db/db.js';

await initDB();

const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.pbkdf2Sync('demo', salt, 1000, 64, 'sha512').toString('hex');
const pwHash = `${salt}:${hash}`;

const emails = ['manager@inmotech.es','manager2@inmotech.es','ana@inmotech.es','pedro@inmotech.es','maria@inmotech.es','javier@inmotech.es','sara@inmotech.es'];

for (const email of emails) {
  run('UPDATE users SET password_hash = @hash WHERE email = @email', { hash: pwHash, email });
  console.log(`Fixed: ${email}`);
}

console.log('Done');
process.exit(0);
