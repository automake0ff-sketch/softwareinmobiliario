import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { callClaude } from './claude.js';
import { EmailService } from './email.js';
import { WhatsAppService } from './whatsapp.js';

export async function logCommunication({ agencyId, leadId, appointmentId, channel, direction, subject, body, status, providerMessageId, error }) {
  await run(
    `INSERT INTO communication_logs (id, agency_id, lead_id, appointment_id, channel, direction, subject, body, status, provider_message_id, error, sent_at, created_at)
     VALUES (@id, @aid, @lid, @appt_id, @channel, @direction, @subject, @body, @status, @pmid, @err, CASE WHEN @status IN ('sent','failed') THEN NOW() ELSE NULL END, NOW())`,
    {
      id: uuidv4(), aid: agencyId, lid: leadId, appt_id: appointmentId || null,
      channel, direction, subject, body,
      status, pmid: providerMessageId || null, err: error || null,
    }
  );
}

export async function logLeadAutomation({ agencyId, leadId, type, channel, status, payload, result }) {
  const id = uuidv4();
  await run(
    `INSERT INTO lead_automations (id, agency_id, lead_id, type, channel, status, payload, result, created_at)
     VALUES (@id, @aid, @lid, @type, @channel, @status, @payload, @result, NOW())`,
    { id, aid: agencyId, lid: leadId, type, channel: channel || null, status, payload: payload ? JSON.stringify(payload) : null, result: result ? JSON.stringify(result) : null }
  );
  return id;
}

export async function logActivity(agencyId, leadId, userId, type, description, metadata = null) {
  await run(
    `INSERT INTO activities (id, agency_id, lead_id, user_id, type, description, metadata, created_at)
     VALUES (@id, @agency_id, @lead_id, @user_id, @type, @description, @metadata, NOW())`,
    {
      id: uuidv4(), agency_id: agencyId, lead_id: leadId, user_id: userId,
      type, description, metadata: metadata ? JSON.stringify(metadata) : null,
    }
  );
}

export async function buildEmailBody({ lead, agency, property, template, subject, body }) {
  const name = lead.name || 'cliente';
  const agencyName = agency.name || 'PropIA Inmobiliaria';
  const signature = agency.email_signature || `${agencyName}\n${agency.phone || ''}\n${agency.email || ''}`;
  const propHtml = property ? `
    <div style="background:#0f3460;border-radius:8px;padding:20px;margin:20px 0">
      <h3 style="color:white;margin:0 0 8px">${property.title || 'Propiedad'}</h3>
      <p style="color:#e94560;font-size:18px;font-weight:bold;margin:8px 0">${typeof property.price === 'number' ? property.price.toLocaleString('es-ES') + '€' : property.price}</p>
      <p style="color:#ccc;font-size:14px;margin:4px 0">📍 ${[property.zone, property.city].filter(Boolean).join(', ') || 'Ubicación'}</p>
      <p style="color:#ccc;font-size:14px;margin:4px 0">🛏 ${property.bedrooms || 'N/A'} hab · 🚿 ${property.bathrooms || 'N/A'} baños · 📐 ${property.surface || 'N/A'} m²</p>
      ${property.external_url ? `<p style="margin:8px 0"><a href="${property.external_url}" style="color:#e94560">Ver en Idealista</a></p>` : ''}
    </div>` : '';

  return `<div style="background:#1a1a2e;padding:40px;font-family:Arial,sans-serif">
    <div style="max-width:600px;margin:auto;background:#16213e;border-radius:12px;padding:30px">
      <h2 style="color:#e94560;margin-top:0">${subject}</h2>
      <div style="color:#e0e0e0;font-size:15px;line-height:1.6;white-space:pre-wrap">${body}</div>
      ${propHtml}
      <hr style="border:1px solid #0f3460;margin:25px 0">
      <div style="color:#888;font-size:12px;text-align:center;white-space:pre-wrap">${signature}</div>
    </div>
  </div>`;
}

const EMAIL_TEMPLATES = {
  first_contact: {
    subject: (name, agency) => `Hola ${name}, un placer contactar contigo`,
    body: (name, agency, lead) => `Hola ${name},\n\nGracias por ponerte en contacto con ${agency.name || 'nuestra agencia'}. He revisado tu solicitud y me gustaría saber más sobre tus necesidades para ayudarte a encontrar la propiedad ideal.\n\n¿Podemos agendar una breve llamada?\n\nQuedo atento a tu respuesta,\n${agency.name || 'El equipo'}`,
  },
  follow_up: {
    subject: (name) => `${name}, ¿has tenido oportunidad de revisarlo?`,
    body: (name, agency) => `Hola ${name},\n\nQuería darle seguimiento a nuestra conversación anterior para saber si has tenido oportunidad de considerar las opciones que comentamos.\n\nSi tienes cualquier duda, no dudes en consultarme. Estoy aquí para ayudarte.\n\nSaludos,\n${agency.name || 'El equipo'}`,
  },
  property_send: {
    subject: (name) => `${name}, propiedades seleccionadas para ti`,
    body: (name, agency, lead, property) => `Hola ${name},\n\nHemos encontrado una propiedad que creemos que se ajusta perfectamente a lo que buscas${property ? `:\n\n${property.title} - ${typeof property.price === 'number' ? property.price.toLocaleString('es-ES') + '€' : property.price}` : ''}.\n\n¿Te gustaría recibir más información o agendar una visita?\n\nQuedo a tu disposición,\n${agency.name || 'El equipo'}`,
  },
  appointment_confirmation: {
    subject: (name) => `Confirmación de cita - ${name}`,
    body: (name, agency) => `Hola ${name},\n\nTe confirmamos los detalles de nuestra próxima cita. Estamos deseando conocerte y ayudarte a encontrar la propiedad que buscas.\n\nSi necesitas modificar la fecha u hora, no dudes en avisarnos.\n\nSaludos,\n${agency.name || 'El equipo'}`,
  },
  reminder: {
    subject: (name) => `Recordatorio de cita - ${name}`,
    body: (name, agency) => `Hola ${name},\n\nTe recordamos que tenemos una cita programada próximamente. Por favor, confírmanos tu asistencia o indícanos si necesitas reprogramarla.\n\nGracias,\n${agency.name || 'El equipo'}`,
  },
  reactivation: {
    subject: (name) => `${name}, ¿sigues buscando propiedad?`,
    body: (name, agency) => `Hola ${name},\n\nHa pasado un tiempo desde nuestra última conversación. Queríamos saber si todavía estás buscando una propiedad o si podemos ayudarte en algo más.\n\nTenemos nuevas propiedades que podrían interesarte.\n\nUn saludo,\n${agency.name || 'El equipo'}`,
  },
  hot_lead: {
    subject: (name) => `Urgente: oportunidad para ti, ${name}`,
    body: (name, agency, lead, property) => `Hola ${name},\n\nTenemos una oportunidad que no queremos que te pierdas${property ? `:\n\n${property.title}` : ''}.\n\nDado tu interés, te recomendamos actuar rápido. ¿Podemos agendar una visita?\n\nQuedo a tu disposición,\n${agency.name || 'El equipo'}`,
  },
  no_response: {
    subject: (name) => `Hola ${name}, ¿todo bien?`,
    body: (name, agency) => `Hola ${name},\n\nHemos intentado contactarte sin éxito hasta ahora. Queremos asegurarnos de que todo está bien y que sigues interesado en encontrar una propiedad.\n\nSi prefieres que te contactemos por otro medio, indícanoslo.\n\nSaludos,\n${agency.name || 'El equipo'}`,
  },
};

export async function detectTemplate(lead) {
  const status = lead.status || 'nuevo';
  const lastActivity = lead.last_activity ? new Date(lead.last_activity) : null;
  const daysSinceActivity = lastActivity ? Math.floor((Date.now() - lastActivity.getTime()) / 86400000) : 999;
  const score = lead.ia_score || 0;

  if (score >= 80) return 'hot_lead';
  if (status === 'nuevo') return 'first_contact';
  if (status === 'visita_agendada' || status === 'negociacion') return 'appointment_confirmation';
  if (daysSinceActivity > 30) return 'reactivation';
  if (daysSinceActivity > 14) return 'no_response';
  if (daysSinceActivity > 7) return 'follow_up';
  return 'property_send';
}

export async function generateAiEmailContent({ lead, agency, property, templateType }) {
  const systemPrompt = `Eres un asistente de email marketing inmobiliario. Genera un email profesional y persuasivo en español. 
Devuelve exclusivamente un objeto JSON con los campos: subject (asunto), body (cuerpo del email).
El body debe tener el nombre del lead y un tono personalizado según el contexto.
Máximo 4 párrafos.`;

  const leadInfo = `Nombre: ${lead.name || 'N/A'}
Email: ${lead.email || 'N/A'}
Teléfono: ${lead.phone || 'N/A'}
Estado: ${lead.status || 'N/A'}
Presupuesto: ${lead.budget || 'No especificado'}
Zona buscada: ${lead.zone || 'No especificada'}
Tipo propiedad: ${lead.property_interest || 'No especificado'}
Última actividad: ${lead.last_activity ? new Date(lead.last_activity).toLocaleDateString('es-ES') : 'Sin actividad'}
Score: ${lead.ia_score || 0}`;

  const agencyInfo = `Nombre: ${agency.name || 'N/A'}
Teléfono: ${agency.phone || 'N/A'}
Email: ${agency.email || 'N/A'}
Dirección: ${agency.address || 'N/A'}`;

  const propertyInfo = property ? `Título: ${property.title || 'N/A'}
Precio: ${property.price || 'N/A'}
Zona: ${[property.zone, property.city].filter(Boolean).join(', ') || 'N/A'}
Características: ${property.bedrooms || 0} hab, ${property.bathrooms || 0} baños, ${property.surface || 0} m²
URL: ${property.external_url || 'N/A'}` : 'Sin propiedad asociada';

  const templateName = templateType || detectTemplate(lead);
  const defaultTemplate = EMAIL_TEMPLATES[templateName] || EMAIL_TEMPLATES.first_contact;

  const userMessage = `Genera un email para un lead inmobiliario usando la plantilla "${templateName}".

DATOS DEL LEAD:
${leadInfo}

DATOS DE LA AGENCIA:
${agencyInfo}

${propertyInfo}

Plantilla base: Asunto: "${defaultTemplate.subject(lead.name, agency)}"
Cuerpo base: "${defaultTemplate.body(lead.name, agency, lead, property)}"

Genera un email mejorado con IA manteniendo el propósito de esta plantilla. Responde solo JSON.`;

  try {
    const raw = await callClaude(systemPrompt, userMessage);
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      subject: parsed.subject || defaultTemplate.subject(lead.name, agency),
      body: parsed.body || defaultTemplate.body(lead.name, agency, lead, property),
      template: templateName,
      cta: getCtaForTemplate(templateName),
    };
  } catch {
    return {
      subject: defaultTemplate.subject(lead.name, agency),
      body: defaultTemplate.body(lead.name, agency, lead, property),
      template: templateName,
      cta: getCtaForTemplate(templateName),
    };
  }
}

async function getCtaForTemplate(template) {
  const map = {
    first_contact: 'Responder a este email o agendar una llamada',
    follow_up: 'Responder con disponibilidad para una llamada',
    property_send: 'Solicitar más información o agendar una visita',
    appointment_confirmation: 'Confirmar asistencia o modificar fecha',
    reminder: 'Confirmar asistencia',
    reactivation: 'Responder si sigue interesado',
    hot_lead: 'Agendar visita urgente',
    no_response: 'Indicar medio de contacto preferido',
  };
  return map[template] || 'Responder a este email';
}

export async function sendAutomatedEmail({ lead, agency, property, subject, body, template, userId }) {
  const agencyId = agency.id;
  const leadId = lead.id;
  const toEmail = lead.email;
  if (!toEmail) throw new Error('El lead no tiene email');

  const emailService = new EmailService({
    sendgridKey: agency.sendgrid_api_key,
    fromEmail: agency.sendgrid_from_email,
    agencyName: agency.name,
  });

  const htmlBody = buildEmailBody({ lead, agency, property, subject, body });
  const result = await emailService.sendEmail({ to: toEmail, subject, html: htmlBody });
  const status = result.success ? 'sent' : 'failed';

  logCommunication({
    agencyId, leadId, channel: 'email', direction: 'outbound',
    subject, body, status, providerMessageId: result.messageId, error: result.error,
  });

  logActivity(agencyId, leadId, userId, 'email_sent',
    `Email automático enviado a ${toEmail}. Asunto: "${subject}". Plantilla: ${template || 'personalizada'}. Estado: ${status}`,
    { subject, template, status, messageId: result.messageId }
  );

  await run(`UPDATE leads SET last_activity = NOW(), last_channel = 'email' WHERE id = @id`, { id: leadId });

  logLeadAutomation({
    agencyId, leadId, type: 'auto_email', channel: 'email', status,
    payload: { subject, body, template },
    result: { messageId: result.messageId, status },
  });

  return { success: result.success, messageId: result.messageId, status };
}

export async function getBestPropertyForLead(lead, agencyId) {
  if (!lead) return null;
  try {
    const budget = lead.budget || lead.budget_max || 0;
    const zone = lead.zone || '';
    const type = lead.property_interest || lead.property_type || '';

    let sql = `SELECT * FROM properties WHERE agency_id = @aid AND status = 'disponible'`;
    const params = { aid: agencyId };

    if (budget > 0) {
      sql += ` AND price <= @budget_max`;
      params.budget_max = budget * 1.2;
    }
    if (zone) {
      sql += ` AND (zone LIKE @zone OR city LIKE @zone)`;
      params.zone = `%${zone}%`;
    }
    if (type) {
      const typeMap = { piso: 'apartment', apartamento: 'apartment', casa: 'house', chalet: 'house', local: 'commercial', oficina: 'office' };
      const mappedType = typeMap[type.toLowerCase()] || type;
      sql += ` AND (type LIKE @type OR title LIKE @type)`;
      params.type = `%${mappedType}%`;
    }

    sql += ` ORDER BY price ASC LIMIT 1`;
    const property = await get(sql, params);
    if (property) return property;

    const fallback = await get(
      `SELECT * FROM properties WHERE agency_id = @aid AND status = 'disponible' ORDER BY price ASC LIMIT 1`,
      { aid: agencyId }
    );
    return fallback || null;
  } catch {
    return null;
  }
}

export async function enhanceEmailWithPropertyContext(body, lead, property) {
  if (!property) return body;
  const propBlock = `\n\n---\n🏠 ${property.title || 'Propiedad recomendada'}\n💰 ${typeof property.price === 'number' ? property.price.toLocaleString('es-ES') + '€' : property.price}\n📍 ${[property.zone, property.city].filter(Boolean).join(', ')}\n🛏 ${property.bedrooms || 'N/A'} hab · ${property.surface || 'N/A'} m²\n🔗 ${property.external_url || property.public_url || 'Consultar disponibilidad'}\n---`;
  return body.includes('---') ? body : body + propBlock;
}

export async function createFollowUpTask(agencyId, leadId, userId, days = 3) {
  const dueDate = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
  const taskId = uuidv4();
  await run(
    `INSERT INTO tasks (id, lead_id, assigned_to, title, description, due_date, completed, created_at)
     VALUES (@id, @lid, @uid, @title, @desc, @due, 0, NOW())`,
    {
      id: taskId, lid: leadId, uid: userId || null,
      title: 'Seguimiento de email',
      desc: `Realizar seguimiento del email enviado al lead. Si no ha respondido en ${days} días, contactar por otro canal.`,
      due: dueDate,
    }
  );
  return taskId;
}
