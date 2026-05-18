import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { auth } from '../middleware/auth.js';
import { callClaude } from '../services/claude.js';

const router = Router();
router.use(auth);

router.get('/', (req, res) => {
  try {
    const { lead_id, channel } = req.query;
    let sql = 'SELECT c.*, u.name AS agent_name FROM conversations c LEFT JOIN users u ON c.agent_id = u.id WHERE c.agency_id = @agency_id';
    const params = { agency_id: req.user.agency_id };

    if (lead_id) { sql += ' AND c.lead_id = @lead_id'; params.lead_id = lead_id; }
    if (channel) { sql += ' AND c.channel = @channel'; params.channel = channel; }

    sql += ' ORDER BY c.created_at DESC';

    const conversations = all(sql, params).map(c => ({
      ...c,
      messages: c.messages ? JSON.parse(c.messages) : [],
    }));

    res.json(conversations);
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json({ error: 'Error al obtener conversaciones.' });
  }
});

router.post('/', (req, res) => {
  try {
    const { lead_id, agent_id, channel, content } = req.body;
    if (!lead_id || !channel) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: lead_id, channel.' });
    }

    const lead = get('SELECT * FROM leads WHERE id = @id', { id: lead_id });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });

    const id = uuidv4();
    const messages = content ? [{ role: 'user', content, timestamp: new Date().toISOString() }] : [];

    run(
      `INSERT INTO conversations (id, agency_id, lead_id, agent_id, channel, messages, created_at)
       VALUES (@id, @agency_id, @lead_id, @agent_id, @channel, @messages, datetime('now'))`,
      {
        id,
        agency_id: lead.agency_id || req.user.agency_id,
        lead_id,
        agent_id: agent_id || req.user.id,
        channel,
        messages: JSON.stringify(messages),
      }
    );

    run("UPDATE leads SET last_activity = datetime('now'), updated_at = datetime('now') WHERE id = @id", { id: lead_id });

    run(
      `INSERT INTO activities (id, agency_id, lead_id, user_id, type, description, created_at)
       VALUES (@id, @agency_id, @lead_id, @user_id, @type, @description, datetime('now'))`,
      {
        id: uuidv4(),
        agency_id: lead.agency_id,
        lead_id,
        user_id: req.user.id,
        type: 'conversation',
        description: `Nueva conversación por ${channel}.`,
      }
    );

    const conversation = get('SELECT * FROM conversations WHERE id = @id', { id });
    conversation.messages = JSON.parse(conversation.messages);
    res.status(201).json(conversation);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Error al crear conversación.' });
  }
});

router.post('/:id/analyze', async (req, res) => {
  try {
    const conversation = get('SELECT * FROM conversations WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada.' });

    const messages = conversation.messages ? JSON.parse(conversation.messages) : [];
    const transcript = messages.map(m => `${m.role}: ${m.content}`).join('\n');

    const summary = await callClaude(
      'Eres un analizador de conversaciones inmobiliarias. Resume la conversación, detecta la intención del lead, y sugiere los próximos pasos. Responde en español.',
      transcript || 'No hay mensajes en esta conversación.'
    );

    run('UPDATE conversations SET summary = @summary WHERE id = @id', { summary, id: req.params.id });

    const leadId = conversation.lead_id;
    run("UPDATE leads SET ia_summary = @summary, updated_at = datetime('now') WHERE id = @id", { summary, id: leadId });

    res.json({ id: req.params.id, summary });
  } catch (error) {
    console.error('Error analyzing conversation:', error);
    res.status(500).json({ error: 'Error al analizar conversación.' });
  }
});

export default router;
