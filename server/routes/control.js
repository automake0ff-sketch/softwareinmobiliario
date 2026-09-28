import { Router } from 'express'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { all, get, run } from '../db/db.js'
import { auth, requireRole } from '../middleware/auth.js'
import { WhatsAppSender } from '../services/whatsapp-sender.js'
import { ActionExecutor } from '../services/action-executor.js'
import { withConsentFooter, markConsentNotice, setAiPaused } from '../services/message-policy.js'
import { getAIUsageSummary } from '../services/ai-budget.js'

const router = Router()
router.use(auth)

const BACKEND_URL = () => (process.env.BACKEND_PUBLIC_URL || process.env.API_URL || '').replace(/\/$/, '')

async function ensurePortalToken(agencyId) {
  const row = await get('SELECT portal_inbox_token FROM agencies WHERE id = @id', { id: agencyId })
  if (row?.portal_inbox_token) return row.portal_inbox_token
  const token = crypto.randomBytes(24).toString('hex')
  await run('UPDATE agencies SET portal_inbox_token = @t WHERE id = @id', { t: token, id: agencyId })
  return token
}

// ── Ajustes de automatización ────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    const aid = req.user.agency_id
    const a = await get('SELECT ai_mode, auto_assign FROM agencies WHERE id = @id', { id: aid })
    const token = await ensurePortalToken(aid)
    const base = BACKEND_URL()
    res.json({
      ai_mode: a?.ai_mode || 'auto',
      auto_assign: a?.auto_assign !== false,
      portal_inbox_path: `/api/webhooks/portal-leads/${token}`,
      portal_inbox_url: base ? `${base}/api/webhooks/portal-leads/${token}` : null,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.patch('/settings', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { ai_mode, auto_assign } = req.body || {}
    if (ai_mode !== undefined && !['auto', 'approve'].includes(ai_mode)) {
      return res.status(400).json({ error: "ai_mode debe ser 'auto' o 'approve'." })
    }
    if (ai_mode !== undefined) {
      await run('UPDATE agencies SET ai_mode = @v WHERE id = @id', { v: ai_mode, id: req.user.agency_id })
    }
    if (auto_assign !== undefined) {
      await run('UPDATE agencies SET auto_assign = @v WHERE id = @id', { v: Boolean(auto_assign), id: req.user.agency_id })
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Cola de aprobación ───────────────────────────────────────────────────
router.get('/approvals', async (req, res) => {
  try {
    const status = ['pending', 'sent', 'rejected'].includes(req.query.status) ? req.query.status : 'pending'
    const rows = await all(
      `SELECT p.id, p.lead_id, p.agent_type, p.content, p.status, p.reason, p.created_at,
              l.name AS lead_name, l.phone AS lead_phone
       FROM pending_messages p
       JOIN leads l ON l.id = p.lead_id
       WHERE p.agency_id = @aid AND p.status = @status
       ORDER BY p.created_at DESC
       LIMIT 100`,
      { aid: req.user.agency_id, status }
    )
    res.json({ items: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/approvals/:id/approve', async (req, res) => {
  try {
    const aid = req.user.agency_id
    const row = await get(
      `SELECT * FROM pending_messages WHERE id = @id AND agency_id = @aid AND status = 'pending'`,
      { id: req.params.id, aid }
    )
    if (!row) return res.status(404).json({ error: 'Borrador no encontrado o ya gestionado.' })

    const lead = await get(
      'SELECT id, phone, whatsapp_opt_out, consent_notice_sent FROM leads WHERE id = @id AND agency_id = @aid',
      { id: row.lead_id, aid }
    )
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' })
    if (lead.whatsapp_opt_out) {
      await run(
        `UPDATE pending_messages SET status = 'rejected', reason = 'opt_out', decided_by = @u, decided_at = NOW() WHERE id = @id`,
        { u: req.user.id, id: row.id }
      )
      return res.status(409).json({ error: 'El lead se ha dado de baja; el mensaje no se envía.' })
    }

    const agency = await get('SELECT whatsapp_token, whatsapp_phone_id FROM agencies WHERE id = @id', { id: aid })
    if (!agency?.whatsapp_token || !agency?.whatsapp_phone_id) {
      return res.status(400).json({ error: 'WhatsApp no está configurado en esta agencia.' })
    }
    const phone = row.phone || lead.phone
    if (!phone) return res.status(400).json({ error: 'El lead no tiene teléfono.' })

    const edited = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
    const content = edited || row.content
    const text = withConsentFooter(content, lead, false)

    const sender = new WhatsAppSender(String(agency.whatsapp_token), String(agency.whatsapp_phone_id))
    const ok = await sender.sendText(String(phone), text)
    if (!ok) {
      return res.status(502).json({ error: 'WhatsApp no aceptó el mensaje (¿fuera de la ventana de 24 h o credenciales incorrectas?). El borrador sigue pendiente.' })
    }

    await new ActionExecutor(aid).saveMessageToConversation(row.lead_id, 'ia_agent', text)
    if (!lead.consent_notice_sent) await markConsentNotice(row.lead_id)
    await run(
      `UPDATE pending_messages SET status = 'sent', content = @c, decided_by = @u, decided_at = NOW(), sent_at = NOW() WHERE id = @id`,
      { c: content, u: req.user.id, id: row.id }
    )
    await run(
      `INSERT INTO activities (id, agency_id, lead_id, type, description, metadata, created_at)
       VALUES (@id, @aid, @lid, 'ia_message_approved', @d, @m, NOW())`,
      {
        id: uuidv4(), aid, lid: row.lead_id,
        d: `Mensaje de ${row.agent_type || 'IA'} aprobado y enviado${edited ? ' (editado)' : ''}`,
        m: JSON.stringify({ approved_by: req.user.id, pending_id: row.id, edited: Boolean(edited) }),
      }
    )
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/approvals/:id/reject', async (req, res) => {
  try {
    const r = await get(
      `SELECT id FROM pending_messages WHERE id = @id AND agency_id = @aid AND status = 'pending'`,
      { id: req.params.id, aid: req.user.agency_id }
    )
    if (!r) return res.status(404).json({ error: 'Borrador no encontrado o ya gestionado.' })
    await run(
      `UPDATE pending_messages SET status = 'rejected', decided_by = @u, decided_at = NOW() WHERE id = @id`,
      { u: req.user.id, id: r.id }
    )
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Traspaso a humano ────────────────────────────────────────────────────
router.post('/leads/:id/handoff', async (req, res) => {
  try {
    const lead = await get('SELECT id FROM leads WHERE id = @id AND agency_id = @aid', {
      id: req.params.id, aid: req.user.agency_id,
    })
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' })
    const paused = req.body?.paused !== false
    await setAiPaused(req.user.agency_id, lead.id, paused)
    await run(
      `INSERT INTO activities (id, agency_id, lead_id, type, description, metadata, created_at)
       VALUES (@id, @aid, @lid, 'ai_handoff', @d, @m, NOW())`,
      {
        id: uuidv4(), aid: req.user.agency_id, lid: lead.id,
        d: paused ? 'Conversación pasada a una persona: la IA deja de responder' : 'La IA vuelve a atender esta conversación',
        m: JSON.stringify({ by: req.user.id }),
      }
    )
    res.json({ ok: true, ai_paused: paused })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Panel de ROI ─────────────────────────────────────────────────────────
router.get('/roi', async (req, res) => {
  try {
    const aid = req.user.agency_id
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30))
    const p = { aid, days }

    const leadsTotal = (await get(
      `SELECT COUNT(*)::int AS n FROM leads WHERE agency_id = @aid AND created_at::timestamptz >= NOW() - make_interval(days => @days)`, p
    ))?.n || 0

    const bySource = await all(
      `SELECT COALESCE(portal, source, 'desconocido') AS source, COUNT(*)::int AS n
       FROM leads WHERE agency_id = @aid AND created_at::timestamptz >= NOW() - make_interval(days => @days)
       GROUP BY 1 ORDER BY n DESC`, p
    )

    // Tiempo hasta el primer mensaje saliente (IA o persona) desde que entra el lead.
    const resp = await get(
      `SELECT COUNT(*)::int AS answered,
              AVG(EXTRACT(EPOCH FROM (fm.first_out - l.created_at::timestamptz))) AS avg_s,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fm.first_out - l.created_at::timestamptz))) AS median_s
       FROM leads l
       JOIN (
         SELECT c.lead_id, MIN(m.created_at::timestamptz) AS first_out
         FROM conversations c JOIN messages m ON m.conversation_id = c.id
         WHERE c.agency_id = @aid AND m.author IN ('agent', 'ia_agent')
         GROUP BY c.lead_id
       ) fm ON fm.lead_id = l.id
       WHERE l.agency_id = @aid
         AND l.created_at::timestamptz >= NOW() - make_interval(days => @days)
         AND fm.first_out >= l.created_at::timestamptz`, p
    )

    const visitsBooked = (await get(
      `SELECT COUNT(*)::int AS n FROM appointments
       WHERE agency_id = @aid AND created_at::timestamptz >= NOW() - make_interval(days => @days) AND status <> 'cancelled'`, p
    ))?.n || 0

    const won = (await get(
      `SELECT COUNT(*)::int AS n FROM leads
       WHERE agency_id = @aid AND created_at::timestamptz >= NOW() - make_interval(days => @days) AND status IN ('reserva','cerrado')`, p
    ))?.n || 0

    const aiMessages = (await get(
      `SELECT COUNT(*)::int AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE c.agency_id = @aid AND m.author = 'ia_agent' AND m.created_at::timestamptz >= NOW() - make_interval(days => @days)`, p
    ))?.n || 0

    const pendingApprovals = (await get(
      `SELECT COUNT(*)::int AS n FROM pending_messages WHERE agency_id = @aid AND status = 'pending'`, { aid }
    ))?.n || 0

    const optOuts = (await get(
      `SELECT COUNT(*)::int AS n FROM leads WHERE agency_id = @aid AND whatsapp_opt_out = true`, { aid }
    ))?.n || 0

    res.json({
      days,
      leads: leadsTotal,
      leads_by_source: bySource,
      first_response: {
        answered: resp?.answered || 0,
        avg_seconds: resp?.avg_s != null ? Math.round(Number(resp.avg_s)) : null,
        median_seconds: resp?.median_s != null ? Math.round(Number(resp.median_s)) : null,
      },
      visits_booked: visitsBooked,
      won,
      ai_messages_sent: aiMessages,
      pending_approvals: pendingApprovals,
      opted_out_leads: optOuts,
      ai_usage: await getAIUsageSummary(aid),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
