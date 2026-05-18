import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { auth } from '../middleware/auth.js';
import { generateLeadSummary } from '../services/claude.js';
import { checkLimit } from '../services/plan-checker.js';

const router = Router();
router.use(auth);

function logActivity(agencyId, leadId, userId, type, description, metadata = null) {
  run(
    `INSERT INTO activities (id, agency_id, lead_id, user_id, type, description, metadata, created_at)
     VALUES (@id, @agency_id, @lead_id, @user_id, @type, @description, @metadata, datetime('now'))`,
    {
      id: uuidv4(),
      agency_id: agencyId,
      lead_id: leadId,
      user_id: userId,
      type,
      description,
      metadata: metadata ? JSON.stringify(metadata) : null,
    }
  );
}

router.get('/', (req, res) => {
  try {
    const { status, office_id, assigned_to, search } = req.query;
    let sql = 'SELECT l.*, u.name AS assigned_name FROM leads l LEFT JOIN users u ON l.assigned_to = u.id WHERE l.agency_id = @agency_id';
    const params = { agency_id: req.user.agency_id };

    if (status) { sql += ' AND l.status = @status'; params.status = status; }
    if (office_id) { sql += ' AND l.office_id = @office_id'; params.office_id = office_id; }
    if (assigned_to) { sql += ' AND l.assigned_to = @assigned_to'; params.assigned_to = assigned_to; }
    if (search) {
      sql += ' AND (l.name LIKE @search OR l.email LIKE @search OR l.phone LIKE @search)';
      params.search = `%${search}%`;
    }

    sql += ' ORDER BY l.updated_at DESC';

    const leads = all(sql, params);
    res.json(leads);
  } catch (error) {
    console.error('Error listing leads:', error);
    res.status(500).json({ error: 'Error al obtener leads.' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const lead = get(
      `SELECT l.*, u.name AS assigned_name, u.email AS assigned_email, u.phone AS assigned_phone
       FROM leads l
       LEFT JOIN users u ON l.assigned_to = u.id
       WHERE l.id = @id AND l.agency_id = @agency_id`,
      { id: req.params.id, agency_id: req.user.agency_id }
    );
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });

    const activities = all(
      'SELECT * FROM activities WHERE lead_id = @lead_id ORDER BY created_at DESC LIMIT 20',
      { lead_id: req.params.id }
    );
    const conversations = all(
      'SELECT * FROM conversations WHERE lead_id = @lead_id ORDER BY created_at DESC',
      { lead_id: req.params.id }
    );
    const insights = all(
      'SELECT * FROM ai_insights WHERE lead_id = @lead_id ORDER BY created_at DESC',
      { lead_id: req.params.id }
    );

    res.json({ ...lead, activities, conversations, insights });
  } catch (error) {
    console.error('Error getting lead:', error);
    res.status(500).json({ error: 'Error al obtener lead.' });
  }
});

router.post('/', checkLimit('leads'), (req, res) => {
  try {
    const { name, phone, email, budget, zone, property_interest, source, agency_id, office_id } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio.' });

    const id = uuidv4();
    run(
      `INSERT INTO leads (id, agency_id, office_id, name, phone, email, budget, zone, property_interest, source, created_at, updated_at)
       VALUES (@id, @agency_id, @office_id, @name, @phone, @email, @budget, @zone, @property_interest, @source, datetime('now'), datetime('now'))`,
      { id, agency_id: agency_id || req.user.agency_id, office_id: office_id || req.user.office_id, name, phone, email, budget, zone, property_interest, source: source || 'manual' }
    );

    logActivity(req.user.agency_id, id, req.user.id, 'lead_created', `Lead ${name} creado.`);

    const lead = get('SELECT * FROM leads WHERE id = @id', { id });
    res.status(201).json(lead);
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Error al crear lead.' });
  }
});

router.patch('/:id/status', (req, res) => {
  try {
    const existing = get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!existing) return res.status(404).json({ error: 'Lead no encontrado.' });

    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'El campo status es obligatorio.' });

    run("UPDATE leads SET status = @status, updated_at = datetime('now') WHERE id = @id", { status, id: req.params.id });

    if (status !== existing.status) {
      logActivity(req.user.agency_id, req.params.id, req.user.id, 'status_change', `Estado cambiado de ${existing.status} a ${status}.`, { from: existing.status, to: status });
    }

    const lead = get('SELECT * FROM leads WHERE id = @id', { id: req.params.id });
    res.json(lead);
  } catch (error) {
    console.error('Error updating lead status:', error);
    res.status(500).json({ error: 'Error al actualizar estado del lead.' });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!existing) return res.status(404).json({ error: 'Lead no encontrado.' });

    const allowed = ['name', 'phone', 'email', 'budget', 'zone', 'property_interest', 'source', 'status', 'office_id', 'assigned_to', 'ia_score', 'ia_insight', 'ia_summary'];
    const updates = [];
    const params = { id: req.params.id };

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = @${field}`);
        params[field] = req.body[field];
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar.' });

    updates.push("updated_at = datetime('now')");
    run(`UPDATE leads SET ${updates.join(', ')} WHERE id = @id`, params);

    const oldStatus = existing.status;
    const newStatus = req.body.status;
    if (newStatus && newStatus !== oldStatus) {
      logActivity(req.user.agency_id, req.params.id, req.user.id, 'status_change', `Estado cambiado de ${oldStatus} a ${newStatus}.`, { from: oldStatus, to: newStatus });
    }

    logActivity(req.user.agency_id, req.params.id, req.user.id, 'lead_updated', 'Lead actualizado.');

    const lead = get('SELECT * FROM leads WHERE id = @id', { id: req.params.id });
    res.json(lead);
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Error al actualizar lead.' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!existing) return res.status(404).json({ error: 'Lead no encontrado.' });

    run('DELETE FROM leads WHERE id = @id', { id: req.params.id });
    logActivity(req.user.agency_id, req.params.id, req.user.id, 'lead_deleted', `Lead ${existing.name} eliminado.`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Error al eliminar lead.' });
  }
});

router.post('/:id/assign', (req, res) => {
  try {
    const { agent_id } = req.body;
    if (!agent_id) return res.status(400).json({ error: 'Se requiere agent_id.' });

    const existing = get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!existing) return res.status(404).json({ error: 'Lead no encontrado.' });

    const agent = get('SELECT * FROM users WHERE id = @id', { id: agent_id });
    if (!agent) return res.status(404).json({ error: 'Usuario no encontrado.' });

    run("UPDATE leads SET assigned_to = @agent_id, updated_at = datetime('now') WHERE id = @id", { agent_id, id: req.params.id });
    logActivity(req.user.agency_id, req.params.id, req.user.id, 'lead_assigned', `Lead asignado a ${agent.name}.`, { agent_id, agent_name: agent.name });

    const lead = get('SELECT * FROM leads WHERE id = @id', { id: req.params.id });
    res.json(lead);
  } catch (error) {
    console.error('Error assigning lead:', error);
    res.status(500).json({ error: 'Error al asignar lead.' });
  }
});

router.get('/:id/activities', (req, res) => {
  try {
    const lead = get('SELECT id FROM leads WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });

    const activities = all(
      'SELECT a.*, u.name AS user_name FROM activities a LEFT JOIN users u ON a.user_id = u.id WHERE a.lead_id = @lead_id AND a.agency_id = @agency_id ORDER BY a.created_at DESC LIMIT 50',
      { lead_id: req.params.id, agency_id: req.user.agency_id }
    );
    res.json(activities);
  } catch (error) {
    console.error('Error getting activities:', error);
    res.status(500).json({ error: 'Error al obtener actividades.' });
  }
});

router.post('/:id/insights', async (req, res) => {
  try {
    const lead = get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });

    const summary = await generateLeadSummary(lead);

    const insightId = uuidv4();
    run(
      `INSERT INTO ai_insights (id, lead_id, agent_type, insight, action, created_at)
       VALUES (@id, @lead_id, @agent_type, @insight, @action, datetime('now'))`,
      { id: insightId, lead_id: req.params.id, agent_type: 'analista', insight: summary, action: 'Revisar y contactar' }
    );

    run("UPDATE leads SET ia_summary = @summary, updated_at = datetime('now') WHERE id = @id", { summary, id: req.params.id });

    logActivity(req.user.agency_id, req.params.id, null, 'ai_insight', 'Insight de IA generado para lead.');

    const insight = get('SELECT * FROM ai_insights WHERE id = @id', { id: insightId });
    res.json(insight);
  } catch (error) {
    console.error('Error generating insight:', error);
    res.status(500).json({ error: 'Error al generar insight.' });
  }
});

export default router;
