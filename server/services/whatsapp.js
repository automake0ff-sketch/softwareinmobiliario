import { run } from '../db/db.js';
import { v4 as uuidv4 } from 'uuid';

export class WhatsAppService {
  constructor(config = {}) {
    this.config = config;
    this.sentMessages = [];
  }

  async sendWhatsAppMessage(to, text, agency) {
    const fromNumber = agency?.whatsapp_number || this.config.whatsappNumber || 'PropIA';
    const waToken = agency?.whatsapp_token || this.config.whatsappToken;
    const waPhoneId = agency?.whatsapp_phone_id || this.config.whatsappPhoneId;

    if (!waToken || !waPhoneId) {
      const log = {
        to,
        text,
        fromNumber,
        sentAt: new Date().toISOString(),
        mock: true,
      };
      this.sentMessages.push(log);
      console.log(`[WHATSAPP MOCK] To: ${to}, From: ${fromNumber}, Message: ${text}`);
      return { mock: true, messageId: `mock_wa_${Date.now()}`, ...log };
    }

    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${waPhoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${waToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || `WhatsApp Cloud API error: ${response.status}`);
      }

      return {
        success: true,
        messageId: data.messages?.[0]?.id || `wa_${Date.now()}`,
        to,
      };
    } catch (error) {
      console.error('[WhatsApp Service Error] Falling back to mock:', error.message);
      const fallback = {
        mock: true,
        messageId: `mock_wa_${Date.now()}`,
        to,
        text,
        error: error.message,
      };
      this.sentMessages.push(fallback);
      return fallback;
    }
  }

  async sendAppointmentConfirmation(lead, appointment, agency, modifyUrl) {
    const formattedDate = new Date(appointment.starts_at).toLocaleString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const typeStr = appointment.type === 'online' ? 'Videollamada' : 'Visita presencial';
    const locationStr = appointment.type === 'online' 
      ? `Enlace de reunión: ${appointment.online_url || 'Meet/Zoom'}`
      : `Lugar de encuentro: ${appointment.location || 'Oficina principal'}`;

    const attendant = appointment.attendant_name || agency.appointment_attendant_name || 'Comercial asignado';

    const text = `¡Hola ${lead.name}! 🌟\n\nTu cita ha sido programada con éxito.\n\n📅 Fecha: ${formattedDate}\n📌 Tipo: ${typeStr}\n📍 ${locationStr}\n👤 Te atenderá: ${attendant}\n\nSi necesitas realizar algún cambio o confirmar tu asistencia, puedes hacerlo de forma segura desde el siguiente enlace:\n🔗 ${modifyUrl}\n\n¡Gracias por confiar en ${agency.name || 'nuestra inmobiliaria'}!`;

    return this.sendWhatsAppMessage(lead.phone, text, agency);
  }

  async sendAppointmentReminder(lead, appointment, agency, modifyUrl) {
    const formattedDate = new Date(appointment.starts_at).toLocaleString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const typeStr = appointment.type === 'online' ? 'Videollamada' : 'Visita presencial';
    const locationStr = appointment.type === 'online'
      ? `Enlace de reunión: ${appointment.online_url || 'Meet/Zoom'}`
      : `Lugar de encuentro: ${appointment.location || 'Oficina principal'}`;

    const attendant = appointment.attendant_name || agency.appointment_attendant_name || 'Comercial asignado';

    const text = `Hola ${lead.name}, ⏰ recordatorio de tu cita en 48 horas.\n\n📅 Fecha: ${formattedDate}\n📌 Tipo: ${typeStr}\n📍 ${locationStr}\n👤 Te atenderá: ${attendant}\n\n*Nota:* Por favor, ten lista la documentación requerida si aplica.\n\n¿Deseas modificar, confirmar o cancelar tu cita?\n🔗 Accede aquí: ${modifyUrl}`;

    return this.sendWhatsAppMessage(lead.phone, text, agency);
  }

  async sendAppointmentUpdate(lead, appointment, agency, modifyUrl) {
    const formattedDate = new Date(appointment.starts_at).toLocaleString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const typeStr = appointment.type === 'online' ? 'Videollamada' : 'Visita presencial';
    const locationStr = appointment.type === 'online'
      ? `Enlace de reunión: ${appointment.online_url || 'Meet/Zoom'}`
      : `Lugar de encuentro: ${appointment.location || 'Oficina principal'}`;

    const text = `Hola ${lead.name}, te informamos que tu cita ha sido reprogramada 📅\n\nNuevos detalles:\n📅 Fecha: ${formattedDate}\n📌 Tipo: ${typeStr}\n📍 ${locationStr}\n👤 Te atenderá: ${appointment.attendant_name || agency.appointment_attendant_name || 'Comercial asignado'}\n\nSi necesitas modificarla de nuevo:\n🔗 Enlace: ${modifyUrl}`;

    return this.sendWhatsAppMessage(lead.phone, text, agency);
  }

  async sendAppointmentCancellation(lead, appointment, agency) {
    const text = `Hola ${lead.name}, te confirmamos que tu cita ha sido cancelada correctamente.\n\nSi ha sido un error o deseas programar una nueva cita más adelante, no dudes en ponerte en contacto con nosotros.\n\nSaludos,\n${agency.name || 'PropIA Inmobiliaria'}`;

    return this.sendWhatsAppMessage(lead.phone, text, agency);
  }
}

export default WhatsAppService;
