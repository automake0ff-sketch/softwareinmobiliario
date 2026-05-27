import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { all, get, run } from '../db/db.js'
import { auth, requireRole } from '../middleware/auth.js'
import { callOpenRouter, streamOpenRouter, parseAgentReply } from '../services/openrouter.js'
import { getAgentSystemPrompt, AGENT_META } from '../agents/index.js'
import { checkAgentAccessMiddleware, checkLimit } from '../services/plan-checker.js'
import { processIncomingLead } from '../agents/captador.js'
import { realtime } from '../services/realtime.js'
import { incrementAgentStats } from '../services/automation-engine.js'

// Dynamic SQLite schema migrations for AI Agents
try { run('ALTER TABLE ai_agents ADD COLUMN is_active INTEGER DEFAULT 1'); } catch (e) {}
try { run('ALTER TABLE ai_agents ADD COLUMN stats TEXT DEFAULT \'{"leads_today":0,"messages_today":0,"success_rate":100}\''); } catch (e) {}

const router = Router()
router.use(auth)

const DEFAULT_AGENTS = [
  { type: 'captador',    name: 'Captador IA',    icon: 'UserPlus' },
  { type: 'vendedor',    name: 'Vendedor IA',    icon: 'Handshake' },
  { type: 'coordinador', name: 'Coordinador IA', icon: 'Brain' },
  { type: 'copywriter',  name: 'Copywriter IA',  icon: 'PenLine' },
  { type: 'tasador',     name: 'Tasador IA',     icon: 'Calculator' },
  { type: 'analista',    name: 'Analista IA',    icon: 'BarChart3' },
  { type: 'agendador',   name: 'Agendador IA',   icon: 'Calendar' },
  { type: 'nurturing',   name: 'Nurturing IA',   icon: 'RefreshCw' },
  { type: 'documentador',name: 'Documentador IA',icon: 'FileText' },
  { type: 'seo',         name: 'SEO IA',         icon: 'Globe' },
  { type: 'financiero',  name: 'Financiero IA',  icon: 'DollarSign' },
  { type: 'notificador', name: 'Notificador IA', icon: 'Bell' },
]

// GET /api/agents - List agents with real metrics from DB
router.get('/', (req, res) => {
  try {
    const { type, status } = req.query
    let sql = 'SELECT * FROM ai_agents WHERE agency_id = @agency_id'
    const params = { agency_id: req.user.agency_id }

    if (type) { sql += ' AND type = @type'; params.type = type }
    if (status) { sql += ' AND status = @status'; params.status = status }

    sql += ' ORDER BY created_at ASC'
    let agents = all(sql, params)

    // Auto-seed default agents if none exist for this agency
    if (!agents || agents.length === 0) {
      const now = new Date().toISOString()
      for (const da of DEFAULT_AGENTS) {
        const id = uuidv4()
        run(
          `INSERT INTO ai_agents (id, agency_id, type, name, is_active, status, stats, created_at)
           VALUES (@id, @agency_id, @type, @name, 1, 'inactive', @stats, @created_at)`,
          {
            id,
            agency_id: req.user.agency_id,
            type: da.type,
            name: da.name,
            stats: JSON.stringify({ leads_today: 0, messages_today: 0, success_rate: null }),
            created_at: now,
          }
        )
      }
      agents = all(sql, params)
      console.log(`[Agents] Seeded ${DEFAULT_AGENTS.length} agents for agency ${req.user.agency_id}`)
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString()

    const enriched = agents.map(a => {
      const rawStats = a.stats ? (() => { try { return JSON.parse(a.stats) } catch { return null } })() : null

      // Real metrics from activities table today
      const todayActivities = all(
        `SELECT id, type, lead_id, created_at FROM activities
         WHERE agency_id = @agency_id AND agent_type = @agent_type AND created_at >= @today`,
        { agency_id: req.user.agency_id, agent_type: a.type, today: todayStr }
      )

      const leadsToday = new Set(todayActivities.map(ta => ta.lead_id).filter(Boolean)).size

      const successLogs = all(
        `SELECT status FROM automation_logs
         WHERE agency_id = @agency_id AND created_at >= @today AND actions_executed IS NOT NULL`,
        { agency_id: req.user.agency_id, today: todayStr }
      )
      const totalLogs = successLogs.length
      const successfulLogs = successLogs.filter(l => l.status === 'success').length
      const successRate = totalLogs > 0 ? Math.round((successfulLogs / totalLogs) * 100) : null

      const messagesToday = rawStats?.messages_today ?? 0

      const lastActivity = todayActivities.length > 0 ? todayActivities[todayActivities.length - 1] : null
      const lastActionText = lastActivity
        ? buildLastActionText(a.type, lastActivity)
        : (rawStats?.last_action ? `Última acción: ${new Date(rawStats.last_action).toLocaleTimeString()}` : null)
      const lastActionAt = lastActivity?.created_at || rawStats?.last_action || null

      return {
        ...a,
        config: a.config ? JSON.parse(a.config) : null,
        metrics: a.metrics ? JSON.parse(a.metrics) : null,
        stats: {
          leads_today: leadsToday,
          messages_today: messagesToday,
          success_rate: successRate,
          last_action: lastActionText,
          last_action_at: lastActionAt,
        },
        is_active: a.is_active !== undefined ? a.is_active : (a.status === 'active' ? 1 : 0),
        display_name: AGENT_META[a.type]?.name || a.name,
        icon: AGENT_META[a.type]?.icon || 'Bot',
        color: AGENT_META[a.type]?.color || '#6366f1',
        description: AGENT_META[a.type]?.description || '',
      }
    })

    res.json(enriched)
  } catch (error) {
    console.error('Error listing agents:', error)
    res.status(500).json({ error: 'Error al obtener agentes.' })
  }
})

const LAST_ACTION_LABELS = {
  captador: 'Cualificó un lead',
  vendedor: 'Envió mensaje de seguimiento',
  coordinador: 'Coordinó asignación de leads',
  copywriter: 'Generó descripción de propiedad',
  tasador: 'Realizó valoración de mercado',
  analista: 'Generó análisis del pipeline',
  agendador: 'Confirmó visita',
  nurturing: 'Activó secuencia de nurturing',
  documentador: 'Solicitó documentación',
  seo: 'Optimizó ficha de propiedad',
  financiero: 'Calculó viabilidad hipotecaria',
  notificador: 'Envió notificación al equipo',
}

function buildLastActionText(agentType, activity) {
  if (!activity) return null
  const label = LAST_ACTION_LABELS[agentType]
  if (label) return label
  return activity.description || activity.title || 'Ejecutó acción'
}

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
    agent.stats = agent.stats ? JSON.parse(agent.stats) : { leads_today: 0, messages_today: 0, success_rate: null }
    res.json({
      ...agent,
      is_active: agent.is_active !== undefined ? agent.is_active : (agent.status === 'active' ? 1 : 0),
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

    const newActive = agent.is_active === 1 ? 0 : 1
    const newStatus = newActive === 1 ? 'active' : 'inactive'

    const PLAN_AGENTS = {
      starter:     ['captador', 'vendedor', 'coordinador'],
      profesional: ['captador','vendedor','coordinador','copywriter','tasador','analista','agendador','nurturing'],
      agencia:     ['captador','vendedor','coordinador','copywriter','tasador','analista','agendador','nurturing','documentador','seo','financiero','notificador'],
    }
    const userPlan = req.user.plan_id || 'starter'
    const allowed = PLAN_AGENTS[userPlan] || PLAN_AGENTS.starter
    if (newActive === 1 && !allowed.includes(agent.type)) {
      const needed = Object.entries(PLAN_AGENTS).find(([_, agents]) => agents.includes(agent.type))?.[0] || 'agencia'
      return res.status(402).json({
        error: `El agente ${agent.name} no está disponible en tu plan actual`,
        code: 'PLAN_LIMIT',
        upgrade_url: `/pricing?upgrade=${needed}`,
      })
    }

    run('UPDATE ai_agents SET status = @status, is_active = @is_active, last_action = datetime(\'now\') WHERE id = @id', { status: newStatus, is_active: newActive, id: req.params.id })

    // Log activity and broadcast
    const actId = uuidv4()
    const title = `Agente ${agent.name} ${newStatus === 'active' ? 'activado' : 'desactivado'}`
    const description = `El estado del agente ${agent.name} cambió a ${newStatus === 'active' ? 'activo' : 'inactivo'}.`
    run(
      `INSERT INTO activities (id, agency_id, type, title, description, agent_type, created_at)
       VALUES (@id, @agency_id, 'ia_action', @title, @description, @agent_type, datetime('now'))`,
      {
        id: actId,
        agency_id: req.user.agency_id,
        title,
        description,
        agent_type: agent.type,
      }
    );

    if (realtime) {
      realtime.broadcastActivity({
        id: actId,
        agency_id: req.user.agency_id,
        type: 'ia_action',
        title,
        description,
        agent_type: agent.type,
        created_at: new Date().toISOString(),
      })
    }

    const updated = get('SELECT * FROM ai_agents WHERE id = @id', { id: req.params.id })
    updated.config = updated.config ? JSON.parse(updated.config) : null
    updated.metrics = updated.metrics ? JSON.parse(updated.metrics) : null
    updated.stats = updated.stats ? JSON.parse(updated.stats) : { leads_today: 0, messages_today: 0, success_rate: null }
    updated.is_active = updated.is_active !== undefined ? updated.is_active : (updated.status === 'active' ? 1 : 0)
    res.json(updated)
  } catch (error) {
    console.error('Error toggling agent:', error)
    res.status(500).json({ error: 'Error al cambiar estado del agente.' })
  }
})

// PATCH /api/agents/:id/toggle - Toggle active/inactive with is_active body
router.patch('/:id/toggle', (req, res) => {
  try {
    const agent = get('SELECT * FROM ai_agents WHERE id = @id AND agency_id = @agency_id', { id: req.params.id, agency_id: req.user.agency_id })
    if (!agent) return res.status(404).json({ error: 'Agente no encontrado.' })

    const { is_active } = req.body
    const newActive = is_active !== undefined ? (is_active ? 1 : 0) : (agent.is_active === 1 ? 0 : 1)
    const newStatus = newActive === 1 ? 'active' : 'inactive'

    const PLAN_AGENTS = {
      starter:     ['captador', 'vendedor', 'coordinador'],
      profesional: ['captador','vendedor','coordinador','copywriter','tasador','analista','agendador','nurturing'],
      agencia:     ['captador','vendedor','coordinador','copywriter','tasador','analista','agendador','nurturing','documentador','seo','financiero','notificador'],
    }
    const userPlan = req.user.plan_id || 'starter'
    const allowed = PLAN_AGENTS[userPlan] || PLAN_AGENTS.starter
    if (newActive === 1 && !allowed.includes(agent.type)) {
      const needed = Object.entries(PLAN_AGENTS).find(([_, agents]) => agents.includes(agent.type))?.[0] || 'agencia'
      return res.status(402).json({
        error: `El agente ${agent.name} no está disponible en tu plan actual`,
        code: 'PLAN_LIMIT',
        upgrade_url: `/pricing?upgrade=${needed}`,
      })
    }

    run('UPDATE ai_agents SET status = @status, is_active = @is_active, last_action = datetime(\'now\') WHERE id = @id', { status: newStatus, is_active: newActive, id: req.params.id })

    // Log activity and broadcast
    const actId = uuidv4()
    const title = `Agente ${agent.name} ${newStatus === 'active' ? 'activado' : 'desactivado'}`
    const description = `El estado del agente ${agent.name} cambió a ${newStatus === 'active' ? 'activo' : 'inactivo'}.`
    run(
      `INSERT INTO activities (id, agency_id, type, title, description, agent_type, created_at)
       VALUES (@id, @agency_id, 'ia_action', @title, @description, @agent_type, datetime('now'))`,
      {
        id: actId,
        agency_id: req.user.agency_id,
        title,
        description,
        agent_type: agent.type,
      }
    );

    if (realtime) {
      realtime.broadcastActivity({
        id: actId,
        agency_id: req.user.agency_id,
        type: 'ia_action',
        title,
        description,
        agent_type: agent.type,
        created_at: new Date().toISOString(),
      })
    }

    const updated = get('SELECT * FROM ai_agents WHERE id = @id', { id: req.params.id })
    updated.config = updated.config ? JSON.parse(updated.config) : null
    updated.metrics = updated.metrics ? JSON.parse(updated.metrics) : null
    updated.stats = updated.stats ? JSON.parse(updated.stats) : { leads_today: 0, messages_today: 0, success_rate: null }
    updated.is_active = updated.is_active !== undefined ? updated.is_active : (updated.status === 'active' ? 1 : 0)
    res.json(updated)
  } catch (error) {
    console.error('Error toggling agent patch:', error)
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

    // Increment agent stats
    incrementAgentStats(agent.type, req.user.agency_id || agent.agency_id)

    // Log activity
    const activityId = uuidv4()
    const activityDescription = `[${agent.type}] Ejecutado: "${userMsg.substring(0, 80)}..."`
    run(
      `INSERT INTO activities (id, agency_id, lead_id, agent_id, type, description, metadata, agent_type, created_at)
       VALUES (@id, @agency_id, @lead_id, @agent_id, @type, @description, @metadata, @agent_type, datetime('now'))`,
      {
        id: activityId,
        agency_id: req.user.agency_id || agent.agency_id,
        lead_id: lead_id || null,
        agent_id: agent.id,
        type: 'ia_action',
        description: activityDescription,
        metadata: JSON.stringify({ model: 'openai/gpt-4o', tokens: rawResponse.length, agentData }),
        agent_type: agent.type,
      }
    )

    if (realtime) {
      realtime.broadcastActivity({
        id: activityId,
        agency_id: req.user.agency_id || agent.agency_id,
        lead_id: lead_id || null,
        agent_id: agent.id,
        type: 'ia_action',
        description: activityDescription,
        agent_type: agent.type,
        created_at: new Date().toISOString(),
      })
    }

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

        // Update metrics
        const metrics = agent.metrics ? JSON.parse(agent.metrics) : {}
        metrics.last_execution = new Date().toISOString()
        metrics.executions = (metrics.executions || 0) + 1
        run(
          'UPDATE ai_agents SET last_action = datetime(\'now\'), metrics = @metrics WHERE id = @id',
          { metrics: JSON.stringify(metrics), id: req.params.id }
        )

        // Increment stats
        incrementAgentStats(agent.type, req.user.agency_id || agent.agency_id)

        const activityId = uuidv4()
        const activityDescription = `[${agent.type}] Chat: "${message.substring(0, 80)}..."`
        run(
          `INSERT INTO activities (id, agency_id, lead_id, agent_id, type, description, metadata, agent_type, created_at)
           VALUES (@id, @agency_id, @lead_id, @agent_id, @type, @description, @metadata, @agent_type, datetime('now'))`,
          {
            id: activityId,
            agency_id: req.user.agency_id || agent.agency_id,
            lead_id: lead_context.lead_id || null,
            agent_id: agent.id,
            type: 'ia_action',
            description: activityDescription,
            metadata: JSON.stringify({ tokens: fullResponse.length }),
            agent_type: agent.type,
          }
        )

        if (realtime) {
          realtime.broadcastActivity({
            id: activityId,
            agency_id: req.user.agency_id || agent.agency_id,
            lead_id: lead_context.lead_id || null,
            agent_id: agent.id,
            type: 'ia_action',
            description: activityDescription,
            agent_type: agent.type,
            created_at: new Date().toISOString(),
          })
        }
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

      // Increment stats
      incrementAgentStats(agent.type, req.user.agency_id || agent.agency_id)

      // Log activity
      const activityId = uuidv4()
      const activityDescription = `[${agent.type}] Chat: "${message.substring(0, 80)}..."`
      run(
        `INSERT INTO activities (id, agency_id, lead_id, agent_id, type, description, metadata, agent_type, created_at)
         VALUES (@id, @agency_id, @lead_id, @agent_id, @type, @description, @metadata, @agent_type, datetime('now'))`,
        {
          id: activityId,
          agency_id: req.user.agency_id || agent.agency_id,
          lead_id: lead_context.lead_id || null,
          agent_id: agent.id,
          type: 'ia_action',
          description: activityDescription,
          metadata: JSON.stringify({ model: agent.type === 'tasador' || agent.type === 'analista' ? 'anthropic/claude-opus-4-5' : 'openai/gpt-4o', tokens: rawResponse.length, agentData }),
          agent_type: agent.type,
        }
      )

      if (realtime) {
        realtime.broadcastActivity({
          id: activityId,
          agency_id: req.user.agency_id || agent.agency_id,
          lead_id: lead_context.lead_id || null,
          agent_id: agent.id,
          type: 'ia_action',
          description: activityDescription,
          agent_type: agent.type,
          created_at: new Date().toISOString(),
        })
      }

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

// POST /api/agents/captador - Qualify a lead using captador agent
router.post('/captador', async (req, res) => {
  try {
    const { lead_id, agency_id } = req.body
    const aid = agency_id || req.user?.agency_id
    if (!lead_id) return res.status(400).json({ error: 'lead_id es obligatorio.' })

    const lead = get('SELECT * FROM leads WHERE id = @id AND agency_id = @agency_id', { id: lead_id, agency_id: aid })
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' })

    const leadData = {
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      budget: lead.budget,
      zone: lead.zone,
      property_interest: lead.property_interest,
      source: lead.source,
      message: lead.property_interest || '',
    }

    const qualification = await processIncomingLead(leadData)

    if (qualification.success && qualification.result) {
      const q = qualification.result
      const updates = {
        ia_score: q.ia_score ?? 0,
        ia_score_label: q.ia_score_label || 'Frío',
        ia_insight: Array.isArray(q.insights) ? q.insights.join('; ') : '',
        ia_insights: Array.isArray(q.insights) ? JSON.stringify(q.insights) : null,
        ia_next_action: q.next_action || '',
        urgency: q.lead_data?.urgency || lead.urgency,
        operation_type: q.lead_data?.tipo_operacion || lead.operation_type,
        budget_max: q.lead_data?.presupuesto ? parseFloat(q.lead_data.presupuesto) : lead.budget_max,
        zones: q.lead_data?.zona ? JSON.stringify([q.lead_data.zona]) : lead.zones,
        updated_at: new Date().toISOString()
      }

      const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ')
      run(`UPDATE leads SET ${setClauses} WHERE id = @id`, { ...updates, id: lead_id })

      // Log activity
      run(
        `INSERT INTO activities (id, agency_id, lead_id, type, description, metadata, created_at)
         VALUES (@id, @agency_id, @lead_id, 'ia_action', @description, @metadata, datetime('now'))`,
        {
          id: uuidv4(),
          agency_id: aid,
          lead_id: lead_id,
          description: `IA Calificó a ${lead.name}: Score ${updates.ia_score} (${updates.ia_score_label})`,
          metadata: JSON.stringify({ qualification: q })
        }
      )

      return res.json({ success: true, lead_id, result: updates })
    } else {
      return res.status(500).json({ error: 'Error al calificar el lead.' })
    }
  } catch (error) {
    console.error('Error in agent captador route:', error)
    res.status(500).json({ error: 'Error interno en el captador.' })
  }
})

export default router
