import { v4 as uuidv4 } from 'uuid'
import { all, get, run } from '../db/db.js'

export const BLOCKS = [
  { id: 'scoring', label: 'Lead Scoring y Enriquecimiento', icon: 'TrendingUp', color: '#6366f1', count: 5 },
  { id: 'multichannel', label: 'Comunicación Multicanal', icon: 'MessageCircle', color: '#25d366', count: 7 },
  { id: 'integrations', label: 'Integraciones CRM y Datos', icon: 'Link', color: '#0f9d58', count: 6 },
  { id: 'marketing', label: 'Marketing Automation', icon: 'Mail', color: '#f59e0b', count: 6 },
  { id: 'operations', label: 'Operaciones y Gestión Interna', icon: 'Users', color: '#ec4899', count: 6 },
  { id: 'advanced', label: 'IA Avanzada y Análisis', icon: 'Sparkles', color: '#06b6d4', count: 5 },
]

// Las 35 plantillas originales n8n replicadas para PropIA
export const FULL_N8N_TEMPLATES = [
  // ═══════════════════════════════════════════════════
  // GRUPO 1 — NOTIFICACIONES
  // ═══════════════════════════════════════════════════
  {
    name: '[N8N-001] Lead nuevo → Slack con análisis IA',
    description: 'Como el flujo n8n "New Lead to Slack": mensaje con análisis de intención, score y siguiente acción',
    trigger_type: 'lead_created', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'captador', prompt_template: 'Nuevo lead en {{agency_name}}: {{lead_name}}, teléfono {{phone}}, email {{email}}, llegó desde {{source_label}}. Genera mensaje de Slack (máximo 4 líneas) con: nombre y datos de contacto, análisis rápido del interés detectado, score inicial estimado (0-100) y la acción inmediata que debe hacer el equipo. Usa emojis de Slack para que sea fácil de leer.', save_to_conversation: false, destinations: [{ type: 'slack' }] } },
      { type: 'assign_to', config: { role: 'comercial' } },
      { type: 'change_stage', config: { new_stage: 'contactado' } },
    ]),
  },
  {
    name: '[N8N-002] Lead nuevo → Telegram con score',
    description: 'Como "Send to Telegram on new lead" de n8n con IA que calcula score y sugiere prioridad',
    trigger_type: 'lead_created', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'captador', prompt_template: 'Lead nuevo: {{lead_name}} | {{phone}} | {{email}} | Zona: {{zone}} | Presupuesto: {{budget_formatted}} | Origen: {{source_label}}. Genera alerta de Telegram con: datos del lead en una línea, score estimado 0-100 con emoji (🔥/🟡/❄️), y 1 acción inmediata. Máximo 5 líneas, con asteriscos para negritas de Telegram.', save_to_conversation: false, destinations: [{ type: 'telegram' }] } },
    ]),
  },
  // ═══════════════════════════════════════════════════
  // GRUPO 5 — GENERACIÓN DE CONTENIDO (N8N-017, 018, 019)
  // ═══════════════════════════════════════════════════
  {
    name: '[N8N-017] Meta Ads copy generator → Buffer/Hootsuite',
    description: 'Genera copies de anuncios semanalmente y los envía a programador de RRSS',
    trigger_type: 'time_schedule', trigger_config: JSON.stringify({ cron: '0 8 * * 1' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'copywriter', prompt_template: 'Plan semanal de Meta Ads para {{agency_name}}, {{agency_city}}. Genera 5 anuncios (para Facebook e Instagram). Para cada anuncio: TITULO: (máx 40 chars), DESCRIPCION: (máx 125 chars), CTA: (texto botón), IMAGEN_SUGERIDA: (descripción de imagen ideal). Separa cada anuncio con ---ANUNCIO2--- etc.', destinations: [{ type: 'notion' }, { type: 'webhook', payload_template: '{"type":"meta_ads_weekly","agency":"{{agency_name}}","city":"{{agency_city}}","week":"{{date}}","content":"{{content}}"}' }, { type: 'slack' }] } },
    ]),
  },
  {
    name: '[N8N-018] Property description AI → publicar en portales',
    description: 'IA crea descripción SEO completa y la envía vía webhook a portales inmobiliarios',
    trigger_type: 'lead_created', trigger_config: JSON.stringify({ property_added: true }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'copywriter', prompt_template: 'Nueva propiedad en {{agency_name}}, {{agency_city}}. Genera ficha completa: TITULO_SEO: (máx 70 chars) URL_SLUG: (versión URL) META_DESCRIPTION: (máx 155 chars) DESCRIPCION_CORTA: (2-3 frases gancho) DESCRIPCION_LARGA: (400 palabras) BULLET_POINTS: (5 beneficios) TAGS_SEO: (10 keywords)', destinations: [{ type: 'webhook', payload_template: '{"action":"publish_property","source":"propia","agency":"{{agency_name}}","city":"{{agency_city}}","content":"{{content}}","timestamp":"{{datetime}}"}' }, { type: 'notion' }, { type: 'crm_field', crm_field: 'ia_summary' }] } },
    ]),
  },
  {
    name: '[N8N-019] Auto-blog: artículo SEO sobre mercado local',
    description: 'Artículo de 800 palabras sobre el mercado inmobiliario local cada mes',
    trigger_type: 'time_schedule', trigger_config: JSON.stringify({ cron: '0 10 5 * *' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'seo', prompt_template: 'Genera artículo SEO para el blog de {{agency_name}} sobre el mercado en {{agency_city}} en {{month}} {{year}}. Estructura: H1 con keyword, INTRO, H2 Situación actual, H2 Zonas demandadas, H2 Precios, H2 Consejos, CONCLUSION con CTA. 700-900 palabras. Añade TITLE_TAG y META_DESCRIPTION al final.', destinations: [{ type: 'notion' }, { type: 'webhook', payload_template: '{"type":"blog_post","agency":"{{agency_name}}","city":"{{agency_city}}","month":"{{month}}","content":"{{content}}"}' }, { type: 'email_sendgrid', subject_template: '📝 Nuevo artículo listo para publicar — {{agency_name}}' }] } },
    ]),
  },
  // ═══════════════════════════════════════════════════
  // GRUPO 7 — INTEGRACIONES AVANZADAS
  // ═══════════════════════════════════════════════════
  {
    name: '[N8N-025] Universal bridge → Zapier/Make/n8n externo',
    description: 'Envía datos estructurados a Zapier, Make o n8n para conectar con cualquier app',
    trigger_type: 'lead_created', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'analista', prompt_template: 'Genera payload JSON estructurado del lead para sistemas externos. Lead: {{lead_name}}, {{phone}}, {{email}}, zona {{zone}}, presupuesto {{budget_max}}, score {{score}}, etapa {{stage}}, origen {{source}}, agencia {{agency_name}}. SOLO JSON.', save_to_conversation: false, destinations: [{ type: 'webhook', payload_template: '{"source":"PropIA","event":"new_lead","timestamp":"{{datetime}}","lead":{"name":"{{lead_name}}","phone":"{{phone}}","email":"{{email}}","score":{{score}},"stage":"{{stage}}","zone":"{{zone}}","budget":{{budget_max}},"source":"{{source}}"},"agency":{"name":"{{agency_name}}","city":"{{agency_city}}"}}' }] } },
    ]),
  },
  {
    name: '[N8N-026] Mirror CRM → Notion database completa',
    description: 'Mantiene copia espejo del CRM en Notion: cada lead con su página e historial',
    trigger_type: 'stage_changed', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'analista', prompt_template: 'Actualización Notion para {{lead_name}}. Etapa: {{stage_label}}. Score: {{score}}/100. Resumen: {{lead_summary}}. Días en CRM: {{days_in_crm}}. Genera: nota de progreso, estado actual, siguiente acción recomendada.', destinations: [{ type: 'notion' }, { type: 'airtable' }] } },
    ]),
  },
  {
    name: '[N8N-027] Live dashboard → Google Sheets en tiempo real',
    description: 'Cada evento importante actualiza la hoja de Google Sheets del dashboard',
    trigger_type: 'score_threshold', trigger_config: JSON.stringify({ threshold: 60, direction: 'above' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'analista', prompt_template: 'Lead {{lead_name}} score {{score}}/100 ({{score_emoji}}). Zona: {{zone}}, presupuesto {{budget_formatted}}, etapa {{stage_label}}, {{days_in_crm}} días. Genera línea para Sheets: {{datetime}}|{{lead_name}}|{{phone}}|{{score}}|{{stage}}|{{zone}}|{{budget_max}}|{{source}}|ACCIÓN.', destinations: [{ type: 'google_sheets' }, { type: 'slack' }] } },
    ]),
  },
  {
    name: '[N8N-028] Customer knowledge base → Airtable',
    description: 'Cada lead cerrado enriquece la base de conocimiento en Airtable',
    trigger_type: 'stage_changed', trigger_config: JSON.stringify({ to_stage: 'cerrado' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'analista', prompt_template: 'Operación cerrada: {{lead_name}}, {{zone}}, {{budget_formatted}}, origen {{source_label}}, {{days_in_crm}} días. Genera aprendizaje: qué funcionó, canal efectivo, perfil cliente ideal, lección aprendida. Máx 100 palabras.', destinations: [{ type: 'airtable' }, { type: 'notion' }, { type: 'webhook', payload_template: '{"type":"closed_deal_learning","lead_profile":"{{zone}}_{{operation_type}}","days_to_close":{{days_in_crm}},"source":"{{source}}","budget":{{budget_max}},"agency":"{{agency_name}}"}' }] } },
    ]),
  },
  // ═══════════════════════════════════════════════════
  // GRUPO 8 — CASOS ESPECIALES INMOBILIARIAS
  // ═══════════════════════════════════════════════════
  {
    name: '[N8N-029] Market alert → leads interesados en esa zona',
    description: 'Cambio en el mercado de una zona → alerta automática a leads interesados',
    trigger_type: 'time_schedule', trigger_config: JSON.stringify({ cron: '0 9 15 * *' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'tasador', prompt_template: 'Alerta mensual de mercado para {{agency_name}} en {{agency_city}}. Genera mensaje corto (máx 4 líneas) para WhatsApp a leads: dato útil del mercado este mes, tono informativo, termina con pregunta suave.', auto_send_whatsapp: false, destinations: [{ type: 'internal_notification' }, { type: 'slack' }] } },
    ]),
  },
  {
    name: '[N8N-030] Opportunity detector → alert inversores',
    description: 'Detecta oportunidades de inversión y alerta a leads con perfil inversor',
    trigger_type: 'time_schedule', trigger_config: JSON.stringify({ cron: '0 8 * * 2,4' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'tasador', prompt_template: 'Oportunidades inversión {{agency_city}} para {{agency_name}}. Genera: 1) Zonas con mejor rentabilidad y yields estimados 2) Tipo propiedad mejor ratio precio/alquiler 3) 2 propiedades tipo para inversión.', destinations: [{ type: 'email_sendgrid', subject_template: '💰 Oportunidades de inversión en {{agency_city}} — {{agency_name}}' }, { type: 'slack' }, { type: 'telegram' }] } },
    ]),
  },
  {
    name: '[N8N-031] Seller outreach: captación de propietarios',
    description: 'Campaña outbound para captar propietarios que quieren vender',
    trigger_type: 'time_schedule', trigger_config: JSON.stringify({ cron: '0 10 * * 2' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'captador', prompt_template: 'Campaña captación vendedores para {{agency_name}} en {{agency_city}}. 3 mensajes: A) propietario indeciso (mercado favorable ahora) B) urgencia (mudanza/herencia) C) inversor rotar portfolio. Cada uno máx 3 líneas WhatsApp. Separa con ---B--- y ---C---', destinations: [{ type: 'notion' }, { type: 'slack' }] } },
    ]),
  },
  {
    name: '[N8N-032] Mortgage comparison → email personalizado',
    description: 'Cuando un lead pregunta por financiación, genera comparativa hipotecaria personalizada',
    trigger_type: 'message_received', trigger_config: JSON.stringify({ intent: 'mortgage_inquiry' }),
    conditions: JSON.stringify([{ field: 'tags', operator: 'contains', value: 'pregunta-hipoteca' }]),
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'financiero', prompt_template: '{{lead_name}} pregunta por financiación. Presupuesto: {{budget_formatted}}. Email con: cálculo personalizado (entrada 20%, gastos 10-12%, total), cuota mensual 25 años tipo fijo 3.2%, comparativa fija vs variable vs mixta, CTA a bróker hipotecario de {{agency_name}}.', destinations: [{ type: 'email_sendgrid', subject_template: 'Tu simulación hipotecaria personalizada — {{agency_name}}' }, { type: 'crm_field', crm_field: 'ia_next_action' }] } },
      { type: 'add_tag', config: { tag: 'hipoteca-calculada' } },
    ]),
  },
  {
    name: '[N8N-034] Review management: solicitar + responder',
    description: 'Tras cada cierre, solicita reseña en Google Maps y genera plantilla de respuesta',
    trigger_type: 'stage_changed', trigger_config: JSON.stringify({ to_stage: 'cerrado' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'copywriter', prompt_template: 'Operación cerrada con {{lead_name}} en {{agency_name}}. Genera DOS textos: SOLICITUD_RESEÑA (WhatsApp, 3 líneas): agradecimiento + pedir reseña Google. PLANTILLA_RESPUESTA: para reseña positiva, 3 líneas. Separa con ---RESPUESTA---', auto_send_whatsapp: true, destinations: [{ type: 'notion' }, { type: 'crm_field', crm_field: 'ia_next_action' }] } },
    ]),
  },
  {
    name: '[N8N-035] Smart reactivation: IA elige momento óptimo',
    description: 'IA analiza historial y determina cuándo y cómo reactivar leads inactivos',
    trigger_type: 'no_response_hours', trigger_config: JSON.stringify({ hours: 720 }),
    conditions: JSON.stringify([{ field: 'ia_score', operator: 'gte', value: 25 }, { field: 'pipeline_stage', operator: 'neq', value: 'cerrado' }]),
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'nurturing', prompt_template: 'Lead {{lead_name}} lleva {{days_since_contact}} días inactivo (etapa: {{stage_label}}, score: {{score}}/100). Buscaba {{zone}}, presupuesto {{budget_formatted}}. Analiza: 1) Estrategia reactivación óptima 2) Mensaje personalizado WhatsApp (máx 3 líneas, ofrece valor concreto de {{zone}}) 3) Si no responde: recomendación final.', auto_send_whatsapp: true, destinations: [{ type: 'crm_field', crm_field: 'ia_next_action' }, { type: 'slack' }] } },
    ]),
  },
]

export const N8N_AUTOMATIONS = [
  // ═══════════════════════════════════════════════════
  // BLOQUE 1: LEAD SCORING Y ENRIQUECIMIENTO
  // ═══════════════════════════════════════════════════
  {
    name: 'Enriquecimiento IA de nuevo lead 🔍',
    description: 'Analiza el lead, asigna score detallado y distribuye a los destinos configurados',
    trigger_type: 'lead_created', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'captador', prompt_template: 'Nuevo lead {{lead_name}} desde {{source}}. Teléfono: {{phone}}. Email: {{email}}. Analiza el perfil y genera: 1) Score de 0-100 con justificación 2) Resumen ejecutivo en 2 frases 3) Próxima acción recomendada 4) Tags sugeridos (comprador-primera-vez, inversor, familiar, lujo, urgente, etc.)', auto_send_whatsapp: false, save_to_conversation: false, destinations: [{ type: 'crm_field', crm_field: 'ia_summary' }, { type: 'internal_notification' }] } },
      { type: 'assign_to', config: { role: 'comercial' } },
      { type: 'change_stage', config: { new_stage: 'contactado' } },
    ]),
  },
  {
    name: 'Clasificación automática VIP vs Estándar 🏷️',
    description: 'Clasifica leads en VIP (alto presupuesto) o estándar y enruta diferente',
    trigger_type: 'lead_created', trigger_config: '{}',
    conditions: JSON.stringify([{ field: 'budget_max', operator: 'gte', value: 500000 }]),
    actions: JSON.stringify([
      { type: 'add_tag', config: { tag: 'vip' } },
      { type: 'update_score', config: { score_change: 20 } },
      { type: 'activate_agent', config: { agent_type: 'captador', prompt_template: 'Lead VIP: {{lead_name}}, presupuesto {{budget_max}}€. Genera bienvenida exclusiva para cliente de alto valor. Tono premium, sin ser pretencioso. Máximo 4 frases.', auto_send_whatsapp: true, destinations: [{ type: 'internal_notification' }, { type: 'webhook', payload_template: '{"event":"vip_lead","name":"{{lead_name}}","budget":{{budget_max}},"phone":"{{phone}}","score":{{score}}}' }] } },
      { type: 'notify_team', config: { notification_message: '💎 LEAD VIP: {{lead_name}}, presupuesto {{budget_max}}€. Asignación manual recomendada.', for_role: 'manager', level: 'urgente' } },
    ]),
  },
  {
    name: 'Detección intención de venta → pipeline captación 🏘️',
    description: 'Cuando un lead quiere vender, inicia pipeline de captación de inmueble',
    trigger_type: 'message_received', trigger_config: '{}',
    conditions: JSON.stringify([{ field: 'tags', operator: 'contains', value: 'quiere-vender' }]),
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'tasador', prompt_template: '{{lead_name}} quiere vender su propiedad en {{zone}}. Genera respuesta que: explique nuestro proceso de valoración gratuita, solicite datos básicos (tipo, m², planta, estado, precio esperado), y proponga visita de tasación esta semana.', auto_send_whatsapp: true, destinations: [{ type: 'crm_field', crm_field: 'ia_next_action' }] } },
      { type: 'add_tag', config: { tag: 'captacion-inmueble' } },
      { type: 'create_task', config: { title: 'Visita de tasación para {{lead_name}}', due_hours: 48, priority: 'alta', assign_to: 'manager' } },
    ]),
  },
  {
    name: 'Recalcular score por comportamiento 📊',
    description: 'Cuando el lead responde rápido o muestra interés, sube score automáticamente',
    trigger_type: 'message_received', trigger_config: '{}',
    conditions: JSON.stringify([{ field: 'ia_score', operator: 'lt', value: 80 }]),
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'coordinador', prompt_template: '{{lead_name}} acaba de enviar un mensaje. Score actual: {{score}}/100, etapa: {{stage}}. Analiza si este mensaje indica aumento de interés (pregunta específica, pide precio, menciona fecha, etc.) y recomienda: nuevo score y próxima acción.', save_to_conversation: false, destinations: [{ type: 'crm_field', crm_field: 'ia_next_action' }] } },
      { type: 'update_field', config: { field: 'last_contact_at', value: 'NOW()' } },
    ]),
  },
  {
    name: 'Recuperación inteligente de leads perdidos 🔄',
    description: 'Analiza los leads marcados como perdidos y genera estrategia de recuperación',
    trigger_type: 'time_schedule', trigger_config: JSON.stringify({ cron: '0 9 * * 1' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'analista', prompt_template: 'Análisis semanal de leads perdidos para {{agency_name}}. Identifica patrones: ¿en qué etapa se pierden más? ¿Qué objeciones son comunes? ¿Qué podemos mejorar? Genera 3 acciones concretas para recuperar leads esta semana.', destinations: [{ type: 'internal_notification' }, { type: 'slack' }] } },
    ]),
  },

  // ═══════════════════════════════════════════════════
  // BLOQUE 2: COMUNICACIÓN MULTICANAL
  // ═══════════════════════════════════════════════════
  {
    name: 'Bienvenida omnicanal: WhatsApp + Email 📲📧',
    description: 'Envía bienvenida por WhatsApp Y email al mismo tiempo',
    trigger_type: 'lead_created', trigger_config: '{}',
    conditions: JSON.stringify([{ field: 'email', operator: 'not_null', value: null }, { field: 'phone', operator: 'not_null', value: null }]),
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'captador', prompt_template: '{{lead_name}} es un nuevo lead con email y teléfono. Genera DOS versiones de bienvenida: 1) VERSION WHATSAPP: breve, conversacional, 2-3 frases, termina con pregunta 2) VERSION EMAIL: más formal, asunto atractivo, párrafo de presentación de {{agency_name}}, lista de servicios, CTA. Separa con ---EMAIL---', auto_send_whatsapp: true, destinations: [{ type: 'email_sendgrid', subject_template: 'Bienvenido/a a {{agency_name}} — Tu búsqueda empieza aquí' }] } },
    ]),
  },
  {
    name: 'Lead caliente → notificar Slack + Telegram 🔥💬',
    description: 'Score alto → mensaje inmediato en Slack y Telegram',
    trigger_type: 'score_threshold', trigger_config: JSON.stringify({ threshold: 75, direction: 'above' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'coordinador', prompt_template: 'Lead caliente detectado: {{lead_name}}, score {{score}}/100, zona {{zone}}, presupuesto {{budget_max}}€, etapa {{stage}}. Genera briefing de 3 líneas para el equipo de ventas: quién es, qué quiere, y qué hacer ahora mismo.', destinations: [{ type: 'slack' }, { type: 'telegram' }] } },
    ]),
  },
  {
    name: 'Post-visita: WhatsApp + registro en CRM 🏠📓',
    description: 'Tras visita completa: mensaje al lead + actualizar CRM',
    trigger_type: 'visit_completed', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'vendedor', prompt_template: '{{lead_name}} acaba de terminar la visita. Genera mensaje de seguimiento cálido (WhatsApp) que recoja feedback y proponga siguiente paso.', auto_send_whatsapp: true, destinations: [{ type: 'crm_field', crm_field: 'ia_summary' }] } },
      { type: 'update_score', config: { score_change: 10 } },
    ]),
  },
  {
    name: 'Cierre de operación → reporte ejecutivo 🎯',
    description: 'Operación cerrada: email al director con resumen + registro',
    trigger_type: 'stage_changed', trigger_config: JSON.stringify({ to_stage: 'cerrado' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'analista', prompt_template: 'Operación CERRADA con {{lead_name}}. Zona: {{zone}}, precio aproximado: {{budget_max}}€. Genera informe ejecutivo del cierre: datos del cliente, tiempo del proceso, fuente del lead, puntos clave del éxito, y lección aprendida para el equipo.', destinations: [{ type: 'email_sendgrid', subject_template: '✅ Cierre: {{lead_name}} — {{agency_name}}' }, { type: 'google_sheets' }] } },
      { type: 'notify_team', config: { notification_message: '🎉 CIERRE: {{lead_name}}. Operación completada.', for_role: 'admin', level: 'importante' } },
    ]),
  },
  {
    name: 'Negociación bloqueada → alerta Telegram ⚠️',
    description: 'Lead en negociación sin respuesta 48h → alerta urgente en Telegram',
    trigger_type: 'no_response_hours', trigger_config: JSON.stringify({ hours: 48 }),
    conditions: JSON.stringify([{ field: 'pipeline_stage', operator: 'eq', value: 'negociacion' }]),
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'notificador', prompt_template: 'ALERTA URGENTE: {{lead_name}} está en NEGOCIACIÓN y lleva 48 horas sin responder. Score: {{score}}/100. Genera alerta con: resumen, riesgo de perder la operación, y acción inmediata recomendada.', destinations: [{ type: 'telegram' }, { type: 'slack' }] } },
      { type: 'notify_team', config: { notification_message: '🚨 CRÍTICO: {{lead_name}} en negociación sin respuesta 48h. Intervención INMEDIATA.', for_role: 'admin', level: 'urgente' } },
      { type: 'create_task', config: { title: 'URGENTE: Llamar a {{lead_name}} — negociación en riesgo', due_hours: 2, priority: 'alta', assign_to: 'manager' } },
    ]),
  },
  {
    name: 'Resumen diario KPI → email manager + Slack 📊',
    description: 'Cada día a las 19h: KPIs del día por email y Slack',
    trigger_type: 'time_schedule', trigger_config: JSON.stringify({ cron: '0 19 * * 1-5' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'analista', prompt_template: 'Genera el resumen ejecutivo del día para {{agency_name}}. Incluye: leads nuevos, contactados, visitas realizadas, operaciones en negociación, cierres, y 2 alertas para mañana. Máximo 150 palabras. Formato limpio con emojis.', destinations: [{ type: 'email_sendgrid', subject_template: '📊 Resumen {{agency_name}} — {{date}}' }, { type: 'slack' }, { type: 'internal_notification' }] } },
    ]),
  },

  // ═══════════════════════════════════════════════════
  // BLOQUE 3: INTEGRACIONES CRM Y DATOS
  // ═══════════════════════════════════════════════════
  {
    name: 'Backup leads → Google Sheets automático 📋',
    description: 'Cada lead nuevo se registra automáticamente en Google Sheets como backup',
    trigger_type: 'lead_created', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'captador', prompt_template: 'Lead {{lead_name}}: genera resumen de 1 línea (nombre, zona, presupuesto, fuente, score inicial) para registro en hoja de cálculo. Solo el resumen.', destinations: [{ type: 'google_sheets' }] } },
    ]),
  },
  {
    name: 'Sincronizar lead con CRM externo vía webhook 🔗',
    description: 'Envía datos del lead a HubSpot / Salesforce / Pipedrive vía webhook',
    trigger_type: 'lead_created', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'coordinador', prompt_template: 'Prepara los datos del lead {{lead_name}} para sincronizar con CRM externo. Incluye: nombre, teléfono, email, zona de interés, presupuesto, tipo de operación, score IA, etapa actual, fuente. Responde SOLO con JSON válido.', destinations: [{ type: 'webhook', payload_template: '{"contact":{"name":"{{lead_name}}","phone":"{{phone}}","email":"{{email}}","lead_score":{{score}},"stage":"{{stage}}","source":"PropIA","agency":"{{agency_name}}"}}' }] } },
    ]),
  },
  {
    name: 'Avisar leads cuando su propiedad ideal sale al mercado 🏡',
    description: 'Nueva propiedad en CRM → buscar leads compatibles → avisar automáticamente',
    trigger_type: 'property_matched', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([
      { type: 'send_property_match', config: {} },
      { type: 'activate_agent', config: { agent_type: 'vendedor', prompt_template: 'Una nueva propiedad en {{zone}} encaja con el perfil de {{lead_name}} (presupuesto {{budget_max}}€). Genera mensaje personalizado explicando POR QUÉ esta propiedad específica es perfecta para lo que busca. Incluye 3 puntos concretos de coincidencia.', destinations: [{ type: 'webhook', payload_template: '{"event":"property_match","lead":"{{lead_name}}","phone":"{{phone}}","zone":"{{zone}}","budget":{{budget_max}}}' }] } },
    ]),
  },
  {
    name: 'Checklist documentación → solicitud + tracking 📎',
    description: 'En negociación: solicitar docs, trackear recepción y recordar los pendientes',
    trigger_type: 'stage_changed', trigger_config: JSON.stringify({ to_stage: 'negociacion' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'request_documents', config: { document_types: ['dni', 'nomina', 'extracto', 'vida_laboral'] } },
      { type: 'activate_agent', config: { agent_type: 'documentador', prompt_template: '{{lead_name}} está en negociación. Genera email formal con: checklist completo de documentos necesarios para la operación, explicación de para qué sirve cada uno, plazo recomendado (72h), y contacto para dudas.', destinations: [{ type: 'email_sendgrid', subject_template: 'Documentación necesaria para tu operación — {{agency_name}}' }] } },
      { type: 'create_task', config: { title: 'Revisar documentación completa de {{lead_name}} (plazo 72h)', due_hours: 72, priority: 'alta', assign_to: 'manager' } },
    ]),
  },

  // ═══════════════════════════════════════════════════
  // BLOQUE 4: MARKETING AUTOMATION
  // ═══════════════════════════════════════════════════
  {
    name: 'Secuencia nurturing 14 días — 4 emails 💌',
    description: 'Leads fríos reciben secuencia automatizada de 4 emails de valor en 14 días',
    trigger_type: 'lead_created', trigger_config: '{}',
    conditions: JSON.stringify([{ field: 'ia_score', operator: 'lt', value: 50 }]),
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'copywriter', prompt_template: 'Genera secuencia de 4 emails de nurturing para {{lead_name}} que busca en {{zone}} con presupuesto {{budget_max}}€. EMAIL 1 (hoy): bienvenida + guía gratuita del mercado en {{zone}}. EMAIL 2 (día 3): 3 propiedades destacadas con precios. EMAIL 3 (día 7): guía proceso de compra en España. EMAIL 4 (día 14): oferta de consulta gratuita. Para cada email: asunto + cuerpo. Separa con ---EMAIL2---, ---EMAIL3---, ---EMAIL4---', destinations: [{ type: 'email_sendgrid', subject_template: 'Tu guía del mercado inmobiliario en {{zone}} — {{agency_name}}' }, { type: 'webhook', payload_template: '{"type":"nurturing_sequence","lead":"{{lead_name}}","email":"{{email}}","start_date":"{{date}}"}' }] } },
    ]),
  },
  {
    name: 'Newsletter mensual de mercado → leads activos 📰',
    description: 'Primer martes del mes: newsletter con tendencias del mercado a leads templados',
    trigger_type: 'time_schedule', trigger_config: JSON.stringify({ cron: '0 9 1-7 * 2' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'copywriter', prompt_template: 'Genera newsletter mensual para leads de {{agency_name}} en {{agency_city}}. Secciones: 1) Resumen del mercado este mes 2) Propiedad destacada del mes 3) Consejo del mes 4) CTA suave. Tono informativo.', destinations: [{ type: 'email_sendgrid', subject_template: '📊 El mercado en {{agency_city}} este mes — {{agency_name}}' }, { type: 'notion' }, { type: 'slack' }] } },
    ]),
  },
  {
    name: 'Reactivación segmentada por zona 📍',
    description: 'Leads fríos de una zona específica reciben contenido ultra-personalizado',
    trigger_type: 'time_schedule', trigger_config: JSON.stringify({ cron: '0 10 15 * *' }),
    conditions: JSON.stringify([{ field: 'ia_score', operator: 'lt', value: 45 }]),
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'nurturing', prompt_template: 'Lead frío {{lead_name}}, buscaba en {{zone}} con presupuesto {{budget_max}}€, lleva tiempo inactivo. Genera mensaje de reactivación ultra-personalizado: menciona algo específico y real de {{zone}} en {{agency_city}} (barrio, equipamientos, precio actual del mercado), sin sonar genérico. Máximo 3 frases.', auto_send_whatsapp: true, destinations: [{ type: 'email_sendgrid', subject_template: 'Novedades en {{zone}} que te pueden interesar' }] } },
    ]),
  },
  {
    name: 'Nueva propiedad → publicar en todos los canales 🚀',
    description: 'Propiedad nueva: genera copy y distribuye en WhatsApp broadcast, email y webhook',
    trigger_type: 'lead_created', trigger_config: JSON.stringify({ property_added: true }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'copywriter', prompt_template: 'Nueva propiedad en {{agency_name}}, {{agency_city}}. Genera: 1) Descripción para portales (400 palabras, SEO) 2) Post Instagram (caption + hashtags) 3) Post LinkedIn corto (inversores) 4) Mensaje WhatsApp broadcast (2 frases + CTA). Separa con ---IG---, ---LI---, ---WA---', destinations: [{ type: 'webhook', payload_template: '{"action":"publish_property","agency":"{{agency_name}}","content":"{{content}}","date":"{{date}}"}' }, { type: 'notion' }, { type: 'slack' }] } },
    ]),
  },

  // ═══════════════════════════════════════════════════
  // BLOQUE 5: OPERACIONES Y GESTIÓN INTERNA
  // ═══════════════════════════════════════════════════
  {
    name: 'Asignación por round-robin inteligente 🔁',
    description: 'Distribuye leads nuevos equitativamente entre comerciales disponibles',
    trigger_type: 'lead_created', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([
      { type: 'assign_to', config: { role: 'comercial' } },
      { type: 'activate_agent', config: { agent_type: 'coordinador', prompt_template: 'Lead {{lead_name}} asignado. Score: {{score}}/100, zona {{zone}}, presupuesto {{budget_max}}€. Genera briefing de 2 líneas para el comercial: perfil del lead y qué debe hacer en las próximas 2 horas.', destinations: [{ type: 'internal_notification' }, { type: 'slack' }] } },
    ]),
  },
  {
    name: 'Generar borrador contrato de arras 📝',
    description: 'Lead en reserva: genera borrador de arras con los datos del CRM',
    trigger_type: 'stage_changed', trigger_config: JSON.stringify({ to_stage: 'reserva' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'documentador', prompt_template: '{{lead_name}} ha llegado a RESERVA. Genera el esquema del contrato de arras: partes (comprador: {{lead_name}}, vendedor: pendiente), objeto (propiedad en {{zone}}), precio {{budget_max}}€, arras (10% habitual), plazo escritura (90 días), y cláusulas estándar. Borrador orientativo requiere revisión notarial.', destinations: [{ type: 'email_sendgrid', subject_template: 'Borrador contrato de arras — {{lead_name}}' }, { type: 'notion' }] } },
      { type: 'notify_team', config: { notification_message: '📝 Borrador de arras generado para {{lead_name}}. Revisar antes de enviar.', for_role: 'manager', level: 'importante' } },
    ]),
  },
  {
    name: 'KPIs del equipo → email dirección cada semana 📈',
    description: 'Lunes: informe de rendimiento individual de cada comercial al director',
    trigger_type: 'time_schedule', trigger_config: JSON.stringify({ cron: '0 8 * * 1' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'analista', prompt_template: 'Genera informe semanal de KPIs del equipo de {{agency_name}}. Incluye tabla comparativa por comercial, métricas clave, comercial de la semana, y 2 áreas de mejora.', destinations: [{ type: 'email_sendgrid', subject_template: 'KPIs del equipo — Semana {{date}} — {{agency_name}}' }, { type: 'slack' }, { type: 'google_sheets' }] } },
    ]),
  },
  {
    name: 'Audit pipeline semanal → detectar riesgos ⚠️',
    description: 'Cada viernes: análisis de operaciones en riesgo y acciones preventivas',
    trigger_type: 'time_schedule', trigger_config: JSON.stringify({ cron: '0 16 * * 5' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'analista', prompt_template: 'Audit semanal de pipeline para {{agency_name}}. Identifica: operaciones en negociación >2 semanas sin avance, leads en visita_agendada sin feedback, leads con score bajando. Genera acciones preventivas.', destinations: [{ type: 'email_sendgrid', subject_template: '⚠️ Audit pipeline — Riesgos detectados — {{agency_name}}' }, { type: 'telegram' }, { type: 'notion' }] } },
    ]),
  },
  {
    name: 'Alertas de plazos legales y vencimientos ⏳',
    description: 'Detecta contratos de arras próximos a vencer y alerta al equipo',
    trigger_type: 'time_schedule', trigger_config: JSON.stringify({ cron: '0 9 * * 1-5' }),
    conditions: JSON.stringify([{ field: 'pipeline_stage', operator: 'eq', value: 'reserva' }]),
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'documentador', prompt_template: 'Lead {{lead_name}} está en RESERVA. Genera recordatorio de plazos: qué documentos deben estar listos, en qué fecha, y qué ocurre si no se cumple el plazo.', destinations: [{ type: 'email_sendgrid', subject_template: '⏳ Alerta plazos: {{lead_name}} — {{agency_name}}' }, { type: 'telegram' }, { type: 'internal_notification' }] } },
      { type: 'create_task', config: { title: 'Revisar plazos contrato {{lead_name}} — Reserva activa', due_hours: 24, priority: 'alta', assign_to: 'manager' } },
    ]),
  },

  // ═══════════════════════════════════════════════════
  // BLOQUE 6: IA AVANZADA Y ANÁLISIS
  // ═══════════════════════════════════════════════════
  {
    name: 'Análisis de sentimiento de conversación 🧠',
    description: 'Después de cada mensaje del lead, analiza sentimiento y ajusta estrategia',
    trigger_type: 'message_received', trigger_config: '{}',
    conditions: JSON.stringify([{ field: 'ia_score', operator: 'gte', value: 40 }]),
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'coordinador', prompt_template: 'Analiza el sentimiento del último mensaje de {{lead_name}}. Responde en 3 líneas: SENTIMIENTO: X | SEÑAL: X | ACCIÓN: X', save_to_conversation: false, destinations: [{ type: 'crm_field', crm_field: 'ia_next_action' }, { type: 'webhook', payload_template: '{"event":"sentiment_analysis","lead":"{{lead_name}}","score":{{score}},"analysis":"{{content}}"}' }] } },
    ]),
  },
  {
    name: 'Predicción de cierre y revenue forecast 🔮',
    description: 'Cada semana: IA predice qué leads cerrarán este mes y revenue esperado',
    trigger_type: 'time_schedule', trigger_config: JSON.stringify({ cron: '0 9 * * 3' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'analista', prompt_template: 'Genera el forecast de cierres para {{agency_name}} para las próximas 4 semanas. Basado en probabilidades por etapa. Incluye revenue estimado del mes y top 3 operaciones más probables.', destinations: [{ type: 'email_sendgrid', subject_template: '🔮 Forecast de cierres — {{agency_name}} — {{date}}' }, { type: 'google_sheets' }, { type: 'slack' }] } },
    ]),
  },
  {
    name: 'Base de conocimiento: FAQs del mercado local 📚',
    description: 'Mensualmente genera y actualiza las FAQs más relevantes del mercado local',
    trigger_type: 'time_schedule', trigger_config: JSON.stringify({ cron: '0 10 1 * *' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'seo', prompt_template: 'Genera las 15 preguntas frecuentes más buscadas sobre el mercado inmobiliario en {{agency_city}} este mes. Para cada FAQ: pregunta optimizada para SEO + respuesta de 100-150 palabras.', destinations: [{ type: 'notion' }, { type: 'webhook', payload_template: '{"type":"faq_update","city":"{{agency_city}}","agency":"{{agency_name}}","content":"{{content}}","date":"{{date}}"}' }] } },
    ]),
  },
  {
    name: 'Análisis de competencia semanal 🔭',
    description: 'Genera análisis de mercado competitivo y posicionamiento de la agencia',
    trigger_type: 'time_schedule', trigger_config: JSON.stringify({ cron: '0 8 * * 2' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'analista', prompt_template: 'Genera análisis de posicionamiento competitivo para {{agency_name}} en {{agency_city}}. Incluye: propuesta de valor diferenciadora, puntos fuertes vs agencias convencionales, oportunidades de mercado, y 3 acciones de marketing.', destinations: [{ type: 'notion' }, { type: 'email_sendgrid', subject_template: 'Análisis competitivo semanal — {{agency_name}}' }, { type: 'internal_notification' }] } },
    ]),
  },
  {
    name: 'Optimización continua de prompts de agentes IA 🔧',
    description: 'Mensualmente analiza el rendimiento de los agentes y sugiere mejoras',
    trigger_type: 'time_schedule', trigger_config: JSON.stringify({ cron: '0 10 1 * *' }), conditions: '[]',
    actions: JSON.stringify([
      { type: 'activate_agent', config: { agent_type: 'analista', prompt_template: 'Auditoría mensual de rendimiento de los agentes IA de {{agency_name}}. Genera 5 recomendaciones concretas para mejorar los prompts de los agentes Captador y Vendedor.', destinations: [{ type: 'notion' }, { type: 'email_sendgrid', subject_template: 'Auditoría IA mensual — {{agency_name}}' }, { type: 'internal_notification' }] } },
    ]),
  },
]

async function seedAutomationList(agency, list, label) {
  let count = 0
  for (const auto of list) {
    const existing = await get('SELECT id FROM automations WHERE agency_id = @aid AND name = @name', { aid: agency.id, name: auto.name })
    if (existing) continue
    await run(
      `INSERT INTO automations (id, agency_id, name, description, is_active, trigger_type, trigger_event, trigger_config, conditions, actions, run_count, created_at)
       VALUES (@id, @agency_id, @name, @description, 1, @trigger_type, @trigger_type, @trigger_config, @conditions, @actions, 0, NOW())`,
      {
        id: uuidv4(), agency_id: agency.id,
        name: auto.name, description: auto.description,
        trigger_type: auto.trigger_type,
        trigger_config: auto.trigger_config,
        conditions: auto.conditions,
        actions: auto.actions,
      }
    )
    count++
  }
  if (count > 0) console.log(`[Seed] ${count} ${label} insertadas`)
  return count
}

export async function seedDestinationsAutomations() {
  const agencies = await all('SELECT id FROM agencies')
  let total = 0

  for (const agency of agencies) {
    total += await seedAutomationList(agency, N8N_AUTOMATIONS, 'automatizaciones n8n')
    total += await seedAutomationList(agency, FULL_N8N_TEMPLATES, 'plantillas n8n completas')
  }

  if (total > 0) console.log(`[Seed] Total: ${total} nuevas automatizaciones insertadas`)
}
