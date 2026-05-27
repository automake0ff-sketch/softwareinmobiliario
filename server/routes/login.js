import { Router } from 'express';
import { get } from '../db/db.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'crm-inmobiliario-secret-dev-key-2026';

function verifyPassword(password, stored) {
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$')) {
    return bcrypt.compareSync(password, stored);
  }
  // Fallback a PBKDF2 antiguo para conservar usuarios semilla
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const verify = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === verify;
}

router.post('/', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    const user = get('SELECT id, email, name, password_hash, role, agency_id, office_id FROM users WHERE email = @email AND active = 1', { email });
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const agency = get('SELECT id, name, slug, plan, plan_status FROM agencies WHERE id = @id', { id: user.agency_id });
    if (!agency) {
      return res.status(404).json({ error: 'Agencia no encontrada' });
    }

    // Firmar token JWT real conteniendo el userId
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        agency_id: user.agency_id,
        office_id: user.office_id,
      },
      agency: {
        id: agency.id,
        name: agency.name,
        slug: agency.slug,
        plan: agency.plan,
        plan_status: agency.plan_status,
      },
    });
  } catch (error) {
    console.error('[LOGIN] Error:', error.message);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

export default router;
