import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { callClaude } from './claude.js';
import { EmailService } from './email.js';
import { WhatsAppService } from './whatsapp.js';
import { logActivity, logCommunication, logLeadAutomation, getBestPropertyForLead } from './lead-automation.service.js';

export function getConsentForLead(leadId, channel) {
  const prefs = get('SELECT * FROM lead_preferences WHERE lead_id = @lid', { lid: leadId });
  if (!prefs) return true;
  if (channel === 'email') return prefs.consent_email === 1;
  if (channel === 'whatsapp') return prefs.consent_whatsapp === 1;
  return true;
}

export function getLeadPreferences(leadId) {
  let prefs = get('SELECT * FROM lead_preferences WHERE lead_id = @lid', { lid: leadId });
  if (!prefs) {
    run(
      `INSERT INTO lead_preferences (lead_id, preferred_channel, consent_email, consent_whatsapp, consent_calls)
       VALUES (@lid, 'whatsapp', 1, 1, 0)`,
      { lid: leadId }
    );
    prefs = get('SELECT * FROM lead_preferences WHERE lead_id = @lid', { lid: leadId });
  }
  return prefs;
}

export async function suggestAppointment({ lead, agency, property, userId }) {
  const workingHours = agency.working_hours ? JSON.parse(agency.working_hours) : { start: '09:00', end: '18:00' };
  const timezone = agency.timezone || 'Europe/Madrid';

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const systemPrompt = `Eres un asistente inmobiliario que agenda citas. Sugiere la mejor fecha, hora y tipo de cita para un lead.
Devuelve solo JSON con: type (online/physical), daysFromNow (1-7), hour (09-18), duration (30/45/60), reason (breve explicación).`;

  const userMessage = `Lead: ${lead.name || 'N/A'}, Score: ${lead.ia_score || 0}, Estado: ${lead.status || 'nuevo'}
${property ? `Propiedad de interés: ${property.title} - ${property.city}` : 'Sin propiedad específica'}
Horario laboral: ${workingHours.start} - ${workingHours.end}
Zona horaria: ${timezone}
Tipo de lead: ${lead.source || 'manual'}
Urgencia: ${lead.urgency || 'normal'}
Preferencia: ${lead.property_interest || 'No especificada'}`;

  if (!property) {
    property = getBestPropertyForLead(lead, agency.id);
  }

  let suggestion = { type: 'online', daysFromNow: 2, hour: '11:00', duration: 30, reason: property ? 'Visita a propiedad compatible' : 'Reunión inicial para conocer sus necesidades.' };

  try {
    const raw = await callClaude(systemPrompt, userMessage);
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    suggestion = { ...suggestion, ...JSON.parse(cleaned) };
  } catch {}

  const startDate = new Date(tomorrow);
  startDate.setDate(startDate.getDate() + (suggestion.daysFromNow - 1));
  const [h, m] = suggestion.hour.split(':').map(Number);
  startDate.setHours(h || 10, m || 0, 0, 0);

  const endDate = new Date(startDate.getTime() + suggestion.duration * 60000);

  const availableUsers = all(
    `SELECT u.id, u.name FROM users u
     WHERE u.agency_id = @aid AND u.role IN ('admin','manager','comercial')
     ORDER BY u.name LIMIT 5`,
    { aid: agency.id }
  );

  const onlineUrl = agency.online_meeting_url || 'https://meet.google.com/';
  const location = agency.address || 'Oficina principal';

  return {
    type: suggestion.type,
    starts_at: startDate.toISOString(),
    ends_at: endDate.toISOString(),
    duration: suggestion.duration,
    timezone,
    online_url: suggestion.type === 'online' ? onlineUrl : null,
    location: suggestion.type === 'physical' ? location : null,
    attendant_name: agency.appointment_attendant_name || (availableUsers[0]?.name) || 'Comercial asignado',
    assigned_user_id: userId,
    reason: suggestion.reason,
    available_users: availableUsers,
  };
}

export async function createAppointment({ lead, agency, type, starts_at, ends_at, timezone, location, online_url, notes, attendant_name, assigned_user_id, userId, origin }) {
  const appointmentId = uuidv4();
  const clientToken = uuidv4();

  const property = getBestPropertyForLead(lead, agency.id);
  const propertyId = property?.id || null;

  run(
    `INSERT INTO appointments (id, agency_id, lead_id, assigned_user_id, type, status, starts_at, ends_at, timezone, location, online_url, notes, client_token, property_id, created_at, updated_at)
     VALUES (@id, @aid, @lid, @auid, @type, 'scheduled', @starts, @ends, @tz, @loc, @ourl, @notes, @token, @pid, NOW(), NOW())`,
    {
      id: appointmentId, aid: agency.id, lid: lead.id, auid: assigned_user_id || userId,
      type, starts: starts_at, ends: ends_at, tz: timezone || agency.timezone || 'Europe/Madrid',
      loc: location, ourl: online_url, notes: notes || '', token: clientToken, pid: propertyId,
    }
  );

  const appointment = get('SELECT * FROM appointments WHERE id = @id', { id: appointmentId });
  appointment.attendant_name = attendant_name;

  logActivity(
    agency.id, lead.id, userId, 'appointment_scheduled',
    `Cita programada automáticamente (${type === 'online' ? 'online' : 'presencial'}) para el ${new Date(starts_at).toLocaleString('es-ES')}. Atenderá: ${attendant_name}`,
    { appointment_id: appointmentId, starts_at, type, attendant_name }
  );

  const modifyUrl = `${origin || 'http://localhost:5173'}/appointment/${clientToken}`;

  if (lead.email) {
    const emailService = new EmailService({
      sendgridKey: agency.sendgrid_api_key, fromEmail: agency.sendgrid_from_email, agencyName: agency.name,
    });
    const emailResult = await emailService.sendAppointmentConfirmation(lead, appointment, agency, modifyUrl);
    logCommunication({
      agencyId: agency.id, leadId: lead.id, appointmentId,
      channel: 'email', direction: 'outbound',
      subject: `Confirmación de cita - ${agency.name}`,
      body: `Cita programada para el ${new Date(starts_at).toLocaleString('es-ES')}`,
      status: emailResult.success || emailResult.mock ? 'sent' : 'failed',
      providerMessageId: emailResult.messageId, error: emailResult.error,
    });
  }

  if (lead.phone) {
    const whatsappService = new WhatsAppService({
      whatsappToken: agency.whatsapp_token, whatsappPhoneId: agency.whatsapp_phone_id, whatsappNumber: agency.whatsapp_number,
    });
    const waResult = await whatsappService.sendAppointmentConfirmation(lead, appointment, agency, modifyUrl);
    logCommunication({
      agencyId: agency.id, leadId: lead.id, appointmentId,
      channel: 'whatsapp', direction: 'outbound',
      subject: null, body: `Confirmación de cita`,
      status: waResult.success || waResult.mock ? 'sent' : 'failed',
      providerMessageId: waResult.messageId, error: waResult.error,
    });
  }

  run(`UPDATE leads SET last_activity = NOW(), last_channel = 'appointment' WHERE id = @id`, { id: lead.id });

  logLeadAutomation({
    agencyId: agency.id, leadId: lead.id, type: 'auto_appointment', channel: type,
    status: 'completed',
    payload: { type, starts_at, ends_at, attendant_name },
    result: { appointment_id: appointmentId, client_token: clientToken },
  });

  return { appointment, client_token: clientToken, modify_url: modifyUrl };
}
