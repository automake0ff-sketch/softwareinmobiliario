import { SupabaseClient } from '@supabase/supabase-js'
import { AgentType } from '../agents/definitions'
import { WhatsAppSender }   from '../integrations/whatsapp'
import { EmailSender }      from '../integrations/email'
import { TelegramSender }   from '../integrations/telegram'
import { SlackSender }      from '../integrations/slack'
import { CalendarManager }  from '../integrations/calendar'

export class ActionExecutor {
  constructor(
    private supabase: SupabaseClient,
    private agencyId: string
  ) {}

  async executeFromAgentData(
    agentType: AgentType,
    leadId: string,
    ctx: Record<string, unknown>,
    message: string,
    data: Record<string, unknown> | null
  ): Promise<string[]> {
    const actions: string[] = []

    // ── SIEMPRE: guardar mensaje en conversación si hay texto ──────
    if (message && message.length > 5) {
      await this.saveMessageToConversation(leadId, agentType, message)
      actions.push('Mensaje guardado en conversación')
    }

    // ── ENVIAR POR WHATSAPP si está configurado ────────────────────
    const shouldSendWA = message && ctx.phone && ctx.wa_token && ctx.wa_phone_id &&
      ['captador','vendedor','agendador','nurturing','documentador','financiero','notificador'].includes(agentType)

    if (shouldSendWA) {
      const wa = new WhatsAppSender(String(ctx.wa_token), String(ctx.wa_phone_id))
      const sent = await wa.sendText(String(ctx.phone), message)
      if (sent) actions.push('WhatsApp enviado ✓')
      else actions.push('WhatsApp: no enviado (verificar credenciales)')
    }

    // ── ACCIONES ESPECÍFICAS POR AGENTE ───────────────────────────

    switch (agentType) {

      case 'captador': {
        // Si la prioridad es alta → notificar al manager
        if (data?.priority === 'alta' || Number(data?.score) >= 80) {
          await this.notifyTeam(
            `🔥 Lead VIP detectado: ${ctx.lead_name} (Score: ${data?.score ?? ctx.score}/100)\nZona: ${ctx.zone} | Presupuesto: ${ctx.budget_formatted}\nAcción: ${data?.next_action}`,
            'urgente', ctx
          )
          actions.push('Equipo notificado — lead prioritario')
        }
        break
      }

      case 'vendedor': {
        // Si escala → crear tarea urgente + notificar
        if (data?.escalate) {
          await this.createTask(leadId, {
            title: `🚨 CIERRE INMMINENTE: ${ctx.lead_name}`,
            description: String(data?.escalate_reason ?? 'El lead ha mostrado señales de cierre'),
            priority: 'alta',
            due_hours: 2,
            assign_to_role: 'manager',
          })
          await this.notifyTeam(
            `🚨 CIERRE INMINENTE: ${ctx.lead_name}\n${data?.escalate_reason}\nIntervención HUMANA inmediata requerida.`,
            'urgente', ctx
          )
          actions.push('Tarea urgente creada', 'Manager notificado — cierre inminente')
        }

        // Si tiene follow-up programado → crear tarea
        if (data?.next_followup_hours) {
          await this.createTask(leadId, {
            title: `Follow-up con ${ctx.lead_name}`,
            description: 'Seguimiento programado por Vendedor IA',
            priority: 'media',
            due_hours: Number(data.next_followup_hours),
            assign_to_role: 'comercial',
          })
          actions.push(`Seguimiento programado en ${data.next_followup_hours}h`)
        }
        break
      }

      case 'coordinador': {
        const coordData = data as Record<string, unknown>

        // Ejecutar asignaciones
        if (Array.isArray(coordData?.assignments)) {
          for (const assignment of coordData.assignments) {
            await this.notifyTeam(
              `📋 Lead asignado: ${assignment.lead_name ?? ctx.lead_name}\nRazón: ${assignment.reason}`,
              'importante', ctx
            )
          }
          actions.push('Asignaciones notificadas al equipo')
        }

        // Generar alertas
        if (Array.isArray(coordData?.alerts)) {
          for (const alert of coordData.alerts) {
            await this.notifyTeam(
              String(alert.message ?? ''),
              String(alert.level ?? 'info') as any,
              ctx
            )
          }
          if (coordData.alerts.length > 0) actions.push(`${coordData.alerts.length} alertas enviadas`)
        }

        // Email de análisis al manager
        if (ctx.sg_key && ctx.sg_from_email && ctx.agency_email) {
          const emailer = new EmailSender(String(ctx.sg_key), String(ctx.sg_from_email), String(ctx.sg_from_name))
          await emailer.send({
            to: String(ctx.agency_email),
            subject: `📊 Análisis del Coordinador IA — ${new Date().toLocaleDateString('es-ES')}`,
            html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${message}</pre>`,
          })
          actions.push('Email de análisis enviado al manager')
        }
        break
      }

      case 'agendador': {
        const agendData = data as Record<string, unknown>

        // Si se ha agendado visita → crear evento en Google Calendar
        if (agendData?.visit_scheduled && agendData?.scheduled_datetime) {
          const cal = new CalendarManager(this.supabase, this.agencyId)
          const eventCreated = await cal.createVisitEvent({
            leadId,
            leadName: String(ctx.lead_name),
            scheduledAt: String(agendData.scheduled_datetime),
            propertyAddress: String(ctx.zone),
          })
          if (eventCreated) actions.push('Evento creado en Google Calendar ✓')

          // Actualizar stage del lead
          await this.supabase.from('leads').update({
            pipeline_stage: 'visita_agendada',
            pipeline_stage_updated_at: new Date().toISOString(),
          }).eq('id', leadId)
          actions.push('Lead movido a Visita agendada')
        }

        // Notificar al comercial asignado
        await this.notifyTeam(message, 'importante', ctx)
        actions.push('Comercial notificado')
        break
      }

      case 'documentador': {
        // Crear checklist de documentos en Supabase
        const docTypes = ['dni', 'nomina', 'extracto', 'vida_laboral']
        const { data: existingDocs } = await this.supabase.from('documents')
          .select('type').eq('lead_id', leadId)
        const existingTypes = new Set(existingDocs?.map(d => d.type))
        const newDocs = docTypes.filter(t => !existingTypes.has(t))

        if (newDocs.length > 0) {
          await this.supabase.from('documents').insert(
            newDocs.map(type => ({
              lead_id: leadId,
              type,
              name: type.toUpperCase(),
              url: '',
              status: 'pending',
              requested_at: new Date().toISOString(),
            }))
          )
          actions.push(`${newDocs.length} documentos añadidos al checklist`)
        }

        // Enviar email con checklist al lead
        if (ctx.email && ctx.sg_key && ctx.sg_from_email) {
          const emailer = new EmailSender(String(ctx.sg_key), String(ctx.sg_from_email), String(ctx.sg_from_name))
          await emailer.send({
            to: String(ctx.email),
            subject: `Documentación necesaria — ${ctx.agency_name}`,
            html: `<div style="font-family:sans-serif;max-width:600px"><p>${message.replace(/\n/g, '<br>')}</p><br><p>Un saludo,<br><strong>${ctx.agency_name}</strong><br>${ctx.agency_phone}</p></div>`,
          })
          actions.push('Email con checklist enviado al lead')
        }
        break
      }

      case 'analista': {
        // Enviar informe por email al manager
        if (ctx.sg_key && ctx.sg_from_email && ctx.agency_email) {
          const emailer = new EmailSender(String(ctx.sg_key), String(ctx.sg_from_email), String(ctx.sg_from_name))
          await emailer.send({
            to: String(ctx.agency_email),
            subject: `📊 Informe Analista IA — ${new Date().toLocaleDateString('es-ES')}`,
            html: this.buildEmailTemplate(message, String(ctx.agency_name)),
          })
          actions.push('Informe enviado por email al manager')
        }

        // Enviar a Slack si está configurado
        if (ctx.slack_webhook) {
          const slack = new SlackSender(String(ctx.slack_webhook))
          await slack.sendMessage({
            text: `*Analista IA — ${ctx.agency_name}*\n${message}`,
          })
          actions.push('Informe enviado a Slack')
        }
        break
      }

      case 'tasador': {
        // Guardar valoración como nota en el lead
        await this.supabase.from('leads').update({
          ia_summary: message.slice(0, 1000),
          updated_at: new Date().toISOString(),
        }).eq('id', leadId)
        actions.push('Valoración guardada en el perfil del lead')

        // Enviar por email si el lead tiene correo
        if (ctx.email && ctx.sg_key && ctx.sg_from_email) {
          const emailer = new EmailSender(String(ctx.sg_key), String(ctx.sg_from_email), String(ctx.sg_from_name))
          await emailer.send({
            to: String(ctx.email),
            subject: `Tu valoración gratuita — ${ctx.agency_name}`,
            html: this.buildEmailTemplate(message, String(ctx.agency_name)),
          })
          actions.push('Valoración enviada por email al lead')
        }
        break
      }

      case 'financiero': {
        // Enviar cálculo por email
        if (ctx.email && ctx.sg_key && ctx.sg_from_email) {
          const emailer = new EmailSender(String(ctx.sg_key), String(ctx.sg_from_email), String(ctx.sg_from_name))
          await emailer.send({
            to: String(ctx.email),
            subject: `Tu simulación hipotecaria — ${ctx.agency_name}`,
            html: this.buildEmailTemplate(message, String(ctx.agency_name)),
          })
          actions.push('Simulación hipotecaria enviada por email')
        }
        break
      }

      case 'notificador': {
        // Enviar a todos los canales configurados
        await this.notifyTeam(message, 'importante', ctx)

        // Telegram si está configurado
        if (ctx.telegram_token && ctx.telegram_chat) {
          const telegram = new TelegramSender(String(ctx.telegram_token))
          await telegram.sendMessage(String(ctx.telegram_chat), message)
          actions.push('Notificación enviada por Telegram')
        }
        break
      }

      case 'nurturing': {
        const nurData = data as Record<string, unknown>
        // Si detectó reactivación → pasar al Vendedor IA
        if (nurData?.reactivation_detected) {
          await this.notifyTeam(
            `🔄 REACTIVACIÓN: ${ctx.lead_name} ha vuelto a responder después de inactividad. Transferir al Vendedor IA.`,
            'urgente', ctx
          )
          actions.push('Reactivación detectada — Vendedor IA alertado')
        }
        // Si debe archivar
        if (nurData?.archive_after_this) {
          await this.supabase.from('leads').update({
            pipeline_stage: 'archivo',
            updated_at: new Date().toISOString(),
          }).eq('id', leadId)
          actions.push('Lead archivado después del último intento')
        }
        break
      }

      case 'seo':
      case 'copywriter': {
        // Guardar contenido generado en la descripción de la propiedad
        // o como nota en el lead
        await this.supabase.from('activities').insert({
          lead_id:   leadId,
          agency_id: this.agencyId,
          type:      'ia_action',
          title:     `${agentType === 'seo' ? 'SEO IA' : 'Copywriter IA'}: contenido generado`,
          description: message.slice(0, 500),
          agent_type:  agentType,
        })
        actions.push('Contenido generado y guardado')
        break
      }
    }

    return actions
  }

  private async saveMessageToConversation(
    leadId: string,
    agentType: AgentType,
    message: string
  ) {
    // Buscar o crear conversación
    let { data: conv } = await this.supabase
      .from('conversations').select('id')
      .eq('lead_id', leadId).eq('channel', 'whatsapp').maybeSingle()

    if (!conv) {
      const { data: newConv } = await this.supabase
        .from('conversations')
        .insert({ lead_id: leadId, agency_id: this.agencyId, channel: 'whatsapp', status: 'open', ia_handling: true })
        .select('id').single()
      conv = newConv
    }

    if (conv?.id) {
      await this.supabase.from('messages').insert({
        conversation_id: conv.id,
        sender_type:    'ia',
        sender_id:      agentType,
        content:        message,
        content_type:   'text',
      })
    }
  }

  private async createTask(
    leadId: string,
    task: { title: string; description?: string; priority: string; due_hours: number; assign_to_role?: string }
  ) {
    let assignedTo: string | null = null
    if (task.assign_to_role) {
      const { data: user } = await this.supabase.from('users')
        .select('id').eq('agency_id', this.agencyId)
        .eq('role', task.assign_to_role).eq('is_active', true).limit(1).single()
      assignedTo = user?.id ?? null
    }

    await this.supabase.from('tasks').insert({
      lead_id:     leadId,
      agency_id:   this.agencyId,
      assigned_to: assignedTo,
      title:       task.title,
      description: task.description ?? '',
      priority:    task.priority,
      status:      'pending',
      due_at:      new Date(Date.now() + task.due_hours * 3600000).toISOString(),
    })
  }

  private async notifyTeam(
    message: string,
    level: 'urgente' | 'importante' | 'info',
    ctx: Record<string, unknown>
  ) {
    // Obtener usuarios del equipo
    const { data: users } = await this.supabase.from('users')
      .select('id').eq('agency_id', this.agencyId)
      .eq('is_active', true)
      .in('role', level === 'urgente' ? ['admin', 'manager'] : ['admin', 'manager', 'comercial'])

    if (!users?.length) return

    await this.supabase.from('notifications').insert(
      users.map(u => ({
        agency_id:  this.agencyId,
        user_id:    u.id,
        title:      level === 'urgente' ? '🚨 Alerta urgente' : level === 'importante' ? '⚡ Importante' : 'ℹ️ Info',
        message:    message.slice(0, 500),
        level,
        is_read:    false,
      }))
    )

    // Slack si está configurado
    if (ctx.slack_webhook && level !== 'info') {
      const slack = new SlackSender(String(ctx.slack_webhook))
      await slack.sendMessage({ text: `*PropIA — ${level.toUpperCase()}*\n${message}` })
        .catch(console.error)
    }
  }

  private buildEmailTemplate(content: string, agencyName: string): string {
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
</html>`
  }
}
