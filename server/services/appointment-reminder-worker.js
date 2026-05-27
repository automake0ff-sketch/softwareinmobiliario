import { all, get, run } from '../db/db.js';
import { EmailService } from './email.js';
import { WhatsAppService } from './whatsapp.js';
import { logActivity, logCommunication } from './lead-automation.service.js';
import { v4 as uuidv4 } from 'uuid';

export async function checkReminders(appUrl = 'http://localhost:5173') {
  try {
    const now = new Date();
    const nowISO = now.toISOString();

    await send48hReminders(now, nowISO, appUrl);
    await send2hReminders(now, nowISO, appUrl);
  } catch (error) {
    console.error('[Reminder Worker Error] Error checking reminders:', error);
  }
}

async function send48hReminders(now, nowISO, appUrl) {
  const targetTime = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const targetISO = targetTime.toISOString();

  const appointments = all(
    `SELECT * FROM appointments 
     WHERE starts_at <= @targetISO 
       AND starts_at > @nowISO
       AND reminder_48h_sent_at IS NULL
       AND status IN ('scheduled', 'confirmed', 'reschedule_requested')`,
    { targetISO, nowISO }
  );

  if (appointments.length === 0) return;
  console.log(`[Reminder Worker] Found ${appointments.length} appointments for 48h reminders.`);

  for (const appt of appointments) {
    const lead = get('SELECT * FROM leads WHERE id = @id', { id: appt.lead_id });
    const agency = get('SELECT * FROM agencies WHERE id = @id', { id: appt.agency_id });

    if (!lead || !agency) {
      run("UPDATE appointments SET reminder_48h_sent_at = 'skipped_missing_context' WHERE id = @id", { id: appt.id });
      continue;
    }

    const emailService = new EmailService({
      sendgridKey: agency.sendgrid_api_key, fromEmail: agency.sendgrid_from_email, agencyName: agency.name
    });
    const whatsappService = new WhatsAppService({
      whatsappToken: agency.whatsapp_token, whatsappPhoneId: agency.whatsapp_phone_id, whatsappNumber: agency.whatsapp_number
    });

    const modifyUrl = `${appUrl}/appointment/${appt.client_token}`;

    if (lead.email) {
      try {
        const emailResult = await emailService.sendAppointmentReminder(lead, appt, agency, modifyUrl);
        run(`INSERT INTO appointment_messages (id, appointment_id, channel, type, status, sent_at) VALUES (@id, @appt_id, 'email', 'reminder', @status, datetime('now'))`,
          { id: uuidv4(), appt_id: appt.id, status: emailResult.success || emailResult.mock ? 'sent' : 'failed' });
        logCommunication({
          agencyId: agency.id, leadId: lead.id, appointmentId: appt.id,
          channel: 'email', direction: 'outbound',
          subject: `Recordatorio: tu cita es en 48h - ${agency.name}`,
          body: `Recordatorio 48h para cita del ${formattedDate || new Date(appt.starts_at).toLocaleString('es-ES')}`,
          status: emailResult.success || emailResult.mock ? 'sent' : 'failed',
          providerMessageId: emailResult.messageId, error: emailResult.error,
        });
      } catch (e) { console.error(`[Reminder Worker] Email error for appt ${appt.id}:`, e); }
    }

    if (lead.phone) {
      try {
        const waResult = await whatsappService.sendAppointmentReminder(lead, appt, agency, modifyUrl);
        run(`INSERT INTO appointment_messages (id, appointment_id, channel, type, status, sent_at) VALUES (@id, @appt_id, 'whatsapp', 'reminder', @status, datetime('now'))`,
          { id: uuidv4(), appt_id: appt.id, status: waResult.success || waResult.mock ? 'sent' : 'failed' });
        logCommunication({
          agencyId: agency.id, leadId: lead.id, appointmentId: appt.id,
          channel: 'whatsapp', direction: 'outbound',
          subject: null, body: `Recordatorio 48h: cita ${new Date(appt.starts_at).toLocaleString('es-ES')}`,
          status: waResult.success || waResult.mock ? 'sent' : 'failed',
          providerMessageId: waResult.messageId, error: waResult.error,
        });
      } catch (e) { console.error(`[Reminder Worker] WhatsApp error for appt ${appt.id}:`, e); }
    }

    logActivity(agency.id, lead.id, null, 'automation_triggered',
      `Recordatorio automático de cita (48h) enviado a ${lead.name}`, { appointment_id: appt.id, reminder_type: '48h' });

    run(`UPDATE appointments SET reminder_48h_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = @id`, { id: appt.id });
    console.log(`[Reminder Worker] 48h reminder sent for appointment ${appt.id} to lead ${lead.name}`);
  }
}

async function send2hReminders(now, nowISO, appUrl) {
  const targetTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const targetISO = targetTime.toISOString();

  const appointments = all(
    `SELECT a.*, ag.reminder_2h_enabled FROM appointments a
     JOIN agencies ag ON ag.id = a.agency_id
     WHERE a.starts_at <= @targetISO
       AND a.starts_at > @nowISO
       AND a.reminder_2h_sent_at IS NULL
       AND a.reminder_48h_sent_at IS NOT NULL
       AND a.status IN ('scheduled', 'confirmed')
       AND (ag.reminder_2h_enabled = 1 OR ag.reminder_2h_enabled IS NULL)`,
    { targetISO, nowISO }
  );

  if (appointments.length === 0) return;
  console.log(`[Reminder Worker] Found ${appointments.length} appointments for 2h reminders.`);

  for (const appt of appointments) {
    const lead = get('SELECT * FROM leads WHERE id = @id', { id: appt.lead_id });
    const agency = get('SELECT * FROM agencies WHERE id = @id', { id: appt.agency_id });

    if (!lead || !agency) {
      run("UPDATE appointments SET reminder_2h_sent_at = 'skipped' WHERE id = @id", { id: appt.id });
      continue;
    }

    const attendant = appt.attendant_name || agency.appointment_attendant_name || 'Comercial asignado';
    const locationStr = appt.type === 'online'
      ? `Enlace: ${appt.online_url || agency.online_meeting_url || 'Meet/Zoom'}`
      : `Dirección: ${appt.location || agency.address || 'Oficina principal'}`;
    const formattedDate = new Date(appt.starts_at).toLocaleString('es-ES', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    if (lead.phone) {
      try {
        const whatsappService = new WhatsAppService({
          whatsappToken: agency.whatsapp_token, whatsappPhoneId: agency.whatsapp_phone_id, whatsappNumber: agency.whatsapp_number
        });
        const text = `⏰ Hola ${lead.name}, te recordamos que tu cita es en 2 horas:\n\n📅 ${formattedDate}\n📍 ${locationStr}\n👤 Te atenderá: ${attendant}\n\n¡Te esperamos!`;
        const waResult = await whatsappService.sendWhatsAppMessage(lead.phone, text, agency);
        logCommunication({
          agencyId: agency.id, leadId: lead.id, appointmentId: appt.id,
          channel: 'whatsapp', direction: 'outbound',
          subject: null, body: `Recordatorio 2h: cita ${formattedDate}`,
          status: waResult.success || waResult.mock ? 'sent' : 'failed',
          providerMessageId: waResult.messageId, error: waResult.error,
        });
      } catch (e) { console.error(`[Reminder Worker] 2h WhatsApp error for appt ${appt.id}:`, e); }
    }

    if (lead.email) {
      try {
        const emailService = new EmailService({
          sendgridKey: agency.sendgrid_api_key, fromEmail: agency.sendgrid_from_email, agencyName: agency.name
        });
        const html = `<div style="background:#1a1a2e;padding:20px;font-family:Arial,sans-serif">
          <div style="max-width:500px;margin:auto;background:#16213e;border-radius:8px;padding:20px">
            <h2 style="color:#e94560;margin:0 0 8px">⏰ Recordatorio - 2 horas</h2>
            <p style="color:#e0e0e0">Hola ${lead.name},</p>
            <p style="color:#e0e0e0">Tu cita es en aproximadamente 2 horas:</p>
            <p style="color:white"><strong>📅 ${formattedDate}</strong></p>
            <p style="color:#ccc">📍 ${locationStr}</p>
            <p style="color:#ccc">👤 ${attendant}</p>
            <hr style="border:1px solid #0f3460;margin:15px 0">
            <p style="color:#888;font-size:12px">${agency.name || 'PropIA Inmobiliaria'}</p>
          </div>
        </div>`;
        const emailResult = await emailService.sendEmail({ to: lead.email, subject: `⏰ Recordatorio: tu cita es en 2 horas`, html });
        logCommunication({
          agencyId: agency.id, leadId: lead.id, appointmentId: appt.id,
          channel: 'email', direction: 'outbound',
          subject: `Recordatorio: tu cita es en 2 horas`,
          body: `Recordatorio 2h para cita en ${formattedDate}`,
          status: emailResult.success || emailResult.mock ? 'sent' : 'failed',
          providerMessageId: emailResult.messageId, error: emailResult.error,
        });
      } catch (e) { console.error(`[Reminder Worker] 2h Email error for appt ${appt.id}:`, e); }
    }

    logActivity(agency.id, lead.id, null, 'automation_triggered',
      `Recordatorio automático de cita (2h) enviado a ${lead.name}`, { appointment_id: appt.id, reminder_type: '2h' });

    run(`UPDATE appointments SET reminder_2h_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = @id`, { id: appt.id });
    console.log(`[Reminder Worker] 2h reminder sent for appointment ${appt.id} to lead ${lead.name}`);
  }
}

let workerIntervalId = null;

export function startReminderWorker(intervalMs = 60 * 60 * 1000, appUrl = 'http://localhost:5173') {
  if (workerIntervalId) {
    clearInterval(workerIntervalId);
  }
  // Run once immediately
  checkReminders(appUrl);
  // Then periodically
  workerIntervalId = setInterval(() => checkReminders(appUrl), intervalMs);
  console.log(`[Reminder Worker] Started periodic reminder checks every ${intervalMs / 1000}s`);
}

export function stopReminderWorker() {
  if (workerIntervalId) {
    clearInterval(workerIntervalId);
    workerIntervalId = null;
    console.log('[Reminder Worker] Stopped periodic reminder worker');
  }
}
