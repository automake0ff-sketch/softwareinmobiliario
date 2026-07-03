import { v4 as uuidv4 } from 'uuid'
import { all, get, run } from '../db/db.js'
import { callOpenRouter, parseAgentReply, interpolate } from './openrouter.js'
import { getAgentSystemPrompt } from '../agents/index.js'
import { realtime } from './realtime.js'

export async function evaluateConditions(conditions, leadData) {
  if (!conditions || !Array.isArray(conditions) || conditions.length === 0) return true
  return conditions.every(cond => {
    const val = leadData[cond.field]
    switch (cond.operator) {
      case 'eq': return val == cond.value
      case 'neq': return val != cond.value
      case 'gt': return Number(val) > Number(cond.value)
      case 'gte': return Number(val) >= Number(cond.value)
      case 'lt': return Number(val) < Number(cond.value)
      case 'lte': return Number(val) <= Number(cond.value)
      case 'contains': return String(val || '').includes(String(cond.value))
      case 'starts': return String(val || '').startsWith(String(cond.value))
      case 'is_null': return val === null || val === undefined || val === ''
      case 'not_null': return val !== null && val !== undefined && val !== ''
      default: return true
    }
  })
}

async function sendWhatsApp(phone, message, agencyId, ctx = {}) {
  if (!phone || !message) return false
  try {
    const clean = phone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '')
    const fullPhone = clean.startsWith('34') ? clean : `34${clean}`

    // Try context credentials first (from full-context-builder), then DB
    const waToken = ctx?.wa_token || null
    const waPhoneId = ctx?.wa_phone_id || null
    const agencyToken = waToken || await get('SELECT whatsapp_token FROM agencies WHERE id = @id', { id: agencyId })?.whatsapp_token
    const agencyPhoneId = waPhoneId || await get('SELECT whatsapp_phone_id FROM agencies WHERE id = @id', { id: agencyId })?.whatsapp_phone_id

    if (agencyToken && agencyPhoneId) {
      const res = await fetch(`https://graph.facebook.com/v18.0/${agencyPhoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agencyToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: fullPhone,
          type: 'text',
          text: { preview_url: false, body: message },
        }),
      })
      if (res.ok) {
        console.log(`[WhatsApp] ✓ Enviado a ${fullPhone}`)
        return true
      }
      const err = await res.text()
      console.error(`[WhatsApp] Error ${res.status}: ${err}`)
      return false
    }

    try {
      const { default: TwilioService } = await import('./twilio.js')
      const twilio = new TwilioService({
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        phoneNumber: process.env.TWILIO_PHONE_NUMBER,
      })
      const result = await twilio.sendSMS(`+${fullPhone}`, message)
      if (!result?.error) return true
    } catch { /* twilio not configured */ }

    console.log(`[WhatsApp Mock → ${fullPhone}]: ${message.substring(0, 80)}...`)
    return false
  } catch (e) {
    console.error('[WhatsApp] Error:', e.message)
    return false
  }
}

async function saveMessageToConversation(leadId, agencyId, content, senderType, senderId) {
  if (!leadId || !content) return
  let conv = await get('SELECT id, messages FROM conversations WHERE lead_id = @lead_id ORDER BY created_at DESC LIMIT 1', { lead_id: leadId })
  if (!conv) {
    const convId = uuidv4()
    await run(
      `INSERT INTO conversations (id, agency_id, lead_id, channel, messages, created_at)
       VALUES (@id, @agency_id, @lead_id, @channel, @messages, NOW())`,
      { id: convId, agency_id: agencyId, lead_id: leadId, channel: 'whatsapp', messages: '[]' }
    )
    conv = { id: convId, messages: '[]' }
  }

  const msgId = uuidv4()
  const newMessage = {
    id: msgId,
    role: senderType || 'ia_agent',
    sender_type: senderType || 'ia_agent',
    sender_id: senderId || 'automation',
    content,
    is_read: true,
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
  const msgs = JSON.parse(conv.messages || '[]')
  msgs.push(newMessage)
  await run(`UPDATE conversations SET messages = @messages, updated_at = NOW() WHERE id = @id`, { messages: JSON.stringify(msgs), id: conv.id })

  await run(
    `INSERT INTO messages (id, conversation_id, author, content, message_type, created_at)
     VALUES (@id, @conversation_id, @author, @content, @message_type, NOW())`,
    {
      id: msgId,
      conversation_id: conv.id,
      author: senderType || 'ia_agent',
      content: content,
      message_type: 'text',
    }
  )

  if (realtime) {
    realtime.broadcast('message', {
      conversation_id: conv.id,
      message: newMessage,
    })
  }
}

async function logActivity(agencyId, leadId, type, title, description, metadata, agentType) {
  const id = uuidv4()
  const created_at = new Date().toISOString()
  await run(
    `INSERT INTO activities (id, agency_id, lead_id, type, title, description, agent_type, metadata, created_at)
     VALUES (@id, @agency_id, @lead_id, @type, @title, @description, @agent_type, @metadata, NOW())`,
    {
      id,
      agency_id: agencyId,
      lead_id: leadId || null,
      type: type || 'automation_triggered',
      title: title || '',
      description: description ? description.substring(0, 400) : '',
      agent_type: agentType || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    }
  )

  if (realtime) {
    realtime.broadcastActivity({
      id,
      agency_id: agencyId,
      lead_id: leadId || null,
      type: type || 'automation_triggered',
      title: title || '',
      description: description || '',
      agent_type: agentType || null,
      created_at,
    })
  }
}

export async function incrementAgentStats(agentType, agencyId, isNewLead = false) {
  if (!agentType || !agencyId) return
  const agent = await get('SELECT id, stats FROM ai_agents WHERE type = @type AND agency_id = @agency_id', { type: agentType, agency_id: agencyId })
  if (agent) {
    let parsed = { leads_today: 0, messages_today: 0, success_rate: null }
    if (agent.stats) {
      try { parsed = JSON.parse(agent.stats) } catch (e) { /* ignore */ }
    }
    parsed.messages_today = (parsed.messages_today || 0) + 1
    if (isNewLead) {
      parsed.leads_today = (parsed.leads_today || 0) + 1
    }
    parsed.success_rate = null

    await run('UPDATE ai_agents SET stats = @stats, last_action = NOW() WHERE id = @id', { stats: JSON.stringify(parsed), id: agent.id })
  }
}

async function createNotification(agencyId, userId, leadId, title, message, level) {
  await run(
    `INSERT INTO notifications (id, agency_id, user_id, lead_id, title, message, level, is_read, created_at)
     VALUES (@id, @agency_id, @user_id, @lead_id, @title, @message, @level, 0, NOW())`,
    {
      id: uuidv4(),
      agency_id: agencyId,
      user_id: userId,
      lead_id: leadId || null,
      title: title || 'Notificación',
      message: message || '',
      level: level || 'info',
    }
  )
}

async function findLeastLoadedUser(agencyId, role) {
  const users = await all(
    'SELECT id, name FROM users WHERE agency_id = @agency_id AND role = @role AND active = 1',
    { agency_id: agencyId, role: role || 'comercial' }
  )
  if (!users.length) return null
  const counts = await Promise.all(users.map(async u => {
    const c = await get(
      'SELECT COUNT(*) as count FROM leads WHERE assigned_to = @assigned_to AND status NOT IN (\'cerrado\',\'perdido\')',
      { assigned_to: u.id }
    )
    return { ...u, count: c?.count || 0 }
  }))
  return counts.sort((a, b) => a.count - b.count)[0]
}

export async function executeAction(action, leadContext, options = {}) {
  const { type, config = {} } = action
  const { testMode = false } = options
  const agencyId = options.agencyId || leadContext.agency_id || leadContext.agencyId
  const leadId = leadContext.lead_id
  const fill = (t) => interpolate(t || '', leadContext)

  try {
    switch (type) {

      case 'activate_agent':
      case 'generate_and_send': {
        const agentType = config.agent_type
        if (!agentType) return { success: false, result: 'agent_type requerido', aiUsed: false }

        let finalMessage, agentData, rawResponse

        if (config._preGeneratedMessage) {
          rawResponse = config._preGeneratedMessage
          const parsed = parseAgentReply(rawResponse)
          finalMessage = parsed.message || rawResponse
          agentData = parsed.data
        } else {
          const systemPrompt = await getAgentSystemPrompt(agentType)
          const userPrompt = fill(config.prompt_template || `Genera una respuesta para ${leadContext.lead_name}.`)
          const contextStr = `
Agencia: ${leadContext.agency_name || ''}
Lead: ${leadContext.lead_name || ''} | Score: ${leadContext.score || '?'}/100 | Etapa: ${leadContext.stage || '?'}
${leadContext.lead_summary ? `Perfil: ${leadContext.lead_summary}` : ''}
${leadContext.budget ? `Presupuesto: ${leadContext.budget}€` : ''}
${leadContext.zone ? `Zona: ${leadContext.zone}` : ''}`

          rawResponse = await callOpenRouter({
            messages: [
              { role: 'system', content: systemPrompt + '\n\n---' + contextStr },
              { role: 'user', content: userPrompt },
            ],
            model: agentType === 'tasador' || agentType === 'analista' || agentType === 'financiero' ? 'reason' : 'smart',
            temperature: 0.7,
            maxTokens: 1500,
          })

          const parsed = parseAgentReply(rawResponse)
          finalMessage = parsed.message || rawResponse
          agentData = parsed.data
        }
        let whatsappSent = false
        let savedToDb = false

        if (!testMode && leadId && agencyId) {
          const autoSend = config.auto_send_whatsapp !== false
          const saveConv = config.save_to_conversation !== false

          if (saveConv && finalMessage) {
            saveMessageToConversation(leadId, agencyId, finalMessage, 'ia_agent', agentType)
            savedToDb = true
          }

          if (autoSend && finalMessage && leadContext.phone) {
            whatsappSent = await sendWhatsApp(leadContext.phone, finalMessage, agencyId, leadContext)
          }

          await run(
            `UPDATE leads SET last_contact_at = NOW(), updated_at = NOW() WHERE id = @id`,
            { id: leadId }
          )

          logActivity(agencyId, leadId, 'ia_action',
            `🤖 ${agentType} ejecutado`,
            finalMessage ? finalMessage.substring(0, 300) : rawResponse.substring(0, 300),
            { agent_type: agentType, auto_send: autoSend, whatsapp_sent: whatsappSent, saved: savedToDb },
            agentType
          )

          incrementAgentStats(agentType, agencyId, leadContext.status === 'nuevo')

          if (agentData) {
            const updates = { updated_at: new Date().toISOString(), last_contact_at: new Date().toISOString() }
            if (agentData.score !== undefined) { updates.ia_score = agentData.score; updates.ia_score_label = agentData.score > 75 ? 'caliente' : agentData.score > 40 ? 'templado' : 'frio' }
            if (agentData.score_change) {
              const lead = await get('SELECT ia_score FROM leads WHERE id = @id', { id: leadId })
              if (lead) {
                const ns = Math.max(0, Math.min(100, (lead.ia_score ?? 50) + Number(agentData.score_change)))
                updates.ia_score = ns; updates.ia_score_label = ns > 75 ? 'caliente' : ns > 40 ? 'templado' : 'frio'
              }
            }
            if (agentData.insights) updates.ia_insights = JSON.stringify(agentData.insights)
            if (agentData.next_action) updates.ia_next_action = agentData.next_action
            if (agentData.stage_change) updates.pipeline_stage = agentData.stage_change
            if (agentData.datos_captados) {
              const d = agentData.datos_captados
              if (d.operation_type) updates.operation_type = d.operation_type
              if (d.budget_max) updates.budget_max = d.budget_max
              if (d.zones?.length) updates.zones = JSON.stringify(d.zones)
              if (d.urgency) updates.urgency = d.urgency
              if (d.property_type) updates.property_type = d.property_type
            }
            if (Object.keys(updates).length > 2) {
              const k = Object.keys(updates).map(k => `${k} = @${k}`).join(', ')
              await run(`UPDATE leads SET ${k} WHERE id = @id`, { ...updates, id: leadId })
            }
          }

          // Enviar a destinos adicionales configurados en la acción
          if (!testMode && config.destinations?.length && finalMessage && agencyId) {
            const { sendToDestination } = await import('./destinations.js')
            for (const destConfig of config.destinations) {
              const destResult = await sendToDestination({
                destConfig,
                content: finalMessage,
                ctx: leadContext,
                subject: config.subject_template,
                agencyId,
              })
              const destType = destConfig.type || 'desconocido'
              console.log(`[Destination ${destType}] ${destResult.detail}`)
            }
          }
        }

        return {
          success: true,
          result: `${agentType} ejecutado. ${savedToDb ? 'Mensaje guardado en conversación ✓' : ''} ${whatsappSent ? 'WhatsApp enviado ✓' : leadContext.phone && !testMode ? 'WhatsApp no disponible' : ''}`,
          message: finalMessage,
          aiUsed: true,
          savedToDb,
          whatsappSent,
        }
      }

      case 'send_whatsapp': {
        const msg = fill(config.message || config.message_template || 'Hola {{lead_name}}!')
        let sent = false
        if (!testMode && leadId && agencyId && leadContext.phone) {
          sent = await sendWhatsApp(leadContext.phone, msg, agencyId)
          saveMessageToConversation(leadId, agencyId, msg, 'ia_agent', 'automation')
          logActivity(agencyId, leadId, 'message_sent', '💬 WhatsApp enviado',
            msg.substring(0, 300),
            { phone: leadContext.phone, sent }, null)
        }
        return { success: true, result: sent ? `WhatsApp enviado a ${leadContext.phone}` : `Mensaje preparado: "${msg.substring(0, 60)}..."`, message: msg, aiUsed: false, whatsappSent: sent }
      }

      case 'send_email': {
        const subject = fill(config.subject_template || 'Mensaje de {{agency_name}}')
        const body = fill(config.body_template || '')
        if (!testMode && leadId && agencyId) {
          logActivity(agencyId, leadId, 'email_sent', '📧 Email generado',
            `Asunto: ${subject}`, { to: leadContext.email, subject }, null)
        }
        return { success: true, result: `Email listo: "${subject}"`, aiUsed: false, generatedMessage: body }
      }

      case 'change_stage': {
        const newStage = config.new_stage
        if (!newStage) throw new Error('new_stage requerido')
        const oldStage = leadContext.stage || leadContext.status
        if (!testMode && leadId) {
          await run("UPDATE leads SET status = @status, pipeline_stage = @status, pipeline_stage_updated_at = NOW(), updated_at = NOW() WHERE id = @id",
            { status: newStage, id: leadId })
          if (agencyId) {
            logActivity(agencyId, leadId, 'stage_changed', `🔄 Etapa: ${oldStage} → ${newStage}`,
              `Cambio automático por automatización`, { from: oldStage, to: newStage, automated: true }, null)
          }
        }
        return { success: true, result: `Lead movido a "${newStage}"`, aiUsed: false, details: { from: oldStage, to: newStage } }
      }

      case 'assign_to': {
        let assignedUserId = config.user_id
        let assignedName = 'comercial'

        if (!assignedUserId && agencyId) {
          const best = findLeastLoadedUser(agencyId, config.role || 'comercial')
          if (best) { assignedUserId = best.id; assignedName = best.name }
        }

        if (!testMode && leadId && assignedUserId) {
          await run("UPDATE leads SET assigned_to = @assigned_to, updated_at = NOW() WHERE id = @id",
            { assigned_to: assignedUserId, id: leadId })
          if (agencyId) {
            logActivity(agencyId, leadId, 'ia_action', `👤 Lead asignado a ${assignedName}`,
              'Asignación automática por automatización',
              { assigned_to: assignedUserId, assigned_name: assignedName, role: config.role }, null)
            createNotification(agencyId, assignedUserId, leadId,
              '📥 Lead asignado',
              `Se te ha asignado el lead ${leadContext.lead_name} (score ${leadContext.score}/100)`,
              'importante')
          }
        }
        return { success: true, result: `Lead asignado a ${assignedName}`, aiUsed: false, details: { assigned_to: assignedUserId, name: assignedName } }
      }

      case 'create_task': {
        const title = fill(config.title || 'Tarea para {{lead_name}}')
        const desc = fill(config.description || '')
        const dueHours = config.due_hours || config.due_days * 24 || 24
        const dueAt = new Date(Date.now() + dueHours * 3600000).toISOString()
        const priority = config.priority || 'alta'

        if (!testMode && leadId && agencyId) {
          let assignToUserId = null
          if (config.assign_to === 'manager' || config.assign_to === 'comercial') {
            const u = await get('SELECT id FROM users WHERE agency_id = @agency_id AND role = @role AND active = 1 LIMIT 1',
              { agency_id: agencyId, role: config.assign_to })
            if (u) assignToUserId = u.id
          }

          await run(
            `INSERT INTO tasks (id, agency_id, lead_id, assigned_to, title, description, due_at, priority, status, created_at)
             VALUES (@id, @agency_id, @lead_id, @assigned_to, @title, @description, @due_at, @priority, 'pending', NOW())`,
            {
              id: uuidv4(),
              agency_id: agencyId, lead_id: leadId,
              assigned_to: assignToUserId,
              title, description: desc,
              due_at: dueAt, priority,
            }
          )

          logActivity(agencyId, leadId, 'task_created', `📋 Tarea: ${title}`, desc.substring(0, 200),
            { due_at: dueAt, priority, due_hours: dueHours }, null)

          if (assignToUserId) {
            createNotification(agencyId, assignToUserId, leadId,
              '📋 Nueva tarea',
              `${title} — vence en ${dueHours}h`,
              priority === 'alta' ? 'urgente' : 'importante')
          }
        }
        return { success: true, result: `Tarea creada: "${title}" (vence en ${dueHours}h)`, aiUsed: false, details: { title, due_hours: dueHours } }
      }

      case 'notify_team': {
        const msg = fill(config.notification_message || config.message || 'Notificación de automatización para {{lead_name}}')
        const forRole = config.for_role || 'manager'
        const level = config.level || 'importante'

        if (!testMode && agencyId) {
          let users = await all(
            'SELECT id FROM users WHERE agency_id = @agency_id AND active = 1',
            { agency_id: agencyId }
          )
          if (forRole !== 'all') {
            users = await all(
              'SELECT id FROM users WHERE agency_id = @agency_id AND role = @role AND active = 1',
              { agency_id: agencyId, role: forRole }
            )
          }
          for (const u of users) {
            createNotification(agencyId, u.id, leadId,
              level === 'urgente' ? '🚨 Alerta urgente' : level === 'importante' ? '⚡ Importante' : 'ℹ️ Información',
              msg, level)
          }
          if (leadId) {
            logActivity(agencyId, leadId, 'ia_action', `🔔 Equipo notificado (${forRole})`,
              msg.substring(0, 300), { role: forRole, level, user_count: users.length }, null)
          }
        }
        return { success: true, result: `Notificación enviada a ${forRole}: "${msg.substring(0, 80)}..."`, aiUsed: false, generatedMessage: msg }
      }

      case 'add_tag': {
        const tagName = fill(config.tag_name || config.tag || '')
        if (!testMode && tagName && leadId) {
          let tag = await get('SELECT * FROM tags WHERE name = @name AND agency_id = @agency_id',
            { name: tagName, agency_id: agencyId })
          if (!tag) {
            const tagId = uuidv4()
            await run('INSERT INTO tags (id, name, color, agency_id) VALUES (@id, @name, @color, @agency_id)',
              { id: tagId, name: tagName, color: config.tag_color || '#6366F1', agency_id: agencyId })
            tag = { id: tagId }
          }
          await run('INSERT INTO lead_tags (lead_id, tag_id) VALUES (@lead_id, @tag_id) ON CONFLICT DO NOTHING',
            { lead_id: leadId, tag_id: tag.id })
        }
        return { success: true, result: `Etiqueta "${tagName}" añadida`, aiUsed: false }
      }

      case 'remove_tag': {
        const tagName = fill(config.tag || '')
        if (!testMode && tagName && leadId) {
          const tag = await get('SELECT id FROM tags WHERE name = @name AND agency_id = @agency_id',
            { name: tagName, agency_id: agencyId })
          if (tag) {
            await run('DELETE FROM lead_tags WHERE lead_id = @lead_id AND tag_id = @tag_id',
              { lead_id: leadId, tag_id: tag.id })
          }
        }
        return { success: true, result: `Etiqueta "${tagName}" eliminada`, aiUsed: false }
      }

      case 'update_score': {
        let newScore
        if (config.score_change !== undefined) {
          const lead = await get('SELECT ia_score FROM leads WHERE id = @id', { id: leadId })
          newScore = Math.max(0, Math.min(100, (lead?.ia_score ?? 50) + Number(config.score_change)))
        } else {
          newScore = Math.max(0, Math.min(100, config.score ?? 50))
        }
        const label = newScore > 75 ? 'caliente' : newScore > 40 ? 'templado' : 'frio'
        if (!testMode && leadId) {
          await run("UPDATE leads SET ia_score = @score, ia_score_label = @label, updated_at = NOW() WHERE id = @id",
            { score: newScore, label, id: leadId })
        }
        return { success: true, result: `Score actualizado a ${newScore}/100 (${label})`, aiUsed: false }
      }

      case 'update_field': {
        const field = config.field
        const value = config.value
        if (!field) throw new Error('field requerido')
        if (!testMode && leadId) {
          await run(`UPDATE leads SET ${field} = @value, updated_at = NOW() WHERE id = @id`,
            { value, id: leadId })
        }
        return { success: true, result: `Campo "${field}" actualizado`, aiUsed: false }
      }

      case 'create_visit': {
        const daysAhead = config.days_ahead || 2
        const visitDate = new Date(Date.now() + daysAhead * 86400000)
        visitDate.setHours(10, 0, 0, 0)

        if (!testMode && leadId && agencyId) {
          const lead = await get('SELECT assigned_to FROM leads WHERE id = @id', { id: leadId })
          await run(
            `INSERT INTO visits (id, lead_id, property_id, assigned_to, scheduled_at, status, notes, created_at)
             VALUES (@id, @lead_id, @property_id, @assigned_to, @scheduled_at, 'scheduled', @notes, NOW())`,
            {
              id: uuidv4(), lead_id: leadId,
              property_id: config.property_id || null,
              assigned_to: lead?.assigned_to || null,
              scheduled_at: visitDate.toISOString(),
              notes: 'Visita creada automáticamente',
            }
          )
          logActivity(agencyId, leadId, 'visit_scheduled', `📅 Visita agendada para ${visitDate.toLocaleDateString('es-ES')}`,
            `Visita creada automáticamente para dentro de ${daysAhead} días`,
            { scheduled_at: visitDate.toISOString(), days_ahead: daysAhead }, null)
          await run("UPDATE leads SET status = 'visita_agendada', pipeline_stage = 'visita_agendada', updated_at = NOW() WHERE id = @id",
            { id: leadId })
        }
        return { success: true, result: `Visita agendada para ${visitDate.toLocaleDateString('es-ES')}`, aiUsed: false }
      }

      case 'request_documents': {
        const docTypes = config.document_types || ['dni', 'nomina', 'extracto']

        if (!testMode && leadId && agencyId) {
          for (const type of docTypes) {
            await run(
              `INSERT INTO documents (id, lead_id, type, name, status, requested_at, created_at)
               VALUES (@id, @lead_id, @type, @name, 'pending', NOW(), NOW())`,
              { id: uuidv4(), lead_id: leadId, type, name: type.toUpperCase() }
            )
          }

          const systemPrompt = await getAgentSystemPrompt('documentador')
          const msg = await callOpenRouter({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Genera un mensaje para ${leadContext.lead_name} pidiendo los siguientes documentos: ${docTypes.join(', ')}. La operación está en etapa ${leadContext.stage || 'desconocida'}. Tono profesional y amable.` },
            ],
            model: 'fast', temperature: 0.7, maxTokens: 500,
          })
          const { message: docMsg } = parseAgentReply(msg)
          const finalDocMsg = docMsg || msg

          saveMessageToConversation(leadId, agencyId, finalDocMsg, 'ia_agent', 'documentador')
          if (leadContext.phone) await sendWhatsApp(leadContext.phone, finalDocMsg, agencyId)

          logActivity(agencyId, leadId, 'document_request', '📋 Documentos solicitados',
            `Se solicitaron: ${docTypes.join(', ')}`,
            { document_types: docTypes }, 'documentador')
        }
        return { success: true, result: `Documentos solicitados: ${docTypes.join(', ')}`, aiUsed: true }
      }

      case 'generate_content': {
        const agentType = config.agent_type || 'copywriter'
        const systemPrompt = await getAgentSystemPrompt(agentType)
        const prompt = config.prompt || `Genera ${config.content_type || 'contenido'} para ${leadContext.lead_name}.`
        const rawResponse = await callOpenRouter({
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
          model: 'fast', temperature: 0.8, maxTokens: 800,
        })
        const { message: contentMsg } = parseAgentReply(rawResponse)
        return { success: true, result: 'Contenido generado', message: contentMsg || rawResponse, aiUsed: true }
      }

      case 'send_property_match': {
        if (!testMode && leadId && agencyId) {
          const props = await all(
            `SELECT id, title, price, zone, bedrooms, surface FROM properties
             WHERE agency_id = @agency_id AND status = 'disponible'
             ORDER BY created_at DESC LIMIT 3`,
            { agency_id: agencyId }
          )

          if (props.length) {
            const systemPrompt = await getAgentSystemPrompt('vendedor')
            const propSummary = props.map(p =>
              `- ${p.title}: ${Number(p.price).toLocaleString('es-ES')}€, ${p.bedrooms}h, ${p.surface}m², ${p.zone}`
            ).join('\n')
            const msg = await callOpenRouter({
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Recomienda estas propiedades a ${leadContext.lead_name} de forma personalizada:\n${propSummary}` },
              ],
              model: 'smart', temperature: 0.7, maxTokens: 600,
            })
            const { message: propMsg } = parseAgentReply(msg)
            if (leadContext.phone) await sendWhatsApp(leadContext.phone, propMsg || msg, agencyId)
          }
        }
        return { success: true, result: 'Propiedades enviadas al lead', aiUsed: true }
      }

      default:
        return { success: false, result: `Acción "${type}" no implementada`, aiUsed: false }
    }
  } catch (err) {
    console.error(`[Engine] Error en acción ${type}:`, err)
    return { success: false, result: `Error: ${err.message}`, aiUsed: false }
  }
}

export async function checkTrigger(automation, leadContext) {
  const conditionsMet = evaluateConditions(automation.conditions || [], leadContext)
  if (!conditionsMet) return false

  const triggerType = automation.trigger_type
  const triggerConfig = automation.trigger_config || {}

  switch (triggerType) {
    case 'lead_created': return true
    case 'stage_changed': {
      const toStage = triggerConfig.to_stage
      if (toStage && leadContext.stage !== toStage) return false
      const fromStage = triggerConfig.from_stage
      if (fromStage && leadContext.previous_stage !== fromStage) return false
      return true
    }
    case 'no_response_hours': {
      const hours = triggerConfig.hours || 24
      const lastActivity = leadContext.last_activity || leadContext.last_activity_at || leadContext.created_at
      if (!lastActivity) return false
      return (Date.now() - new Date(lastActivity).getTime()) / 3600000 >= hours
    }
    case 'score_threshold': {
      const threshold = triggerConfig.threshold || 80
      const score = Number(leadContext.score) || 0
      return triggerConfig.direction !== 'below' ? score >= threshold : score <= threshold
    }
    case 'time_schedule': return true
    case 'message_received': return !!leadContext.last_message
    case 'visit_completed': return leadContext.visit_status === 'completed'
    case 'score_dropped': return true
    case 'property_matched': return true
    default: return true
  }
}

export async function triggerAutomations({ trigger_type, lead_id, agency_id, trigger_payload }) {
  try {
    const aid = agency_id
    if (!trigger_type || !lead_id) {
      throw new Error('trigger_type y lead_id son requeridos')
    }

    // Get lead data from DB
    const lead = await get('SELECT * FROM leads WHERE id = @id', { id: lead_id })
    if (!lead) throw new Error('Lead no encontrado.')

    // Build lead context
    const leadContext = {
      ...trigger_payload,
      lead_id: lead.id,
      lead_name: lead.name,
      phone: lead.phone,
      email: lead.email,
      score: lead.ia_score,
      stage: lead.status,
      zone: lead.zone,
      budget: lead.budget,
      lead_summary: lead.ia_summary,
      source: lead.source,
      assigned_to: lead.assigned_to,
      last_activity: lead.last_activity,
      agency_id: aid,
    }

    // Find matching automations
    const automations = await all(
      'SELECT * FROM automations WHERE agency_id = @agency_id AND is_active = true AND trigger_type = @trigger_type',
      { agency_id: aid, trigger_type }
    )

    if (!automations.length) {
      return { message: 'No hay automatizaciones activas para este trigger', executed: 0, results: [] }
    }

    const results = []

    for (const auto of automations) {
      const conditions = JSON.parse(auto.conditions || '[]')
      const actions = JSON.parse(auto.actions || '[]')
      const triggerConfig = JSON.parse(auto.trigger_config || '{}')

      const automationWithParsed = {
        ...auto,
        conditions,
        actions,
        trigger_config: triggerConfig,
      }

      // Check if trigger conditions are met
      if (!checkTrigger(automationWithParsed, leadContext)) {
        results.push({ automation_id: auto.id, name: auto.name, skipped: true, reason: 'Condiciones no cumplidas' })
        continue
      }

      // Execute actions in sequence
      const actionResults = []
      for (const action of actions) {
        try {
          const result = await executeAction(action, leadContext, { agencyId: aid })
          actionResults.push({ action_type: action.type, ...result })
        } catch (err) {
          actionResults.push({ action_type: action.type, success: false, result: err.message, aiUsed: false })
        }
      }

      // Update run count
      await run('UPDATE automations SET run_count = COALESCE(run_count, 0) + 1, last_run_at = NOW() WHERE id = @id',
        { id: auto.id })

      // Log activity
      await run(
        `INSERT INTO activities (id, agency_id, lead_id, type, description, metadata, created_at)
         VALUES (@id, @agency_id, @lead_id, @type, @description, @metadata, NOW())`,
        {
          id: uuidv4(),
          agency_id: aid,
          lead_id,
          type: 'automation_triggered',
          description: `Automatización: ${auto.name}`,
          metadata: JSON.stringify({ automation_id: auto.id, trigger_type, actions_executed: actionResults.length }),
        }
      )

      // Log in automation_logs table if it exists (try/catch)
      try {
        await run(
          `INSERT INTO automation_logs (id, automation_id, lead_id, agency_id, status, actions_executed, created_at)
           VALUES (@id, @automation_id, @lead_id, @agency_id, @status, @actions_executed, NOW())`,
          {
            id: uuidv4(),
            automation_id: auto.id,
            lead_id,
            agency_id: aid,
            status: 'success',
            actions_executed: JSON.stringify(actionResults),
          }
        )
      } catch (err) {
        console.error('[Trigger Log Error] Could not save to automation_logs:', err.message)
      }

      results.push({ automation_id: auto.id, name: auto.name, executed: true, actions: actionResults })
    }

    return { executed: results.filter(r => r.executed).length, results }
  } catch (error) {
    console.error('Error executing automations in trigger function:', error)
    throw error
  }
}
