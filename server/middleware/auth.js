import { get, run } from '../db/db.js';
import jwt from 'jsonwebtoken';

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
// Compatibilidad temporal: JWTs propios emitidos antes de la migración a Supabase Auth
// (p.ej. tokens ya en circulación firmados con JWT_SECRET). Si no necesitas soportarlos,
// puedes eliminar este fallback y JWT_SECRET del .env.
const JWT_SECRET = process.env.JWT_SECRET;

export async function getAgencyFromUser(userId) {
  const user = await get('SELECT agency_id FROM users WHERE id = @id', { id: userId });
  return user ? user.agency_id : null;
}

async function loadUserWithPlan(userId) {
  // agencies.plan / agencies.plan_status son la fuente de verdad del plan activo
  // (subscriptions.plan_id es un UUID que referencia plans.id y NO es el slug
  // 'starter'/'profesional'/'agencia' que usa el resto del código — ver notas de migración).
  const user = await get(
    `SELECT u.id, u.email, u.role, u.agency_id, u.office_id, a.plan, a.plan_status
     FROM users u
     LEFT JOIN agencies a ON a.id = u.agency_id
     WHERE u.id = @id AND u.active = true`,
    { id: userId }
  );
  return user;
}

function buildReqUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    agency_id: user.agency_id,
    office_id: user.office_id,
    plan_id: user.plan || 'starter',
    plan_status: user.plan_status || 'active',
  };
}

export async function auth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : req.headers['x-auth-token'];

  if (!token) {
    return res.status(401).json({ error: 'Se requiere token de autenticación.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, SUPABASE_JWT_SECRET);
  } catch (supabaseErr) {
    // Fallback opcional a JWTs propios pre-migración. Elimina este bloque si no aplica.
    if (JWT_SECRET) {
      try {
        decoded = jwt.verify(token, JWT_SECRET);
        decoded.sub = decoded.sub || decoded.userId;
      } catch (legacyErr) {
        return res.status(401).json({ error: 'Token inválido o expirado.' });
      }
    } else {
      return res.status(401).json({ error: 'Token inválido o expirado.' });
    }
  }

  const userId = decoded.sub; // Supabase pone el UUID del usuario en 'sub'
  if (!userId) {
    return res.status(401).json({ error: 'Token inválido: falta el identificador de usuario.' });
  }

  try {
    let user = await loadUserWithPlan(userId);

    if (!user) {
      // Primer login con este UUID de Supabase Auth: aprovisionar agencia + usuario.
      const agencyId = userId; // usamos el mismo UUID como agencyId para el alta inicial
      const email = decoded.email || '';
      const name = email ? email.split('@')[0] : 'Usuario';
      const slug = 'inmo-' + userId.replace(/-/g, '').slice(0, 12);

      // En producción (Supabase), auth.users ya existe. En dev local, lo creamos como stub.
      await run(
        `INSERT INTO auth.users (id, email) VALUES (@id, @email) ON CONFLICT (id) DO NOTHING`,
        { id: userId, email }
      );

      await run(
        `INSERT INTO agencies (id, name, slug, plan, plan_status)
         VALUES (@id, @name, @slug, 'starter', 'active')
         ON CONFLICT (id) DO NOTHING`,
        { id: agencyId, name: 'Mi Inmobiliaria', slug }
      );

      await run(
        `INSERT INTO users (id, email, name, role, agency_id, active)
         VALUES (@id, @email, @name, 'admin', @agency_id, true)
         ON CONFLICT (id) DO NOTHING`,
        { id: userId, email, name, agency_id: agencyId }
      );

      user = await loadUserWithPlan(userId);
    }

    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo.' });
    }

    req.user = buildReqUser(user);
    next();
  } catch (err) {
    console.error('[AUTH] Error verificando/aprovisionando usuario:', err.message);
    return res.status(500).json({ error: 'Error interno de autenticación.' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Acción permitida solo para: ${roles.join(', ')}` });
    }
    next();
  };
}

export function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado.' });
  }
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Acceso solo para administradores del SaaS.' });
  }
  next();
}

export default { auth, requireRole, requireSuperAdmin, getAgencyFromUser };
