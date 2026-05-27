import { initDB, all, get, run, saveDB } from './db/db.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function slugify(text) {
  return text.toString().toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
}

async function seed() {
  await initDB();

  const existing = get('SELECT id FROM agencies LIMIT 1');
  if (existing) {
    console.log('Ya existen datos en la BD. No se ejecuta seed.');
    return;
  }

  const agencyId = uuidv4();
  const now = new Date().toISOString();

  run(`INSERT INTO agencies (id, name, slug, email, phone, city, plan, plan_status, created_at)
       VALUES (@id, @name, @slug, @email, @phone, @city, @plan, @plan_status, @now)`, {
    id: agencyId,
    name: 'InmoTech Realty',
    slug: slugify('InmoTech Realty'),
    email: 'admin@inmotech.es',
    phone: '+34123456789',
    city: 'Madrid',
    plan: 'profesional',
    plan_status: 'active',
    now,
  });
  console.log('✓ Agencia creada: InmoTech Realty');

  const userId = uuidv4();
  run(`INSERT INTO users (id, email, name, password_hash, role, agency_id, phone, active, created_at)
       VALUES (@id, @email, @name, @password_hash, @role, @agency_id, @phone, 1, @created_at)`, {
    id: userId,
    email: 'admin@inmotech.es',
    name: 'Admin',
    password_hash: hashPassword('admin123'),
    role: 'admin',
    agency_id: agencyId,
    phone: '+34123456789',
    created_at: now,
  });
  console.log('✓ Usuario creado: admin@inmotech.es / admin123');

  const agents = [
    { type: 'captador', name: 'Captador IA' },
    { type: 'vendedor', name: 'Vendedor IA' },
    { type: 'coordinador', name: 'Coordinador IA' },
    { type: 'copywriter', name: 'Copywriter IA' },
    { type: 'tasador', name: 'Tasador IA' },
    { type: 'analista', name: 'Analista IA' },
    { type: 'agendador', name: 'Agendador IA' },
    { type: 'nurturing', name: 'Nurturing IA' },
    { type: 'documentador', name: 'Documentador IA' },
    { type: 'notificador', name: 'Notificador IA' },
  ];
  for (const agent of agents) {
    run(`INSERT INTO ai_agents (id, agency_id, type, name, status, config, created_at)
         VALUES (@id, @agency_id, @type, @name, 'inactive', '{}', @created_at)`, {
      id: uuidv4(), agency_id: agencyId, type: agent.type, name: agent.name, created_at: now,
    });
  }
  console.log('✓ Agentes IA creados:', agents.length);

  run(`INSERT INTO subscriptions (id, agency_id, plan_id, status, billing_cycle, created_at)
       VALUES (@id, @agency_id, @plan_id, 'active', 'monthly', @created_at)`, {
    id: uuidv4(), agency_id: agencyId, plan_id: 'profesional', created_at: now,
  });
  console.log('✓ Suscripción creada');

  saveDB();
  console.log('\n✅ Seed completado. Inicia sesión con:');
  console.log('   Email: admin@inmotech.es');
  console.log('   Pass:  admin123');
}

seed().catch(e => { console.error('Error:', e); process.exit(1); });
