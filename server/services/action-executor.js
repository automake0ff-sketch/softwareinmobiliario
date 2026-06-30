import { run, get, all } from '../db/db.js';
import { v4 as uuidv4 } from 'uuid';
import { WhatsAppSender } from './whatsapp-sender.js';
import { EmailSender } from './email-sender.js';
import { TelegramSender } from './telegram-sender.js';
import { SlackSender } from './slack-sender.js';
import { CalendarManager } from './calendar-manager.js';
import { realtime } from './realtime.js';

export class ActionExecutor {
  constructor(agencyId) {
    this.agencyId = agencyId;
  }

  async executeFromAgentData(
    agentType,
    leadId,
    ctx,
    message,
    data
  ) {
    const actions = [];

    // ── SIEMPRE: guardar mensaje en conversación si hay texto ──────
    if (message && message.length > 5) {
      await this.saveMessageToConversation(leadId, agentType, message);
      actions.push('Mensaje guardado en conversación');
    }

    // ── ENVIAR POR WHATSAPP si está configurado ────────────────────
    const shouldSendWA = message && ctx.phone && ctx.wa_token && ctx.wa_phone_id &&
      ['captador','vendedor','agendador','nurturing','documentador','financiero','notificador'].includes(agentType);

    if (shouldSendWA) {
      const wa = new WhatsAppSender(String(ctx.wa_token), String(ctx.wa_phone_id));
      const sent = await wa.sendText(String(ctx.phone), message);
      if (sent) actions.push('WhatsApp enviado ✓');
      else actions.push('WhatsApp: no enviado (verificar credenciales)');
    }

    // ── ACCIONES ESPECÍFICAS POR AGENTE ───────────────────────────
    switch (agentType) {

      case 'captador': {
        if (data?.priority === 'alta' || Number(data?.score) >= 80) {
          await this.notifyTeam(
            `🔥 Lead VIP detectado: ${ctx.lead_name} (Score: ${data?.score ?? ctx.score}/100)\nZona: ${ctx.zone} | Presupuesto: ${ctx.budget_formatted}\nAcción: ${data?.next_action}`,
            'urgente', ctx
          );
          actions.push('Equipo notificado — lead prioritario');
        }
        break;
      }

      case 'vendedor': {
        if (data?.escalate) {
          await this.createTask(leadId, {
            title: `🚨 CIERRE INMINENTE: ${ctx.lead_name}`,
            description: String(data?.escalate_reason ?? 'El lead ha mostrado señales de cierre'),
            priority: 'alta',
            due_hours: 2,
            assign_to_role: 'manager',
          });
          await this.notifyTeam(
            `🚨 CIERRE INMINENTE: ${ctx.lead_name}\n${data?.escalate_reason}\nIntervención HUMANA inmediata requerida.`,
            'urgente', ctx
          );
          actions.push('Tarea urgente creada', 'Manager notificado — cierre inminente');
        }

        if (data?.next_followup_hours) {
          await this.createTask(leadId, {
            title: `Follow-up con ${ctx.lead_name}`,
            description: 'Seguimiento programado por Vendedor IA',
            priority: 'media',
            due_hours: Number(data.next_followup_hours),
            assign_to_role: 'comercial',
          });
          actions.push(`Seguimiento programado en ${data.next_followup_hours}h`);
        }
        break;
      }

      case 'coordinador': {
        const coordData = data || {};

        if (Array.isArray(coordData?.assignments)) {
          for (const assignment of coordData.assignments) {
            await this.notifyTeam(
              `📋 Lead asignado: ${assignment.lead_name ?? ctx.lead_name}\nRazón: ${assignment.reason}`,
              'importante', ctx
            );
          }
          actions.push('Asignaciones notificadas al equipo');
        }

        if (Array.isArray(coordData?.alerts)) {
          for (const alert of coordData.alerts) {
            await this.notifyTeam(
              String(alert.message ?? ''),
              String(alert.level ?? 'info'),
              ctx
            );
          }
          if (coordData.alerts.length > 0) actions.push(`${coordData.alerts.length} alertas enviadas`);
        }

        if (ctx.sg_key && ctx.sg_from_email && ctx.agency_email) {
          const emailer = new EmailSender(String(ctx.sg_key), String(ctx.sg_from_email), String(ctx.sg_from_name));
          await emailer.send({
            to: String(ctx.agency_email),
            subject: `📊 Análisis del Coordinador IA — ${new Date().toLocaleDateString('es-ES')}`,
            html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${message}</pre>`,
          });
          actions.push('Email de análisis enviado al manager');
        }
        break;
      }

      case 'agendador': {
        const agendData = data || {};

        if (agendData?.visit_scheduled && agendData?.scheduled_datetime) {
          const cal = new CalendarManager(this.agencyId);
          const eventCreated = await cal.createVisitEvent({
            leadId,
            leadName: String(ctx.lead_name),
            scheduledAt: String(agendData.scheduled_datetime),
            propertyAddress: String(ctx.zone || 'Oficina'),
          });
          if (eventCreated) actions.push('Evento creado en Google Calendar ✓');

          run("UPDATE leads SET pipeline_stage = 'visita_agendada', status = 'visita_agendada', pipeline_stage_updated_at = NOW() WHERE id = @id", { id: leadId });
          actions.push('Lead movido a Visita agendada');
        }

        await this.notifyTeam(message, 'importante', ctx);
        actions.push('Comercial notificado');
        break;
      }

      case 'documentador': {
        const docTypes = ['dni', 'nomina', 'extracto', 'vida_laboral'];
        const existingDocs = all('SELECT type FROM documents WHERE lead_id = @lead_id', { lead_id: leadId });
        const existingTypes = new Set(existingDocs?.map(d => d.type));
        const newDocs = docTypes.filter(t => !existingTypes.has(t));

        if (newDocs.length > 0) {
          for (const type of newDocs) {
            run(
              `INSERT INTO documents (id, lead_id, type, name, status, requested_at, created_at)
               VALUES (@id, @lead_id, @type, @name, 'pending', NOW(), NOW())`,
              {
                id: uuidv4(),
                lead_id: leadId,
                type,
                name: type.toUpperCase(),
              }
            );
          }
          actions.push(`${newDocs.length} documentos añadidos al checklist`);
        }

        if (ctx.email && ctx.sg_key && ctx.sg_from_email) {
          const emailer = new EmailSender(String(ctx.sg_key), String(ctx.sg_from_email), String(ctx.sg_from_name));
          await emailer.send({
            to: String(ctx.email),
            subject: `Documentación necesaria — ${ctx.agency_name}`,
            html: `<div style="font-family:sans-serif;max-width:600px"><p>${message.replace(/\n/g, '<br>')}</p><br><p>Un saludo,<br><strong>${ctx.agency_name}</strong><br>${ctx.agency_phone}</p></div>`,
          });
          actions.push('Email con checklist enviado al lead');
        }
        break;
      }

      case 'analista': {
        if (ctx.sg_key && ctx.sg_from_email && ctx.agency_email) {
          const emailer = new EmailSender(String(ctx.sg_key), String(ctx.sg_from_email), String(ctx.sg_from_name));
          await emailer.send({
            to: String(ctx.agency_email),
            subject: `📊 Informe Analista IA — ${new Date().toLocaleDateString('es-ES')}`,
            html: this.buildEmailTemplate(message, String(ctx.agency_name)),
          });
          actions.push('Informe enviado por email al manager');
        }

        if (ctx.slack_webhook) {
          const slack = new SlackSender(String(ctx.slack_webhook));
          await slack.sendMessage({
            text: `*Analista IA — ${ctx.agency_name}*\n${message}`,
          });
          actions.push('Informe enviado a Slack');
        }
        break;
      }

      case 'tasador': {
        run("UPDATE leads SET ia_summary = @msg, updated_at = NOW() WHERE id = @id", { msg: message.slice(0, 1000), id: leadId });
        actions.push('Valoración guardada en el perfil del lead');

        if (ctx.email && ctx.sg_key && ctx.sg_from_email) {
          const emailer = new EmailSender(String(ctx.sg_key), String(ctx.sg_from_email), String(ctx.sg_from_name));
          await emailer.send({
            to: String(ctx.email),
            subject: `Tu valoración gratuita — ${ctx.agency_name}`,
            html: this.buildEmailTemplate(message, String(ctx.agency_name)),
          });
          actions.push('Valoración enviada por email al lead');
        }
        break;
      }

      case 'financiero': {
        if (ctx.email && ctx.sg_key && ctx.sg_from_email) {
          const emailer = new EmailSender(String(ctx.sg_key), String(ctx.sg_from_email), String(ctx.sg_from_name));
          await emailer.send({
            to: String(ctx.email),
            subject: `Tu simulación hipotecaria — ${ctx.agency_name}`,
            html: this.buildEmailTemplate(message, String(ctx.agency_name)),
          });
          actions.push('Simulación hipotecaria enviada por email');
        }
        break;
      }

      case 'notificador': {
        await this.notifyTeam(message, 'importante', ctx);

        if (ctx.telegram_token && ctx.telegram_chat) {
          const telegram = new TelegramSender(String(ctx.telegram_token));
          await telegram.sendMessage(String(ctx.telegram_chat), message);
          actions.push('Notificación enviada por Telegram');
        }
        break;
      }

      case 'nurturing': {
        const nurData = data || {};
        if (nurData?.reactivation_detected) {
          await this.notifyTeam(
            `🔄 REACTIVACIÓN: ${ctx.lead_name} ha vuelto a responder después de inactividad. Transferir al Vendedor IA.`,
            'urgente', ctx
          );
          actions.push('Reactivación detectada — Vendedor IA alertado');
        }
        if (nurData?.archive_after_this) {
          run("UPDATE leads SET pipeline_stage = 'archivo', status = 'cerrado', updated_at = NOW() WHERE id = @id", { id: leadId });
          actions.push('Lead archivado después del último intento');
        }
        break;
      }

      case 'seo':
      case 'copywriter': {
        run(
          `INSERT INTO activities (id, agency_id, lead_id, type, title, description, agent_type, created_at)
           VALUES (@id, @agency_id, @lead_id, 'ia_action', @title, @description, @agent_type, NOW())`,
          {
            id: uuidv4(),
            agency_id: this.agencyId,
            lead_id: leadId,
            title: `${agentType === 'seo' ? 'SEO IA' : 'Copywriter IA'}: contenido generado`,
            description: message.slice(0, 500),
            agent_type: agentType,
          }
        );
        actions.push('Contenido generado y guardado');
        break;
      }
    }

    return actions;
  }

  async saveMessageToConversation(leadId, agentType, message) {
    let conv = get("SELECT id FROM conversations WHERE lead_id = @id AND channel = 'whatsapp' LIMIT 1", { id: leadId });

    if (!conv) {
      const newId = uuidv4();
      run(
        `INSERT INTO conversations (id, lead_id, agency_id, channel, created_at)
         VALUES (@id, @lead_id, @agency_id, 'whatsapp', NOW())`,
        { id: newId, lead_id: leadId, agency_id: this.agencyId }
      );
      conv = { id: newId };
    }

    if (conv?.id) {
      run(
        `INSERT INTO messages (id, conversation_id, author, content, message_type, created_at)
         VALUES (@id, @conversation_id, 'ia_agent', @content, 'text', NOW())`,
        {
          id: uuidv4(),
          conversation_id: conv.id,
          content: message,
        }
      );
    }
  }

  async createTask(leadId, task) {
    let assignedTo = null;
    if (task.assign_to_role) {
      const user = get("SELECT id FROM users WHERE agency_id = @agency_id AND role = @role AND active = 1 LIMIT 1", {
        agency_id: this.agencyId,
        role: task.assign_to_role,
      });
      assignedTo = user?.id || null;
    }

    run(
      `INSERT INTO tasks (id, lead_id, assigned_to, title, description, due_date, completed, created_at)
       VALUES (@id, @lead_id, @assigned_to, @title, @description, @due, 0, NOW())`,
      {
        id: uuidv4(),
        lead_id: leadId,
        assigned_to: assignedTo,
        title: task.title,
        description: task.description || '',
        due: new Date(Date.now() + task.due_hours * 3600000).toISOString(),
      }
    );
  }

  async notifyTeam(message, level, ctx) {
    const roles = level === 'urgente' ? ['admin', 'manager'] : ['admin', 'manager', 'comercial'];
    const placeholders = roles.map(() => '?').join(',');
    const users = all(`SELECT id FROM users WHERE agency_id = ? AND active = 1 AND role IN (${placeholders})`, [
      this.agencyId, ...roles
    ]);

    if (!users?.length) return;

    for (const u of users) {
      run(
        `INSERT INTO notifications (id, agency_id, user_id, lead_id, title, body, type, read, created_at)
         VALUES (@id, @agency_id, @user_id, @lead_id, @title, @body, @type, 0, NOW())`,
        {
          id: uuidv4(),
          agency_id: this.agencyId,
          user_id: u.id,
          lead_id: ctx.lead_id || null,
          title: level === 'urgente' ? '🚨 Alerta urgente' : level === 'importante' ? '⚡ Importante' : 'ℹ️ Info',
          body: message.slice(0, 500),
          type: level,
        }
      );
    }

    if (ctx.slack_webhook && level !== 'info') {
      const slack = new SlackSender(String(ctx.slack_webhook));
      await slack.sendMessage({ text: `*PropIA — ${level.toUpperCase()}*\n${message}` }).catch(console.error);
    }
  }

  buildEmailTemplate(content, agencyName) {
    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:20px">
    <div style="background:#1a1a2e;border-radius:12px;padding:24px;margin-bottom:20px">
      <h2 style="color:#6366f1;margin:0;font-size:20px">${agencyName}</h2>
      <p style="color:#94a3b8;margin:4px 0 0;font-size:13px">Informe generado por PropIA IA</p>
    </div>
    <div style="background:white;border-radius:12px;padding:24px;line-height:1.6;color:#374151;font-size:15px">
      ${content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px">
      Generado automáticamente por PropIA · ${new Date().toLocaleDateString('es-ES')}
    </p>
  </div>
</body>
</html>`;
  }
}
