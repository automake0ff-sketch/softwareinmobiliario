import { get } from '../db/db.js';

export async function getAuthContext(req) {
  const { agency_id, id: userId, role } = req.user || {};

  if (!agency_id) {
    return { error: true, status: 401, message: 'No autenticado' };
  }

  const agency = await get('SELECT * FROM agencies WHERE id = @id', { id: agency_id });
  if (!agency) {
    return { error: true, status: 404, message: 'Agencia no encontrada' };
  }

  return {
    error: false,
    agencyId: agency_id,
    userId,
    userRole: role,
    agency,
  };
}

export async function requireAgency(req, res, next) {
  const ctx = await getAuthContext(req);
  if (ctx.error) {
    return res.status(ctx.status).json({ error: ctx.message });
  }
  req.agency = ctx.agency;
  next();
}
