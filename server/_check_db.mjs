import { all, get, initDB } from './db/db.js';

await initDB();

// Check if automation_templates table exists
try {
  const tables = all("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('Tables:', tables.map(t => t.name).join(', '));
} catch(e) {
  console.log('Table list error:', e.message);
}

// Check automation_templates
try {
  const existing = get('SELECT COUNT(*) as c FROM automation_templates');
  console.log('automation_templates count:', existing?.c ?? 0);
  
  if (existing && existing.c > 0) {
    const sample = all('SELECT id, name, category, is_active FROM automation_templates LIMIT 5');
    console.log('Sample:', JSON.stringify(sample, null, 2));
  } else {
    console.log('Table is EMPTY');
  }
} catch(e) {
  console.log('Error:', e.message);
}

// Check automations table too
try {
  const acount = get('SELECT COUNT(*) as c FROM automations');
  console.log('automations count:', acount?.c ?? 0);
} catch(e) {
  console.log('Automations query error:', e.message);
}

console.log('Done');
process.exit(0);
