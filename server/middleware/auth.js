import { get, run } from '../db/db.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'crm-inmobiliario-secret-dev-key-2026';
const API_TOKEN = process.env.API_TOKEN || 'demo-token-dev';

export function getAgencyFromUser(userId) {
  const user = get('SELECT agency_id FROM users WHERE id = @id', { id: userId })
  if (user) return user.agency_id
  return null
}

export function auth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const xAuthToken = req.headers['x-auth-token'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (xAuthToken) {
    token = xAuthToken;
  }

  if (!token) {
    return res.status(401).json({ error: 'Se requiere token de autenticación.' });
  }

  // Soporte legacy para API_TOKEN de desarrollo (si no es formato JWT)
  if (token === API_TOKEN && !token.includes('.')) {
    const userId = req.headers['x-auth-user'];
    if (!userId) {
      return res.status(401).json({ error: 'Se requiere x-auth-user para autenticación de desarrollo legacy.' });
    }
    
    let user = get('SELECT id, role, agency_id, office_id FROM users WHERE id = @id AND active = 1', { id: userId });
    
    if (!user) {
      const emailHeader = req.headers['x-auth-email'];
      if (emailHeader) {
        user = get('SELECT id, role, agency_id, office_id FROM users WHERE email = @email AND active = 1', { email: emailHeader });
        if (user) {
          try {
            const oldUserId = user.id;
            const oldAgencyId = user.agency_id;
            const newAgencyId = req.headers['x-auth-agency'] || oldAgencyId || userId;
            
            run('UPDATE users SET id = @newUserId, agency_id = @newAgencyId WHERE id = @oldUserId', {
              newUserId: userId,
              newAgencyId,
              oldUserId
            });

            if (oldAgencyId && oldAgencyId !== newAgencyId) {
              run('UPDATE agencies SET id = @newAgencyId WHERE id = @oldAgencyId', {
                newAgencyId,
                oldAgencyId
              });
            }

            user = get('SELECT id, role, agency_id, office_id FROM users WHERE id = @id AND active = 1', { id: userId });
          } catch (err) {
            console.error('[AUTH LINK OAUTH] Error linking user by email:', err.message);
          }
        }
      }
    }

    if (!user) {
      try {
        const agencyId = req.headers['x-auth-agency'] || userId;
        const userEmail = req.headers['x-auth-email'] || 'oauth-' + userId.substring(0, 8) + '@inmotech.es';
        const agencySlug = 'inmo-' + agencyId.substring(0, 8);

        run(
          `INSERT OR IGNORE INTO agencies (id, name, slug, plan, plan_status, onboarding_completed, onboarding_step)
           VALUES (@id, @name, @slug, 'starter', 'active', 0, 0)`,
          { id: agencyId, name: 'Mi Inmobiliaria', slug: agencySlug }
        );
        
        run(
          `INSERT OR IGNORE INTO users (id, email, name, password_hash, role, agency_id, active)
           VALUES (@id, @email, @name, 'oauth-user-pass-hash', 'admin', @agency_id, 1)`,
          { id: userId, email: userEmail, name: 'Asesor Google', agency_id: agencyId }
        );

        run(
          `INSERT OR IGNORE INTO subscriptions (id, agency_id, plan_id, status, billing_cycle, created_at)
           VALUES (@id, @agency_id, 'starter', 'active', 'monthly', datetime('now'))`,
          { id: crypto.randomUUID(), agency_id: agencyId }
        );

        run(
          `INSERT OR IGNORE INTO usage_counters (id, agency_id, period_start, created_at)
           VALUES (@id, @agency_id, @period_start, datetime('now'))`,
          {
            id: crypto.randomUUID(),
            agency_id: agencyId,
            period_start: new Date().toISOString().slice(0, 7) + '-01'
          }
        );

        user = get('SELECT id, role, agency_id, office_id FROM users WHERE id = @id AND active = 1', { id: userId });
      } catch (e) {
        console.error('[AUTH AUTO-PROVISION] Error:', e.message);
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo.' });
    }
    const sub = get('SELECT plan_id, status FROM subscriptions WHERE agency_id = @aid ORDER BY created_at DESC LIMIT 1', { aid: user.agency_id });
    
    req.user = {
      id: user.id,
      role: user.role,
      agency_id: user.agency_id,
      office_id: user.office_id,
      plan_id: sub?.plan_id || 'starter',
      plan_status: sub?.status || 'active',
    };
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    const user = get('SELECT id, role, agency_id, office_id FROM users WHERE id = @id AND active = 1', { id: userId });
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo.' });
    }

    const sub = get('SELECT plan_id, status FROM subscriptions WHERE agency_id = @aid ORDER BY created_at DESC LIMIT 1', { aid: user.agency_id });

    req.user = {
      id: user.id,
      role: user.role,
      agency_id: user.agency_id,
      office_id: user.office_id,
      plan_id: sub?.plan_id || 'starter',
      plan_status: sub?.status || 'active',
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
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

export default { auth, requireRole, requireSuperAdmin };
