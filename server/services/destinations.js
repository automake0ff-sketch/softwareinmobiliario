import { v4 as uuidv4 } from 'uuid'
import { all, get, run } from '../db/db.js'

function interpolate(template, ctx) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(ctx[k] ?? ''))
}

function buildCredsFromContext(type, ctx) {
  if (!ctx) return {}
  switch (type) {
    case 'whatsapp':
      return { token: ctx.wa_token, phone_number_id: ctx.wa_phone_id }
    case 'email_sendgrid':
      return { api_key: ctx.sg_api_key, from_email: ctx.sg_from_email, from_name: ctx.sg_from_name }
    case 'telegram':
      return { bot_token: ctx.telegram_bot_token, chat_id: ctx.telegram_chat_id }
    case 'slack':
      return { webhook_url: ctx.slack_webhook_url }
    case 'notion':
      return { api_key: ctx.notion_api_key, database_id: ctx.notion_database_id }
    case 'airtable':
      return { api_key: ctx.airtable_api_key, base_id: ctx.airtable_base_id, table_name: ctx.airtable_table }
    case 'google_sheets':
      return { spreadsheet_id: ctx.google_sheets_id }
    case 'webhook':
      return { url: ctx.zapier_webhook_url || ctx.make_webhook_url || ctx.n8n_webhook_url }
    default:
      return {}
  }
}

async function saveMessageToConversation(leadId, agencyId, content) {
  if (!leadId || !content) return
  let conv = await get('SELECT id FROM conversations WHERE lead_id = @lead_id ORDER BY created_at DESC LIMIT 1', { lead_id: leadId })
  if (!conv) {
    const convId = uuidv4()
    await run(
      `INSERT INTO conversations (id, lead_id, agent_id, channel, created_at)
       VALUES (@id, @lead_id, @agent_id, @channel, NOW())`,
      { id: convId, lead_id: leadId, agent_id: null, channel: 'whatsapp' }
    )
    conv = { id: convId }
  }
  await run(
    `INSERT INTO messages (id, conversation_id, author, content, message_type, created_at)
     VALUES (@id, @conversation_id, @author, @content, @message_type, NOW())`,
    {
      id: uuidv4(),
      conversation_id: conv.id,
      author: 'ia_agent',
      content: content,
      message_type: 'text',
    }
  )
}

export async function sendToDestination({ destConfig, content, ctx, subject, agencyId }) {
  const { type, destination_id } = destConfig
  const fill = (t) => interpolate(t || '', ctx)

  // Build credentials from context (full-context-builder) OR from stored destination
  let creds = {}
  if (destination_id) {
    const dest = await get(
      'SELECT credentials, type, is_active FROM agency_destinations WHERE id = @id AND agency_id = @agency_id',
      { id: destination_id, agency_id: agencyId }
    )
    if (!dest || !dest.is_active) return { ok: false, detail: 'Destino desactivado o no encontrado' }
    creds = JSON.parse(dest.credentials || '{}')
  } else {
    // Try to build credentials from context (from full-context-builder)
    creds = buildCredsFromContext(type, ctx)
  }

  try {
    switch (type) {

      case 'whatsapp': {
        const phone = ctx.phone
        if (!phone) return { ok: false, detail: 'Lead sin teléfono' }
        if (!creds.token || !creds.phone_number_id) return { ok: false, detail: 'WhatsApp no configurado' }

        const cleanPhone = String(phone).replace(/[\s\-\(\)\+]/g, '')
        const fullPhone = cleanPhone.startsWith('34') ? cleanPhone : `34${cleanPhone}`

        const res = await fetch(`https://graph.facebook.com/v18.0/${creds.phone_number_id}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: fullPhone, type: 'text', text: { preview_url: false, body: content } }),
        })

        if (res.ok) {
          if (ctx.lead_id) await saveMessageToConversation(ctx.lead_id, agencyId, content)
          return { ok: true, detail: `WhatsApp enviado a +${fullPhone}` }
        }
        const err = await res.json()
        return { ok: false, detail: `WhatsApp error: ${err?.error?.message || res.status}` }
      }

      case 'email_sendgrid': {
        const toEmail = ctx.email || creds.default_to
        if (!toEmail) return { ok: false, detail: 'Sin email destino' }
        if (!creds.api_key) return { ok: false, detail: 'SendGrid no configurado' }

        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${creds.api_key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: toEmail, name: ctx.lead_name || '' }] }],
            from: { email: creds.from_email, name: creds.from_name || ctx.agency_name },
            subject: subject ? fill(subject) : `Mensaje de ${ctx.agency_name}`,
            content: [{ type: 'text/html', value: String(content).replace(/\n/g, '<br>') }],
          }),
        })

        return res.ok ? { ok: true, detail: `Email enviado a ${toEmail}` } : { ok: false, detail: `SendGrid error ${res.status}` }
      }

      case 'email_smtp': {
        const toEmail = ctx.email || creds.default_to
        if (!toEmail) return { ok: false, detail: 'Sin email destino' }

        const res = await fetch('/api/email/send-smtp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agency_id: agencyId,
            to: toEmail,
            to_name: ctx.lead_name || '',
            subject: subject ? fill(subject) : `Mensaje de ${ctx.agency_name}`,
            html: String(content).replace(/\n/g, '<br>'),
            credentials: creds,
          }),
        })

        return res.ok ? { ok: true, detail: `Email SMTP enviado a ${toEmail}` } : { ok: false, detail: `SMTP error ${res.status}` }
      }

      case 'webhook': {
        if (!creds.url) return { ok: false, detail: 'URL de webhook no configurada' }

        const payloadTemplate = destConfig.payload_template || '{"lead_name":"{{lead_name}}","message":"{{content}}","score":{{score}},"stage":"{{stage}}"}'
        const payloadStr = fill(payloadTemplate.replace('{{content}}', String(content).replace(/"/g, '\\"')))
        let payload
        try { payload = JSON.parse(payloadStr) } catch { payload = { content, lead_name: ctx.lead_name, score: ctx.score, stage: ctx.stage } }

        const headers = { 'Content-Type': 'application/json' }
        if (creds.auth_type === 'bearer') headers['Authorization'] = `Bearer ${creds.auth_value}`
        if (creds.auth_type === 'basic') headers['Authorization'] = 'Basic ' + Buffer.from(creds.auth_value || '').toString('base64')

        const res = await fetch(creds.url, {
          method: (creds.method || 'POST').toUpperCase(),
          headers,
          body: JSON.stringify(payload),
        })

        return { ok: res.ok, detail: `Webhook ${res.ok ? 'enviado' : 'falló'} (${res.status})` }
      }

      case 'google_sheets': {
        if (!creds.spreadsheet_id) return { ok: false, detail: 'Google Sheets no configurado' }
        return { ok: true, detail: 'Google Sheets requiere configuración manual del Service Account' }
      }

      case 'telegram': {
        if (!creds.bot_token || !creds.chat_id) return { ok: false, detail: 'Telegram no configurado' }

        const text = `*${ctx.agency_name}* — ${new Date().toLocaleString('es-ES')}\n\n${content}`
        const res = await fetch(`https://api.telegram.org/bot${creds.bot_token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: creds.chat_id, text, parse_mode: 'Markdown' }),
        })

        return res.ok ? { ok: true, detail: `Telegram enviado al chat ${creds.chat_id}` } : { ok: false, detail: `Telegram error ${res.status}` }
      }

      case 'slack': {
        if (!creds.webhook_url) return { ok: false, detail: 'Slack no configurado' }

        const res = await fetch(creds.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `*${ctx.agency_name}* · ${ctx.lead_name || 'Lead'}\n${content}`,
            blocks: [
              { type: 'section', text: { type: 'mrkdwn', text: `*${ctx.agency_name}* · Lead: *${ctx.lead_name}* (Score: ${ctx.score}/100)` } },
              { type: 'section', text: { type: 'mrkdwn', text: content } },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Etapa: ${ctx.stage} · ${new Date().toLocaleString('es-ES')}` }] },
            ],
          }),
        })

        return res.ok ? { ok: true, detail: 'Mensaje enviado a Slack' } : { ok: false, detail: `Slack error ${res.status}` }
      }

      case 'notion': {
        if (!creds.api_key || !creds.database_id) return { ok: false, detail: 'Notion no configurado' }

        const res = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: { Authorization: `Bearer ${creds.api_key}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
          body: JSON.stringify({
            parent: { database_id: creds.database_id },
            properties: {
              Nombre: { title: [{ text: { content: String(ctx.lead_name || 'Lead') } }] },
              Teléfono: { phone_number: String(ctx.phone || '') },
              Email: { email: String(ctx.email || '') },
              Score: { number: Number(ctx.score) || 0 },
              Etapa: { select: { name: String(ctx.stage || 'nuevo') } },
              Zona: { rich_text: [{ text: { content: String(ctx.zone || '') } }] },
              Presupuesto: { number: Number(ctx.budget_max) || 0 },
              'Mensaje IA': { rich_text: [{ text: { content: String(content).slice(0, 2000) } }] },
              Agencia: { rich_text: [{ text: { content: String(ctx.agency_name || '') } }] },
              Fecha: { date: { start: new Date().toISOString() } },
            },
          }),
        })

        const body = await res.json()
        return res.ok ? { ok: true, detail: 'Página creada en Notion database' } : { ok: false, detail: `Notion error: ${body?.message || res.status}` }
      }

      case 'airtable': {
        if (!creds.api_key || !creds.base_id || !creds.table_name) return { ok: false, detail: 'Airtable no configurado' }

        const res = await fetch(`https://api.airtable.com/v0/${creds.base_id}/${encodeURIComponent(creds.table_name)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${creds.api_key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              Nombre: ctx.lead_name,
              Teléfono: ctx.phone,
              Email: ctx.email,
              Score: ctx.score,
              Etapa: ctx.stage,
              Zona: ctx.zone,
              Presupuesto: ctx.budget_max,
              'Mensaje IA': String(content).slice(0, 2000),
              Agencia: ctx.agency_name,
              Fecha: new Date().toISOString(),
            },
          }),
        })

        const body = await res.json()
        return res.ok ? { ok: true, detail: `Registro creado en Airtable: ${creds.table_name}` } : { ok: false, detail: `Airtable error: ${body?.error || res.status}` }
      }

      case 'crm_field': {
        const field = destConfig.crm_field
        if (!field || !ctx.lead_id) return { ok: false, detail: 'crm_field o lead_id no especificado' }
        await run(`UPDATE leads SET ${field} = @value, updated_at = NOW() WHERE id = @id`, { value: content, id: ctx.lead_id })
        return { ok: true, detail: `Campo "${field}" actualizado en el lead` }
      }

      case 'internal_notification': {
        const users = await all('SELECT id FROM users WHERE agency_id = @agency_id AND active = true', { agency_id: agencyId })
        for (const u of users) {
          await run(
            `INSERT INTO notifications (id, agency_id, user_id, lead_id, title, body, type, created_at)
             VALUES (@id, @agency_id, @user_id, @lead_id, @title, @body, @type, NOW())`,
            {
              id: uuidv4(), agency_id: agencyId, user_id: u.id,
              lead_id: ctx.lead_id || null,
              title: ctx.automation_name || 'Automatización ejecutada',
              body: String(content).slice(0, 500),
              type: 'automation',
            }
          )
        }
        return { ok: true, detail: `Notificación interna enviada a ${users.length} usuario(s)` }
      }

      default:
        return { ok: false, detail: `Tipo de destino "${type}" no implementado` }
    }
  } catch (e) {
    return { ok: false, detail: `Error: ${e.message}` }
  }
}
