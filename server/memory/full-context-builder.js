import { get } from '../db/db.js'

const STAGE_LABELS = {
  nuevo: 'Nuevo Lead', contactado: 'Contactado', interesado: 'Interesado',
  visita_agendada: 'Visita agendada', negociacion: 'En negociación',
  reserva: 'Reserva firmada', cerrado: 'Cerrado', perdido: 'Perdido',
}

const SOURCE_LABELS = {
  whatsapp: 'WhatsApp directo', web: 'Formulario web', web_form: 'Formulario web',
  idealista: 'Idealista', fotocasa: 'Fotocasa', habitaclia: 'Habitaclia',
  meta_ads: 'Meta Ads', email: 'Email', manual: 'Manual', referido: 'Referido',
}

export function interpolate(template, ctx) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = ctx[key]
    return val !== undefined && val !== null ? String(val) : ''
  })
}

export function buildFullContext(leadId, agencyId) {
  const lead = get('SELECT * FROM leads WHERE id = @id', { id: leadId })
  if (!lead) return null

  const agency = get('SELECT * FROM agencies WHERE id = @id', { id: agencyId })

  let assignedUser = null
  if (lead.assigned_to) {
    assignedUser = get('SELECT name FROM users WHERE id = @id', { id: lead.assigned_to })
  }

  const now = new Date()
  const locale = 'es-ES'
  const tz = 'Europe/Madrid'

  const score = lead.ia_score ?? 0
  const scoreLabel = score > 75 ? 'caliente' : score > 40 ? 'templado' : 'frío'
  const scoreEmoji = score > 75 ? '🔥' : score > 40 ? '🟡' : '❄️'

  const createdAt = lead.created_at ? new Date(lead.created_at + 'Z') : now
  const lastContact = lead.last_contact_at ? new Date(lead.last_contact_at + 'Z') : createdAt
  const daysInCrm = Math.floor((now - createdAt) / 86400000)
  const daysSinceContact = Math.floor((now - lastContact) / 86400000)

  const budgetMax = lead.budget_max ?? lead.budget ?? 0
  const budgetFormatted = budgetMax > 0
    ? Number(budgetMax).toLocaleString('es-ES') + '€'
    : 'no definido'

  const firstName = (lead.name || 'Lead').split(' ')[0]
  const zonesRaw = lead.zones ? (() => { try { return JSON.parse(lead.zones) } catch { return [] } })() : []
  const tags = (() => { try {
    const rows = get('SELECT t.name FROM tags t JOIN lead_tags lt ON t.id = lt.tag_id WHERE lt.lead_id = @lid', { lid: leadId })
    return rows ? (Array.isArray(rows) ? rows.map(r => r.name).join(', ') : rows.name || '') : ''
  } catch { return '' } })()

  // Try to parse zones as JSON array or string
  let zonesList = zonesRaw
  if (typeof zonesRaw === 'string') {
    try { zonesList = JSON.parse(zonesRaw) } catch { zonesList = [zonesRaw] }
  }

  return {
    // Lead
    lead_id: leadId,
    lead_name: lead.name || 'Lead',
    lead_first_name: firstName,
    phone: lead.phone || '',
    email: lead.email || '',
    score,
    score_label: scoreLabel,
    score_emoji: scoreEmoji,
    stage: lead.pipeline_stage || lead.status || 'nuevo',
    stage_label: STAGE_LABELS[lead.pipeline_stage || lead.status] || 'Nuevo Lead',
    zone: (zonesList && zonesList[0]) || lead.zone || '',
    zones: zonesList.length ? zonesList : (lead.zone ? [lead.zone] : []),
    budget_max: budgetMax,
    budget_formatted: budgetFormatted,
    operation_type: lead.operation_type || 'compra',
    urgency: lead.urgency || 'media',
    source: lead.source || 'manual',
    source_label: SOURCE_LABELS[lead.source] || lead.source || 'Manual',
    lead_summary: lead.ia_summary || '',
    days_in_crm: daysInCrm,
    days_since_contact: daysSinceContact,
    tags: tags,
    assigned_to_name: assignedUser?.name || 'sin asignar',
    status: lead.status || 'nuevo',

    // Agencia
    agency_id: agencyId,
    agency_name: agency?.name || 'Mi Agencia',
    agency_city: agency?.city || 'España',
    agency_email: agency?.email || '',
    agency_phone: agency?.phone || '',
    agency_whatsapp: agency?.whatsapp_number || '',
    agency_website: agency?.website || '',
    agency_address: agency?.address || '',
    agency_instagram: agency?.instagram || '',

    // Credenciales para destinations
    wa_token: agency?.whatsapp_token || '',
    wa_phone_id: agency?.whatsapp_phone_id || '',
    sg_api_key: agency?.sendgrid_api_key || '',
    sg_from_email: agency?.sendgrid_from_email || '',
    sg_from_name: agency?.sendgrid_from_name || agency?.name || '',
    telegram_bot_token: agency?.telegram_bot_token || '',
    telegram_chat_id: agency?.telegram_chat_id || '',
    slack_webhook_url: agency?.slack_webhook_url || '',
    notion_api_key: agency?.notion_api_key || '',
    notion_database_id: agency?.notion_database_id || '',
    airtable_api_key: agency?.airtable_api_key || '',
    airtable_base_id: agency?.airtable_base_id || '',
    airtable_table: agency?.airtable_table || 'Leads',
    google_sheets_id: agency?.google_sheets_id || '',
    zapier_webhook_url: agency?.zapier_webhook_url || '',
    make_webhook_url: agency?.make_webhook_url || '',
    n8n_webhook_url: agency?.n8n_webhook_url || '',

    // Tiempo
    date: now.toLocaleDateString(locale, { timeZone: tz }),
    time: now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: tz }),
    datetime: now.toLocaleString(locale, { timeZone: tz }),
    day_of_week: now.toLocaleDateString(locale, { weekday: 'long', timeZone: tz }),
    month: now.toLocaleDateString(locale, { month: 'long', timeZone: tz }),
    year: now.getFullYear().toString(),
  }
}

export function buildTestContext(agencyId) {
  const agency = get('SELECT * FROM agencies WHERE id = @id', { id: agencyId })
  const now = new Date()
  const locale = 'es-ES'

  return {
    lead_id: 'test-lead-001',
    lead_name: 'Carlos García (TEST)',
    lead_first_name: 'Carlos',
    phone: '+34 600 000 000',
    email: 'carlos@email.com',
    score: 72,
    score_label: 'templado',
    score_emoji: '🟡',
    stage: 'interesado',
    stage_label: 'Interesado',
    zone: 'Triana',
    zones: ['Triana'],
    budget_max: 280000,
    budget_formatted: '280.000€',
    operation_type: 'compra',
    urgency: 'media',
    source: 'idealista',
    source_label: 'Idealista',
    lead_summary: 'Busca piso 3 habitaciones en Triana, presupuesto 280.000€, quiere mudarse antes de verano.',
    days_in_crm: 5,
    days_since_contact: 1,
    tags: 'vip, primera-vivienda',
    assigned_to_name: 'Ana López',
    status: 'interesado',

    agency_id: agencyId,
    agency_name: agency?.name || 'PropIA Demo',
    agency_city: agency?.city || 'Sevilla',
    agency_email: agency?.email || '',
    agency_phone: agency?.phone || '',
    agency_whatsapp: agency?.whatsapp_number || '',
    agency_website: agency?.website || '',
    agency_address: agency?.address || '',
    agency_instagram: agency?.instagram || '',

    wa_token: agency?.whatsapp_token || '',
    wa_phone_id: agency?.whatsapp_phone_id || '',
    sg_api_key: agency?.sendgrid_api_key || '',
    sg_from_email: agency?.sendgrid_from_email || '',
    sg_from_name: agency?.sendgrid_from_name || agency?.name || '',
    telegram_bot_token: agency?.telegram_bot_token || '',
    telegram_chat_id: agency?.telegram_chat_id || '',
    slack_webhook_url: agency?.slack_webhook_url || '',
    notion_api_key: agency?.notion_api_key || '',
    notion_database_id: agency?.notion_database_id || '',
    airtable_api_key: agency?.airtable_api_key || '',
    airtable_base_id: agency?.airtable_base_id || '',
    airtable_table: agency?.airtable_table || 'Leads',
    google_sheets_id: agency?.google_sheets_id || '',
    zapier_webhook_url: agency?.zapier_webhook_url || '',
    make_webhook_url: agency?.make_webhook_url || '',
    n8n_webhook_url: agency?.n8n_webhook_url || '',

    date: now.toLocaleDateString(locale),
    time: now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    datetime: now.toLocaleString(locale),
    day_of_week: now.toLocaleDateString(locale, { weekday: 'long' }),
    month: now.toLocaleDateString(locale, { month: 'long' }),
    year: now.getFullYear().toString(),
  }
}
