export class EmailService {
  constructor(config = {}) {
    this.config = config;
    this.sentEmails = [];
  }

  async sendEmail(options) {
    const { to, subject, html, from, attachments } = options;
    const fromAddr = from || this.config.fromEmail || 'noreply@inmotech.es';
    const agencyName = this.config.agencyName || 'CRM Inmobiliario';

    if (!this.config.sendgridKey && !this.config.smtpHost) {
      const log = {
        to, subject, from: fromAddr,
        htmlLength: html ? html.length : 0,
        attachments: attachments ? attachments.length : 0,
        sentAt: new Date().toISOString(),
        mock: true,
      };
      this.sentEmails.push(log);
      console.log(`[EMAIL MOCK] To: ${to}, Subject: ${subject}`);
      return { mock: true, messageId: `mock_email_${Date.now()}`, ...log };
    }

    try {
      let messageId;
      if (this.config.sendgridKey) {
        const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.sendgridKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: fromAddr, name: agencyName },
            subject,
            content: [{ type: 'text/html', value: html }],
            attachments: attachments ? attachments.map((a) => ({
              content: a.content?.toString('base64') || a.content,
              filename: a.filename,
              type: a.type || 'application/octet-stream',
            })) : undefined,
          }),
        });
        if (!resp.ok) throw new Error(`SendGrid error: ${resp.status}`);
        messageId = `sg_${Date.now()}`;
      } else if (this.config.smtpHost) {
        messageId = `smtp_${Date.now()}`;
      }
      return { success: true, messageId, to, subject };
    } catch (e) {
      const fallback = {
        mock: true,
        messageId: `mock_email_${Date.now()}`,
        to,
        subject,
        error: e.message,
      };
      this.sentEmails.push(fallback);
      return fallback;
    }
  }

  async sendWelcome(lead) {
    const html = this.generateEmailTemplate('welcome', { lead });
    return this.sendEmail({
      to: lead.email,
      subject: `¡Bienvenido a ${this.config.agencyName || 'InmoTech Realty'}!`,
      html,
    });
  }

  async sendPropertyMatch(lead, property) {
    const html = this.generateEmailTemplate('property_match', { lead, property });
    return this.sendEmail({
      to: lead.email,
      subject: `Propiedad recomendada para ti: ${property.title}`,
      html,
    });
  }

  async sendVisitConfirmation(lead, visit) {
    const html = this.generateEmailTemplate('visit_confirmation', { lead, visit });
    return this.sendEmail({
      to: lead.email,
      subject: `Confirmación de visita - ${visit.propertyTitle || 'Propiedad'}`,
      html,
    });
  }

  async sendWeeklyReport(manager, data) {
    const html = this.generateEmailTemplate('report', { data, isWeekly: true });
    return this.sendEmail({
      to: manager.email,
      subject: `Informe semanal - ${this.config.agencyName || 'InmoTech Realty'}`,
      html,
    });
  }

  async sendDailyBriefing(user, briefing) {
    const html = this.generateEmailTemplate('briefing', { briefing, user });
    return this.sendEmail({
      to: user.email,
      subject: `Briefing diario - ${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
      html,
    });
  }

  async sendAppointmentConfirmation(lead, appointment, agency, modifyUrl) {
    const html = this.generateEmailTemplate('appointment_confirmation', { lead, appointment, agency, modifyUrl });
    return this.sendEmail({
      to: lead.email,
      subject: `Confirmación de tu cita - ${agency.name || 'PropIA Inmobiliaria'}`,
      html,
    });
  }

  async sendAppointmentReminder(lead, appointment, agency, modifyUrl) {
    const html = this.generateEmailTemplate('appointment_reminder', { lead, appointment, agency, modifyUrl });
    return this.sendEmail({
      to: lead.email,
      subject: `Recordatorio de tu cita - ${agency.name || 'PropIA Inmobiliaria'}`,
      html,
    });
  }

  async sendAppointmentUpdate(lead, appointment, agency, modifyUrl) {
    const html = this.generateEmailTemplate('appointment_update', { lead, appointment, agency, modifyUrl });
    return this.sendEmail({
      to: lead.email,
      subject: `Modificación de tu cita - ${agency.name || 'PropIA Inmobiliaria'}`,
      html,
    });
  }

  async sendAppointmentCancellation(lead, appointment, agency) {
    const html = this.generateEmailTemplate('appointment_cancel', { lead, appointment, agency });
    return this.sendEmail({
      to: lead.email,
      subject: `Cancelación de tu cita - ${agency.name || 'PropIA Inmobiliaria'}`,
      html,
    });
  }

  generateEmailTemplate(type, data) {
    const templates = {
      welcome: () => {
        const name = data.lead?.name || 'Estimado cliente';
        return `<div style="background:#1a1a2e;padding:40px;font-family:Arial,sans-serif">
          <div style="max-width:600px;margin:auto;background:#16213e;border-radius:12px;padding:30px">
            <h1 style="color:#e94560;font-size:24px;margin-bottom:8px">¡Bienvenido a ${this.config.agencyName || 'InmoTech Realty'}!</h1>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6">Hola ${name},</p>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6">Nos alegra que hayas confiado en nosotros para encontrar la propiedad de tus sueños. Nuestro equipo de agentes IA está listo para ayudarte.</p>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6">Muy pronto recibirás recomendaciones personalizadas basadas en tus preferencias.</p>
            <div style="text-align:center;margin:30px 0">
              <a href="${this.config.appUrl || 'http://localhost:5173'}" style="display:inline-block;background:#e94560;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">Ver mi panel</a>
            </div>
            <hr style="border:1px solid #0f3460;margin:20px 0">
            <p style="color:#888;font-size:12px;text-align:center">Este mensaje fue generado automáticamente por el CRM Inmobiliario IA</p>
          </div>
        </div>`;
      },

      property_match: () => {
        const name = data.lead?.name || 'Estimado cliente';
        const prop = data.property || {};
        const price = typeof prop.price === 'number' ? prop.price.toLocaleString('es-ES') + '€' : prop.price || 'Consultar';
        const location = [prop.zone, prop.city].filter(Boolean).join(', ') || 'Ubicación';
        return `<div style="background:#1a1a2e;padding:40px;font-family:Arial,sans-serif">
          <div style="max-width:600px;margin:auto;background:#16213e;border-radius:12px;padding:30px">
            <h1 style="color:#e94560;font-size:22px;margin-bottom:8px">Propiedad recomendada para ti</h1>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6">Hola ${name},</p>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6">Hemos encontrado una propiedad que podría interesarte:</p>
            <div style="background:#0f3460;border-radius:8px;padding:20px;margin:20px 0">
              <h2 style="color:white;font-size:18px;margin:0 0 8px">${prop.title || 'Propiedad'}</h2>
              <p style="color:#e94560;font-size:20px;font-weight:bold;margin:8px 0">${price}</p>
              <p style="color:#ccc;font-size:14px;margin:4px 0">📍 ${location}</p>
              <p style="color:#ccc;font-size:14px;margin:4px 0">🛏 ${prop.bedrooms || 'N/A'} hab · 🚿 ${prop.bathrooms || 'N/A'} baños · 📐 ${prop.surface || 'N/A'} m²</p>
              ${prop.matchReason ? `<p style="color:#a8d8ea;font-size:13px;font-style:italic;margin:8px 0">💡 ${prop.matchReason}</p>` : ''}
            </div>
            <div style="text-align:center;margin:20px 0">
              <a href="${this.config.appUrl || 'http://localhost:5173'}/properties/${prop.id || ''}" style="display:inline-block;background:#e94560;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">Ver propiedad</a>
            </div>
            <hr style="border:1px solid #0f3460;margin:20px 0">
            <p style="color:#888;font-size:12px;text-align:center">CRM Inmobiliario IA</p>
          </div>
        </div>`;
      },

      visit_confirmation: () => {
        const name = data.lead?.name || 'Estimado cliente';
        const visit = data.visit || {};
        return `<div style="background:#1a1a2e;padding:40px;font-family:Arial,sans-serif">
          <div style="max-width:600px;margin:auto;background:#16213e;border-radius:12px;padding:30px">
            <h1 style="color:#e94560;font-size:22px;margin-bottom:8px">Visita confirmada ✅</h1>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6">Hola ${name},</p>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6">Tu visita ha sido confirmada con los siguientes detalles:</p>
            <div style="background:#0f3460;border-radius:8px;padding:20px;margin:20px 0">
              <p style="color:white;font-size:16px;margin:4px 0"><strong>Propiedad:</strong> ${visit.propertyTitle || 'No especificada'}</p>
              <p style="color:white;font-size:16px;margin:4px 0"><strong>Fecha:</strong> ${visit.date ? new Date(visit.date).toLocaleString('es-ES') : 'No especificada'}</p>
              <p style="color:white;font-size:16px;margin:4px 0"><strong>Dirección:</strong> ${visit.address || 'Por confirmar'}</p>
              ${visit.notes ? `<p style="color:#a8d8ea;font-size:14px;margin:8px 0">📝 ${visit.notes}</p>` : ''}
            </div>
            <p style="color:#e0e0e0;font-size:14px;line-height:1.6">Recibirás un recordatorio 24 horas antes de la visita.</p>
            <hr style="border:1px solid #0f3460;margin:20px 0">
            <p style="color:#888;font-size:12px;text-align:center">CRM Inmobiliario IA</p>
          </div>
        </div>`;
      },

      report: () => {
        const d = data.data || {};
        return `<div style="background:#1a1a2e;padding:40px;font-family:Arial,sans-serif">
          <div style="max-width:600px;margin:auto;background:#16213e;border-radius:12px;padding:30px">
            <h1 style="color:#e94560;font-size:22px;margin-bottom:8px">${data.isWeekly ? 'Informe semanal' : 'Informe'}</h1>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6">Resumen de actividad:</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0">
              ${[['Nuevos leads', d.newLeads || 0], ['Leads calientes', d.hotLeads || 0], ['Visitas realizadas', d.visitsCompleted || 0], ['Tareas completadas', d.tasksCompleted || 0], ['Conversaciones', d.conversations || 0], ['Propiedades activas', d.activeProperties || 0]].map(([label, val]) =>
                `<div style="background:#0f3460;border-radius:8px;padding:15px;text-align:center">
                  <div style="color:#e94560;font-size:28px;font-weight:bold">${val}</div>
                  <div style="color:#ccc;font-size:13px">${label}</div>
                </div>`
              ).join('')}
            </div>
            ${d.recommendations ? `<div style="background:#1a1a2e;border-left:3px solid #e94560;padding:12px;margin:15px 0"><p style="color:#e0e0e0;font-size:13px;margin:0">${d.recommendations.join('<br>')}</p></div>` : ''}
            <hr style="border:1px solid #0f3460;margin:20px 0">
            <p style="color:#888;font-size:12px;text-align:center">CRM Inmobiliario IA · ${new Date().toLocaleDateString('es-ES')}</p>
          </div>
        </div>`;
      },

      briefing: () => {
        const b = data.briefing || {};
        const summary = b.summary || {};
        return `<div style="background:#1a1a2e;padding:40px;font-family:Arial,sans-serif">
          <div style="max-width:600px;margin:auto;background:#16213e;border-radius:12px;padding:30px">
            <h1 style="color:#e94560;font-size:20px;margin-bottom:4px">Briefing diario</h1>
            <p style="color:#888;font-size:13px;margin-bottom:20px">${b.date || new Date().toLocaleDateString('es-ES')}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:15px 0">
              ${[['Nuevos leads', summary.newLeads || 0], ['Calientes', summary.hotLeads || 0], ['Visitas hoy', summary.todayVisits || 0], ['Tareas pendientes', summary.pendingTasks || 0]].map(([label, val]) =>
                `<div style="background:#0f3460;border-radius:6px;padding:12px;text-align:center">
                  <div style="color:#e94560;font-size:24px;font-weight:bold">${val}</div>
                  <div style="color:#ccc;font-size:12px">${label}</div>
                </div>`
              ).join('')}
            </div>
            ${b.highlights?.length ? `<div style="background:#0f3460;border-radius:8px;padding:15px;margin:15px 0">
              <p style="color:#e0e0e0;font-size:13px;font-weight:bold;margin:0 0 8px">Destacados</p>
              ${b.highlights.map(h => `<p style="color:#a8d8ea;font-size:13px;margin:3px 0">• ${h}</p>`).join('')}
            </div>` : ''}
            <p style="color:#888;font-size:12px;text-align:center;margin-top:20px">CRM Inmobiliario IA · Generado automáticamente</p>
          </div>
        </div>`;
      },

      appointment_confirmation: () => {
        const lead = data.lead || {};
        const appt = data.appointment || {};
        const agency = data.agency || {};
        const modifyUrl = data.modifyUrl || '#';
        const formattedDate = new Date(appt.starts_at).toLocaleString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        const typeStr = appt.type === 'online' ? 'Videollamada' : 'Cita presencial';
        const locationStr = appt.type === 'online'
          ? `<strong>Enlace de reunión:</strong> <a href="${appt.online_url || '#'}" style="color:#e94560">${appt.online_url || 'Google Meet'}</a>`
          : `<strong>Dirección:</strong> ${appt.location || agency.address || 'Oficina principal'}`;

        const attendant = appt.attendant_name || agency.appointment_attendant_name || 'Comercial asignado';

        return `<div style="background:#1a1a2e;padding:40px;font-family:Arial,sans-serif">
          <div style="max-width:600px;margin:auto;background:#16213e;border-radius:12px;padding:30px">
            <h1 style="color:#e94560;font-size:22px;margin-bottom:8px">Cita Confirmada ✅</h1>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6">Hola ${lead.name || 'Estimado cliente'},</p>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6">Te confirmamos los detalles de tu próxima cita con <strong>${agency.name || 'PropIA Inmobiliaria'}</strong>:</p>
            
            <div style="background:#0f3460;border-radius:8px;padding:20px;margin:20px 0">
              <p style="color:white;font-size:15px;margin:4px 0">📅 <strong>Fecha:</strong> ${formattedDate}</p>
              <p style="color:white;font-size:15px;margin:4px 0">⏱ <strong>Duración:</strong> ${appt.ends_at ? Math.round((new Date(appt.ends_at) - new Date(appt.starts_at)) / 60000) : 30} minutos</p>
              <p style="color:white;font-size:15px;margin:4px 0">📌 <strong>Tipo:</strong> ${typeStr}</p>
              <p style="color:white;font-size:15px;margin:4px 0">📍 ${locationStr}</p>
              <p style="color:white;font-size:15px;margin:4px 0">👤 <strong>Persona que te atenderá:</strong> ${attendant}</p>
              ${appt.notes ? `<p style="color:#a8d8ea;font-size:14px;margin:12px 0 0">📝 <strong>Notas adicionales:</strong> ${appt.notes}</p>` : ''}
            </div>

            <p style="color:#e0e0e0;font-size:14px;line-height:1.6">Si necesitas modificar la fecha/hora o necesitas cancelar la cita, puedes gestionarlo directamente sin necesidad de iniciar sesión pulsando el siguiente enlace:</p>
            
            <div style="text-align:center;margin:30px 0">
              <a href="${modifyUrl}" style="display:inline-block;background:#e94560;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">Gestionar mi Cita</a>
            </div>

            <hr style="border:1px solid #0f3460;margin:20px 0">
            <p style="color:#888;font-size:12px;text-align:center">Este mensaje fue enviado automáticamente por ${agency.name || 'PropIA'}.</p>
          </div>
        </div>`;
      },

      appointment_reminder: () => {
        const lead = data.lead || {};
        const appt = data.appointment || {};
        const agency = data.agency || {};
        const modifyUrl = data.modifyUrl || '#';
        const formattedDate = new Date(appt.starts_at).toLocaleString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        const typeStr = appt.type === 'online' ? 'Videollamada' : 'Cita presencial';
        const locationStr = appt.type === 'online'
          ? `<strong>Enlace de reunión:</strong> <a href="${appt.online_url || '#'}" style="color:#e94560">${appt.online_url || 'Google Meet'}</a>`
          : `<strong>Dirección:</strong> ${appt.location || agency.address || 'Oficina principal'}`;

        const attendant = appt.attendant_name || agency.appointment_attendant_name || 'Comercial asignado';

        return `<div style="background:#1a1a2e;padding:40px;font-family:Arial,sans-serif">
          <div style="max-width:600px;margin:auto;background:#16213e;border-radius:12px;padding:30px">
            <h1 style="color:#e94560;font-size:22px;margin-bottom:8px">Recordatorio de Cita ⏰</h1>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6">Hola ${lead.name || 'Estimado cliente'},</p>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6">Te recordamos que en 48 horas tenemos agendada una cita contigo:</p>
            
            <div style="background:#0f3460;border-radius:8px;padding:20px;margin:20px 0">
              <p style="color:white;font-size:15px;margin:4px 0">📅 <strong>Fecha:</strong> ${formattedDate}</p>
              <p style="color:white;font-size:15px;margin:4px 0">📌 <strong>Tipo:</strong> ${typeStr}</p>
              <p style="color:white;font-size:15px;margin:4px 0">📍 ${locationStr}</p>
              <p style="color:white;font-size:15px;margin:4px 0">👤 <strong>Persona que te atenderá:</strong> ${attendant}</p>
            </div>

            <p style="color:#e0e0e0;font-size:14px;line-height:1.6"><strong>Importante:</strong> Rogamos que acudas puntualmente o tengas lista la información relevante si aplica. Si te surge algún inconveniente, por favor confírmanos tu asistencia, cámbiala o cancélala desde aquí:</p>
            
            <div style="text-align:center;margin:30px 0">
              <a href="${modifyUrl}" style="display:inline-block;background:#e94560;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">Confirmar o Modificar Cita</a>
            </div>

            <hr style="border:1px solid #0f3460;margin:20px 0">
            <p style="color:#888;font-size:12px;text-align:center">Este mensaje fue enviado automáticamente por ${agency.name || 'PropIA'}.</p>
          </div>
        </div>`;
      },

      appointment_update: () => {
        const lead = data.lead || {};
        const appt = data.appointment || {};
        const agency = data.agency || {};
        const modifyUrl = data.modifyUrl || '#';
        const formattedDate = new Date(appt.starts_at).toLocaleString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        const typeStr = appt.type === 'online' ? 'Videollamada' : 'Cita presencial';
        const locationStr = appt.type === 'online'
          ? `<strong>Enlace de reunión:</strong> <a href="${appt.online_url || '#'}" style="color:#e94560">${appt.online_url || 'Google Meet'}</a>`
          : `<strong>Dirección:</strong> ${appt.location || agency.address || 'Oficina principal'}`;

        const attendant = appt.attendant_name || agency.appointment_attendant_name || 'Comercial asignado';

        return `<div style="background:#1a1a2e;padding:40px;font-family:Arial,sans-serif">
          <div style="max-width:600px;margin:auto;background:#16213e;border-radius:12px;padding:30px">
            <h1 style="color:#e94560;font-size:22px;margin-bottom:8px">Cita Modificada 📅</h1>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6">Hola ${lead.name || 'Estimado cliente'},</p>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6">Te informamos que tu cita ha sido reprogramada. Aquí tienes los nuevos detalles de la cita:</p>
            
            <div style="background:#0f3460;border-radius:8px;padding:20px;margin:20px 0">
              <p style="color:white;font-size:15px;margin:4px 0">📅 <strong>Fecha:</strong> ${formattedDate}</p>
              <p style="color:white;font-size:15px;margin:4px 0">📌 <strong>Tipo:</strong> ${typeStr}</p>
              <p style="color:white;font-size:15px;margin:4px 0">📍 ${locationStr}</p>
              <p style="color:white;font-size:15px;margin:4px 0">👤 <strong>Persona que te atenderá:</strong> ${attendant}</p>
            </div>

            <p style="color:#e0e0e0;font-size:14px;line-height:1.6">Si necesitas realizar cualquier otra consulta o modificación:</p>
            
            <div style="text-align:center;margin:30px 0">
              <a href="${modifyUrl}" style="display:inline-block;background:#e94560;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">Ver / Modificar Detalles</a>
            </div>

            <hr style="border:1px solid #0f3460;margin:20px 0">
            <p style="color:#888;font-size:12px;text-align:center">Este mensaje fue enviado automáticamente por ${agency.name || 'PropIA'}.</p>
          </div>
        </div>`;
      },

      appointment_cancel: () => {
        const lead = data.lead || {};
        const appt = data.appointment || {};
        const agency = data.agency || {};

        return `<div style="background:#1a1a2e;padding:40px;font-family:Arial,sans-serif">
          <div style="max-width:600px;margin:auto;background:#16213e;border-radius:12px;padding:30px">
            <h1 style="color:#e94560;font-size:22px;margin-bottom:8px">Cita Cancelada ❌</h1>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6">Hola ${lead.name || 'Estimado cliente'},</p>
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6">Te confirmamos que la cita que tenías agendada con <strong>${agency.name || 'PropIA Inmobiliaria'}</strong> ha sido cancelada correctamente.</p>
            
            <p style="color:#e0e0e0;font-size:15px;line-height:1.6">Si crees que esto ha sido un error, o si deseas volver a agendar una cita en otro momento, no dudes en ponerte en contacto con nosotros.</p>

            <hr style="border:1px solid #0f3460;margin:20px 0">
            <p style="color:#888;font-size:12px;text-align:center">Saludos cordiales,<br>El equipo de ${agency.name || 'PropIA'}</p>
          </div>
        </div>`;
      },
    };

    const generator = templates[type];
    if (!generator) {
      return `<div style="background:#1a1a2e;padding:20px;font-family:Arial,sans-serif"><p style="color:white">${JSON.stringify(data)}</p></div>`;
    }
    return generator();
  }
}

export default EmailService;
