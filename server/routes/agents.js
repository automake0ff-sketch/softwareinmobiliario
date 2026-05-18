import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { all, get, run } from '../db/db.js'
import { auth, requireRole } from '../middleware/auth.js'
import { callOpenRouter, streamOpenRouter, parseAgentReply } from '../services/openrouter.js'
import { getAgentSystemPrompt, AGENT_META } from '../agents/index.js'
import { checkAgentAccessMiddleware, checkLimit } from '../services/plan-checker.js'

const router = Router()
router.use(auth)

// GET /api/agents - List agents (with filters)
router.get('/', (req, res) => {
  try {
    const { type, status } = req.query
    let sql = 'SELECT * FROM ai_agents WHERE agency_id = @agency_id'
    const params = { agency_id: req.user.agency_id }

    if (type) { sql += ' AND type = @type'; params.type = type }
    if (status) { sql += ' AND status = @status'; params.status = status }

    sql += ' ORDER BY created_at ASC'
    const agents = all(sql, params).map(a => ({
      ...a,
      config: a.config ? JSON.parse(a.config) : null,
      metrics: a.metrics ? JSON.parse(a.metrics) : null,
    }))

    // Enrich with metadata from AGENT_META
    const enriched = agents.map(a => ({
      ...a,
      display_name: AGENT_META[a.type]?.name || a.name,
      icon: AGENT_META[a.type]?.icon || 'Bot',
      color: AGENT_META[a.type]?.color || '#6366f1',
      description: AGENT_META[a.type]?.description || '',
    }))

    res.json(enriched)
  } catch (error) {
    console.error('Error listing agents:', error)
    res.status(500).json({ error: 'Error al obtener agentes.' })
  }
})

// GET /api/agents/types - Get agent types with metadata (no DB needed)
router.get('/types', (req, res) => {
  const types = Object.entries(AGENT_META).map(([type, meta]) => ({
    type,
    ...meta,
  }))
  res.json(types)
})

// GET /api/agents/:id - Get single agent
router.get('/:id', (req, res) => {
  try {
    const agent = get('SELECT * FROM ai_agents WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id })
    if (!agent) return res.status(404).json({ error: 'Agente no encontrado.' })
    agent.config = agent.config ? JSON.parse(agent.config) : null
    agent.metrics = agent.metrics ? JSON.parse(agent.metrics) : null
    res.json({
      ...agent,
      display_name: AGENT_META[agent.type]?.name || agent.name,
      icon: AGENT_META[agent.type]?.icon || 'Bot',
      color: AGENT_META[agent.type]?.color || '#6366f1',
    })
  } catch (error) {
    console.error('Error getting agent:', error)
    res.status(500).json({ error: 'Error al obtener agente.' })
  }
})

// POST /api/agents/:id/toggle - Toggle active/inactive
router.post('/:id/toggle', (req, res) => {
  try {
    const agent = get('SELECT * FROM ai_agents WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id })
    if (!agent) return res.status(404).json({ error: 'Agente no encontrado.' })

    const newStatus = agent.status === 'active' ? 'inactive' : 'active'
    run('UPDATE ai_agents SET status = @status, last_action = datetime(\'now\') WHERE id = @id', { status: newStatus, id: req.params.id })

    const updated = get('SELECT * FROM ai_agents WHERE id = @id', { id: req.params.id })
    updated.config = updated.config ? JSON.parse(updated.config) : null
    updated.metrics = updated.metrics ? JSON.parse(updated.metrics) : null
    res.json(updated)
  } catch (error) {
    console.error('Error toggling agent:', error)
    res.status(500).json({ error: 'Error al cambiar estado del agente.' })
  }
})

// POST /api/agents/:id/execute - Execute agent with OpenRouter (legacy endpoint)
router.post('/:id/execute', checkAgentAccessMiddleware, async (req, res) => {
  try {
    const agent = get('SELECT * FROM ai_agents WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id })
    if (!agent) return res.status(404).json({ error: 'Agente no encontrado.' })

    const { context, message, lead_id } = req.body
    const userMsg = message || context || 'Ejecuta tu función principal como agente inmobiliario.'
    const systemPrompt = await getAgentSystemPrompt(agent.type)

    const rawResponse = await callOpenRouter({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      model: 'smart',
      temperature: 0.7,
      maxTokens: 1500,
    })

    const { message: agentMessage, data: agentData } = parseAgentReply(rawResponse)

    // Apply agent actions to lead if lead_id exists
    if (lead_id && agentData) {
      const updates = { updated_at: new Date().toISOString() }
      
      if (agent.type === 'captador') {
        if (agentData.score !== undefined) updates.ia_score = agentData.score
        if (agentData.score_label) updates.ia_score_label = agentData.score_label
        if (agentData.datos_captados) {
          const d = agentData.datos_captados
          if (d.operation_type) updates.operation_type = d.operation_type
          if (d.budget_max) updates.budget_max = d.budget_max
          if (d.zones?.length) updates.zones = JSON.stringify(d.zones)
          if (d.urgency) updates.urgency = d.urgency
        }
        if (agentData.insights) updates.ia_insights = JSON.stringify(agentData.insights)
        if (agentData.next_action) updates.ia_next_action = agentData.next_action
      }

      if (agent.type === 'vendedor' && agentData.score_change) {
        const lead = get('SELECT ia_score FROM leads WHERE id = @id', { id: lead_id })
        if (lead) {
          const newScore = Math.max(0, Math.min(100, (lead.ia_score ?? 50) + Number(agentData.score_change)))
          updates.ia_score = newScore
          updates.ia_score_label = newScore > 75 ? 'caliente' : newScore > 40 ? 'templado' : 'frio'
        }
        if (agentData.stage_change) updates.pipeline_stage = agentData.stage_change
      }

      if (Object.keys(updates).length > 1) {
        const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ')
        run(`UPDATE leads SET ${setClauses} WHERE id = @id`, { ...updates, id: lead_id })
      }
    }

    // Update metrics
    const metrics = agent.metrics ? JSON.parse(agent.metrics) : {}
    metrics.last_execution = new Date().toISOString()
    metrics.executions = (metrics.executions || 0) + 1

    run(
      'UPDATE ai_agents SET last_action = datetime(\'now\'), metrics = @metrics WHERE id = @id',
      { metrics: JSON.stringify(metrics), id: req.params.id }
    )

    // Log activity
    run(
      `INSERT INTO activities (id, agency_id, lead_id, agent_id, type, description, metadata, created_at)
       VALUES (@id, @agency_id, @lead_id, @agent_id, @type, @description, @metadata, datetime('now'))`,
      {
        id: uuidv4(),
        agency_id: req.user.agency_id || agent.agency_id,
        lead_id: lead_id || null,
        agent_id: agent.id,
        type: 'ia_action',
        description: `[${agent.type}] Ejecutado: "${userMsg.substring(0, 80)}..."`,
        metadata: JSON.stringify({ model: 'openai/gpt-4o', tokens: rawResponse.length, agentData }),
      }
    )

    res.json({ 
      agent_id: agent.id, 
      agent_name: agent.name, 
      type: agent.type, 
      response: rawResponse,
      message: agentMessage,
      data: agentData,
      model: 'openai/gpt-4o' 
    })
  } catch (error) {
    console.error('Error executing agent:', error)
    res.status(500).json({ error: error.message || 'Error al ejecutar agente.' })
  }
})

// POST /api/agents/:id/chat - Chat with agent via OpenRouter (with streaming support)
router.post('/:id/chat', async (req, res) => {
  try {
    const agent = get('SELECT * FROM ai_agents WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id })
    if (!agent) return res.status(404).json({ error: 'Agente no encontrado.' })

    const { message, conversation_history = [], lead_context = {}, stream = false } = req.body
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message es requerido' })
    }

    const systemPrompt = await getAgentSystemPrompt(agent.type)

    // Build context string
    let contextStr = ''
    if (lead_context.name) contextStr += `\nLead: ${lead_context.name}`
    if (lead_context.score !== undefined) contextStr += ` | Score: ${lead_context.score}/100`
    if (lead_context.stage) contextStr += ` | Etapa: ${lead_context.stage}`
    if (lead_context.zone) contextStr += ` | Zona: ${lead_context.zone}`
    if (lead_context.budget) contextStr += ` | Presupuesto: ${lead_context.budget}€`
    if (lead_context.summary) contextStr += `\nPerfil: ${lead_context.summary}`
    if (lead_context.agency_name) contextStr += `\nAgencia: ${lead_context.agency_name}`
    if (lead_context.agency_city) contextStr += ` | Ciudad: ${lead_context.agency_city}`

    const fullSystemPrompt = contextStr
      ? `${systemPrompt}\n\n---\nCONTEXTO ACTUAL:${contextStr}`
      : systemPrompt

    const messages = [
      { role: 'system', content: fullSystemPrompt },
      ...(conversation_history || []).slice(-10),
      { role: 'user', content: message },
    ]

    // Function to apply agent actions to lead
    const applyLeadUpdates = async (rawResponse, leadId) => {
      if (!leadId) return
      const { data: agentData } = parseAgentReply(rawResponse)
      if (!agentData) return

      const updates = { updated_at: new Date().toISOString() }
      
      if (agent.type === 'captador') {
        if (agentData.score !== undefined) updates.ia_score = agentData.score
        if (agentData.score_label) updates.ia_score_label = agentData.score_label
        if (agentData.datos_captados) {
          const d = agentData.datos_captados
          if (d.operation_type) updates.operation_type = d.operation_type
          if (d.budget_max) updates.budget_max = d.budget_max
          if (d.zones?.length) updates.zones = JSON.stringify(d.zones)
          if (d.urgency) updates.urgency = d.urgency
        }
        if (agentData.insights) updates.ia_insights = JSON.stringify(agentData.insights)
        if (agentData.next_action) updates.ia_next_action = agentData.next_action
      }

      if (agent.type === 'vendedor' && agentData.score_change) {
        const lead = get('SELECT ia_score FROM leads WHERE id = @id', { id: leadId })
        if (lead) {
          const newScore = Math.max(0, Math.min(100, (lead.ia_score ?? 50) + Number(agentData.score_change)))
          updates.ia_score = newScore
          updates.ia_score_label = newScore > 75 ? 'caliente' : newScore > 40 ? 'templado' : 'frio'
        }
        if (agentData.stage_change) updates.pipeline_stage = agentData.stage_change
      }

      if (Object.keys(updates).length > 1) {
        const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ')
        run(`UPDATE leads SET ${setClauses} WHERE id = @id`, { ...updates, id: leadId })
      }
    }

    if (stream) {
      // SSE streaming response
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      try {
        let fullResponse = ''
        for await (const chunk of streamOpenRouter({
          messages,
          model: agent.type === 'tasador' || agent.type === 'analista' ? 'reason' : 'smart',
          temperature: 0.7,
          maxTokens: 2000,
        })) {
          fullResponse += chunk
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`)
        }
        res.write('data: [DONE]\n\n')
        res.end()

        // Apply lead updates and log activity async
        await applyLeadUpdates(fullResponse, lead_context.lead_id)
        
        run(
          `INSERT INTO activities (id, agency_id, lead_id, agent_id, type, description, metadata, created_at)
           VALUES (@id, @agency_id, @lead_id, @agent_id, @type, @description, @metadata, datetime('now'))`,
          {
            id: uuidv4(),
            agency_id: req.user.agency_id || agent.agency_id,
            lead_id: lead_context.lead_id || null,
            agent_id: agent.id,
            type: 'ia_action',
            description: `[${agent.type}] Chat: "${message.substring(0, 80)}..."`,
            metadata: JSON.stringify({ tokens: fullResponse.length }),
          }
        )
      } catch (err) {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
        res.end()
      }
    } else {
      const rawResponse = await callOpenRouter({
        messages,
        model: agent.type === 'tasador' || agent.type === 'analista' ? 'reason' : 'smart',
        temperature: 0.7,
        maxTokens: 2000,
      })

      const { message: agentMessage, data: agentData } = parseAgentReply(rawResponse)

      // Apply lead updates
      await applyLeadUpdates(rawResponse, lead_context.lead_id)

      // Update metrics
      const metrics = agent.metrics ? JSON.parse(agent.metrics) : {}
      metrics.last_execution = new Date().toISOString()
      metrics.executions = (metrics.executions || 0) + 1
      run(
        'UPDATE ai_agents SET last_action = datetime(\'now\'), metrics = @metrics WHERE id = @id',
        { metrics: JSON.stringify(metrics), id: req.params.id }
      )

      // Log activity
      run(
        `INSERT INTO activities (id, agency_id, lead_id, agent_id, type, description, metadata, created_at)
         VALUES (@id, @agency_id, @lead_id, @agent_id, @type, @description, @metadata, datetime('now'))`,
        {
          id: uuidv4(),
          agency_id: req.user.agency_id || agent.agency_id,
          lead_id: lead_context.lead_id || null,
          agent_id: agent.id,
          type: 'ia_action',
          description: `[${agent.type}] Chat: "${message.substring(0, 80)}..."`,
          metadata: JSON.stringify({ model: agent.type === 'tasador' || agent.type === 'analista' ? 'anthropic/claude-opus-4-5' : 'openai/gpt-4o', tokens: rawResponse.length, agentData }),
        }
      )

      res.json({
        agent_id: agent.id,
        agent_type: agent.type,
        agent_name: AGENT_META[agent.type]?.name || agent.name,
        response: rawResponse,
        message: agentMessage,
        data: agentData,
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error) {
    console.error('Error in agent chat:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Error interno' })
    }
  }
})

// GET /api/agents/:id/metrics - Get agent metrics
router.get('/:id/metrics', (req, res) => {
  try {
    const agent = get('SELECT * FROM ai_agents WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id })
    if (!agent) return res.status(404).json({ error: 'Agente no encontrado.' })

    const metrics = agent.metrics ? JSON.parse(agent.metrics) : {}
    const activities = all(
      'SELECT * FROM activities WHERE agent_id = @agent_id ORDER BY created_at DESC LIMIT 20',
      { agent_id: req.params.id }
    )

    res.json({
      id: agent.id,
      name: agent.name,
      type: agent.type,
      display_name: AGENT_META[agent.type]?.name || agent.name,
      icon: AGENT_META[agent.type]?.icon || 'Bot',
      color: AGENT_META[agent.type]?.color || '#6366f1',
      metrics,
      recent_activities: activities,
    })
  } catch (error) {
    console.error('Error getting agent metrics:', error)
    res.status(500).json({ error: 'Error al obtener métricas.' })
  }
})

export default router
