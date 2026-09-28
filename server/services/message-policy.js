import { v4 as uuidv4 } from 'uuid'
import { get, run } from '../db/db.js'

// ── Baja / alta por WhatsApp (RGPD + normativa de comunicaciones) ───────────
// Solo se reconoce un mensaje que ES la orden (no una frase que la contiene),
// para no dar de baja a alguien que escribe "no quiero parar de ver pisos".
const OPT_OUT_RE = /^\s*(baja|stop|parar|cancelar|darme de baja|dar de baja|no quiero (recibir )?(m[aá]s )?mensajes|no me (escribas|escriban) m[aá]s|unsubscribe)\W*$/i
const OPT_IN_RE = /^\s*(alta|reactivar|start|volver a recibir)\W*$/i

export function detectConsentCommand(text) {
  const t = String(text || '')
  if (OPT_OUT_RE.test(t)) return 'opt_out'
  if (OPT_IN_RE.test(t)) return 'opt_in'
  return null
}

export const CONSENT_FOOTER = '\n\nResponde BAJA para dejar de recibir mensajes.'
export const OPT_OUT_CONFIRMATION =
  'Hemos registrado tu baja y no volverás a recibir mensajes automáticos. Si cambias de idea, responde ALTA.'
export const OPT_IN_CONFIRMATION = 'Perfecto, hemos reactivado tus mensajes. Responde BAJA cuando quieras dejar de recibirlos.'

// Agentes que hablan con el lead. El resto (notificador, coordinador…) son internos.
export const LEAD_FACING_AGENTS = ['captador', 'vendedor', 'agendador', 'nurturing', 'documentador', 'financiero']
export const PROACTIVE_AGENTS = ['nurturing', 'documentador', 'financiero']

/**
 * Decide qué hacer con un mensaje que una IA quiere enviar a un lead.
 *  - block: el lead se dio de baja o un humano ha tomado la conversación.
 *  - hold:  la agencia tiene activado "aprobar antes de enviar".
 *  - send:  se puede enviar.
 */
export async function outboundDecision(agencyId, leadId) {
  const lead = await get(
    'SELECT id, whatsapp_opt_out, ai_paused, consent_notice_sent FROM leads WHERE id = @id AND agency_id = @aid',
    { id: leadId, aid: agencyId }
  )
  if (!lead) return { decision: 'block', reason: 'lead_not_found', lead: null }
  if (lead.whatsapp_opt_out) return { decision: 'block', reason: 'opt_out', lead }
  if (lead.ai_paused) return { decision: 'block', reason: 'human_handoff', lead }
  const agency = await get('SELECT ai_mode FROM agencies WHERE id = @id', { id: agencyId })
  if (agency?.ai_mode === 'approve') return { decision: 'hold', reason: 'approval_mode', lead }
  return { decision: 'send', reason: null, lead }
}

/** Añade el aviso de baja al primer mensaje automático y a los proactivos. */
export function withConsentFooter(message, lead, proactive) {
  if (!message) return message
  if (message.includes('BAJA')) return message
  if (proactive || !lead?.consent_notice_sent) return message + CONSENT_FOOTER
  return message
}

export async function markConsentNotice(leadId) {
  await run('UPDATE leads SET consent_notice_sent = true WHERE id = @id', { id: leadId })
}

export async function setOptOut(agencyId, leadId, optedOut) {
  await run(
    `UPDATE leads SET whatsapp_opt_out = @v, opt_out_at = ${optedOut ? 'NOW()' : 'NULL'}, updated_at = NOW()
     WHERE id = @id AND agency_id = @aid`,
    { v: optedOut, id: leadId, aid: agencyId }
  )
}

export async function setAiPaused(agencyId, leadId, paused) {
  await run(
    `UPDATE leads SET ai_paused = @v, ai_paused_at = ${paused ? 'NOW()' : 'NULL'}, updated_at = NOW()
     WHERE id = @id AND agency_id = @aid`,
    { v: paused, id: leadId, aid: agencyId }
  )
}

/** Guarda un borrador para que una persona lo apruebe. Evita duplicados idénticos pendientes. */
export async function queueForApproval({ agencyId, leadId, agentType, phone, content, reason }) {
  const dup = await get(
    `SELECT id FROM pending_messages WHERE agency_id = @aid AND lead_id = @lid AND content = @c AND status = 'pending'`,
    { aid: agencyId, lid: leadId, c: content }
  )
  if (dup) return dup.id
  const id = uuidv4()
  await run(
    `INSERT INTO pending_messages (id, agency_id, lead_id, agent_type, phone, content, status, reason, created_at)
     VALUES (@id, @aid, @lid, @agent, @phone, @content, 'pending', @reason, NOW())`,
    { id, aid: agencyId, lid: leadId, agent: agentType, phone: phone || null, content, reason: reason || 'approval_mode' }
  )
  return id
}
