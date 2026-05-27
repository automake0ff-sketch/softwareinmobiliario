-- ═══════════════════════════════════════════════════════
-- PropIA — SEED DATA
-- Planes de suscripción y plantillas de automatización
-- ═══════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════
-- PLANES DE SUSCRIPCIÓN
-- ═══════════════════════════════════════════════════════
INSERT INTO plans (name, description, price_monthly, price_yearly, currency,
  max_offices, max_users, max_leads_per_month, max_agents, max_automations,
  available_agent_types, feature_whatsapp, feature_meta_ads, feature_white_label,
  feature_api_access, feature_analytics_advanced, feature_priority_support,
  feature_dedicated_support, is_active, sort_order)
VALUES
  ('starter', 'Para agentes independientes que empiezan. Gestión básica de leads y 3 agentes IA.',
   79, 790, 'EUR',
   1, 5, 500, 3, 10,
   '["captador","vendedor","coordinador"]',
   TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 1),

  ('profesional', 'Para agencias en crecimiento. Más agentes, integraciones y analytics avanzados.',
   199, 1990, 'EUR',
   3, 15, 2000, 8, 25,
   '["captador","vendedor","coordinador","copywriter","tasador","analista","agendador","nurturing"]',
   TRUE, TRUE, FALSE, TRUE, TRUE, TRUE, FALSE, TRUE, 2),

  ('agencia', 'Para agencias establecidas con múltiples oficinas. Todos los agentes y white-label.',
   499, 4990, 'EUR',
   10, 50, 10000, 12, 100,
   '["captador","vendedor","coordinador","copywriter","tasador","analista","agendador","nurturing","documentador","seo","financiero","notificador"]',
   TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 3),

  ('enterprise', 'Para grandes grupos inmobiliarios. Solución personalizada con soporte dedicado.',
   999, 9990, 'EUR',
   999, 999, 999999, 12, 999,
   '["captador","vendedor","coordinador","copywriter","tasador","analista","agendador","nurturing","documentador","seo","financiero","notificador"]',
   TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 4);

-- ═══════════════════════════════════════════════════════
-- PLANTILLAS DE AUTOMATIZACIÓN (Marketplace global)
-- ═══════════════════════════════════════════════════════
INSERT INTO automation_templates
  (name, description, category, difficulty, trigger_type, trigger_config,
   conditions, actions, min_plan, requires, is_featured, installs, sort_order)
VALUES

-- CAPTACIÓN
('Bienvenida inmediata',
 'Responde a nuevos leads en menos de 2 minutos con un mensaje personalizado del Captador IA',
 'captacion', 'basica', 'lead_created', '{}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"captador","prompt_template":"Nuevo lead {{lead_name}} desde {{source}} en {{agency_name}}. Genera bienvenida cálida (2-3 frases), usa su nombre, preséntate como el asistente de {{agency_name}} en {{agency_city}}, y haz UNA pregunta de cualificación.","auto_send_whatsapp":true,"save_to_conversation":true}},{"type":"change_stage","config":{"new_stage":"contactado"}}]',
 'starter', '["whatsapp"]', TRUE, 1240, 1),

('Cualificación inteligente de lead',
 'El Captador IA hace las preguntas clave para conocer el perfil del lead y asignar score',
 'captacion', 'basica', 'lead_created', '{}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"captador","prompt_template":"Lead {{lead_name}} llega a {{agency_name}}. Genera las 3 preguntas más importantes para cualificar si es comprador real: presupuesto, zona y urgencia. Elige el orden más natural según el origen {{source}}.","auto_send_whatsapp":true}},{"type":"assign_to","config":{"role":"comercial"}}]',
 'starter', '["whatsapp"]', TRUE, 987, 2),

('Lead VIP detectado — escalada inmediata',
 'Cuando un lead tiene presupuesto alto, alerta al manager y asigna al mejor comercial',
 'captacion', 'basica', 'lead_created', '{}',
 '[{"field":"budget_max","operator":"gte","value":400000}]',
 '[{"type":"add_tag","config":{"tag":"vip"}},{"type":"update_score","config":{"score_change":20}},{"type":"assign_to","config":{"role":"manager"}},{"type":"notify_team","config":{"notification_message":"💎 LEAD VIP: {{lead_name}}, presupuesto alto en {{zone}}. Asignado a manager.","for_role":"manager","level":"urgente"}}]',
 'starter', '[]', TRUE, 432, 3),

-- SEGUIMIENTO
('Follow-up 24h sin respuesta',
 'Si el lead no responde en 24 horas, el Vendedor IA envía un mensaje de seguimiento',
 'seguimiento', 'basica', 'no_response_hours', '{"hours":24}',
 '[{"field":"ia_score","operator":"gte","value":30},{"field":"pipeline_stage","operator":"neq","value":"cerrado"}]',
 '[{"type":"activate_agent","config":{"agent_type":"vendedor","prompt_template":"{{lead_name}} no ha respondido en 24h. Etapa: {{stage}}, score: {{score}}/100, zona: {{zone}}. Genera follow-up breve y sin presión (máximo 2 frases). Pregunta si sigue interesado o tiene dudas que puedas resolver.","auto_send_whatsapp":true}}]',
 'starter', '["whatsapp"]', TRUE, 2341, 4),

('Reactivación urgente lead caliente 72h',
 'Lead con score alto que lleva 72h sin responder — mensaje de reactivación con valor real',
 'seguimiento', 'basica', 'no_response_hours', '{"hours":72}',
 '[{"field":"ia_score","operator":"gte","value":65}]',
 '[{"type":"activate_agent","config":{"agent_type":"vendedor","prompt_template":"Lead caliente {{lead_name}} ({{score}}/100) lleva 72h sin responder. Zona {{zone}}, presupuesto {{budget_max}}. Genera mensaje de reactivación con algo de valor: propiedad nueva, dato de mercado, o pregunta diferente. No suenes desesperado. 2-3 frases.","auto_send_whatsapp":true}},{"type":"notify_team","config":{"notification_message":"🚨 {{lead_name}} (score {{score}}) lleva 72h sin responder. Mensaje de reactivación enviado.","for_role":"manager","level":"urgente"}},{"type":"create_task","config":{"title":"Llamar a {{lead_name}} si no responde al mensaje de reactivación","due_hours":4,"priority":"alta","assign_to":"comercial"}}]',
 'starter', '["whatsapp"]', TRUE, 1876, 5),

('Nurturing mensual leads fríos',
 'Cada mes, los leads fríos reciben contenido de valor del mercado de su zona',
 'seguimiento', 'basica', 'time_schedule', '{"cron":"0 10 1 * *"}',
 '[{"field":"ia_score","operator":"lt","value":40}]',
 '[{"type":"activate_agent","config":{"agent_type":"nurturing","prompt_template":"Lead frío {{lead_name}}, buscaba en {{zone}} con presupuesto {{budget_max}}. Genera mensaje mensual de valor (2-3 frases): menciona algo útil del mercado en {{zone}}, {{agency_city}}. Tono personal, no de campaña.","auto_send_whatsapp":true}}]',
 'starter', '["whatsapp"]', FALSE, 1102, 6),

-- VISITAS
('Recordatorio de visita 24h antes',
 'El Agendador IA recuerda la visita y pide confirmación al lead',
 'visitas', 'basica', 'time_schedule', '{"hours_before_visit":24}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"agendador","prompt_template":"Genera recordatorio de visita para {{lead_name}} en {{agency_name}}. Incluye: hora, pide confirmación, datos de contacto de la agencia ({{agency_phone}}). Tono amable.","auto_send_whatsapp":true}},{"type":"create_task","config":{"title":"Preparar briefing visita {{lead_name}}","due_hours":20,"priority":"alta","assign_to":"comercial"}}]',
 'starter', '["whatsapp"]', TRUE, 1543, 7),

('Seguimiento post-visita',
 'El Vendedor IA contacta al lead 3h después de la visita para recoger feedback',
 'visitas', 'basica', 'visit_completed', '{}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"vendedor","prompt_template":"{{lead_name}} terminó la visita hace 3 horas. Genera mensaje de seguimiento cálido: agradece el tiempo, pregunta qué le pareció, ofrece resolver dudas, sugiere siguiente paso sutilmente.","auto_send_whatsapp":true}},{"type":"update_score","config":{"score_change":12}},{"type":"create_task","config":{"title":"Llamar a {{lead_name}} si no responde al seguimiento post-visita","due_hours":24,"priority":"alta","assign_to":"comercial"}}]',
 'starter', '["whatsapp"]', TRUE, 1287, 8),

-- PIPELINE
('Documentación en negociación',
 'Al llegar a negociación, solicita documentos y calcula viabilidad financiera',
 'pipeline', 'intermedia', 'stage_changed', '{"to_stage":"negociacion"}', '[]',
 '[{"type":"request_documents","config":{"document_types":["dni","nomina","extracto","vida_laboral"]}},{"type":"activate_agent","config":{"agent_type":"financiero","prompt_template":"{{lead_name}} en negociación, presupuesto {{budget_max}}. Genera mensaje con estimación de gastos totales (entrada 20% + impuestos ~10% + notaría ~1%) y cuota hipotecaria aproximada a 25 años.","auto_send_whatsapp":false,"destinations":[{"type":"email_sendgrid","subject_template":"Próximos pasos para tu operación — {{agency_name}}"}]}},{"type":"notify_team","config":{"notification_message":"💼 {{lead_name}} en NEGOCIACIÓN. Documentación solicitada.","for_role":"manager","level":"importante"}},{"type":"create_task","config":{"title":"Revisar documentación {{lead_name}} cuando llegue","due_hours":72,"priority":"alta","assign_to":"manager"}}]',
 'profesional', '["email"]', TRUE, 1023, 9),

('Lead caliente sin asignar — acción urgente',
 'Score alto sin comercial asignado — asignación automática y alerta',
 'pipeline', 'basica', 'score_threshold', '{"threshold":80,"direction":"above"}',
 '[{"field":"assigned_to","operator":"is_null","value":null}]',
 '[{"type":"assign_to","config":{"role":"comercial"}},{"type":"notify_team","config":{"notification_message":"🔥 {{lead_name}} ({{score}}/100) sin asignar. Zona: {{zone}}, presupuesto {{budget_max}}. Asignado automáticamente.","for_role":"manager","level":"urgente"}}]',
 'starter', '[]', TRUE, 1567, 10),

('Cierre: celebración + solicitar referidos',
 'Operación cerrada — felicitación al lead y solicitud de referidos de forma natural',
 'pipeline', 'basica', 'stage_changed', '{"to_stage":"cerrado"}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"vendedor","prompt_template":"Operación cerrada con {{lead_name}} en {{agency_name}}. Genera mensaje de felicitación genuino: celebra el momento, ofrece ayuda post-compra, y de forma muy natural al final menciona que si conocen a alguien buscando algo similar, estarán encantados de ayudar. Sin presión comercial.","auto_send_whatsapp":true}},{"type":"notify_team","config":{"notification_message":"🎉 CIERRE: {{lead_name}}. ¡Enhorabuena al equipo!","for_role":"all","level":"importante"}},{"type":"create_task","config":{"title":"Pedir reseña Google a {{lead_name}} (en 2 semanas)","due_hours":336,"priority":"media","assign_to":"comercial"}}]',
 'starter', '["whatsapp"]', TRUE, 1234, 11),

-- REPORTES
('Briefing matutino del equipo',
 'Cada mañana laborable el equipo recibe sus leads prioritarios y tareas del día',
 'reportes', 'basica', 'time_schedule', '{"cron":"0 8 * * 1-5"}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"notificador","prompt_template":"Genera briefing matutino para el equipo de {{agency_name}} en {{agency_city}}. Formato: saludo motivador, recordatorio de revisar leads sin respuesta, consejo de ventas inmobiliarias del día, y emoji de energía. Máximo 5 líneas.","destinations":[{"type":"internal_notification"},{"type":"slack"}]}}]',
 'starter', '[]', FALSE, 876, 12),

('Informe semanal → email + Slack',
 'Lunes 8:30: análisis ejecutivo del equipo para el manager con KPIs y recomendaciones',
 'reportes', 'intermedia', 'time_schedule', '{"cron":"30 8 * * 1"}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"analista","prompt_template":"Informe semanal para {{agency_name}}, {{agency_city}}. Genera: resumen ejecutivo del pipeline (3 bullets), 3 métricas clave con benchmarks del sector inmobiliario, top oportunidades de la semana, y 3 acciones prioritarias.","destinations":[{"type":"email_sendgrid","subject_template":"📊 Informe semanal {{agency_name}} — {{date}}"},{"type":"slack"}]}}]',
 'profesional', '["email"]', TRUE, 743, 13),

-- N8N / INTEGRACIONES
('[n8n] New lead → Slack con análisis IA',
 'Replica el flujo n8n más usado: lead nuevo → Slack con score, zona, presupuesto y siguiente acción',
 'n8n', 'basica', 'lead_created', '{}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"captador","prompt_template":"Nuevo lead en {{agency_name}}: {{lead_name}}, {{phone}}, {{email}}, desde {{source}}. Zona: {{zone}}, presupuesto: {{budget_max}}. Genera mensaje Slack (4 líneas máx): datos clave, score estimado, y acción inmediata para el equipo.","save_to_conversation":false,"destinations":[{"type":"slack"}]}},{"type":"assign_to","config":{"role":"comercial"}},{"type":"change_stage","config":{"new_stage":"contactado"}}]',
 'starter', '["slack"]', TRUE, 2134, 14),

('[n8n] Lead nuevo → Google Sheets backup',
 'Cada lead se añade automáticamente a tu hoja de cálculo',
 'n8n', 'basica', 'lead_created', '{}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"captador","prompt_template":"Genera línea para Google Sheets (valores separados por |): {{date}}|{{lead_name}}|{{phone}}|{{email}}|{{zone}}|{{budget_max}}|{{operation_type}}|{{source}}|{{score}}|{{stage}}|{{agency_name}}. Solo esa línea.","save_to_conversation":false,"destinations":[{"type":"google_sheets"},{"type":"airtable"}]}}]',
 'profesional', '["sheets"]', FALSE, 1876, 15),

('[n8n] Stage change → webhook CRM externo',
 'Sincroniza cambios de etapa con HubSpot, Pipedrive, Salesforce o cualquier CRM vía webhook',
 'n8n', 'intermedia', 'stage_changed', '{}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"coordinador","prompt_template":"{{lead_name}} cambió a etapa {{stage}}. Score: {{score}}. Genera JSON para CRM externo con todos los datos del lead.","save_to_conversation":false,"destinations":[{"type":"webhook","payload_template":"{\"event\":\"stage_changed\",\"lead_name\":\"{{lead_name}}\",\"phone\":\"{{phone}}\",\"email\":\"{{email}}\",\"stage\":\"{{stage}}\",\"score\":{{score}},\"zone\":\"{{zone}}\",\"budget\":{{budget_max}},\"agency\":\"{{agency_name}}\",\"timestamp\":\"{{datetime}}\"}"}]}}]',
 'profesional', '["webhook"]', TRUE, 1234, 16),

('[n8n] AI property description → portales',
 'Nueva propiedad en el CRM → Copywriter IA genera descripción SEO y la envía vía webhook',
 'n8n', 'intermedia', 'lead_created', '{"property_added":true}', '[]',
 '[{"type":"activate_agent","config":{"agent_type":"copywriter","prompt_template":"Nueva propiedad de {{agency_name}}, {{agency_city}}. Genera: TITULO: (SEO, máx 70 chars) DESCRIPCION_CORTA: (2-3 frases gancho) DESCRIPCION_LARGA: (300 palabras, emocional + características + CTA) BULLET_POINTS: (5 beneficios con •) KEYWORDS: (10 long-tail locales). Contacto al final: {{agency_email}}, {{agency_phone}}.","save_to_conversation":false,"destinations":[{"type":"webhook","payload_template":"{\"action\":\"new_property\",\"agency\":\"{{agency_name}}\",\"city\":\"{{agency_city}}\",\"content\":\"{{content}}\",\"timestamp\":\"{{datetime}}\"}"},{"type":"notion"}]}}]',
 'profesional', '["webhook"]', FALSE, 876, 17);
