import { Router } from 'express'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { get, run } from '../db/db.js'
import { defaultQueue } from '../services/queue.js'
import { realtime } from '../services/realtime.js'
import { setAgencyContext } from '../services/ai-budget.js'
import { assignLead } from '../services/lead-assignment.js'
import { parsePortalEmail } from '../services/portal-parser.js'

// Entrada de leads de portales por email reenviado.
//
// La agencia reenvía (o configura una regla para reenviar) los avisos de
// Idealista/Fotocasa a un servicio de "email entrante" (SendGrid Inbound
// Parse, Mailgun Routes, Cloudflare Email Worker, Zapier/Make…) que hace POST
// a esta URL. Se aceptan JSON y formularios (urlencoded) con los campos
// habituales: from/sender, subject, text/body-plain/stripped-text, html/body-html.
// La URL lleva un token secreto por agencia (ver GET /api/control/settings).
const router = Router()

function pick(body, keys) {
  for (const k of keys) if (body?.[k]) return String(body[k])
  return ''
}
function tokenMatches(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

router.post('/:token', async (req, res) => {
  let agency = null
  try {
    const token = String(req.params.token || '')
    if (token.length < 32) return res.status(404).json({ error: 'No encontrado' })

    const candidate = await get('SELECT id, name FROM agencies WHERE portal_inbox_token = @t', { t: token })
    if (!candidate || !tokenMatches(token, (await get('SELECT portal_inbox_token AS t FROM agencies WHERE id = @id', { id: candidate.id })).t)) {
      return res.status(404).json({ error: 'No encontrado' })
    }
    agency = candidate
    setAgencyContext(agency.id)

    const b = req.body || {}
    const from = pick(b, ['from', 'sender', 'From'])
    const subject = pick(b, ['subject', 'Subject'])
    const text = pick(b, ['text', 'body-plain', 'stripped-text', 'plain', 'body'])
    const html = pick(b, ['html', 'body-html', 'stripped-html'])
    const parsed = parsePortalEmail({ from, subject, text, html })

    const logId = uuidv4()
    const excerpt = (text || html).slice(0, 1500)

    if (!parsed.usable) {
      await run(
        `INSERT INTO portal_inbound_log (id, agency_id, portal, from_email, subject, parsed, status, raw_excerpt, created_at)
         VALUES (@id, @aid, @portal, @from, @subject, @parsed, 'unparsed', @raw, NOW())`,
        { id: logId, aid: agency.id, portal: parsed.portal, from: from.slice(0, 200), subject: subject.slice(0, 300), parsed: JSON.stringify(parsed), raw: excerpt }
      )
      return res.status(202).json({ ok: true, created: false, reason: 'sin_datos_de_contacto' })
    }

    // Duplicados: mismo teléfono o email en esta agencia en los últimos 30 días
    const dup = await get(
      `SELECT id FROM leads
       WHERE agency_id = @aid
         AND ((@phone <> '' AND phone = @phone) OR (@email <> '' AND LOWER(email) = @email))
         AND created_at::timestamptz >= NOW() - INTERVAL '30 days'
       ORDER BY created_at DESC LIMIT 1`,
      { aid: agency.id, phone: parsed.phone || '', email: parsed.email || '' }
    )

    // leads.source tiene un CHECK con valores fijos: idealista o email. El
    // portal concreto (fotocasa, habitaclia…) se guarda aparte en leads.portal.
    const portalName = parsed.portal || 'portal'
    const source = parsed.portal === 'idealista' ? 'idealista' : 'email'
    let leadId
    if (dup) {
      leadId = dup.id
      await run('UPDATE leads SET last_activity = NOW(), updated_at = NOW() WHERE id = @id AND agency_id = @aid', { id: leadId, aid: agency.id })
      await run(
        `INSERT INTO activities (id, agency_id, lead_id, type, description, metadata, created_at)
         VALUES (@id, @aid, @lid, 'portal_contact', @d, @m, NOW())`,
        {
          id: uuidv4(), aid: agency.id, lid: leadId,
          d: `Nuevo contacto desde ${portalName}${parsed.reference ? ` (ref. ${parsed.reference})` : ''}`,
          m: JSON.stringify({ portal: parsed.portal, reference: parsed.reference, message: parsed.message }),
        }
      )
    } else {
      leadId = uuidv4()
      await run(
        `INSERT INTO leads (id, agency_id, name, phone, email, source, portal, property_interest, status, created_at, updated_at)
         VALUES (@id, @aid, @name, @phone, @email, @source, @portal, @interest, 'nuevo', NOW(), NOW())`,
        {
          id: leadId, aid: agency.id,
          name: parsed.name || 'Contacto de portal',
          phone: parsed.phone, email: parsed.email, source, portal: portalName,
          interest: parsed.reference ? `Anuncio ${parsed.reference}` : null,
        }
      )
      try { await assignLead(agency.id, leadId) } catch (e) { console.error('[PORTAL] assignLead:', e.message) }
      defaultQueue.add('process_new_lead', {
        leadId, agencyId: agency.id, source, initialMessage: parsed.message || null,
      })
    }

    await run(
      `INSERT INTO portal_inbound_log (id, agency_id, portal, from_email, subject, parsed, status, lead_id, raw_excerpt, created_at)
       VALUES (@id, @aid, @portal, @from, @subject, @parsed, @status, @lid, @raw, NOW())`,
      {
        id: logId, aid: agency.id, portal: parsed.portal, from: from.slice(0, 200), subject: subject.slice(0, 300),
        parsed: JSON.stringify(parsed), status: dup ? 'duplicate' : 'created', lid: leadId, raw: excerpt,
      }
    )
    if (realtime && !dup) {
      realtime.broadcastActivity({
        type: 'new_lead', leadId, leadName: parsed.name || 'Contacto de portal',
        description: `Nuevo lead desde ${portalName}`, source,
      })
    }
    return res.status(200).json({ ok: true, created: !dup, duplicate: Boolean(dup), lead_id: leadId })
  } catch (e) {
    console.error('[PORTAL] Error:', e.message)
    return res.status(500).json({ error: 'Error procesando el aviso' })
  }
})

export default router
