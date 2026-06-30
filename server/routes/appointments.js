import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { auth } from '../middleware/auth.js';
import { EmailService } from '../services/email.js';
import { WhatsAppService } from '../services/whatsapp.js';

const router = Router();

// Helper to log activities
function logActivity(agencyId, leadId, userId, type, description, metadata = null) {
  run(
    `INSERT INTO activities (id, agency_id, lead_id, user_id, type, description, metadata, created_at)
     VALUES (@id, @agency_id, @lead_id, @user_id, @type, @description, @metadata, NOW())`,
    {
      id: uuidv4(),
      agency_id: agencyId,
      lead_id: leadId,
      user_id: userId,
      type,
      description,
      metadata: metadata ? JSON.stringify(metadata) : null,
    }
  );
}

// ────────────────────────────────────────────────────────────────────────
// 🌍 PUBLIC CLIENT PORTAL ENDPOINTS (SECURED BY UNIQUE TOKEN)
// ────────────────────────────────────────────────────────────────────────

// GET /api/public/appointment/:token - Fetch details for the public portal
router.get('/public/appointment/:token', (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: 'Token es requerido.' });

    const appointment = get('SELECT * FROM appointments WHERE client_token = @token', { token });
    if (!appointment) return res.status(404).json({ error: 'Cita no encontrada o token inválido.' });

    const lead = get('SELECT id, name, email, phone FROM leads WHERE id = @lead_id AND agency_id = @agency_id', {
      lead_id: appointment.lead_id,
      agency_id: appointment.agency_id
    });
    if (!lead) return res.status(404).json({ error: 'Lead asociado no encontrado.' });

    const agency = get('SELECT id, name, logo_url, email, phone, address, online_meeting_url FROM agencies WHERE id = @agency_id', {
      agency_id: appointment.agency_id
    });

    res.json({
      appointment,
      lead,
      agency
    });
  } catch (error) {
    console.error('Error fetching public appointment:', error);
    res.status(500).json({ error: 'Error al obtener los detalles de la cita.' });
  }
});

// POST /api/public/appointment/:token/confirm - Client confirms attendance
router.post('/public/appointment/:token/confirm', (req, res) => {
  try {
    const { token } = req.params;
    const appointment = get('SELECT * FROM appointments WHERE client_token = @token', { token });
    if (!appointment) return res.status(404).json({ error: 'Cita no encontrada.' });

    if (appointment.status === 'cancelled') {
      return res.status(400).json({ error: 'No se puede confirmar una cita cancelada.' });
    }

    run(
      "UPDATE appointments SET status = 'confirmed', updated_at = NOW() WHERE id = @id",
      { id: appointment.id }
    );

    logActivity(
      appointment.agency_id,
      appointment.lead_id,
      null,
      'appointment_confirmed',
      'El cliente ha confirmado su asistencia a la cita.',
      { appointment_id: appointment.id }
    );

    res.json({ success: true, status: 'confirmed' });
  } catch (error) {
    console.error('Error confirming appointment:', error);
    res.status(500).json({ error: 'Error al confirmar la cita.' });
  }
});

// POST /api/public/appointment/:token/cancel - Client cancels appointment
router.post('/public/appointment/:token/cancel', async (req, res) => {
  try {
    const { token } = req.params;
    const appointment = get('SELECT * FROM appointments WHERE client_token = @token', { token });
    if (!appointment) return res.status(404).json({ error: 'Cita no encontrada.' });

    run(
      "UPDATE appointments SET status = 'cancelled', updated_at = NOW() WHERE id = @id",
      { id: appointment.id }
    );

    logActivity(
      appointment.agency_id,
      appointment.lead_id,
      null,
      'appointment_cancelled',
      'El cliente ha cancelado la cita.',
      { appointment_id: appointment.id }
    );

    // Send notifications to client and agency
    const lead = get('SELECT * FROM leads WHERE id = @lead_id', { lead_id: appointment.lead_id });
    const agency = get('SELECT * FROM agencies WHERE id = @agency_id', { agency_id: appointment.agency_id });

    const emailService = new EmailService({
      sendgridKey: agency.sendgrid_api_key,
      fromEmail: agency.sendgrid_from_email,
      agencyName: agency.name
    });
    const whatsappService = new WhatsAppService({
      whatsappToken: agency.whatsapp_token,
      whatsappPhoneId: agency.whatsapp_phone_id,
      whatsappNumber: agency.whatsapp_number
    });

    if (lead.email) {
      await emailService.sendAppointmentCancellation(lead, appointment, agency).catch(console.error);
    }
    if (lead.phone) {
      await whatsappService.sendAppointmentCancellation(lead, appointment, agency).catch(console.error);
    }

    res.json({ success: true, status: 'cancelled' });
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    res.status(500).json({ error: 'Error al cancelar la cita.' });
  }
});

// POST /api/public/appointment/:token/reschedule - Client requests reschedule
router.post('/public/appointment/:token/reschedule', async (req, res) => {
  try {
    const { token } = req.params;
    const { starts_at, ends_at, notes } = req.body;

    if (!starts_at || !ends_at) {
      return res.status(400).json({ error: 'starts_at y ends_at son obligatorios.' });
    }

    if (new Date(starts_at) <= new Date()) {
      return res.status(400).json({ error: 'La fecha de la cita debe ser futura.' });
    }

    const appointment = get('SELECT * FROM appointments WHERE client_token = @token', { token });
    if (!appointment) return res.status(404).json({ error: 'Cita no encontrada.' });

    const updatedNotes = notes 
      ? `${appointment.notes || ''}\n[Cliente solicitó cambio]: ${notes}`.trim()
      : appointment.notes;

    run(
      `UPDATE appointments 
       SET starts_at = @starts_at, ends_at = @ends_at, notes = @notes, status = 'reschedule_requested', updated_at = NOW()
       WHERE id = @id`,
      {
        id: appointment.id,
        starts_at,
        ends_at,
        notes: updatedNotes
      }
    );

    const updatedAppt = get('SELECT * FROM appointments WHERE id = @id', { id: appointment.id });

    logActivity(
      appointment.agency_id,
      appointment.lead_id,
      null,
      'appointment_rescheduled',
      `El cliente solicitó reprogramar la cita para el ${new Date(starts_at).toLocaleString('es-ES')}.`,
      { appointment_id: appointment.id, starts_at }
    );

    // Send updated notifications
    const lead = get('SELECT * FROM leads WHERE id = @lead_id', { lead_id: appointment.lead_id });
    const agency = get('SELECT * FROM agencies WHERE id = @agency_id', { agency_id: appointment.agency_id });

    const emailService = new EmailService({
      sendgridKey: agency.sendgrid_api_key,
      fromEmail: agency.sendgrid_from_email,
      agencyName: agency.name
    });
    const whatsappService = new WhatsAppService({
      whatsappToken: agency.whatsapp_token,
      whatsappPhoneId: agency.whatsapp_phone_id,
      whatsappNumber: agency.whatsapp_number
    });

    const origin = req.headers.origin || 'http://localhost:5173';
    const modifyUrl = `${origin}/appointment/${token}`;

    if (lead.email) {
      await emailService.sendAppointmentUpdate(lead, updatedAppt, agency, modifyUrl).catch(console.error);
    }
    if (lead.phone) {
      await whatsappService.sendAppointmentUpdate(lead, updatedAppt, agency, modifyUrl).catch(console.error);
    }

    res.json({ success: true, status: 'reschedule_requested', appointment: updatedAppt });
  } catch (error) {
    console.error('Error requesting reschedule:', error);
    res.status(500).json({ error: 'Error al solicitar reprogramación de la cita.' });
  }
});

// ────────────────────────────────────────────────────────────────────────
// 🔒 PRIVATE CRM COMMERCIAL ENDPOINTS (AUTH REQUIRED)
// ────────────────────────────────────────────────────────────────────────

// PATCH /api/appointments/:id - CRM user updates appointment details (attendant, dates, notes)
router.patch('/appointments/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const agencyId = req.user.agency_id;

    const appointment = get('SELECT * FROM appointments WHERE id = @id AND agency_id = @agency_id', { id, agency_id: agencyId });
    if (!appointment) return res.status(404).json({ error: 'Cita no encontrada.' });

    const allowed = ['starts_at', 'ends_at', 'type', 'status', 'location', 'online_url', 'notes', 'assigned_user_id'];
    const updates = [];
    const params = { id };

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = @${field}`);
        params[field] = req.body[field];
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar.' });

    updates.push("updated_at = NOW()");
    run(`UPDATE appointments SET ${updates.join(', ')} WHERE id = @id`, params);

    const updatedAppt = get('SELECT * FROM appointments WHERE id = @id', { id });

    // Log Activity
    logActivity(
      agencyId,
      appointment.lead_id,
      req.user.id,
      'appointment_updated',
      'Cita actualizada por el equipo comercial.',
      { appointment_id: id }
    );

    // If date/time changed significantly, resend update notification
    const dateChanged = req.body.starts_at && req.body.starts_at !== appointment.starts_at;
    if (dateChanged) {
      const lead = get('SELECT * FROM leads WHERE id = @lead_id', { lead_id: appointment.lead_id });
      const agency = get('SELECT * FROM agencies WHERE id = @agency_id', { agency_id: agencyId });

      const emailService = new EmailService({
        sendgridKey: agency.sendgrid_api_key,
        fromEmail: agency.sendgrid_from_email,
        agencyName: agency.name
      });
      const whatsappService = new WhatsAppService({
        whatsappToken: agency.whatsapp_token,
        whatsappPhoneId: agency.whatsapp_phone_id,
        whatsappNumber: agency.whatsapp_number
      });

      const origin = req.headers.origin || 'http://localhost:5173';
      const modifyUrl = `${origin}/appointment/${appointment.client_token}`;

      if (lead.email) {
        await emailService.sendAppointmentUpdate(lead, updatedAppt, agency, modifyUrl).catch(console.error);
      }
      if (lead.phone) {
        await whatsappService.sendAppointmentUpdate(lead, updatedAppt, agency, modifyUrl).catch(console.error);
      }
    }

    res.json(updatedAppt);
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ error: 'Error al actualizar la cita.' });
  }
});

// POST /api/appointments/:id/cancel - CRM user cancels appointment manually
router.post('/appointments/:id/cancel', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const agencyId = req.user.agency_id;

    const appointment = get('SELECT * FROM appointments WHERE id = @id AND agency_id = @agency_id', { id, agency_id: agencyId });
    if (!appointment) return res.status(404).json({ error: 'Cita no encontrada.' });

    run("UPDATE appointments SET status = 'cancelled', updated_at = NOW() WHERE id = @id", { id });

    logActivity(
      agencyId,
      appointment.lead_id,
      req.user.id,
      'appointment_cancelled',
      'Cita cancelada manualmente por el equipo comercial.',
      { appointment_id: id }
    );

    // Send cancellation notifications
    const lead = get('SELECT * FROM leads WHERE id = @lead_id', { lead_id: appointment.lead_id });
    const agency = get('SELECT * FROM agencies WHERE id = @agency_id', { agency_id: agencyId });

    const emailService = new EmailService({
      sendgridKey: agency.sendgrid_api_key,
      fromEmail: agency.sendgrid_from_email,
      agencyName: agency.name
    });
    const whatsappService = new WhatsAppService({
      whatsappToken: agency.whatsapp_token,
      whatsappPhoneId: agency.whatsapp_phone_id,
      whatsappNumber: agency.whatsapp_number
    });

    if (lead.email) {
      await emailService.sendAppointmentCancellation(lead, appointment, agency).catch(console.error);
    }
    if (lead.phone) {
      await whatsappService.sendAppointmentCancellation(lead, appointment, agency).catch(console.error);
    }

    res.json({ success: true, status: 'cancelled' });
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    res.status(500).json({ error: 'Error al cancelar la cita.' });
  }
});

export default router;
