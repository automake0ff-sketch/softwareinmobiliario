import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import crypto from 'crypto';

import bcrypt from 'bcryptjs';

const router = Router();

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}
import { registerSchema, validateBody } from '../middleware/validators.js';

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, stored) {
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$')) {
    return bcrypt.compareSync(password, stored);
  }
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const verify = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === verify;
}

router.post('/', validateBody(registerSchema), (req, res) => {
  try {
    const { email, password, name, phone, agencyName, agencyCity, agencyPhone, agencyEmail, plan } = req.body;

    const existingUser = get('SELECT id FROM users WHERE email = @email', { email });
    if (existingUser) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    }

    const existingSlug = get('SELECT id FROM agencies WHERE slug = @slug', { slug: slugify(agencyName) });
    if (existingSlug) {
      return res.status(409).json({ error: 'Ya existe una agencia con ese nombre. Prueba con otro.' });
    }

    const agencyId = uuidv4();
    const now = new Date().toISOString();

    run(
      `INSERT INTO agencies (id, name, slug, email, phone, city, website, plan, plan_status, onboarding_step, onboarding_completed, created_at)
       VALUES (@id, @name, @slug, @email, @phone, @city, @website, @plan, @plan_status, 0, 0, @now)`,
      {
        id: agencyId,
        name: agencyName,
        slug: slugify(agencyName),
        email: agencyEmail || email,
        phone: agencyPhone || phone,
        city: agencyCity || '',
        website: '',
        plan: plan || 'starter',
        plan_status: 'trialing',
        now,
      }
    );

    const userId = uuidv4();
    const userRole = 'admin';

    run(
      `INSERT INTO users (id, email, name, password_hash, role, agency_id, phone, active, created_at)
       VALUES (@id, @email, @name, @password_hash, @role, @agency_id, @phone, 1, @created_at)`,
      {
        id: userId,
        email,
        name,
        password_hash: hashPassword(password),
        role: userRole,
        agency_id: agencyId,
        phone: phone || '',
        created_at: now,
      }
    );

    const defaultAgents = [
      { type: 'captador', name: 'Captador IA' },
      { type: 'vendedor', name: 'Vendedor IA' },
      { type: 'coordinador', name: 'Coordinador IA' },
      { type: 'copywriter', name: 'Copywriter IA' },
      { type: 'tasador', name: 'Tasador IA' },
      { type: 'analista', name: 'Analista IA' },
      { type: 'agendador', name: 'Agendador IA' },
      { type: 'nurturing', name: 'Nurturing IA' },
      { type: 'documentador', name: 'Documentador IA' },
      { type: 'seo', name: 'SEO IA' },
      { type: 'financiero', name: 'Financiero IA' },
      { type: 'notificador', name: 'Notificador IA' }
    ];

    for (const agent of defaultAgents) {
      run(
        `INSERT INTO ai_agents (id, agency_id, type, name, status, config, created_at)
         VALUES (@id, @agency_id, @type, @name, 'inactive', '{}', @created_at)`,
        {
          id: uuidv4(),
          agency_id: agencyId,
          type: agent.type,
          name: agent.name,
          created_at: now,
        }
      );
    }

    run(
      `INSERT INTO subscriptions (id, agency_id, plan_id, status, billing_cycle, created_at)
       VALUES (@id, @agency_id, @plan_id, 'active', 'monthly', @created_at)`,
      {
        id: uuidv4(),
        agency_id: agencyId,
        plan_id: plan || 'starter',
        created_at: now,
      }
    );

    run(
      `INSERT INTO usage_counters (id, agency_id, period_start, created_at)
       VALUES (@id, @agency_id, @period_start, @created_at)`,
      {
        id: uuidv4(),
        agency_id: agencyId,
        period_start: now.slice(0, 7) + '-01',
        created_at: now,
      }
    );

    console.log(`[REGISTER] Nueva agencia creada: ${agencyName} (${agencyId}) por ${name} (${email})`);

    res.status(201).json({
      agency_id: agencyId,
      user_id: userId,
      name,
      email,
      role: userRole,
      plan: plan || 'starter',
    });
  } catch (error) {
    console.error('[REGISTER] Error:', error.message);
    res.status(500).json({ error: 'Error al crear la cuenta. Intente de nuevo.' });
  }
});

export default router;
