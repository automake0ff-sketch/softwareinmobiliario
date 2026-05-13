import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { all, get, run } from '../db/db.js'
import { auth } from '../middleware/auth.js'
import { callOpenRouter, streamOpenRouter, parseAgentReply, interpolate } from '../services/openrouter.js'
import { getAgentSystemPrompt, AGENT_META } from '../agents/index.js'

const router = Router()
router.use(auth)

const TEST_CONTEXT = {
  lead_id: 'test-lead-001',
  lead_name: 'Carlos García (TEST)',
  phone: '+34 600 000 000',
  score: 72,
  stage: 'interesado',
  lead_summary: 'Busca piso 3 habitaciones en Triana, presupuesto 280.000€, quiere mudarse antes de verano. Tiene pre-aprobación hipotecaria.',
  budget: 280000,
  zone: 'Triana',
  agency_name: 'PropIA Demo',
  agency_city: 'Sevilla',
}

router.post('/execute-realtime', async (req, res) => {
  const { automation_id, lead_id, test_mode } = req.body

  if (!automation_id) {
    return res.status(400).json({ error: 'automation_id es requerido' })
  }

  // Cargar automatización
  const auto = get('SELECT * FROM automations WHERE id = @id', { id: automation_id })
  if (!auto) {
    return res.status(404).json({ error: 'Automatización no encontrada' })
  }

  const actions = JSON.parse(auto.actions || '[]')
  const conditions = JSON.parse(auto.conditions || '[]')

  // Cargar contexto del lead
  let ctx = { ...TEST_CONTEXT }

  if (!test_mode && lead_id) {
    const lead = get('SELECT * FROM leads WHERE id = @id', { id: lead_id })
    if (!lead) {
      return res.status(404).json({ error: 'Lead no encontrado' })
    }

    const agency = get('SELECT name FROM agencies WHERE id = @id', { id: req.user.agency_id })

    ctx = {
      ...TEST_CONTEXT,
      lead_id: lead.id,
      lead_name: lead.name || 'Lead',
      phone: lead.phone,
      email: lead.email,
      score: lead.ia_score,
      stage: lead.pipeline_stage || lead.status,
      lead_summary: lead.ia_summary,
      budget: lead.budget_max,
      zone: lead.zones ? JSON.parse(lead.zones)?.[0] || '' : '',
      zones: lead.zones ? JSON.parse(lead.zones) : [],
      source: lead.source,
      assigned_to: lead.assigned_to,
      agency_id: req.user.agency_id,
      agency_name: agency?.name || 'Mi Agencia',
      agency_city: 'España',
    }
  }

  // Configurar SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const send = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  try {
    const allResults = []

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]
      const fill = (t) => interpolate(t || '', ctx)
      const t0 = Date.now()

      send({ type: 'action_start', index: i, action: action.type })

      try {
        let result = ''
        let aiMessage = ''
        let aiUsed = false

        // ── ACTIVATE AGENT (con streaming) ─────────────
        if (action.type === 'activate_agent' || action.type === 'generate_and_send') {
          aiUsed = true
          const agentType = action.config?.agent_type
          const def = AGENT_META[agentType]

          if (!agentType) {
            throw new Error('agent_type requerido para activate_agent')
          }

          const systemPrompt = await getAgentSystemPrompt(agentType)
          const promptTpl = action.config?.prompt_template || `Analiza el lead ${ctx.lead_name} y genera una respuesta apropiada.`

          const systemCtx = `
\n\n═══ CONTEXTO ACTUAL ═══
Agencia: ${ctx.agency_name}
Lead: ${ctx.lead_name}
Score: ${ctx.score ?? 'N/A'}/100
Etapa: ${ctx.stage ?? 'desconocida'}
${ctx.lead_summary ? `Perfil: ${ctx.lead_summary}` : ''}
${ctx.zone ? `Zona: ${ctx.zone}` : ''}
${ctx.budget ? `Presupuesto: ${ctx.budget}€` : ''}
          `.trim()

          const fullSystemPrompt = systemPrompt + systemCtx
          const userMessage = fill(promptTpl)

          // Determinar modelo
          const modelMap = {
            captador: 'fast',
            agendador: 'fast',
            nurturing: 'fast',
            documentador: 'fast',
            notificador: 'fast',
            tasador: 'reason',
            analista: 'reason',
            financiero: 'reason',
          }
          const model = modelMap[agentType] || 'smart'

          // Streaming de chunks
          try {
            let fullText = ''
            for await (const chunk of streamOpenRouter({
              messages: [
                { role: 'system', content: fullSystemPrompt },
                { role: 'user', content: userMessage },
              ],
              model,
              temperature: 0.7,
              maxTokens: 1500,
            })) {
              fullText += chunk
              send({ type: 'ai_chunk', index: i, chunk })
            }

            const parsed = parseAgentReply(fullText)
            aiMessage = parsed.message || fullText
            result = `${def?.name || agentType} ejecutado correctamente`

            // Aplicar cambios al lead si no es test
            if (!test_mode && lead_id && parsed.data) {
              await applyLeadChanges(lead_id, agentType, parsed.data)
            }

            // Registrar en activities
            if (!test_mode && lead_id) {
              run(
                `INSERT INTO activities (id, agency_id, lead_id, type, title, description, agent_type, created_at)
                 VALUES (@id, @agency_id, @lead_id, @type, @title, @description, @agent_type, datetime('now'))`,
                {
                  id: uuidv4(),
                  agency_id: req.user.agency_id,
                  lead_id: lead_id,
                  type: 'automation_triggered',
                  title: `Auto: ${auto.name} → ${action.type}`,
                  description: aiMessage ? aiMessage.substring(0, 400) : result,
                  agent_type: agentType,
                }
              )
            }

          } catch (streamErr) {
            console.log('[execute-realtime] Streaming failed, trying non-stream:', streamErr.message)
            // Fallback sin streaming
            const fullText = await callOpenRouter({
              messages: [
                { role: 'system', content: fullSystemPrompt },
                { role: 'user', content: userMessage },
              ],
              model,
              temperature: 0.7,
              maxTokens: 1500,
            })

            // Simular chunks
            const chunkSize = 50
            for (let j = 0; j < fullText.length; j += chunkSize) {
              send({ type: 'ai_chunk', index: i, chunk: fullText.substring(j, j + chunkSize) })
              await new Promise(r => setTimeout(r, 20))
            }

            const parsed = parseAgentReply(fullText)
            aiMessage = parsed.message || fullText
            result = `${def?.name || agentType} ejecutado correctamente`

            if (!test_mode && lead_id && parsed.data) {
              await applyLeadChanges(lead_id, agentType, parsed.data)
            }
          }
        }

        // ── GENERATE CONTENT ─────────────────────────
        else if (action.type === 'generate_content') {
          aiUsed = true
          const agentType = action.config?.agent_type || 'copywriter'
          const contentType = action.config?.content_type || 'mensaje de seguimiento'

          const systemPrompt = await getAgentSystemPrompt(agentType)
          const userMessage = `Genera ${contentType} para el lead ${ctx.lead_name}. Perfil: ${ctx.lead_summary || 'Sin perfil'}. Etapa: ${ctx.stage || 'desconocida'}. Score: ${ctx.score || 'N/A'}/100.`

          const fullText = await callOpenRouter({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            model: 'fast',
            temperature: 0.8,
            maxTokens: 800,
          })

          const chunkSize = 50
          for (let j = 0; j < fullText.length; j += chunkSize) {
            send({ type: 'ai_chunk', index: i, chunk: fullText.substring(j, j + chunkSize) })
            await new Promise(r => setTimeout(r, 20))
          }

          const parsed = parseAgentReply(fullText)
          aiMessage = parsed.message || fullText
          result = 'Contenido generado'
        }

        // ── SEND WHATSAPP ────────────────────────────
        else if (action.type === 'send_whatsapp') {
          const msg = fill(action.config?.message_template || action.config?.message || 'Hola {{lead_name}}!')
          aiMessage = msg
          result = `Mensaje preparado para ${ctx.phone ?? ctx.lead_name}`
          console.log(`[WhatsApp → ${ctx.phone}]: ${msg}`)
        }

        // ── SEND EMAIL ───────────────────────────────
        else if (action.type === 'send_email') {
          const subject = fill(action.config?.subject_template || 'Mensaje de la agencia')
          const body = fill(action.config?.body_template || '')
          aiMessage = body
          result = `Email listo: "${subject}"`
          console.log(`[Email → ${ctx.email}]: ${subject}`)
        }

        // ── CHANGE STAGE ─────────────────────────────
        else if (action.type === 'change_stage') {
          const newStage = action.config?.new_stage
          if (newStage && !test_mode && lead_id) {
            run(
              "UPDATE leads SET pipeline_stage = @stage, status = @stage, updated_at = datetime('now') WHERE id = @id",
              { stage: newStage, id: lead_id }
            )
          }
          result = `Lead movido a etapa: ${newStage}`
        }

        // ── CREATE TASK ──────────────────────────────
        else if (action.type === 'create_task') {
          const title = fill(action.config?.title || 'Tarea automática')
          const desc = fill(action.config?.description || '')

          if (!test_mode && lead_id) {
            run(
              `INSERT INTO tasks (id, agency_id, lead_id, title, description, status, created_at)
               VALUES (@id, @agency_id, @lead_id, @title, @description, 'pending', datetime('now'))`,
              {
                id: uuidv4(),
                agency_id: req.user.agency_id,
                lead_id: lead_id,
                title,
                description: desc,
              }
            )
          }
          result = `Tarea creada: "${title}"`
        }

        // ── NOTIFY TEAM ──────────────────────────────
        else if (action.type === 'notify_team') {
          const msg = fill(action.config?.message || 'Notificación de {{lead_name}}')
          const forRole = action.config?.for_role || 'comercial'
          aiMessage = msg
          result = `Notificación enviada a ${forRole}: "${msg.slice(0, 80)}..."`

          if (!test_mode) {
            const users = all(
              'SELECT id FROM users WHERE agency_id = @agency_id AND role = @role AND active = 1',
              { agency_id: req.user.agency_id, role: forRole }
            )
            for (const user of users) {
              run(
                `INSERT INTO notifications (id, agency_id, user_id, lead_id, title, body, type, created_at)
                 VALUES (@id, @agency_id, @user_id, @lead_id, @title, @body, @type, datetime('now'))`,
                {
                  id: uuidv4(),
                  agency_id: req.user.agency_id,
                  user_id: user.id,
                  lead_id: lead_id || null,
                  title: 'Automatización ejecutada',
                  body: msg,
                  type: 'automation',
                }
              )
            }
          }
        }

        // ── ADD TAG ──────────────────────────────────
        else if (action.type === 'add_tag') {
          const tagName = fill(action.config?.tag_name || action.config?.tag || '')
          if (tagName && !test_mode && lead_id) {
            let tag = get('SELECT * FROM tags WHERE name = @name AND agency_id = @agency_id',
              { name: tagName, agency_id: req.user.agency_id })
            if (!tag) {
              const tagId = uuidv4()
              run('INSERT INTO tags (id, name, color, agency_id) VALUES (@id, @name, @color, @agency_id)',
                { id: tagId, name: tagName, color: action.config?.tag_color || '#6366F1', agency_id: req.user.agency_id })
              tag = { id: tagId }
            }
            run('INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (@lead_id, @tag_id)',
              { lead_id, tag_id: tag.id })
          }
          result = `Etiqueta "${tagName}" añadida`
        }

        // ── ASSIGN TO ────────────────────────────────
        else if (action.type === 'assign_to') {
          const userId = action.config?.user_id
          const role = action.config?.role
          if (!test_mode && lead_id) {
            if (userId) {
              run("UPDATE leads SET assigned_to = @assigned_to, updated_at = datetime('now') WHERE id = @id",
                { assigned_to: userId, id: lead_id })
            }
          }
          result = `Lead asignado a: ${userId || role || 'comercial disponible'}`
        }

        // ── UPDATE SCORE ─────────────────────────────
        else if (action.type === 'update_score') {
          const score = action.config?.score
          const scoreChange = action.config?.score_change

          if (!test_mode && lead_id) {
            if (score !== undefined) {
              const scoreLabel = score > 75 ? 'caliente' : score > 40 ? 'templado' : 'frio'
              run("UPDATE leads SET ia_score = @score, ia_score_label = @score_label, updated_at = datetime('now') WHERE id = @id",
                { score, score_label: scoreLabel, id: lead_id })
            } else if (scoreChange) {
              const lead = get('SELECT ia_score FROM leads WHERE id = @id', { id: lead_id })
              if (lead) {
                const newScore = Math.max(0, Math.min(100, (lead.ia_score ?? 50) + Number(scoreChange)))
                const scoreLabel = newScore > 75 ? 'caliente' : newScore > 40 ? 'templado' : 'frio'
                run("UPDATE leads SET ia_score = @score, ia_score_label = @score_label, updated_at = datetime('now') WHERE id = @id",
                  { score: newScore, score_label: scoreLabel, id: lead_id })
              }
            }
          }
          result = `Score actualizado: ${score ?? `+${scoreChange}`}`
        }

        // ── OTROS tipos ──────────────────────────────
        else {
          result = `Acción ${action.type} ejecutada`
        }

        const durationMs = Date.now() - t0
        allResults.push({ action: action.type, ok: true, result, aiMessage, aiUsed })
        send({
          type: 'action_done',
          index: i,
          result,
          aiMessage,
          aiUsed,
          durationMs,
        })

      } catch (err) {
        console.error(`[execute-realtime] Action ${i} error:`, err)
        allResults.push({ action: action.type, ok: false, error: err.message })
        send({
          type: 'action_error',
          index: i,
          error: err.message,
        })
      }
    }

    // Actualizar contadores de la automatización
    if (!test_mode) {
      run(
        'UPDATE automations SET run_count = COALESCE(run_count, 0) + 1, last_run_at = datetime(\'now\') WHERE id = @id',
        { id: automation_id }
      )

      try {
        run(
          `INSERT INTO automation_logs (id, automation_id, lead_id, status, actions_executed, created_at)
           VALUES (@id, @automation_id, @lead_id, @status, @actions_executed, datetime('now'))`,
          {
            id: uuidv4(),
            automation_id,
            lead_id: lead_id || null,
            status: allResults.every(r => r.ok) ? 'success' : 'partial',
            actions_executed: JSON.stringify(allResults),
          }
        )
      } catch { /* table might not exist */ }
    }

    send({
      type: 'execution_complete',
      total_actions: actions.length,
      success: allResults.filter(r => r.ok).length,
    })

    res.write('data: [DONE]\n\n')
    res.end()

  } catch (err) {
    console.error('[execute-realtime] Error:', err)
    try {
      send({ type: 'action_error', index: 0, error: err.message })
      send({ type: 'execution_complete', total_actions: actions.length, success: 0, error: err.message })
      res.write('data: [DONE]\n\n')
    } catch { /* already sent */ }
    res.end()
  }
})

async function applyLeadChanges(leadId, agentType, data) {
  if (!leadId || !data) return

  const updates = { updated_at: new Date().toISOString() }

  if (agentType === 'captador') {
    if (data.score !== undefined) {
      updates.ia_score = data.score
      updates.ia_score_label = data.score_label
    }
    if (data.insights) updates.ia_insights = JSON.stringify(data.insights)
    if (data.next_action) updates.ia_next_action = data.next_action

    const d = data.datos_captados || data.lead_data || {}
    if (d.operation_type) updates.operation_type = d.operation_type
    if (d.budget_max) updates.budget_max = d.budget_max
    if (d.zones?.length) updates.zones = JSON.stringify(d.zones)
    if (d.urgency) updates.urgency = d.urgency
  }

  if (agentType === 'vendedor') {
    if (data.score_change) {
      const lead = get('SELECT ia_score FROM leads WHERE id = @id', { id: leadId })
      if (lead) {
        const newScore = Math.max(0, Math.min(100, (lead.ia_score ?? 50) + Number(data.score_change)))
        updates.ia_score = newScore
        updates.ia_score_label = newScore > 75 ? 'caliente' : newScore > 40 ? 'templado' : 'frio'
      }
    }
    if (data.stage_change) updates.pipeline_stage = data.stage_change
  }

  if (Object.keys(updates).length > 1) {
    const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ')
    run(`UPDATE leads SET ${setClauses} WHERE id = @id`, { ...updates, id: leadId })
  }
}

export default router
