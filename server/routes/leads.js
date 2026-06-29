import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { auth } from '../middleware/auth.js';
import { generateLeadSummary } from '../services/claude.js';
import { checkLimit } from '../services/plan-checker.js';
import { triggerAutomations } from '../services/automation-engine.js';
import { leadSchema, validateBody } from '../middleware/validators.js';
import { EmailService } from '../services/email.js';
import { WhatsAppService } from '../services/whatsapp.js';

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

// GET /api/leads - GET leads with search, stage filters and pagination
router.get('/', (req, res) => {
  try {
    const { status, stage, office_id, assigned_to, search, page, limit } = req.query;
    const agencyId = req.user.agency_id;

    let filterSql = ' WHERE l.agency_id = @agency_id';
    const params = { agency_id: agencyId };

    const statusVal = stage || status;
    if (statusVal) {
      filterSql += ' AND (l.status = @status OR l.pipeline_stage = @status)';
      params.status = statusVal;
    }
    if (office_id) {
      filterSql += ' AND l.office_id = @office_id';
      params.office_id = office_id;
    }
    if (assigned_to) {
      filterSql += ' AND l.assigned_to = @assigned_to';
      params.assigned_to = assigned_to;
    }
    if (search) {
      filterSql += ' AND (l.name LIKE @search OR l.email LIKE @search OR l.phone LIKE @search OR l.property_interest LIKE @search)';
      params.search = `%${search}%`;
    }

    // Get total count matching criteria for pagination
    const countRow = get(`SELECT COUNT(*) as count FROM leads l${filterSql}`, params);
    const total = countRow ? countRow.count : 0;

    let querySql = `SELECT l.*, u.name AS assigned_name FROM leads l LEFT JOIN users u ON l.assigned_to = u.id${filterSql} ORDER BY l.updated_at DESC`;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;

    if (page && limit) {
      const offsetNum = (pageNum - 1) * limitNum;
      querySql += ' LIMIT @limit OFFSET @offset';
      params.limit = limitNum;
      params.offset = offsetNum;
    }

    const leads = all(querySql, params).map(l => {
      // Ensure compatible fields
      return {
        ...l,
        zones: l.zones ? JSON.parse(l.zones) : [],
        ia_insights: l.ia_insights ? JSON.parse(l.ia_insights) : [],
      };
    });

    res.json({
      leads,
      total,
      page: pageNum,
      limit: limitNum
    });
  } catch (error) {
    console.error('Error listing leads:', error);
    res.status(500).json({ error: 'Error al obtener leads.' });
  }
});

// GET /api/leads/:id - GET single lead with activities, conversations, and pending tasks
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

    // Parse array columns
    lead.zones = lead.zones ? JSON.parse(lead.zones) : [];
    lead.ia_insights = lead.ia_insights ? JSON.parse(lead.ia_insights) : [];

    const activities = all(
      'SELECT * FROM activities WHERE lead_id = @lead_id ORDER BY created_at DESC LIMIT 30',
      { lead_id: req.params.id }
    ).map(a => ({
      ...a,
      metadata: a.metadata ? JSON.parse(a.metadata) : null,
    }));

    const conversations = all(
      'SELECT * FROM conversations WHERE lead_id = @lead_id ORDER BY created_at DESC',
      { lead_id: req.params.id }
    ).map(c => {
      const messagesList = c.messages ? JSON.parse(c.messages) : [];
      return { ...c, messages: messagesList };
    });

    const insights = all(
      'SELECT * FROM ai_insights WHERE lead_id = @lead_id ORDER BY created_at DESC',
      { lead_id: req.params.id }
    );

    const tasks = all(
      'SELECT * FROM tasks WHERE lead_id = @lead_id AND completed = 0 ORDER BY due_date ASC',
      { lead_id: req.params.id }
    );

    res.json({
      ...lead,
      lead,
      activities,
      conversations,
      insights,
      tasks
    });
  } catch (error) {
    console.error('Error getting lead:', error);
    res.status(500).json({ error: 'Error al obtener lead.' });
  }
});

// POST /api/leads - Create lead, verify plan limits, and trigger background workflows
router.post('/', checkLimit('leads'), validateBody(leadSchema), (req, res) => {
  try {
    const { name, phone, email, budget, zone, property_interest, source, agency_id, office_id, pipeline_stage } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio.' });

    const id = uuidv4();
    const activeAgencyId = agency_id || req.user.agency_id;
    const initialStage = pipeline_stage || 'nuevo';

    // In SQLite leads check status table constraint: default it if not matching
    const sqliteStatus = ['nuevo','contactado','interesado','visita_agendada','negociacion','reserva','cerrado'].includes(initialStage) ? initialStage : 'nuevo';

    run(
      `INSERT INTO leads (id, agency_id, office_id, name, phone, email, budget, zone, property_interest, source, status, pipeline_stage, pipeline_stage_updated_at, created_at, updated_at)
       VALUES (@id, @agency_id, @office_id, @name, @phone, @email, @budget, @zone, @property_interest, @source, @status, @pipeline_stage, datetime('now'), datetime('now'), datetime('now'))`,
      {
        id,
        agency_id: activeAgencyId,
        office_id: office_id || req.user.office_id,
        name,
        phone,
        email,
        budget: budget ? Number(budget) : null,
        zone,
        property_interest,
        source: source || 'manual',
        status: sqliteStatus,
        pipeline_stage: initialStage,
      }
    );

    logActivity(activeAgencyId, id, req.user.id, 'lead_created', `Lead ${name} creado.`);

    const lead = get('SELECT * FROM leads WHERE id = @id', { id });
    res.status(201).json(lead);

    // Run background qualifications and automation triggers
    const port = process.env.PORT || 3002;
    const localUrl = `http://localhost:${port}`;
    const token = req.headers['x-auth-token'] || 'demo-token-dev';
    const userId = req.headers['x-auth-user'] || req.user?.id;

    globalThis.fetch(`${localUrl}/api/agents/captador`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token,
        'x-auth-user': userId,
      },
      body: JSON.stringify({ lead_id: id, agency_id: activeAgencyId })
    }).then(r => r.json())
      .then(d => {
        console.log('[Background Captador] Calificación completada:', d);
        triggerAutomations({
          trigger_type: 'lead_created',
          lead_id: id,
          agency_id: activeAgencyId,
          trigger_payload: d.result || lead
        }).then(ad => console.log('[Background Trigger] Automatizaciones ejecutadas:', ad))
          .catch(ae => console.error('[Background Trigger] Error:', ae));
      })
      .catch(err => {
        console.error('[Background Captador] Error:', err);
        triggerAutomations({
          trigger_type: 'lead_created',
          lead_id: id,
          agency_id: activeAgencyId,
          trigger_payload: lead
        }).catch(ae => console.error('[Background Trigger Fallback] Error:', ae));
      });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Error al crear lead.' });
  }
});

// PATCH /api/leads/:id/status - Update lead status
router.patch('/:id/status', (req, res) => {
  try {
    const existing = get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!existing) return res.status(404).json({ error: 'Lead no encontrado.' });

    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'El campo status es obligatorio.' });

    const isStageValid = ['nuevo','contactado','interesado','visita_agendada','negociacion','reserva','cerrado'].includes(status);
    const updates = ['pipeline_stage = @status', 'pipeline_stage_updated_at = datetime(\'now\')'];
    const params = { status, id: req.params.id };

    if (isStageValid) {
      updates.push('status = @status');
    }

    run(`UPDATE leads SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = @id`, params);

    if (status !== existing.pipeline_stage) {
      logActivity(req.user.agency_id, req.params.id, req.user.id, 'stage_changed', `Etapa cambiada de ${existing.pipeline_stage || existing.status} a ${status}.`, { from: existing.pipeline_stage || existing.status, to: status });

      // Trigger stage_changed automation
      triggerAutomations({
        trigger_type: 'stage_changed',
        lead_id: req.params.id,
        agency_id: req.user.agency_id,
        trigger_payload: { to_stage: status, from_stage: existing.pipeline_stage || existing.status }
      }).catch(ae => console.error('[Background Trigger PATCH status] Error:', ae));
    }

    const lead = get('SELECT * FROM leads WHERE id = @id', { id: req.params.id });
    res.json(lead);
  } catch (error) {
    console.error('Error updating lead status:', error);
    res.status(500).json({ error: 'Error al actualizar estado del lead.' });
  }
});

// PATCH /api/leads/:id - Update lead details and check for pipeline stage triggers
router.patch('/:id', validateBody(leadSchema.partial()), (req, res) => {
  try {
    const existing = get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!existing) return res.status(404).json({ error: 'Lead no encontrado.' });

    const allowed = ['name', 'phone', 'email', 'budget', 'zone', 'property_interest', 'source', 'status', 'pipeline_stage', 'office_id', 'assigned_to', 'ia_score', 'ia_insights', 'ia_insight', 'ia_summary', 'urgency', 'operation_type', 'budget_max', 'zones', 'property_type'];
    const updates = [];
    const params = { id: req.params.id };

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if ((field === 'zones' || field === 'ia_insights') && typeof value === 'object') {
          value = JSON.stringify(value);
        }
        updates.push(`${field} = @${field}`);
        params[field] = value;
      }
    }

    if (req.body.pipeline_stage && !req.body.status) {
      const isStageValid = ['nuevo','contactado','interesado','visita_agendada','negociacion','reserva','cerrado'].includes(req.body.pipeline_stage);
      if (isStageValid) {
        updates.push('status = @status_sync');
        params.status_sync = req.body.pipeline_stage;
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar.' });

    updates.push("updated_at = datetime('now')");
    run(`UPDATE leads SET ${updates.join(', ')} WHERE id = @id`, params);

    const oldStage = existing.pipeline_stage || existing.status;
    const newStage = req.body.pipeline_stage || req.body.status;

    if (newStage && newStage !== oldStage) {
      logActivity(req.user.agency_id, req.params.id, req.user.id, 'stage_changed', `Etapa cambiada a ${newStage}`, { from: oldStage, to: newStage });

      // Trigger stage_changed automation
      triggerAutomations({
        trigger_type: 'stage_changed',
        lead_id: req.params.id,
        agency_id: req.user.agency_id,
        trigger_payload: { to_stage: newStage, from_stage: oldStage }
      }).catch(ae => console.error('[Background Trigger PATCH] Error:', ae));
    }

    logActivity(req.user.agency_id, req.params.id, req.user.id, 'lead_updated', 'Lead actualizado.');

    const lead = get('SELECT * FROM leads WHERE id = @id', { id: req.params.id });
    res.json(lead);
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Error al actualizar lead.' });
  }
});

// PUT /api/leads/:id - Update lead details with explicit cross-agency guard
router.put('/:id', validateBody(leadSchema.partial()), (req, res) => {
  try {
    const existing = get('SELECT * FROM leads WHERE id = @id', { id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Lead no encontrado.' });
    if (existing.agency_id !== req.user.agency_id) return res.status(403).json({ error: 'No autorizado para modificar este lead.' });

    const allowed = ['name', 'phone', 'email', 'budget', 'zone', 'property_interest', 'source', 'status', 'pipeline_stage', 'office_id', 'assigned_to', 'ia_score', 'ia_insights', 'ia_insight', 'ia_summary', 'urgency', 'operation_type', 'budget_max', 'zones', 'property_type'];
    const updates = [];
    const params = { id: req.params.id };

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if ((field === 'zones' || field === 'ia_insights') && typeof value === 'object') {
          value = JSON.stringify(value);
        }
        updates.push(field + ' = @' + field);
        params[field] = value;
      }
    }

    if (req.body.pipeline_stage && !req.body.status) {
      const isStageValid = ['nuevo','contactado','interesado','visita_agendada','negociacion','reserva','cerrado'].includes(req.body.pipeline_stage);
      if (isStageValid) {
        updates.push('status = @status_sync');
        params.status_sync = req.body.pipeline_stage;
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar.' });

    updates.push("updated_at = datetime('now')");
    run('UPDATE leads SET ' + updates.join(', ') + ' WHERE id = @id', params);

    const lead = get('SELECT * FROM leads WHERE id = @id', { id: req.params.id });
    res.json(lead);
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Error al actualizar lead.' });
  }
});

// DELETE /api/leads/:id - Archive lead (soft delete by setting pipeline_stage to 'archivo')
router.delete('/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!existing) return res.status(404).json({ error: 'Lead no encontrado.' });

    run("UPDATE leads SET pipeline_stage = 'archivo', updated_at = datetime('now') WHERE id = @id", { id: req.params.id });
    logActivity(req.user.agency_id, req.params.id, req.user.id, 'stage_changed', `Lead archivado.`, { from: existing.pipeline_stage || existing.status, to: 'archivo' });

    res.json({ ok: true, success: true });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Error al archivar lead.' });
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
    ).map(a => ({
      ...a,
      metadata: a.metadata ? JSON.parse(a.metadata) : null,
    }));
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

// POST /api/leads/:id/tasks - Create task for lead
router.post('/:id/tasks', (req, res) => {
  try {
    const { title, description, due_date } = req.body;
    if (!title) return res.status(400).json({ error: 'El título es obligatorio.' });

    const taskId = uuidv4();
    run(
      `INSERT INTO tasks (id, lead_id, title, description, due_date, completed, created_at)
       VALUES (@id, @lead_id, @title, @description, @due_date, 0, datetime('now'))`,
      {
        id: taskId,
        lead_id: req.params.id,
        title,
        description: description || '',
        due_date: due_date || null
      }
    );

    logActivity(req.user.agency_id, req.params.id, req.user.id, 'task_created', `Tarea creada: "${title}"`);

    const task = get('SELECT * FROM tasks WHERE id = @id', { id: taskId });
    res.status(201).json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Error al crear la tarea.' });
  }
});

// PATCH /api/leads/:id/tasks/:taskId - Toggle or mark task completed status
router.patch('/:id/tasks/:taskId', (req, res) => {
  try {
    const { completed } = req.body;
    const isCompleted = completed ? 1 : 0;

    run('UPDATE tasks SET completed = @completed WHERE id = @taskId AND lead_id = @leadId', {
      completed: isCompleted,
      taskId: req.params.taskId,
      leadId: req.params.id
    });

    if (isCompleted) {
      logActivity(req.user.agency_id, req.params.id, req.user.id, 'task_completed', `Tarea completada.`);
    }

    const task = get('SELECT * FROM tasks WHERE id = @id', { id: req.params.taskId });
    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Error al actualizar la tarea.' });
  }
});

// POST /api/leads/:id/email - Send manual email to lead and log activity
router.post('/:id/email', async (req, res) => {
  try {
    const { id } = req.params;
    const { recipient, subject, body, template } = req.body;
    const agencyId = req.user.agency_id;

    if (!subject || !body) {
      return res.status(400).json({ error: 'El asunto y cuerpo del mensaje son obligatorios.' });
    }

    const lead = get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', { id, agency_id: agencyId });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });

    const toEmail = recipient || lead.email;
    if (!toEmail) return res.status(400).json({ error: 'El lead no tiene un correo electrónico configurado.' });

    const agency = get('SELECT * FROM agencies WHERE id = @agency_id', { agency_id: agencyId });
    const emailService = new EmailService({
      sendgridKey: agency.sendgrid_api_key,
      fromEmail: agency.sendgrid_from_email,
      agencyName: agency.name
    });

    // Make an elegant wrapping HTML for manual emails matching current style
    const htmlBody = `<div style="background:#1a1a2e;padding:40px;font-family:Arial,sans-serif">
      <div style="max-width:600px;margin:auto;background:#16213e;border-radius:12px;padding:30px">
        <h2 style="color:#e94560;margin-top:0">${subject}</h2>
        <div style="color:#e0e0e0;font-size:15px;line-height:1.6;white-space:pre-wrap">${body}</div>
        <hr style="border:1px solid #0f3460;margin:25px 0">
        <p style="color:#888;font-size:12px;text-align:center">${agency.name || 'PropIA Inmobiliaria'} · ${agency.address || ''}</p>
      </div>
    </div>`;

    const result = await emailService.sendEmail({
      to: toEmail,
      subject,
      html: htmlBody,
    });

    const status = result.success ? 'sent' : 'failed';
    const errorMsg = result.error || null;

    logActivity(
      agencyId,
      id,
      req.user.id,
      'email_sent',
      `Email manual enviado a ${toEmail} con asunto: "${subject}". Estado: ${status}`,
      { subject, recipient: toEmail, status, error: errorMsg }
    );

    res.json({ success: result.success || false, status, messageId: result.messageId, error: errorMsg });
  } catch (error) {
    console.error('Error sending lead email:', error);
    res.status(500).json({ error: 'Error al enviar el email.' });
  }
});

// POST /api/leads/:id/appointments - Create and schedule a new appointment
router.post('/:id/appointments', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, starts_at, ends_at, assigned_user_id, location, online_url, notes, attendant_name } = req.body;
    const agencyId = req.user.agency_id;

    if (!type || !starts_at || !ends_at) {
      return res.status(400).json({ error: 'El tipo de cita, fecha de inicio y fin son obligatorios.' });
    }

    if (new Date(starts_at) <= new Date()) {
      return res.status(400).json({ error: 'La fecha de la cita debe ser futura.' });
    }

    const lead = get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', { id, agency_id: agencyId });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });

    if (!lead.email && !lead.phone) {
      return res.status(400).json({ error: 'El lead debe tener un correo electrónico o un teléfono para poder programar la cita y enviar confirmación.' });
    }

    const agency = get('SELECT * FROM agencies WHERE id = @agency_id', { agency_id: agencyId });
    const finalAttendant = attendant_name || agency.appointment_attendant_name || 'Comercial asignado';
    const finalOnlineUrl = type === 'online' ? (online_url || agency.online_meeting_url || 'https://meet.google.com/') : null;
    const finalLocation = type === 'physical' ? (location || agency.address || 'Oficina principal') : null;

    const appointmentId = uuidv4();
    const clientToken = uuidv4(); // Unique long random token

    run(
      `INSERT INTO appointments (id, agency_id, lead_id, assigned_user_id, type, status, starts_at, ends_at, timezone, location, online_url, notes, client_token, created_at, updated_at)
       VALUES (@id, @agency_id, @lead_id, @assigned_user_id, @type, 'scheduled', @starts_at, @ends_at, @timezone, @location, @online_url, @notes, @client_token, datetime('now'), datetime('now'))`,
      {
        id: appointmentId,
        agency_id: agencyId,
        lead_id: id,
        assigned_user_id: assigned_user_id || req.user.id,
        type,
        starts_at,
        ends_at,
        timezone: agency.timezone || 'Europe/Madrid',
        location: finalLocation,
        online_url: finalOnlineUrl,
        notes: notes || '',
        client_token: clientToken,
      }
    );

    const appointment = get('SELECT * FROM appointments WHERE id = @id', { id: appointmentId });
    // Keep attendant_name for rendering/templates
    appointment.attendant_name = finalAttendant;

    logActivity(
      agencyId,
      id,
      req.user.id,
      'appointment_scheduled',
      `Cita programada (${type === 'online' ? 'online' : 'presencial'}) para el ${new Date(starts_at).toLocaleString('es-ES')}.`,
      { appointment_id: appointmentId, starts_at }
    );

    // Enviar confirmaciones automáticas inmediatamente
    const emailService = new EmailService({
      sendgridKey: agency.sendgrid_api_key,
      fromEmail: agency.sendgrid_from_email,
      agencyName: agency.name
    });
    const whatsappService = new WhatsAppService({
      whatsappToken: agency.whatsapp_token,
      whatsappPhoneId: agency.whatsapp_phone_id,
      whatsappNumber: agency.whatsapp_number
    });

    const origin = req.headers.origin || 'http://localhost:5173';
    const modifyUrl = `${origin}/appointment/${clientToken}`;

    let emailResult = { success: false };
    let waResult = { success: false };

    if (lead.email) {
      emailResult = await emailService.sendAppointmentConfirmation(lead, appointment, agency, modifyUrl);
      run(
        `INSERT INTO appointment_messages (id, appointment_id, channel, type, status, error, sent_at)
         VALUES (@id, @appt_id, 'email', 'confirmation', @status, @error, datetime('now'))`,
        {
          id: uuidv4(),
          appt_id: appointmentId,
          status: emailResult.success || emailResult.mock ? 'sent' : 'failed',
          error: emailResult.error || null,
        }
      );
      logActivity(
        agencyId,
        id,
        null,
        'email_sent',
        `Confirmación de cita enviada por email a ${lead.email}.`,
        { appointment_id: appointmentId }
      );
    }

    if (lead.phone) {
      waResult = await whatsappService.sendAppointmentConfirmation(lead, appointment, agency, modifyUrl);
      run(
        `INSERT INTO appointment_messages (id, appointment_id, channel, type, status, error, sent_at)
         VALUES (@id, @appt_id, 'whatsapp', 'confirmation', @status, @error, datetime('now'))`,
        {
          id: uuidv4(),
          appt_id: appointmentId,
          status: waResult.success || waResult.mock ? 'sent' : 'failed',
          error: waResult.error || null,
        }
      );
      logActivity(
        agencyId,
        id,
        null,
        'whatsapp_sent',
        `Confirmación de cita enviada por WhatsApp a ${lead.phone}.`,
        { appointment_id: appointmentId }
      );
    }

    res.status(201).json({ appointment, email_sent: emailResult.success || emailResult.mock, whatsapp_sent: waResult.success || waResult.mock });
  } catch (error) {
    console.error('Error scheduling lead appointment:', error);
    res.status(500).json({ error: 'Error al programar la cita.' });
  }
});

// GET /api/leads/:id/appointments - Fetch all appointments of lead (scoped to agency)
router.get('/:id/appointments', (req, res) => {
  try {
    const { id } = req.params;
    const agencyId = req.user.agency_id;

    const lead = get('SELECT id FROM leads WHERE id = @id AND agency_id = @agency_id', { id, agency_id: agencyId });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });

    const appointments = all(
      `SELECT a.*, u.name AS assigned_user_name 
       FROM appointments a 
       LEFT JOIN users u ON a.assigned_user_id = u.id 
       WHERE a.lead_id = @lead_id AND a.agency_id = @agency_id 
       ORDER BY a.starts_at DESC`,
      { lead_id: id, agency_id: agencyId }
    );

    res.json(appointments);
  } catch (error) {
    console.error('Error fetching lead appointments:', error);
    res.status(500).json({ error: 'Error al obtener las citas del lead.' });
  }
});

// ─── AUTO GENERATE EMAIL ──────────────────────────────────────────────────
router.post('/:id/auto-email', async (req, res) => {
  try {
    const { id } = req.params;
    const { template: templateType, property_id } = req.body;
    const agencyId = req.user.agency_id;

    const lead = get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', { id, agency_id: agencyId });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });

    const agency = get('SELECT * FROM agencies WHERE id = @agency_id', { agency_id: agencyId });

    // Only fetch property if property_id sent OR auto-detect best property for context
    const property = property_id
      ? get('SELECT * FROM properties WHERE id = @pid AND agency_id = @aid', { pid: property_id, aid: agencyId })
      : null;

    // ── GENERATION MODE (regenerate=false) ──
    if (!req.body.regenerate) {
      if (!lead.email) {
        return res.status(400).json({ error: 'El lead no tiene email. Añade un email al lead antes de generar un email automático.' });
      }
      const { generateAiEmailContent, detectTemplate } = await import('../services/lead-automation.service.js');
      const detectedTemplate = templateType || detectTemplate(lead);
      const content = await generateAiEmailContent({ lead, agency, property, templateType: detectedTemplate });
      return res.json(content);
    }

    // ── SEND MODE (regenerate=true) ──
    if (!lead.email) {
      return res.status(400).json({ error: 'El lead no tiene email. No se puede enviar el email.' });
    }

    const { sendAutomatedEmail, createFollowUpTask } =
      await import('../services/lead-automation.service.js');

    // Use the subject/body sent from frontend (user may have edited them)
    const subject = req.body.subject || `Hola ${lead.name}, contacto desde ${agency.name || 'nuestra agencia'}`;
    const body = req.body.body || `Hola ${lead.name},\n\nGracias por tu interés. Quedamos a tu disposición para cualquier consulta.\n\nUn saludo.`;
    const template = req.body.template || 'first_contact';

    const result = await sendAutomatedEmail({
      lead, agency, property, subject, body,
      template, userId: req.user.id,
    });

    createFollowUpTask(agencyId, id, req.user.id);

    if (lead.status === 'nuevo') {
      run(`UPDATE leads SET status = 'contactado', updated_at = datetime('now') WHERE id = @id`, { id });
    }

    res.json({ ...result, subject, body, template, lead_status_updated: lead.status === 'nuevo' });
  } catch (error) {
    console.error('Error in auto-email:', error);
    const message = error.message || 'Error al generar/enviar el email automático';
    res.status(500).json({ error: message });
  }
});

// ─── AUTO APPOINTMENT ─────────────────────────────────────────────────────
router.post('/:id/auto-appointment', async (req, res) => {
  try {
    const { id } = req.params;
    const agencyId = req.user.agency_id;

    const lead = get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', { id, agency_id: agencyId });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });

    const agency = get('SELECT * FROM agencies WHERE id = @agency_id', { agency_id: agencyId });

    if (!req.body.confirm) {
      const { suggestAppointment } = await import('../services/appointment-automation.service.js');
      const suggestion = await suggestAppointment({ lead, agency, userId: req.user.id });
      return res.json(suggestion);
    }

    const { createAppointment } = await import('../services/appointment-automation.service.js');
    const { type, starts_at, ends_at, timezone, location, online_url, notes, attendant_name, assigned_user_id } = req.body;
    const origin = req.headers.origin || 'http://localhost:5173';

    if (!type || !starts_at || !ends_at) {
      return res.status(400).json({ error: 'Faltan datos obligatorios: tipo, fecha inicio y fin.' });
    }

    const result = await createAppointment({
      lead, agency, type, starts_at, ends_at,
      timezone: timezone || agency.timezone || 'Europe/Madrid',
      location, online_url, notes, attendant_name,
      assigned_user_id: assigned_user_id || req.user.id,
      userId: req.user.id, origin,
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error in auto-appointment:', error);
    res.status(500).json({ error: 'Error al programar cita automática.' });
  }
});

// ─── QUALIFY LEAD ─────────────────────────────────────────────────────────
router.post('/:id/qualify', async (req, res) => {
  try {
    const { id } = req.params;
    const agencyId = req.user.agency_id;

    const lead = get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', { id, agency_id: agencyId });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });

    const { qualifyLead } = await import('../services/ai-qualifier.service.js');
    const result = await qualifyLead(lead, agencyId, req.user.id);

    res.json(result);
  } catch (error) {
    console.error('Error qualifying lead:', error);
    res.status(500).json({ error: 'Error al cualificar lead.' });
  }
});

// ─── SALES AGENT ──────────────────────────────────────────────────────────
router.post('/:id/sales-agent', async (req, res) => {
  try {
    const { id } = req.params;
    const agencyId = req.user.agency_id;

    const lead = get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', { id, agency_id: agencyId });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });

    const agency = get('SELECT * FROM agencies WHERE id = @agency_id', { agency_id: agencyId });

    if (!req.body.execute) {
      const { suggestSalesAction } = await import('../services/sales-agent.service.js');
      const suggestion = await suggestSalesAction(lead, agency, req.user.id);
      return res.json(suggestion);
    }

    const { executeSalesAction } = await import('../services/sales-agent.service.js');
    const { action, channel, message, property_id } = req.body;
    const origin = req.headers.origin || 'http://localhost:5173';

    const result = await executeSalesAction({
      lead, agency, action, channel, message, propertyId: property_id, userId: req.user.id, origin,
    });

    res.json(result);
  } catch (error) {
    console.error('Error in sales agent:', error);
    res.status(500).json({ error: 'Error al ejecutar acción del Vendedor IA.' });
  }
});

export default router;
