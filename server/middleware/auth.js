import { get } from '../db/db.js';

const API_TOKEN = process.env.API_TOKEN || 'demo-token-dev';

export function getAgencyFromUser(userId) {
  const user = get('SELECT agency_id FROM users WHERE id = @id', { id: userId })
  if (user) return user.agency_id
  return null
}

export function auth(req, res, next) {
  const token = req.headers['x-auth-token'];
  const userId = req.headers['x-auth-user'];

  if (!token || !userId) {
    return res.status(401).json({ error: 'Se requiere autenticación. Envíe x-auth-token y x-auth-user.' });
  }

  if (token !== API_TOKEN) {
    return res.status(401).json({ error: 'Token inválido.' });
  }

  let agencyId = req.headers['x-auth-agency'] || null
  const officeId = req.headers['x-auth-office'] || null

  if (!agencyId) {
    agencyId = getAgencyFromUser(userId)
  }

  if (!agencyId) {
    return res.status(401).json({ error: 'Usuario no tiene agencia asignada. Contacte al administrador.' });
  }

  const agency = get('SELECT id FROM agencies WHERE id = @id', { id: agencyId })
  if (!agency) {
    return res.status(404).json({ error: 'Agencia no encontrada.' });
  }

  const sub = get('SELECT plan_id, status FROM subscriptions WHERE agency_id = @aid ORDER BY created_at DESC LIMIT 1', { aid: agencyId })

  req.user = {
    id: userId,
    role: req.headers['x-auth-role'] || 'comercial',
    agency_id: agencyId,
    office_id: officeId,
    plan_id: sub?.plan_id || 'starter',
    plan_status: sub?.status || 'active',
  };

  next();
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

export default { auth, requireRole, requireSuperAdmin };
