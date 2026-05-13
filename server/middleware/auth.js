import { get } from '../db/db.js';

const API_TOKEN = process.env.API_TOKEN || 'demo-token-dev';

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

  if (agencyId) {
    const agency = get('SELECT id FROM agencies WHERE id = @id', { id: agencyId })
    if (!agency) {
      const firstAgency = get('SELECT id FROM agencies LIMIT 1')
      if (firstAgency) agencyId = firstAgency.id
    }
  } else {
    const user = get('SELECT agency_id FROM users WHERE id = @id', { id: userId })
    if (user) agencyId = user.agency_id
  }

  if (!agencyId) {
    const firstAgency = get('SELECT id FROM agencies LIMIT 1')
    if (firstAgency) agencyId = firstAgency.id
  }

  req.user = {
    id: userId,
    role: req.headers['x-auth-role'] || 'comercial',
    agency_id: agencyId,
    office_id: officeId,
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

export default { auth, requireRole };
