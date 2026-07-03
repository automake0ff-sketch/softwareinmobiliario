import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { callClaude } from './claude.js';
import { logActivity, logLeadAutomation, sendAutomatedEmail } from './lead-automation.service.js';
import { suggestAppointment, createAppointment } from './appointment-automation.service.js';
import { qualifyLead } from './ai-qualifier.service.js';

const AGENT_SYSTEM_PROMPT = `Eres un Vendedor IA Inmobiliario. Tu objetivo es decidir la mejor acción comercial para cada lead.
Basado en su estado, score, historial y propiedades disponibles, determina qué hacer.

Devuelve JSON con:
- action: "send_property" | "ask_availability" | "propose_appointment" | "resolve_objection" | "reactivate" | "follow_up" | "send_to_qualifier"
- channel_recommended: "whatsapp" | "email" | "call"
- message: string con el mensaje a enviar (adaptado al canal)
- property_id: id de propiedad recomendada o null
- reason: breve explicación de la decisión
- next_action: sugerencia de siguiente paso
- follow_up_days: número de días para seguimiento`;

const SUGGESTED_ACTIONS = {
  send_property: { label: 'Enviar propiedad', icon: 'Home' },
  ask_availability: { label: 'Pedir disponibilidad', icon: 'Calendar' },
  propose_appointment: { label: 'Proponer cita', icon: 'Calendar' },
  resolve_objection: { label: 'Resolver objeción', icon: 'MessageCircle' },
  reactivate: { label: 'Reactivar conversación', icon: 'RefreshCw' },
  follow_up: { label: 'Hacer seguimiento', icon: 'TrendingUp' },
  send_to_qualifier: { label: 'Cualificar primero', icon: 'ShieldAlert' },
};

export async function suggestSalesAction(lead, agency, userId) {
  const availableProperties = await all(
    `SELECT p.* FROM properties p
     WHERE p.agency_id = @aid AND p.status = 'disponible'
     ORDER BY p.created_at DESC LIMIT 5`,
    { aid: agency.id }
  );

  const recentActivities = await all(
    `SELECT type, description, created_at FROM activities
     WHERE lead_id = @lid AND agency_id = @aid
     ORDER BY created_at DESC LIMIT 10`,
    { lid: lead.id, aid: agency.id }
  );

  const leadInfo = `Nombre: ${lead.name || 'N/A'}
Estado: ${lead.status || 'N/A'}
Score: ${lead.ia_score || 0}
Presupuesto: ${lead.budget || 'No especificado'}
Zona: ${lead.zone || 'No especificada'}
Tipo propiedad: ${lead.property_interest || 'No especificado'}
Última actividad: ${lead.last_activity || 'Sin actividad'}
Canal preferido: ${lead.last_channel || 'No definido'}
Insights: ${lead.ia_summary || 'Ninguno'}`;

  const propertiesInfo = availableProperties.length > 0
    ? availableProperties.map((p, i) =>
        `${i + 1}. ${p.title} - ${p.price}€ - ${p.city} ${p.zone || ''} - ${p.bedrooms || 0}hab ${p.surface || 0}m2 - ID: ${p.id}`
      ).join('\n')
    : 'No hay propiedades disponibles en este momento.';

  const activityHistory = recentActivities.map(a =>
    `[${a.created_at}] ${a.type}: ${a.description}`
  ).join('\n') || 'Sin actividad reciente.';

  const systemPrompt = AGENT_SYSTEM_PROMPT;
  const userMessage = `Analiza este lead y decide la mejor acción comercial:

PERFIL DEL LEAD:
${leadInfo}

PROPIEDADES DISPONIBLES:
${propertiesInfo}

HISTORIAL DE ACTIVIDAD:
${activityHistory}

Responde solo JSON válido sin markdown. Si hay propiedades disponibles y el lead está interesado, sugiere send_property con el ID de la más adecuada.`;

  let result = {
    action: 'follow_up',
    channel_recommended: lead.last_channel === 'whatsapp' ? 'whatsapp' : 'email',
    message: getDefaultMessage(lead, agency),
    property_id: availableProperties[0]?.id || null,
    reason: 'Seguimiento estándar del lead',
    next_action: 'Esperar respuesta y evaluar',
    follow_up_days: 3,
  };

  try {
    const raw = await callClaude(systemPrompt, userMessage);
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    result = { ...result, ...parsed };
  } catch {}

  const matchedProperty = result.property_id
    ? availableProperties.find(p => p.id === result.property_id)
    : null;

  return {
    ...result,
    matched_property: matchedProperty,
    available_properties: availableProperties,
    action_info: SUGGESTED_ACTIONS[result.action] || SUGGESTED_ACTIONS.follow_up,
  };
}

function getDefaultMessage(lead, agency) {
  const name = lead.name || 'cliente';
  return `Hola ${name}, soy el asistente virtual de ${agency.name || 'nuestra agencia'}. Queríamos saber cómo va tu búsqueda de propiedad y si podemos ayudarte en algo. ¿Qué tal va todo?`;
}

export async function executeSalesAction({ lead, agency, action, channel, message, propertyId, userId, origin }) {
  const result = { action, channel, sent: false, appointment_created: false, qualified: false };

  if (action === 'send_to_qualifier') {
    const qualifierResult = await qualifyLead(lead, agency.id, userId);
    result.qualified = true;
    result.qualifier_result = qualifierResult;
  }

  if (action === 'propose_appointment') {
    const property = propertyId ? await get('SELECT * FROM properties WHERE id = @id AND agency_id = @aid', { id: propertyId, aid: agency.id }) : null;
    const suggestion = await suggestAppointment({ lead, agency, property, userId });
    result.appointment_suggestion = suggestion;
  }

  if (channel === 'email' && lead.email) {
    try {
      const property = propertyId ? await get('SELECT * FROM properties WHERE id = @id AND agency_id = @aid', { id: propertyId, aid: agency.id }) : null;
      const sendResult = await sendAutomatedEmail({
        lead, agency, property,
        subject: action === 'reactivate' ? `Hola ${lead.name}, ¿sigues buscando?` :
                 action === 'send_property' ? `Propiedad recomendada para ti, ${lead.name}` :
                 `${lead.name}, queremos ayudarte a encontrar tu hogar`,
        body: message,
        template: action,
        userId,
      });
      result.sent = sendResult.success;
    } catch (e) {
      result.error = e.message;
    }
  }

  if (channel === 'whatsapp' && lead.phone) {
    const { WhatsAppService } = await import('./whatsapp.js');
    const waService = new WhatsAppService({
      whatsappToken: agency.whatsapp_token,
      whatsappPhoneId: agency.whatsapp_phone_id,
      whatsappNumber: agency.whatsapp_number,
    });
    const waResult = await waService.sendWhatsAppMessage(lead.phone, message, agency);
    result.sent = waResult.success || waResult.mock;
  }

  const updatedLead = await get('SELECT * FROM leads WHERE id = @id', { id: lead.id });
  logActivity(agency.id, lead.id, userId, 'ia_action',
    `Vendedor IA: Acción "${action}" por canal "${channel}". ${result.sent ? 'Mensaje enviado.' : ''}`,
    result
  );

  logLeadAutomation({
    agencyId: agency.id, leadId: lead.id, type: 'sales_agent', status: result.sent ? 'completed' : 'failed',
    payload: { action, channel, message },
    result,
  });

  await run(`UPDATE leads SET last_activity = NOW(), last_channel = @channel WHERE id = @id`,
    { id: lead.id, channel }
  );

  return result;
}
