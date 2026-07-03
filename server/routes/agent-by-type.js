import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { all, get, run } from '../db/db.js'
import { auth } from '../middleware/auth.js'
import { callOpenRouter, streamOpenRouter, parseAgentReply } from '../services/openrouter.js'
import { realtime } from '../services/realtime.js'
import { incrementAgentStats } from '../services/automation-engine.js'
import { AgentOrchestrator } from '../services/agent-orchestrator.js'
import { ActionExecutor } from '../services/action-executor.js'

const router = Router()
router.use(auth)

function loadAgentDef(type) {
  try {
    const def = AGENT_DEFINITIONS[type]
    if (!def) return null
    return def
  } catch {
    return null
  }
}

const AGENT_DEFINITIONS = {}

async function ensureDefinitionsLoaded() {
  if (Object.keys(AGENT_DEFINITIONS).length > 0) return
  try {
    const mod = await import('../../lib/agents/definitions.ts')
    if (mod?.AGENTS) {
      Object.entries(mod.AGENTS).forEach(([key, val]) => {
        AGENT_DEFINITIONS[key] = val
      })
    }
  } catch (e) {
    // fallback: load from existing server agents
    const { getAgentSystemPrompt, AGENT_META } = await import('../agents/index.js')
    const types = Object.keys(AGENT_META)
    for (const type of types) {
      AGENT_DEFINITIONS[type] = {
        type,
        name: AGENT_META[type]?.name || type,
        description: AGENT_META[type]?.description || '',
        model: type === 'tasador' || type === 'analista' || type === 'financiero'
          ? 'anthropic/claude-sonnet-4-6'
          : type === 'vendedor' || type === 'coordinador' || type === 'copywriter' || type === 'seo'
            ? 'openai/gpt-4o'
            : 'openai/gpt-4o-mini',
        temperature: type === 'coordinador' || type === 'tasador' || type === 'analista' || type === 'financiero'
          ? 0.15 : type === 'vendedor' ? 0.72 : type === 'copywriter' ? 0.88 : 0.65,
        maxTokens: type === 'copywriter' || type === 'analista' || type === 'seo' ? 2000 : 1000,
        systemPrompt: await getAgentSystemPrompt(type),
      }
    }
  }
}

const VALID_TYPES = [
  'captador', 'vendedor', 'coordinador', 'copywriter',
  'tasador', 'analista', 'agendador', 'nurturing',
  'documentador', 'seo', 'financiero', 'notificador',
]

// POST /api/agents/type/:type/chat - Chat with an agent by type
router.post('/type/:type/chat', async (req, res) => {
  try {
    await ensureDefinitionsLoaded()

    const { type } = req.params
    if (!VALID_TYPES.includes(type)) {
      return res.status(404).json({
        error: `Agente "${type}" no reconocido. Tipos válidos: ${VALID_TYPES.join(', ')}`
      })
    }

    const def = AGENT_DEFINITIONS[type]
    if (!def) {
      return res.status(404).json({ error: `Agente "${type}" no encontrado en definiciones.` })
    }

    const { message, conversation_history = [], lead_context = {}, stream = false } = req.body
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message es requerido' })
    }

    const agencyId = req.user.agency_id
    const orchestrator = new AgentOrchestrator(agencyId)

    // Build system prompt with context
    let contextStr = ''
    const now = new Date()

    let lead = null
    if (lead_context.lead_id) {
      lead = await get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', {
        id: lead_context.lead_id, agency_id: agencyId
      })
      if (lead) {
        contextStr += `\nLead: ${lead.name}`
        contextStr += `\nTeléfono: ${lead.phone || 'no disponible'}`
        contextStr += `\nEmail: ${lead.email || 'no disponible'}`
        contextStr += `\nScore IA actual: ${lead.ia_score ?? 0}/100 (${lead.ia_score_label ?? 'sin clasificar'})`
        contextStr += `\nEtapa pipeline: ${lead.pipeline_stage || 'nuevo'}`
        contextStr += `\nZona de interés: ${lead.zone || lead.zones?.[0] || 'no especificada'}`
        contextStr += `\nPresupuesto: ${lead.budget_max ? Number(lead.budget_max).toLocaleString('es-ES') + '€' : 'no especificado'}`
        contextStr += `\nTipo de operación: ${lead.operation_type || 'compra'}`
        contextStr += `\nUrgencia: ${lead.urgency || 'media'}`
        if (lead.ia_summary) contextStr += `\nResumen del lead: ${lead.ia_summary}`
        if (lead.ia_insights) {
          const insights = typeof lead.ia_insights === 'string' ? JSON.parse(lead.ia_insights) : lead.ia_insights
          if (Array.isArray(insights)) contextStr += `\nInsights previos: ${insights.join(', ')}`
        }
      }
    } else {
      if (lead_context.name) contextStr += `\nLead: ${lead_context.name}`
      if (lead_context.score !== undefined) contextStr += `\nScore IA: ${lead_context.score}/100`
      if (lead_context.stage) contextStr += `\nEtapa: ${lead_context.stage}`
      if (lead_context.zone) contextStr += `\nZona de interés: ${lead_context.zone}`
      if (lead_context.budget) contextStr += `\nPresupuesto: ${lead_context.budget}€`
      if (lead_context.summary) contextStr += `\nPerfil: ${lead_context.summary}`
    }

    if (lead_context.agency_name) contextStr += `\nAgencia: ${lead_context.agency_name}`
    if (lead_context.agency_city) contextStr += `\nCiudad: ${lead_context.agency_city}`
    contextStr += `\nFecha: ${now.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })}`
    contextStr += `\nHora: ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })}`

    const fullSystemPrompt = contextStr
      ? `${def.systemPrompt}\n\n═══ CONTEXTO ACTUAL ═══${contextStr}`
      : def.systemPrompt

    const messages = [
      { role: 'system', content: fullSystemPrompt },
      ...(conversation_history || []).slice(-12),
      { role: 'user', content: message },
    ]

    const agentType = type

    // Log activity (fire and forget)
    const activityId = uuidv4()
    await run(
      `INSERT INTO activities (id, agency_id, lead_id, type, title, description, agent_type, created_at)
       VALUES (@id, @agency_id, @lead_id, 'ia_action', @title, @description, @agent_type, NOW())`,
      {
        id: activityId,
        agency_id: agencyId,
        lead_id: lead_context.lead_id || null,
        title: `${def.name} ejecutado`,
        description: message.slice(0, 300),
        agent_type: agentType,
      }
    )

    incrementAgentStats(agentType, agencyId)

    if (realtime) {
      realtime.broadcastActivity({
        id: activityId,
        agency_id: agencyId,
        lead_id: lead_context.lead_id || null,
        type: 'ia_action',
        title: `${def.name} ejecutado`,
        description: message.slice(0, 300),
        agent_type: agentType,
        created_at: now.toISOString(),
      })
    }

    // ── STREAMING ──
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Accel-Buffering', 'no')

      try {
        let fullResponse = ''
        for await (const chunk of streamOpenRouter({
          messages,
          model: def.model,
          temperature: def.temperature,
          maxTokens: def.maxTokens,
        })) {
          fullResponse += chunk
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`)
        }
        res.write('data: [DONE]\n\n')
        res.end()

        // Ejecutar las acciones de fondo después del streaming
        if (lead) {
          const { message: agentMsg, data: agentData } = parseAgentReply(fullResponse)
          const agencyData = await orchestrator.loadAgency()
          const ctx = orchestrator.buildContext(lead, agencyData, 'manual')
          const executor = new ActionExecutor(agencyId)
          await executor.executeFromAgentData(type, lead.id, ctx, agentMsg || fullResponse, agentData)
          await orchestrator.updateLeadFromAgentData(lead.id, type, agentData || {})
        }
      } catch (err) {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
        res.end()
      }
      return
    }

    // ── NORMAL RESPONSE ──
    const raw = await callOpenRouter({
      messages,
      model: def.model,
      temperature: def.temperature,
      maxTokens: def.maxTokens,
    })

    const { message: agentMessage, data: agentData } = parseAgentReply(raw)

    let actionsExecuted = []
    if (lead) {
      const agencyData = await orchestrator.loadAgency()
      const ctx = orchestrator.buildContext(lead, agencyData, 'manual')
      const executor = new ActionExecutor(agencyId)
      actionsExecuted = await executor.executeFromAgentData(type, lead.id, ctx, agentMessage || raw, agentData)
      await orchestrator.updateLeadFromAgentData(lead.id, type, agentData || {})
    }

    res.json({
      agent: agentType,
      agentName: def.name,
      model: def.model,
      message: agentMessage || raw,
      data: agentData,
      actions: actionsExecuted,
      timestamp: now.toISOString(),
    })

  } catch (err) {
    console.error(`[AgentByType/${req.params.type}]`, err)
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Error interno del servidor' })
    }
  }
})

export default router

