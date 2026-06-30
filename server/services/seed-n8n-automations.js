import { v4 as uuidv4 } from 'uuid'
import { all, get, run } from '../db/db.js'

const AUTOMATIONS = [

  // ════════════════════════════════════════════════════════
  // GRUPO 1 — NOTIFICACIONES (7 plantillas N8N)
  // ════════════════════════════════════════════════════════

  {
    name: '[N8N] Lead nuevo → Slack con análisis IA',
    description: 'Como el flujo de n8n "New Lead to Slack" pero el mensaje incluye análisis de intención, score y siguiente acción recomendada',
    trigger_type: 'lead_created', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'captador',
        prompt_template: 'Nuevo lead en {{agency_name}}: {{lead_name}}, teléfono {{phone}}, email {{email}}, llegó desde {{source_label}}. Genera mensaje de Slack (máximo 4 líneas) con: nombre y datos de contacto, análisis rápido del interés detectado, score inicial estimado (0-100) y la acción inmediata que debe hacer el equipo. Usa emojis de Slack para que sea fácil de leer.',
        save_to_conversation: false,
        destinations: [{ type: 'slack' }]
      }
    }, {
      type: 'assign_to',
      config: { role: 'comercial' }
    }, {
      type: 'change_stage',
      config: { new_stage: 'contactado' }
    }]),
  },

  {
    name: '[N8N] Lead nuevo → Telegram con score',
    description: 'Como "Send to Telegram on new lead" de n8n pero con IA que calcula el score y sugiere prioridad',
    trigger_type: 'lead_created', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'captador',
        prompt_template: 'Lead nuevo: {{lead_name}} | {{phone}} | {{email}} | Zona: {{zone}} | Presupuesto: {{budget_formatted}} | Origen: {{source_label}}. Genera alerta de Telegram con: datos del lead en una línea, score estimado 0-100 con emoji (🔥/🟡/❄️), y 1 acción inmediata. Máximo 5 líneas, con asteriscos para negritas de Telegram.',
        save_to_conversation: false,
        destinations: [{ type: 'telegram' }]
      }
    }]),
  },

  {
    name: '[N8N] Pipeline stalled → alerta urgente multicanal',
    description: 'Replicando "Stalled Deal Alert" de n8n: cuando una operación no avanza, alerta en todos los canales del equipo',
    trigger_type: 'no_response_hours', trigger_config: '{"hours": 72}',
    conditions: JSON.stringify([{ field: 'pipeline_stage', operator: 'eq', value: 'negociacion' }]),
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'coordinador',
        prompt_template: 'ALERTA: operación estancada. Lead {{lead_name}} lleva 72h sin actividad en etapa NEGOCIACIÓN. Score: {{score_emoji}} {{score}}/100. Presupuesto: {{budget_formatted}}. Lleva {{days_in_crm}} días en el CRM. Genera alerta ejecutiva de 3 líneas: situación, riesgo de perder la operación, y acción inmediata con deadline.',
        save_to_conversation: false,
        destinations: [{ type: 'slack' }, { type: 'telegram' }, { type: 'internal_notification' }]
      }
    }, {
      type: 'create_task',
      config: { title: 'URGENTE: Llamar a {{lead_name}} — negociación en riesgo (72h sin contacto)', due_hours: 4, priority: 'alta', assign_to: 'manager' }
    }]),
  },

  {
    name: '[N8N] Deal closed → celebración + registro en todos los sistemas',
    description: 'Como "Deal Won Celebration" de n8n: cierre en Slack, Telegram, Notion y Google Sheets simultáneamente',
    trigger_type: 'stage_changed', trigger_config: '{"to_stage": "cerrado"}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'analista',
        prompt_template: '🎉 CIERRE EN {{agency_name}}. Lead: {{lead_name}}, zona: {{zone}}, operación de {{budget_formatted}}. Lleva {{days_in_crm}} días en el CRM. Genera: 1) Mensaje de celebración para Slack/Telegram (emotivo, con datos clave) 2) Una línea de registro para Google Sheets: fecha, nombre, zona, precio, días hasta cierre, fuente. Separa con ---SHEETS---',
        save_to_conversation: false,
        destinations: [{ type: 'slack' }, { type: 'telegram' }, { type: 'google_sheets' }, { type: 'notion' }, { type: 'airtable' }]
      }
    }, {
      type: 'notify_team',
      config: { notification_message: '🎉 {{lead_name}} cerrado. Operación: {{budget_formatted}} en {{zone}}. ¡Enhorabuena!', for_role: 'all', level: 'importante' }
    }]),
  },

  {
    name: '[N8N] New lead → Google Sheets (backup CRM)',
    description: 'Replica exacta del flujo n8n más usado: cada lead nuevo se añade como fila en Google Sheets',
    trigger_type: 'lead_created', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'captador',
        prompt_template: 'Genera registro para Google Sheets de este lead. Formato exacto (separado por |): {{date}} | {{lead_name}} | {{phone}} | {{email}} | {{zone}} | {{budget_formatted}} | {{operation_type}} | {{source_label}} | {{score}} | {{stage_label}} | {{agency_name}}. Solo esa línea, sin explicaciones.',
        save_to_conversation: false,
        destinations: [{ type: 'google_sheets' }, { type: 'airtable' }]
      }
    }]),
  },

  {
    name: '[N8N] Stage change → webhook CRM externo + Notion',
    description: 'Sincroniza cambios de etapa con sistemas externos como HubSpot, Pipedrive o Salesforce vía webhook',
    trigger_type: 'stage_changed', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'analista',
        prompt_template: 'El lead {{lead_name}} ha cambiado de etapa. Nueva etapa: {{stage_label}}. Score: {{score}}/100. Días en CRM: {{days_in_crm}}. Genera: 1) JSON para webhook CRM externo con todos los datos del lead 2) Nota de actualización para Notion en 2 líneas. Separa con ---NOTION---',
        save_to_conversation: false,
        destinations: [
          { type: 'webhook', payload_template: '{"event":"stage_changed","lead_name":"{{lead_name}}","phone":"{{phone}}","email":"{{email}}","new_stage":"{{stage}}","score":{{score}},"zone":"{{zone}}","budget":{{budget_max}},"agency":"{{agency_name}}","date":"{{datetime}}"}' },
          { type: 'notion' }
        ]
      }
    }]),
  },

  {
    name: '[N8N] Daily digest → Airtable + email resumen',
    description: 'Como el flujo n8n de "Daily Report": cada día recopila métricas y las envía a Airtable y por email',
    trigger_type: 'time_schedule', trigger_config: '{"cron": "0 18 * * 1-5"}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'analista',
        prompt_template: 'Genera el daily digest para {{agency_name}} ({{date}}). Incluye: leads nuevos del día (estima un número realista), leads en cada etapa del pipeline, alertas importantes, y 2 acciones para mañana. Formato: primero el resumen en texto para email, luego una línea para Airtable separada por ---AIRTABLE--- con: fecha|leads_nuevos|en_negociacion|cierres_semana|score_promedio',
        save_to_conversation: false,
        destinations: [
          { type: 'email_sendgrid', subject_template: '📊 Daily digest {{agency_name}} — {{date}}' },
          { type: 'airtable' },
          { type: 'slack' }
        ]
      }
    }]),
  },

  {
    name: '[N8N] Nueva propiedad → publicar en portales vía webhook',
    description: 'Cuando se añade una propiedad al CRM, dispara webhooks a Idealista API, portales propios y buffer de RRSS',
    trigger_type: 'lead_created', trigger_config: '{"property_added": true}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'copywriter',
        prompt_template: 'Nueva propiedad de {{agency_name}} en {{agency_city}}. Genera contenido de publicación: TITULO: (título SEO 70 chars) DESCRIPCION_CORTA: (2 frases para listado) DESCRIPCION_LARGA: (250 palabras) WHATSAPP: (mensaje broadcast 2 frases) INSTAGRAM: (caption con hashtags locales) Usa cada etiqueta en mayúsculas como separador.',
        save_to_conversation: false,
        destinations: [
          { type: 'webhook', payload_template: '{"action":"new_property","agency":"{{agency_name}}","city":"{{agency_city}}","content":"{{content}}","timestamp":"{{datetime}}"}' },
          { type: 'slack' },
          { type: 'notion' }
        ]
      }
    }]),
  },

  // ════════════════════════════════════════════════════════
  // GRUPO 3 — EMAIL AUTOMATION
  // ════════════════════════════════════════════════════════

  {
    name: '[N8N] Welcome flow: WhatsApp + Email al mismo tiempo',
    description: 'El flujo de bienvenida más clásico de n8n replicado: contacto inmediato por ambos canales con mensaje personalizado por IA',
    trigger_type: 'lead_created', trigger_config: '{}',
    conditions: JSON.stringify([{ field: 'email', operator: 'not_null', value: null }]),
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'captador',
        prompt_template: 'Lead {{lead_name}} ({{phone}}, {{email}}) llegó desde {{source_label}} buscando en {{zone}} con presupuesto {{budget_formatted}}. Genera DOS mensajes: WHATSAPP: bienvenida cálida y breve (2-3 frases), usa su nombre, preséntate como el asistente de {{agency_name}}, haz UNA pregunta para cualificar. EMAIL: más formal, asunto atractivo al inicio con ASUNTO:, presentación de {{agency_name}}, qué podemos ofrecerle, y CTA para agendar llamada. Separa con ---EMAIL---',
        auto_send_whatsapp: true,
        destinations: [{ type: 'email_sendgrid', subject_template: 'Bienvenido/a a {{agency_name}} — {{lead_first_name}}, estamos aquí para ayudarte' }]
      }
    }, {
      type: 'change_stage',
      config: { new_stage: 'contactado' }
    }]),
  },

  {
    name: '[N8N] Email drip sequence: día 1, día 3, día 7',
    description: 'Replica el flujo n8n de drip campaign: secuencia de 3 emails de nurturing con contenido diferente cada vez',
    trigger_type: 'lead_created', trigger_config: '{}',
    conditions: JSON.stringify([{ field: 'ia_score', operator: 'lt', value: 60 }, { field: 'email', operator: 'not_null', value: null }]),
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'copywriter',
        prompt_template: 'Genera secuencia de 3 emails de nurturing para {{lead_name}} que busca en {{zone}} ({{budget_formatted}}). EMAIL DÍA 1 (hoy): bienvenida + guía gratuita del mercado en {{zone}}, {{agency_city}}. EMAIL DÍA 3: 3 propiedades tipo que tenemos en {{zone}} con rangos de precio. EMAIL DÍA 7: guía del proceso de compra en España paso a paso + invitación a consulta gratuita. Para cada uno: ASUNTO: en la primera línea, luego el cuerpo. Separa con ---DIA3--- y ---DIA7---',
        destinations: [
          { type: 'email_sendgrid', subject_template: '{{lead_first_name}}, tu guía del mercado en {{zone}} — {{agency_name}}' },
          { type: 'webhook', payload_template: '{"type":"drip_sequence_started","lead":"{{lead_name}}","email":"{{email}}","zone":"{{zone}}","agency":"{{agency_name}}"}' }
        ]
      }
    }]),
  },

  {
    name: '[N8N] Post-visit email + feedback request',
    description: 'Exactamente como el nodo "Post-meeting follow-up" de n8n: email de seguimiento 3h después de la visita con solicitud de feedback',
    trigger_type: 'visit_completed', trigger_config: '{}',
    conditions: JSON.stringify([{ field: 'email', operator: 'not_null', value: null }]),
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'vendedor',
        prompt_template: '{{lead_name}} acaba de terminar una visita con {{agency_name}}. Genera email post-visita con ASUNTO: en primera línea. El email debe: agradecer el tiempo, preguntar qué le pareció la propiedad (3 opciones con emojis: ❤️ me encantó / 🤔 tengo dudas / 👀 quiero ver más opciones), ofrecer resolver cualquier pregunta, y proponer next step concreto. Tono cálido y sin presión.',
        auto_send_whatsapp: true,
        destinations: [{ type: 'email_sendgrid', subject_template: '¿Qué te pareció la visita, {{lead_first_name}}? — {{agency_name}}' }]
      }
    }, {
      type: 'update_score',
      config: { score_change: 12 }
    }, {
      type: 'create_task',
      config: { title: 'Llamar a {{lead_name}} si no responde al email post-visita (24h)', due_hours: 24, priority: 'alta', assign_to: 'comercial' }
    }]),
  },

  {
    name: '[N8N] No-show → email empático + nuevo horario',
    description: 'Cuando el lead no aparece a la visita: email automático comprensivo con 3 nuevas propuestas de horario',
    trigger_type: 'visit_no_show', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'agendador',
        prompt_template: '{{lead_name}} no se presentó a la visita de hoy sin avisar. Genera email (ASUNTO: en primera línea) comprensivo que: no le haga sentir mal, entienda que puede haber pasado algo, proponga 3 nuevas fechas esta semana (días laborables, horarios 10h, 17h, 19h), y mencione que también tiene otra propiedad muy similar que igual le interesa ver. Incluye al final el número de teléfono {{agency_phone}} por si prefiere llamar.',
        destinations: [
          { type: 'email_sendgrid', subject_template: '{{lead_first_name}}, ¿todo bien? Reagendamos cuando quieras' },
          { type: 'crm_field', crm_field: 'ia_next_action' }
        ]
      }
    }, {
      type: 'update_score',
      config: { score_change: -10 }
    }, {
      type: 'add_tag',
      config: { tag: 'no-show' }
    }]),
  },

  // ════════════════════════════════════════════════════════
  // GRUPO 4 — ANÁLISIS Y REPORTES
  // ════════════════════════════════════════════════════════

  {
    name: '[N8N] Weekly report → email + Google Sheets',
    description: 'El flujo semanal de n8n más popular: informe ejecutivo los lunes con KPIs a dirección + registro en Sheets',
    trigger_type: 'time_schedule', trigger_config: '{"cron": "30 8 * * 1"}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'analista',
        prompt_template: 'Informe semanal {{agency_name}} — semana del {{date}}. Genera: SECCIÓN 1 (para email) — resumen ejecutivo: leads nuevos vs semana anterior (benchmark: 15-20/semana agencia media), conversión pipeline, cierres del mes a la fecha, 3 insights clave, 3 acciones prioritarias próxima semana. SECCIÓN 2 (para Sheets, una línea) — {{date}}|leads_semana|contactados|visitas|negociaciones|cierres|score_promedio|fuente_top. Separa con ---SHEETS---',
        save_to_conversation: false,
        destinations: [
          { type: 'email_sendgrid', subject_template: '📊 Informe semanal {{agency_name}} — {{date}}' },
          { type: 'google_sheets' },
          { type: 'slack' }
        ]
      }
    }]),
  },

  {
    name: '[N8N] Monthly market report → newsletter',
    description: 'Como el flujo mensual de n8n "Send newsletter to subscribers": informe de mercado a todos los leads activos',
    trigger_type: 'time_schedule', trigger_config: '{"cron": "0 9 1 * *"}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'copywriter',
        prompt_template: 'Newsletter mensual de {{agency_name}} para {{month}} {{year}}. Ciudad: {{agency_city}}. Genera newsletter HTML-friendly con: 1) RESUMEN DE MERCADO: tendencias de precios en {{agency_city}} este mes, zonas más demandadas, tiempo medio de venta 2) PROPIEDAD DESTACADA DEL MES: descripción de una propiedad tipo de {{agency_city}} con datos realistas 3) CONSEJO DEL MES: tip sobre hipotecas, inversión o proceso de compra 4) CTA suave al final con {{agency_phone}} y {{agency_email}}. Tono informativo y de valor, nada de spam.',
        save_to_conversation: false,
        destinations: [
          { type: 'email_sendgrid', subject_template: '📊 El mercado en {{agency_city}} — {{month}} {{year}} — {{agency_name}}' },
          { type: 'notion' },
          { type: 'webhook', payload_template: '{"type":"monthly_newsletter","agency":"{{agency_name}}","month":"{{month}}","content":"{{content}}"}' }
        ]
      }
    }]),
  },

  {
    name: '[N8N] Pipeline health check → viernes 17h',
    description: 'Réplica del flujo "Deal health check" de n8n: cada viernes analiza el estado del pipeline y detecta riesgos',
    trigger_type: 'time_schedule', trigger_config: '{"cron": "0 17 * * 5"}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'analista',
        prompt_template: 'Health check del pipeline de {{agency_name}} — viernes {{date}}. Analiza el estado de salud del pipeline esta semana. Incluye: 1) VERDE ✅: qué va bien (leads avanzando, visitas realizadas) 2) AMARILLO ⚠️: riesgos detectados (leads sin actividad, etapas estancadas) 3) ROJO 🚨: urgencias críticas (negociaciones en riesgo) 4) PLAN DE ACCIÓN: 5 cosas concretas para hacer el lunes. Datos basados en benchmarks del sector inmobiliario.',
        save_to_conversation: false,
        destinations: [
          { type: 'email_sendgrid', subject_template: '⚠️ Pipeline health check — {{agency_name}} — {{date}}' },
          { type: 'telegram' },
          { type: 'slack' }
        ]
      }
    }]),
  },

  {
    name: '[N8N] AI lead scoring → webhook analytics platform',
    description: 'Réplica de "AI-powered lead scoring" de n8n: cuando cambia el score, envía a plataforma de analytics',
    trigger_type: 'score_threshold', trigger_config: '{"threshold": 70, "direction": "above"}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'coordinador',
        prompt_template: 'Lead {{lead_name}} ha superado score 70 ({{score_emoji}} {{score}}/100). Zona: {{zone}}, presupuesto: {{budget_formatted}}, etapa: {{stage_label}}, fuente: {{source_label}}, días en CRM: {{days_in_crm}}. Genera: 1) Análisis breve de por qué es un lead de calidad (2 líneas) 2) Score breakdown: qué factores lo elevan 3) Siguiente acción óptima para el equipo. Para Slack: formato conciso con datos clave.',
        save_to_conversation: false,
        destinations: [
          { type: 'webhook', payload_template: '{"event":"high_score_lead","lead_name":"{{lead_name}}","score":{{score}},"zone":"{{zone}}","budget":{{budget_max}},"source":"{{source}}","days_in_crm":{{days_in_crm}},"agency":"{{agency_name}}","timestamp":"{{datetime}}"}' },
          { type: 'slack' }
        ]
      }
    }, {
      type: 'notify_team',
      config: { notification_message: '{{score_emoji}} {{lead_name}} supera score 70 ({{score}}/100). Zona: {{zone}}, presupuesto: {{budget_formatted}}. Atención prioritaria.', for_role: 'comercial', level: 'importante' }
    }]),
  },

  // ════════════════════════════════════════════════════════
  // GRUPO 5 — GENERACIÓN DE CONTENIDO
  // ════════════════════════════════════════════════════════

  {
    name: '[N8N] Meta Ads copy generator → Buffer/Hootsuite',
    description: 'Como el flujo n8n "AI content calendar": genera copies de anuncios semanalmente y los envía a programador',
    trigger_type: 'time_schedule', trigger_config: '{"cron": "0 8 * * 1"}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'copywriter',
        prompt_template: 'Plan semanal de Meta Ads para {{agency_name}}, {{agency_city}}. Genera 5 anuncios (para Facebook e Instagram). Para cada anuncio: ANUNCIO 1: TITULO: (máx 40 chars), DESCRIPCION: (máx 125 chars), CTA: (texto botón), IMAGEN_SUGERIDA: (descripción de imagen ideal). Temas: 1) Urgencia de mercado 2) Primera vivienda 3) Inversión en {{agency_city}} 4) Propiedad destacada tipo 5) Proceso simple con {{agency_name}}. Separa cada anuncio con ---ANUNCIO2--- etc.',
        save_to_conversation: false,
        destinations: [
          { type: 'notion' },
          { type: 'webhook', payload_template: '{"type":"meta_ads_weekly","agency":"{{agency_name}}","city":"{{agency_city}}","week":"{{date}}","content":"{{content}}"}' },
          { type: 'slack' }
        ]
      }
    }]),
  },

  {
    name: '[N8N] Property description AI → publicar en portales',
    description: 'Réplica exacta del flujo n8n "Generate property listing": IA crea descripción completa y la envía vía webhook a portales',
    trigger_type: 'lead_created', trigger_config: '{"property_added": true}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'copywriter',
        prompt_template: 'Nueva propiedad en {{agency_name}}, {{agency_city}}. Genera ficha completa para portales inmobiliarios: TITULO_SEO: (máx 70 chars, incluir tipo+habitaciones+zona+ciudad) URL_SLUG: (versión URL del título, todo minúsculas con guiones) META_DESCRIPTION: (máx 155 chars) DESCRIPCION_CORTA: (2-3 frases de gancho para listado) DESCRIPCION_LARGA: (400 palabras, empieza con párrafo emocional, sigue con características, termina con CTA) BULLET_POINTS: (5 beneficios, uno por línea con •) TAGS_SEO: (10 keywords long-tail locales separadas por coma). Formato limpio para copiar y pegar.',
        save_to_conversation: false,
        destinations: [
          { type: 'webhook', payload_template: '{"action":"publish_property","source":"propia","agency":"{{agency_name}}","city":"{{agency_city}}","content":"{{content}}","timestamp":"{{datetime}}"}' },
          { type: 'notion' },
          { type: 'crm_field', crm_field: 'ia_summary' }
        ]
      }
    }]),
  },

  {
    name: '[N8N] Auto-blog: artículo SEO sobre mercado local',
    description: 'Como el flujo n8n "Auto-generate blog content": artículo de 800 palabras sobre el mercado cada mes',
    trigger_type: 'time_schedule', trigger_config: '{"cron": "0 10 5 * *"}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'seo',
        prompt_template: 'Genera artículo SEO completo para el blog de {{agency_name}} sobre el mercado inmobiliario en {{agency_city}} en {{month}} {{year}}. Estructura: H1: título con keyword principal (incluir {{agency_city}} y año), INTRO: párrafo inicial con keyword y gancho, H2: Situación actual del mercado en {{agency_city}}, H2: Zonas más demandadas y por qué, H2: Precios actuales por tipo de propiedad, H2: Consejos para compradores/inversores en {{agency_city}}, CONCLUSION: con CTA a contactar con {{agency_name}} ({{agency_email}}, {{agency_phone}}). Total: 700-900 palabras. Añade al final TITLE_TAG: y META_DESCRIPTION: para SEO.',
        save_to_conversation: false,
        destinations: [
          { type: 'notion' },
          { type: 'webhook', payload_template: '{"type":"blog_post","agency":"{{agency_name}}","city":"{{agency_city}}","month":"{{month}}","year":"{{year}}","content":"{{content}}"}' },
          { type: 'email_sendgrid', subject_template: '📝 Nuevo artículo listo para publicar — {{agency_name}}' }
        ]
      }
    }]),
  },

  // ════════════════════════════════════════════════════════
  // GRUPO 6 — OPERACIONES Y PROCESOS INTERNOS
  // ════════════════════════════════════════════════════════

  {
    name: '[N8N] Lead onboarding: secuencia completa día 0',
    description: 'El flujo de onboarding más completo de n8n: en el momento que entra un lead, ejecuta 5 acciones coordinadas',
    trigger_type: 'lead_created', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'captador',
        prompt_template: 'Lead {{lead_name}} ({{phone}}) llegó desde {{source_label}} buscando en {{zone}}, presupuesto {{budget_formatted}}. Genera SOLO el mensaje de WhatsApp de bienvenida: cálido, usa su nombre, preséntate como el asistente de {{agency_name}} en {{agency_city}}, haz UNA pregunta de cualificación. Máximo 3 frases.',
        auto_send_whatsapp: true,
        save_to_conversation: true
      }
    }, {
      type: 'assign_to',
      config: { role: 'comercial' }
    }, {
      type: 'change_stage',
      config: { new_stage: 'contactado' }
    }, {
      type: 'create_task',
      config: { title: 'Primer contacto con {{lead_name}} — confirmar interés y cualificar', due_hours: 2, priority: 'alta', assign_to: 'comercial' }
    }, {
      type: 'activate_agent',
      config: {
        agent_type: 'coordinador',
        prompt_template: 'Nuevo lead registrado: {{lead_name}}, {{zone}}, {{budget_formatted}}, origen {{source_label}}. Genera briefing de 2 líneas para el CRM: perfil resumido y estrategia de primer contacto recomendada.',
        save_to_conversation: false,
        destinations: [{ type: 'crm_field', crm_field: 'ia_summary' }, { type: 'slack' }]
      }
    }]),
  },

  {
    name: '[N8N] Visit reminder: 24h + 2h + briefing comercial',
    description: 'Réplica del flujo n8n "Meeting reminder sequence": mensaje 24h, mensaje 2h y briefing al comercial, todo automático',
    trigger_type: 'time_schedule', trigger_config: '{"hours_before_visit": 24}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'agendador',
        prompt_template: 'Genera DOS mensajes para la visita de mañana de {{lead_name}} con {{agency_name}}. MENSAJE_LEAD (WhatsApp, 3 líneas): recordatorio amable con hora, pide confirmación, menciona que puede preguntar dudas a {{agency_phone}}. MENSAJE_COMERCIAL (para el equipo, 5 líneas): briefing del lead con su perfil, qué busca, puntos a destacar, posible objeción y objetivo de la visita. Separa con ---COMERCIAL---',
        auto_send_whatsapp: true,
        save_to_conversation: true,
        destinations: [{ type: 'internal_notification' }, { type: 'slack' }]
      }
    }]),
  },

  {
    name: '[N8N] Arras process: checklist + draft + alertas legales',
    description: 'Como el flujo n8n "Contract process automation": cuando hay reserva, genera checklist, borrador y alertas de plazos',
    trigger_type: 'stage_changed', trigger_config: '{"to_stage": "reserva"}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'documentador',
        prompt_template: '{{lead_name}} ha firmado reserva en {{agency_name}}. Propiedad: {{zone}}, {{agency_city}}, precio aprox. {{budget_formatted}}. Genera DOCUMENTO COMPLETO: 1) CHECKLIST (con casillas ☐): documentos pendientes del comprador y vendedor 2) BORRADOR DE ARRAS: esquema con partes, objeto, precio, importe arras (10%), plazos (escritura en 90 días), cláusulas penales estándar, nota obligatoria de revisión notarial 3) ALERTAS DE PLAZOS: fechas clave con 30 días de antelación. Separa secciones con ---ARRAS--- y ---PLAZOS---',
        save_to_conversation: false,
        destinations: [
          { type: 'email_sendgrid', subject_template: '📝 Proceso de arras — {{lead_name}} — {{agency_name}}' },
          { type: 'notion' },
          { type: 'webhook', payload_template: '{"type":"arras_started","lead":"{{lead_name}}","agency":"{{agency_name}}","date":"{{date}}"}' }
        ]
      }
    }, {
      type: 'notify_team',
      config: { notification_message: '📝 {{lead_name}} en RESERVA. Proceso de arras iniciado. Revisar checklist de documentación.', for_role: 'manager', level: 'urgente' }
    }, {
      type: 'create_task',
      config: { title: 'Coordinar notaría para escritura de {{lead_name}} (plazo: 90 días)', due_hours: 48, priority: 'alta', assign_to: 'manager' }
    }]),
  },

  {
    name: '[N8N] Valuation request → AI report → email PDF',
    description: 'Réplica de "Automated property valuation" de n8n: el propietario pide valoración y recibe informe por email',
    trigger_type: 'message_received', trigger_config: '{"intent": "valuation_request"}',
    conditions: JSON.stringify([{ field: 'tags', operator: 'contains', value: 'quiere-vender' }]),
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'tasador',
        prompt_template: '{{lead_name}} solicita valoración de su propiedad en {{zone}}, {{agency_city}}. Genera INFORME COMPLETO DE VALORACIÓN para enviar por email: HEADER: logo textual de {{agency_name}}, fecha {{date}}, referencia CLIENT-{{score}} SECCIÓN 1 — DATOS: tipo de propiedad estimado para la zona, m² aproximados, características estándar de {{zone}} SECCIÓN 2 — VALORACIÓN: precio mínimo, óptimo y máximo con justificación de mercado, precio por m² de la zona SECCIÓN 3 — ANÁLISIS: demanda actual en {{zone}}, tiempo medio de venta, comparables recientes SECCIÓN 4 — RECOMENDACIÓN: estrategia de precio y marketing recomendada FOOTER: datos de contacto de {{agency_name}}: {{agency_email}}, {{agency_phone}}, {{agency_website}}. Nota legal obligatoria al final.',
        destinations: [
          { type: 'email_sendgrid', subject_template: 'Tu valoración gratuita de {{zone}}, {{agency_city}} — {{agency_name}}' },
          { type: 'crm_field', crm_field: 'ia_summary' },
          { type: 'notion' }
        ]
      }
    }, {
      type: 'add_tag',
      config: { tag: 'valoracion-enviada' }
    }, {
      type: 'create_task',
      config: { title: 'Visita de confirmación de tasación para {{lead_name}} — {{zone}}', due_hours: 48, priority: 'alta', assign_to: 'manager' }
    }]),
  },

  {
    name: '[N8N] Conversation analysis → strategy adjustment',
    description: 'Como el flujo n8n "Sentiment analysis pipeline": analiza cada mensaje y ajusta la estrategia automáticamente',
    trigger_type: 'message_received', trigger_config: '{}',
    conditions: JSON.stringify([{ field: 'ia_score', operator: 'gte', value: 50 }]),
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'coordinador',
        prompt_template: 'Análisis de conversación: {{lead_name}}, score {{score_emoji}} {{score}}/100, etapa {{stage_label}}, {{days_since_contact}} días desde último contacto. Resumen de perfil: {{lead_summary}}. Analiza el estado actual y determina: SENTIMIENTO: (positivo/neutro/negativo/dubitativo) SEÑAL_DETECTADA: (intención de compra alta/media/baja/dudas sobre precio/dudas sobre zona/necesita más tiempo) ESTRATEGIA_OPTIMA: (qué tipo de mensaje enviar ahora) NEXT_ACTION: (acción concreta en próximas 2h). Responde exactamente en ese formato.',
        save_to_conversation: false,
        destinations: [
          { type: 'crm_field', crm_field: 'ia_next_action' },
          { type: 'webhook', payload_template: '{"event":"conversation_analyzed","lead":"{{lead_name}}","score":{{score}},"stage":"{{stage}}","analysis":"{{content}}","agency":"{{agency_name}}"}' }
        ]
      }
    }]),
  },

  // ════════════════════════════════════════════════════════
  // GRUPO 7 — INTEGRACIONES AVANZADAS
  // ════════════════════════════════════════════════════════

  {
    name: '[N8N] Universal bridge → Zapier/Make/n8n externo',
    description: 'Envía datos estructurados a Zapier, Make o tu propio n8n para conectar con cualquier app (Gmail, Drive, Trello, etc.)',
    trigger_type: 'lead_created', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'analista',
        prompt_template: 'Genera el payload JSON estructurado de este lead para enviar a sistemas externos. Lead: {{lead_name}}, {{phone}}, {{email}}, zona {{zone}}, presupuesto {{budget_max}}, score {{score}}, etapa {{stage}}, origen {{source}}, agencia {{agency_name}}, ciudad {{agency_city}}. Genera SOLO el JSON perfectamente formateado con todos los campos, incluye timestamp {{datetime}} y agency_id para referencia.',
        save_to_conversation: false,
        destinations: [
          { type: 'webhook', payload_template: '{"source":"PropIA","event":"new_lead","timestamp":"{{datetime}}","lead":{"name":"{{lead_name}}","phone":"{{phone}}","email":"{{email}}","score":{{score}},"stage":"{{stage}}","zone":"{{zone}}","budget":{{budget_max}},"source":"{{source}}","operation":"{{operation_type}}"},"agency":{"name":"{{agency_name}}","city":"{{agency_city}}","email":"{{agency_email}}"}}' }
        ]
      }
    }]),
  },

  {
    name: '[N8N] Mirror CRM → Notion database completa',
    description: 'Mantiene una copia espejo del CRM en Notion: cada lead tiene su página con todo el historial',
    trigger_type: 'stage_changed', trigger_config: '{}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'analista',
        prompt_template: 'Genera actualización para la base de datos Notion de {{lead_name}}. Etapa actual: {{stage_label}}. Score: {{score}}/100. Resumen del proceso hasta ahora: {{lead_summary}}. Días en CRM: {{days_in_crm}}. Genera: 1) Nota de progreso (2 líneas) 2) Estado actual de la operación 3) Siguiente acción recomendada con fecha. Formato Notion-friendly con bullets.',
        save_to_conversation: false,
        destinations: [{ type: 'notion' }, { type: 'airtable' }]
      }
    }]),
  },

  {
    name: '[N8N] Live dashboard → Google Sheets en tiempo real',
    description: 'Cada evento importante actualiza la hoja de Google Sheets que sirve como dashboard del equipo',
    trigger_type: 'score_threshold', trigger_config: '{"threshold": 60, "direction": "above"}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'analista',
        prompt_template: 'Lead {{lead_name}} ha alcanzado score {{score}}/100 ({{score_emoji}}). Zona: {{zone}}, presupuesto {{budget_formatted}}, etapa {{stage_label}}, {{days_in_crm}} días en CRM, origen {{source_label}}. Genera línea para Google Sheets dashboard: {{datetime}}|{{lead_name}}|{{phone}}|{{score}}|{{stage}}|{{zone}}|{{budget_max}}|{{source}}|{{assigned_to_name}}|ACCIÓN RECOMENDADA (1 frase). Solo esa línea.',
        save_to_conversation: false,
        destinations: [{ type: 'google_sheets' }, { type: 'slack' }]
      }
    }]),
  },

  {
    name: '[N8N] Customer knowledge base → Airtable',
    description: 'Cada lead cerrado enriquece la base de conocimiento en Airtable para mejorar futuras captaciones',
    trigger_type: 'stage_changed', trigger_config: '{"to_stage": "cerrado"}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'analista',
        prompt_template: 'Operación cerrada: {{lead_name}}, {{zone}}, {{budget_formatted}}, origen {{source_label}}, {{days_in_crm}} días hasta cierre. Genera análisis de aprendizaje para base de conocimiento: qué funcionó, qué canal fue más efectivo, perfil del cliente ideal detectado, y lección aprendida para futuros leads similares. Máximo 100 palabras, datos estructurados.',
        save_to_conversation: false,
        destinations: [
          { type: 'airtable' },
          { type: 'notion' },
          { type: 'webhook', payload_template: '{"type":"closed_deal_learning","lead_profile":"{{zone}}_{{operation_type}}","days_to_close":{{days_in_crm}},"source":"{{source}}","budget":{{budget_max}},"agency":"{{agency_name}}","learnings":"{{content}}"}' }
        ]
      }
    }]),
  },

  // ════════════════════════════════════════════════════════
  // GRUPO 8 — CASOS ESPECIALES INMOBILIARIAS
  // ════════════════════════════════════════════════════════

  {
    name: '[N8N] Market alert → WhatsApp a leads de esa zona',
    description: 'Cuando hay un cambio en el mercado de una zona, alerta automáticamente a todos los leads interesados en ella',
    trigger_type: 'time_schedule', trigger_config: '{"cron": "0 9 15 * *"}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'tasador',
        prompt_template: 'Alerta mensual de mercado para {{agency_name}} en {{agency_city}}. Genera mensaje corto (máximo 4 líneas) para enviar por WhatsApp a leads interesados en varias zonas de {{agency_city}}. El mensaje debe: dar 1 dato real o estimado del mercado este mes, ser útil e informativo (no comercial), y terminar con una pregunta suave de seguimiento. Tono de asesor de confianza.',
        auto_send_whatsapp: false,
        destinations: [{ type: 'internal_notification' }, { type: 'slack' }]
      }
    }]),
  },

  {
    name: '[N8N] Opportunity detector → alert inversores',
    description: 'Detecta oportunidades de inversión y alerta automáticamente a leads con perfil inversor',
    trigger_type: 'time_schedule', trigger_config: '{"cron": "0 8 * * 2,4"}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'tasador',
        prompt_template: 'Análisis de oportunidades de inversión en {{agency_city}} para {{agency_name}}. Genera informe de 2 párrafos para leads inversores: 1) Zonas con mejor rentabilidad actual en {{agency_city}} con yields estimados (usar benchmarks: 3-5% yield neto en ciudad media española) 2) Tipo de propiedad con mejor ratio precio/alquiler ahora mismo y por qué. Añade al final 2 propiedades tipo ideales para inversión con datos de ejemplo.',
        save_to_conversation: false,
        destinations: [
          { type: 'email_sendgrid', subject_template: '💰 Oportunidades de inversión en {{agency_city}} — {{agency_name}}' },
          { type: 'slack' },
          { type: 'telegram' }
        ]
      }
    }]),
  },

  {
    name: '[N8N] Seller outreach: captación de propietarios',
    description: 'Automatiza la captación de propietarios que quieren vender generando mensajes personalizados por zona',
    trigger_type: 'time_schedule', trigger_config: '{"cron": "0 10 * * 2"}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'captador',
        prompt_template: 'Campaña de captación de vendedores para {{agency_name}} en {{agency_city}}. Genera 3 mensajes diferentes para propietarios que consideran vender: MENSAJE_A: para propietario que lleva tiempo sin decidirse (perspectiva de mercado favorable ahora), MENSAJE_B: para propietario con urgencia (mudanza/separación/herencia), MENSAJE_C: para inversor que quiere rotar portfolio. Cada mensaje máximo 3 líneas para WhatsApp. Separa con ---B--- y ---C---',
        save_to_conversation: false,
        destinations: [{ type: 'notion' }, { type: 'slack' }]
      }
    }]),
  },

  {
    name: '[N8N] Mortgage comparison → personalized email',
    description: 'Cuando un lead pregunta por financiación, genera comparativa personalizada y la envía por email',
    trigger_type: 'message_received', trigger_config: '{"intent": "mortgage_inquiry"}',
    conditions: JSON.stringify([{ field: 'tags', operator: 'contains', value: 'pregunta-hipoteca' }]),
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'financiero',
        prompt_template: '{{lead_name}} ha preguntado por financiación hipotecaria. Presupuesto objetivo: {{budget_formatted}}. Genera email con ASUNTO: en primera línea. El email incluye: cálculo personalizado (entrada necesaria = 20% de {{budget_max}} = €, gastos = 10-12% de {{budget_max}} = €, total necesario = €), cuota mensual estimada a 25 años con tipo fijo actual (3.2%), comparativa fija vs variable vs mixta en tabla simple, y CTA para conectar con bróker hipotecario de {{agency_name}}. Clausula obligatoria al final sobre estimaciones.',
        destinations: [
          { type: 'email_sendgrid', subject_template: 'Tu simulación hipotecaria personalizada — {{agency_name}}' },
          { type: 'crm_field', crm_field: 'ia_next_action' }
        ]
      }
    }, {
      type: 'add_tag',
      config: { tag: 'hipoteca-calculada' }
    }]),
  },

  {
    name: '[N8N] Monthly forecast → CEO email + Sheets dashboard',
    description: 'Como el flujo n8n "Executive reporting": previsión de cierres del mes con datos del pipeline',
    trigger_type: 'time_schedule', trigger_config: '{"cron": "0 9 1 * *"}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'analista',
        prompt_template: 'Forecast de {{month}} {{year}} para {{agency_name}}, {{agency_city}}. Genera informe ejecutivo para dirección: RESUMEN EJECUTIVO (3 bullets máximo), FORECAST CIERRES: tabla con leads en cada etapa y probabilidad de cierre (negociacion=65%, visita=35%, interesado=15%), REVENUE ESTIMADO: rango mínimo-máximo basado en presupuestos promedio del sector (150k-300k €/operación), TOP 3 OPORTUNIDADES: leads ficticios con nombre anónimo que tienen más probabilidad de cerrar este mes, RIESGOS: 2 factores de riesgo para el forecast, ACCIÓN: 3 cosas críticas para maximizar cierres en {{month}}. Añade al final línea para Sheets separada con ---SHEETS---: {{year}}-{{month}}|mes|leads_activos|forecast_cierres|revenue_min|revenue_max',
        save_to_conversation: false,
        destinations: [
          { type: 'email_sendgrid', subject_template: '📈 Forecast {{month}} {{year}} — {{agency_name}}' },
          { type: 'google_sheets' },
          { type: 'slack' }
        ]
      }
    }]),
  },

  {
    name: '[N8N] Review management: solicitar + plantilla respuesta',
    description: 'Tras cada cierre, solicita reseña en Google Maps y genera plantilla de respuesta para futuras reseñas',
    trigger_type: 'stage_changed', trigger_config: '{"to_stage": "cerrado"}', conditions: '[]',
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'copywriter',
        prompt_template: 'Operación cerrada con {{lead_name}} en {{agency_name}}. Genera DOS textos: SOLICITUD_RESEÑA (para enviar a {{lead_name}} por WhatsApp, 3 líneas): agradecimiento por la confianza, petición de reseña en Google con enlace genérico a Google Maps, mencionar que ayuda mucho a la agencia. PLANTILLA_RESPUESTA_POSITIVA (para cuando llegue la reseña positiva, 3 líneas): agradecer específicamente, mencionar el barrio/zona, invitar a recomendar. Separa con ---RESPUESTA---',
        auto_send_whatsapp: true,
        destinations: [{ type: 'notion' }, { type: 'crm_field', crm_field: 'ia_next_action' }]
      }
    }]),
  },

  {
    name: '[N8N] Smart reactivation: IA elige momento y mensaje óptimos',
    description: 'Como el flujo n8n "AI-powered re-engagement": la IA analiza el historial y determina cuándo y cómo reactivar',
    trigger_type: 'no_response_hours', trigger_config: '{"hours": 720}',
    conditions: JSON.stringify([{ field: 'ia_score', operator: 'gte', value: 25 }, { field: 'pipeline_stage', operator: 'neq', value: 'cerrado' }]),
    actions: JSON.stringify([{
      type: 'activate_agent',
      config: {
        agent_type: 'nurturing',
        prompt_template: 'Lead {{lead_name}} lleva {{days_since_contact}} días sin actividad (etapa: {{stage_label}}, score: {{score}}/100). Buscaba en {{zone}}, presupuesto {{budget_formatted}}, llegó por {{source_label}}. Resumen: {{lead_summary}}. Analiza el caso y genera: 1) Estrategia de reactivación óptima (por qué este lead merece un intento más) 2) Mensaje de reactivación personalizado para WhatsApp (máximo 3 líneas, no menciones el tiempo que lleva sin responder, ofrece algo de valor concreto relacionado con {{zone}} o {{operation_type}}) 3) Si no responde a este mensaje: recomendación (archivar / intentar por email / llamar directamente).',
        auto_send_whatsapp: true,
        destinations: [{ type: 'crm_field', crm_field: 'ia_next_action' }, { type: 'slack' }]
      }
    }]),
  },
]

export function seedN8nAutomations() {
  const existing = get('SELECT COUNT(*) as c FROM automations WHERE name LIKE \'[N8N]%\'')
  if (existing && existing.c >= 35) {
    console.log(`[Seed N8N] Ya existen ${existing.c} automatizaciones. Saltando.`)
    return
  }

  const allAgencies = all('SELECT id FROM agencies')
  if (!allAgencies || allAgencies.length === 0) {
    console.log('[Seed N8N] No hay agencias. Se insertarán cuando exista una.')
    return
  }

  for (const agency of allAgencies) {
    const agencyId = agency.id
    let inserted = 0

    for (const auto of AUTOMATIONS) {
      try {
        run(
          `INSERT INTO automations (id, agency_id, name, description, trigger_type, trigger_config, conditions, actions, is_active, run_count, created_at)
           VALUES (@id, @agency_id, @name, @description, @trigger_type, @trigger_config, @conditions, @actions, 1, 0, NOW())`,
          {
            id: uuidv4(),
            agency_id: agencyId,
            name: auto.name,
            description: auto.description,
            trigger_type: auto.trigger_type,
            trigger_config: auto.trigger_config,
            conditions: auto.conditions,
            actions: auto.actions,
          }
        )
        inserted++
      } catch (e) {
        console.log(`[Seed N8N] Skip: ${auto.name} — ${e.message}`)
      }
    }

    console.log(`[Seed N8N] ${inserted} automatizaciones insertadas para agencia ${agencyId}`)
  }
}
