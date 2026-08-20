import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { auth } from '../middleware/auth.js';
import { realtime } from '../services/realtime.js';

// Auto-run schema migrations for conversations/messages tables.
// is_read en messages: la tabla canónica (supabase/migrations/00001_schema.sql)
// no la incluye, pero la necesitamos para contar mensajes no leídos.
const convMigrations = [
  `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ia_handling INTEGER DEFAULT 1`,
  `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`,
  `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS agency_id UUID`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false`,
];
for (const sql of convMigrations) {
  try { await run(sql); } catch (e) { console.log('[Migration] conversations:', e.message); }
}

const router = Router();
router.use(auth);

function mapMessage(m) {
  return {
    id: m.id,
    role: m.author === 'lead' ? 'lead' : m.author === 'system' ? 'system' : 'agent',
    sender_type: m.author,
    content: m.content,
    message_type: m.message_type,
    is_read: !!m.is_read,
    timestamp: m.created_at,
    created_at: m.created_at,
  };
}

// POST /api/conversations - Create a new conversation for a lead
router.post('/', async (req, res) => {
  try {
    const { lead_id, channel = 'whatsapp', content = 'Chat iniciado' } = req.body;
    const agencyId = req.user.agency_id;

    if (!lead_id) return res.status(400).json({ error: 'lead_id es obligatorio.' });

    const lead = await get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', { id: lead_id, agency_id: agencyId });
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' });

    let existing = await get(
      'SELECT * FROM conversations WHERE lead_id = @lead_id AND channel = @channel AND agency_id = @agency_id',
      { lead_id, channel, agency_id: agencyId }
    );

    if (existing) {
      const rows = await all('SELECT * FROM messages WHERE conversation_id = @id ORDER BY created_at ASC', { id: existing.id });
      const messages = rows.map(mapMessage);
      return res.status(200).json({
        id: existing.id,
        lead_id: existing.lead_id,
        channel: existing.channel,
        status: existing.status || 'active',
        ia_handling: existing.ia_handling !== 0,
        messages,
        created_at: existing.created_at,
        updated_at: existing.updated_at || existing.created_at,
      });
    }

    const convId = uuidv4();
    await run(
      `INSERT INTO conversations (id, lead_id, channel, agency_id, status, ia_handling, created_at, updated_at)
       VALUES (@id, @lead_id, @channel, @agency_id, 'active', 1, NOW(), NOW())`,
      { id: convId, lead_id, channel, agency_id: agencyId }
    );

    const firstMsgId = uuidv4();
    await run(
      `INSERT INTO messages (id, conversation_id, author, content, message_type, is_read, created_at)
       VALUES (@id, @conversation_id, 'system', @content, 'text', true, NOW())`,
      { id: firstMsgId, conversation_id: convId, content }
    );

    const messages = [mapMessage({ id: firstMsgId, author: 'system', content, message_type: 'text', is_read: true, created_at: new Date().toISOString() })];

    res.status(201).json({
      id: convId,
      lead_id,
      channel,
      status: 'active',
      ia_handling: true,
      messages,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Error al crear la conversación.' });
  }
});

// GET /api/conversations - List conversations with lead details, last message, and unread counts
router.get('/', async (req, res) => {
  try {
    const agencyId = req.user.agency_id;

    // Antes: 1 query para listar conversaciones + 1 query POR CADA conversacion
    // para traer TODOS sus mensajes solo para calcular el ultimo mensaje y el
    // contador de no leidos. Con cientos de conversaciones activas eso son
    // cientos de round-trips en cada carga de la pantalla. Ahora: una sola
    // consulta con LATERAL joins que calculan ambas cosas directamente en SQL.
    const sql = `
      SELECT
        c.*,
        l.name AS lead_name, l.phone AS lead_phone, l.ia_score AS lead_ia_score, l.pipeline_stage AS lead_pipeline_stage,
        lastmsg.id AS last_msg_id, lastmsg.author AS last_msg_author, lastmsg.content AS last_msg_content,
        lastmsg.message_type AS last_msg_type, lastmsg.is_read AS last_msg_is_read, lastmsg.created_at AS last_msg_created_at,
        COALESCE(unread.count, 0)::int AS unread_count
      FROM conversations c
      JOIN leads l ON c.lead_id = l.id
      LEFT JOIN LATERAL (
        SELECT id, author, content, message_type, is_read, created_at
        FROM messages WHERE conversation_id = c.id
        ORDER BY created_at DESC LIMIT 1
      ) lastmsg ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS count FROM messages
        WHERE conversation_id = c.id AND author = 'lead' AND is_read = false
      ) unread ON true
      WHERE c.agency_id = @agency_id
      ORDER BY c.updated_at DESC, c.created_at DESC
    `;
    const rows = await all(sql, { agency_id: agencyId });

    const conversations = rows.map((c) => ({
      id: c.id,
      lead_id: c.lead_id,
      channel: c.channel,
      status: c.status,
      ia_handling: c.ia_handling !== 0,
      updated_at: c.updated_at || c.created_at,
      created_at: c.created_at,
      lead: {
        id: c.lead_id,
        name: c.lead_name,
        phone: c.lead_phone,
        ia_score: c.lead_ia_score,
        pipeline_stage: c.lead_pipeline_stage
      },
      last_message: c.last_msg_id ? mapMessage({
        id: c.last_msg_id, author: c.last_msg_author, content: c.last_msg_content,
        message_type: c.last_msg_type, is_read: c.last_msg_is_read, created_at: c.last_msg_created_at,
      }) : null,
      unread_count: c.unread_count,
    }));

    res.json(conversations);
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json({ error: 'Error al obtener conversaciones.' });
  }
});

// GET /api/conversations/:id/messages - GET messages and mark as read
router.get('/:id/messages', async (req, res) => {
  try {
    const conv = await get('SELECT * FROM conversations WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id });
    if (!conv) return res.status(404).json({ error: 'Conversación no encontrada.' });

    await run(
      "UPDATE messages SET is_read = true WHERE conversation_id = @id AND author = 'lead' AND is_read = false",
      { id: req.params.id }
    );

    const rows = await all('SELECT * FROM messages WHERE conversation_id = @id ORDER BY created_at ASC', { id: req.params.id });
    res.json(rows.map(mapMessage));
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: 'Error al obtener mensajes.' });
  }
});

// POST /api/conversations/:id/messages - POST a message, sync via Meta WhatsApp API, and broadcast
router.post('/:id/messages', async (req, res) => {
  try {
    const { content } = req.body;
    const conversationId = req.params.id;
    const agencyId = req.user.agency_id;

    if (!content) return res.status(400).json({ error: 'El contenido es obligatorio.' });

    const conv = await get('SELECT * FROM conversations WHERE id = @id AND agency_id = @agency_id', { id: conversationId, agency_id: agencyId });
    if (!conv) return res.status(404).json({ error: 'Conversación no encontrada.' });

    const msgId = uuidv4();
    await run(
      `INSERT INTO messages (id, conversation_id, author, content, message_type, is_read, created_at)
       VALUES (@id, @conversation_id, 'agent', @content, 'text', true, NOW())`,
      { id: msgId, conversation_id: conversationId, content }
    );
    await run('UPDATE conversations SET updated_at = NOW() WHERE id = @id', { id: conversationId });

    const newMsg = mapMessage({ id: msgId, author: 'agent', content, message_type: 'text', is_read: true, created_at: new Date().toISOString() });

    // Fetch lead details
    const lead = await get('SELECT * FROM leads WHERE id = @id', { id: conv.lead_id });

    // WhatsApp config Meta Graph API check
    const agency = await get('SELECT whatsapp_token, whatsapp_phone_id FROM agencies WHERE id = @aid', { aid: agencyId });
    let whatsappSent = null; // null = no aplica (sin telefono/credenciales), true/false = intento real
    if (agency?.whatsapp_token && agency?.whatsapp_phone_id && lead?.phone) {
      const phone = String(lead.phone).replace(/[\s\-\(\)\+]/g, '');
      const fullPhone = phone.startsWith('34') ? phone : `34${phone}`;

      try {
        const waRes = await globalThis.fetch(`https://graph.facebook.com/v18.0/${agency.whatsapp_phone_id}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${agency.whatsapp_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: fullPhone,
            type: 'text',
            text: { body: content }
          })
        });
        whatsappSent = waRes.ok;
        if (!waRes.ok) {
          const errBody = await waRes.text().catch(() => '');
          console.error(`[WhatsApp POST] Meta respondio ${waRes.status}: ${errBody}`);
        }
      } catch (err) {
        whatsappSent = false;
        console.error('[WhatsApp POST] Error de red enviando mensaje:', err.message);
      }
    }
    if (realtime) {
      realtime.broadcast('message', {
        conversation_id: conversationId,
        message: newMsg
      });
    }

    res.status(201).json({ ...newMsg, whatsapp_sent: whatsappSent });
  } catch (error) {
    console.error('Error posting message:', error);
    res.status(500).json({ error: 'Error al enviar mensaje.' });
  }
});

// PATCH /api/conversations/:id - Toggle ia_handling
router.patch('/:id', async (req, res) => {
  try {
    const { ia_handling } = req.body;
    const agencyId = req.user.agency_id;
    const conversationId = req.params.id;

    const conv = await get('SELECT * FROM conversations WHERE id = @id AND agency_id = @agency_id', { id: conversationId, agency_id: agencyId });
    if (!conv) return res.status(404).json({ error: 'Conversación no encontrada.' });

    const val = ia_handling ? 1 : 0;
    await run('UPDATE conversations SET ia_handling = @val, updated_at = NOW() WHERE id = @id AND agency_id = @agency_id', {
      val,
      id: conversationId,
      agency_id: agencyId
    });

    res.json({ ok: true, id: conversationId, ia_handling: !!ia_handling });
  } catch (error) {
    console.error('Error patching conversation:', error);
    res.status(500).json({ error: 'Error al actualizar conversación.' });
  }
});

export default router;
