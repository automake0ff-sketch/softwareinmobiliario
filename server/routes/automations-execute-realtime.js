import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { all, get, run } from '../db/db.js'
import { auth } from '../middleware/auth.js'
import { callOpenRouter, streamOpenRouter, parseAgentReply, interpolate } from '../services/openrouter.js'
import { getAgentSystemPrompt, AGENT_META } from '../agents/index.js'
import { executeAction } from '../services/automation-engine.js'
import { buildFullContext, buildTestContext } from '../memory/full-context-builder.js'

const router = Router()
router.use(auth)

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

  // Cargar contexto completo del lead usando buildFullContext
  let ctx

  if (!test_mode && lead_id) {
    ctx = buildFullContext(lead_id, req.user.agency_id)
    if (!ctx) {
      return res.status(404).json({ error: 'Lead no encontrado' })
    }
  } else {
    ctx = buildTestContext(req.user.agency_id)
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
        let result, aiMessage, aiUsed = false
        let savedToDb = false
        let whatsappSent = false

        // ── ACTIVATE AGENT (con streaming + engine) ─
        if (action.type === 'activate_agent' || action.type === 'generate_and_send') {
          aiUsed = true
          const agentType = action.config?.agent_type
          const def = AGENT_META[agentType]

          if (!agentType) throw new Error('agent_type requerido')

          const systemPrompt = await getAgentSystemPrompt(agentType)
          const promptTpl = action.config?.prompt_template || `Analiza ${ctx.lead_name} y genera respuesta.`
          const systemCtx = `═══ CONTEXTO ═══\nLead: ${ctx.lead_name} | Score: ${ctx.score}/100 | Etapa: ${ctx.stage}\n${ctx.lead_summary ? `Perfil: ${ctx.lead_summary}` : ''}\n${ctx.zone ? `Zona: ${ctx.zone}` : ''}${ctx.budget ? ` | Presupuesto: ${ctx.budget}€` : ''}`
          const fullSystemPrompt = systemPrompt + '\n\n' + systemCtx
          const userMessage = fill(promptTpl)

          const modelMap = { captador: 'fast', agendador: 'fast', nurturing: 'fast', documentador: 'fast', notificador: 'fast', tasador: 'reason', analista: 'reason', financiero: 'reason' }
          const model = modelMap[agentType] || 'smart'

          try {
            // Streaming
            let fullText = ''
            for await (const chunk of streamOpenRouter({
              messages: [{ role: 'system', content: fullSystemPrompt }, { role: 'user', content: userMessage }],
              model, temperature: 0.7, maxTokens: 1500,
            })) {
              fullText += chunk
              send({ type: 'ai_chunk', index: i, chunk })
            }

            // Ejecutar acción REAL con el texto generado (saltar IA, solo guardar/enviar)
            const engineResult = await executeAction(
              { type: action.type, config: { ...action.config, _preGeneratedMessage: fullText } },
              ctx,
              { testMode: test_mode, agencyId: req.user.agency_id }
            )

            aiMessage = engineResult.message || engineResult.result
            result = engineResult.result
            savedToDb = engineResult.savedToDb || false
            whatsappSent = engineResult.whatsappSent || false

          } catch (streamErr) {
            console.log('[execute-realtime] Streaming failed, fallback non-stream:', streamErr.message)
            const fullText = await callOpenRouter({
              messages: [{ role: 'system', content: fullSystemPrompt }, { role: 'user', content: userMessage }],
              model, temperature: 0.7, maxTokens: 1500,
            })

            const chunkSize = 50
            for (let j = 0; j < fullText.length; j += chunkSize) {
              send({ type: 'ai_chunk', index: i, chunk: fullText.substring(j, j + chunkSize) })
              await new Promise(r => setTimeout(r, 20))
            }

            const engineResult = await executeAction(
              { type: action.type, config: { ...action.config, _preGeneratedMessage: fullText } },
              ctx,
              { testMode: test_mode, agencyId: req.user.agency_id }
            )

            aiMessage = engineResult.message || engineResult.result
            result = engineResult.result
            savedToDb = engineResult.savedToDb || false
            whatsappSent = engineResult.whatsappSent || false
          }
        }

        // ── GENERATE CONTENT (streaming simple) ──────
        else if (action.type === 'generate_content') {
          aiUsed = true
          const agentType = action.config?.agent_type || 'copywriter'
          const systemPrompt = await getAgentSystemPrompt(agentType)
          const userMessage = `Genera ${action.config?.content_type || 'contenido'} para ${ctx.lead_name}. Perfil: ${ctx.lead_summary || ''}. Etapa: ${ctx.stage}.`

          const fullText = await callOpenRouter({
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
            model: 'fast', temperature: 0.8, maxTokens: 800,
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

        // ── RESTO DE ACCIONES → Engine real ─────────
        else {
          const engineResult = await executeAction(
            { type: action.type, config: action.config || {} },
            ctx,
            { testMode: test_mode, agencyId: req.user.agency_id }
          )

          aiMessage = engineResult.message || engineResult.generatedMessage || ''
          result = engineResult.result
          aiUsed = engineResult.aiUsed || false
          savedToDb = engineResult.savedToDb || false
          whatsappSent = engineResult.whatsappSent || false
        }

        const durationMs = Date.now() - t0
        allResults.push({ action: action.type, ok: true, result, aiMessage, aiUsed, savedToDb, whatsappSent })
        send({
          type: 'action_done',
          index: i,
          result,
          aiMessage,
          aiUsed,
          durationMs,
          savedToDb,
          whatsappSent,
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
