import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { auth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(auth);

router.get('/:id', (req, res) => {
  try {
    const agency = get('SELECT * FROM agencies WHERE id = @id', { id: req.params.id });
    if (!agency) return res.status(404).json({ error: 'Agencia no encontrada.' });

    const offices = all('SELECT * FROM offices WHERE agency_id = @agency_id ORDER BY name', { agency_id: req.params.id });
    const users = all('SELECT id, email, name, role, office_id, avatar, phone, active FROM users WHERE agency_id = @agency_id ORDER BY name', { agency_id: req.params.id });

    res.json({ ...agency, offices, users });
  } catch (error) {
    console.error('Error getting agency:', error);
    res.status(500).json({ error: 'Error al obtener agencia.' });
  }
});

router.post('/', requireRole('admin'), (req, res) => {
  try {
    const { name, slug, logo_url, primary_color, domain } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Faltan campos obligatorios: name, slug.' });

    const existing = get('SELECT id FROM agencies WHERE slug = @slug', { slug });
    if (existing) return res.status(409).json({ error: 'Ya existe una agencia con ese slug.' });

    const id = uuidv4();
    run(
      `INSERT INTO agencies (id, name, slug, logo_url, primary_color, domain, created_at)
       VALUES (@id, @name, @slug, @logo_url, @primary_color, @domain, datetime('now'))`,
      { id, name, slug, logo_url, primary_color: primary_color || '#2563eb', domain }
    );

    const agency = get('SELECT * FROM agencies WHERE id = @id', { id });
    res.status(201).json(agency);
  } catch (error) {
    console.error('Error creating agency:', error);
    res.status(500).json({ error: 'Error al crear agencia.' });
  }
});

router.patch('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const existing = get('SELECT * FROM agencies WHERE id = @id', { id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Agencia no encontrada.' });

    const allowed = ['name', 'slug', 'logo_url', 'primary_color', 'domain'];
    const updates = [];
    const params = { id: req.params.id };

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = @${field}`);
        params[field] = req.body[field];
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar.' });
    run(`UPDATE agencies SET ${updates.join(', ')} WHERE id = @id`, params);

    const agency = get('SELECT * FROM agencies WHERE id = @id', { id: req.params.id });
    res.json(agency);
  } catch (error) {
    console.error('Error updating agency:', error);
    res.status(500).json({ error: 'Error al actualizar agencia.' });
  }
});

router.get('/:id/stats', (req, res) => {
  try {
    const aid = req.params.id;

    const totalLeads = get('SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid', { aid }).count;
    const leadsByStatus = all('SELECT status, COUNT(*) as count FROM leads WHERE agency_id = @aid GROUP BY status', { aid });
    const totalProperties = get('SELECT COUNT(*) as count FROM properties WHERE agency_id = @aid', { aid }).count;
    const propertiesByStatus = all('SELECT status, COUNT(*) as count FROM properties WHERE agency_id = @aid GROUP BY status', { aid });
    const totalUsers = get('SELECT COUNT(*) as count FROM users WHERE agency_id = @aid AND active = 1', { aid }).count;

    const leadsThisMonth = get(
      "SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid AND created_at >= datetime('now', 'start of month')",
      { aid }
    ).count;

    const conversion = get(
      "SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid AND status IN ('reserva','cerrado')",
      { aid }
    ).count;

    const avgScore = get('SELECT AVG(ia_score) as avg FROM leads WHERE agency_id = @aid AND ia_score > 0', { aid }).avg;

    const topZone = get(
      'SELECT zone, COUNT(*) as count FROM leads WHERE agency_id = @aid AND zone IS NOT NULL GROUP BY zone ORDER BY count DESC LIMIT 1',
      { aid }
    );

    res.json({
      totalLeads,
      leadsByStatus,
      totalProperties,
      propertiesByStatus,
      totalUsers,
      leadsThisMonth,
      conversionRate: totalLeads > 0 ? ((conversion / totalLeads) * 100).toFixed(1) : 0,
      avgScore: avgScore ? Number(avgScore).toFixed(1) : null,
      topZone: topZone ? topZone.zone : null,
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas.' });
  }
});

router.get('/:id/ranking', (req, res) => {
  try {
    const aid = req.params.id;

    const ranking = all(
      `SELECT u.id, u.name, u.avatar, u.office_id, o.name AS office_name,
              COUNT(l.id) AS total_leads,
              SUM(CASE WHEN l.status IN ('reserva','cerrado') THEN 1 ELSE 0 END) AS converted,
              AVG(l.ia_score) AS avg_score
       FROM users u
       LEFT JOIN leads l ON l.assigned_to = u.id
       LEFT JOIN offices o ON u.office_id = o.id
       WHERE u.agency_id = @aid AND u.role = 'comercial'
       GROUP BY u.id
       ORDER BY converted DESC, avg_score DESC`,
      { aid }
    );

    res.json(ranking);
  } catch (error) {
    console.error('Error getting ranking:', error);
    res.status(500).json({ error: 'Error al obtener ranking.' });
  }
});

router.get('/:id/feed', (req, res) => {
  try {
    const activities = all(
      `SELECT a.*, u.name AS user_name, l.name AS lead_name
       FROM activities a
       LEFT JOIN users u ON a.user_id = u.id
       LEFT JOIN leads l ON a.lead_id = l.id
       WHERE a.agency_id = @agency_id
       ORDER BY a.created_at DESC LIMIT 50`,
      { agency_id: req.params.id }
    );

    res.json(activities);
  } catch (error) {
    console.error('Error getting feed:', error);
    res.status(500).json({ error: 'Error al obtener feed de actividad.' });
  }
});

export default router;
