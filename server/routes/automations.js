import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { all, get, run } from '../db/db.js'
import { auth, requireRole } from '../middleware/auth.js'
import { callOpenRouter } from '../services/openrouter.js'
import { evaluateConditions, executeAction, checkTrigger } from '../services/automation-engine.js'

const router = Router()
router.use(auth)

// GET /api/automations - List all automations for agency
router.get('/', (req, res) => {
  try {
    const agencyId = req.query.agency_id || req.user.agency_id
    if (!agencyId) return res.status(400).json({ error: 'agency_id requerido' })

    const automations = all(
      'SELECT * FROM automations WHERE agency_id = @agency_id ORDER BY created_at DESC',
      { agency_id: agencyId }
    ).map(a => ({
      ...a,
      conditions: a.conditions ? JSON.parse(a.conditions) : [],
      actions: a.actions ? JSON.parse(a.actions) : [],
      trigger_config: a.trigger_config ? JSON.parse(a.trigger_config) : {},
    }))

    res.json(automations)
  } catch (error) {
    console.error('Error listing automations:', error)
    res.status(500).json({ error: 'Error al obtener automatizaciones.' })
  }
})

// GET /api/automations/triggers - Get available trigger types
router.get('/triggers', (req, res) => {
  res.json([
    { value: 'lead_created',      label: 'Nuevo lead',                icon: 'UserPlus' },
    { value: 'stage_changed',      label: 'Cambio de etapa',          icon: 'ArrowRight' },
    { value: 'no_response_hours',  label: 'Sin respuesta X h',        icon: 'Clock' },
    { value: 'message_received',   label: 'Mensaje recibido',         icon: 'MessageCircle' },
    { value: 'visit_completed',    label: 'Visita completada',        icon: 'Calendar' },
    { value: 'visit_no_show',      label: 'No-show a la visita',      icon: 'X' },
    { value: 'document_received',  label: 'Documento recibido',       icon: 'FileText' },
    { value: 'score_threshold',    label: 'Score supera umbral',      icon: 'TrendingUp' },
    { value: 'score_dropped',      label: 'Score ha bajado',          icon: 'ArrowDown' },
    { value: 'time_schedule',      label: 'Programado',               icon: 'Clock' },
    { value: 'property_matched',   label: 'Propiedad compatible',     icon: 'Home' },
  ])
})

// GET /api/automations/actions - Get available action types
router.get('/actions', (req, res) => {
  res.json([
    { value: 'activate_agent',    label: 'Activar agente IA',        icon: 'Bot' },
    { value: 'send_whatsapp',     label: 'Enviar WhatsApp',           icon: 'MessageCircle' },
    { value: 'send_email',        label: 'Enviar email',              icon: 'Mail' },
    { value: 'change_stage',      label: 'Cambiar etapa',            icon: 'ArrowRight' },
    { value: 'assign_to',         label: 'Asignar comercial',        icon: 'UserPlus' },
    { value: 'create_task',       label: 'Crear tarea',              icon: 'CheckSquare' },
    { value: 'notify_team',       label: 'Notificar equipo',         icon: 'Bell' },
    { value: 'add_tag',           label: 'Añadir etiqueta',          icon: 'Tag' },
    { value: 'start_nurturing',   label: 'Iniciar nurturing',        icon: 'RefreshCw' },
    { value: 'generate_content',  label: 'Generar contenido',        icon: 'FileText' },
    { value: 'update_score',      label: 'Actualizar score lead',    icon: 'ArrowUpDown' },
  ])
})

// GET /api/automations/agents - Get available agent types
router.get('/agents', async (req, res) => {
  try {
    const { AGENT_META } = await import('../agents/index.js')
    const agents = Object.entries(AGENT_META).map(([type, meta]) => ({
      value: type,
      label: meta.name,
      icon: meta.icon,
      description: meta.description,
    }))
    res.json(agents)
  } catch (error) {
    console.error('Error listing agent types:', error)
    res.status(500).json({ error: 'Error al obtener tipos de agente.' })
  }
})

// POST /api/automations - Create new automation
router.post('/', (req, res) => {
  try {
    const agencyId = req.user.agency_id || req.body.agency_id
    if (!agencyId) return res.status(400).json({ error: 'agency_id requerido' })

    const { name, description, trigger_type, trigger_config, conditions, actions } = req.body
    if (!name || !trigger_type) {
      return res.status(400).json({ error: 'name y trigger_type son requeridos' })
    }

    const id = uuidv4()
    run(
      `INSERT INTO automations (id, agency_id, name, description, is_active, trigger_type, trigger_event, trigger_config, conditions, actions, action, run_count, created_at)
       VALUES (@id, @agency_id, @name, @description, 1, @trigger_type, @trigger_type, @trigger_config, @conditions, @actions, '', 0, datetime('now'))`,
      {
        id,
        agency_id: agencyId,
        name,
        description: description || '',
        trigger_type,
        trigger_config: JSON.stringify(trigger_config || {}),
        conditions: JSON.stringify(conditions || []),
        actions: JSON.stringify(actions || []),
      }
    )

    const created = get('SELECT * FROM automations WHERE id = @id', { id })
    res.json({
      ...created,
      conditions: JSON.parse(created.conditions || '[]'),
      actions: JSON.parse(created.actions || '[]'),
      trigger_config: JSON.parse(created.trigger_config || '{}'),
    })
  } catch (error) {
    console.error('Error creating automation:', error)
    res.status(500).json({ error: 'Error al crear automatización.' })
  }
})

// POST /api/automations/:id/toggle - Toggle active/inactive
router.post('/:id/toggle', (req, res) => {
  try {
    const auto = get('SELECT * FROM automations WHERE id = @id', { id: req.params.id })
    if (!auto) return res.status(404).json({ error: 'Automatización no encontrada.' })

    const newStatus = auto.is_active ? 0 : 1
    run('UPDATE automations SET is_active = @is_active WHERE id = @id',
      { is_active: newStatus, id: req.params.id })

    const updated = get('SELECT * FROM automations WHERE id = @id', { id: req.params.id })
    res.json({
      ...updated,
      conditions: JSON.parse(updated.conditions || '[]'),
      actions: JSON.parse(updated.actions || '[]'),
      trigger_config: JSON.parse(updated.trigger_config || '{}'),
    })
  } catch (error) {
    console.error('Error toggling automation:', error)
    res.status(500).json({ error: 'Error al cambiar estado.' })
  }
})

// PUT /api/automations/:id - Update automation
router.put('/:id', (req, res) => {
  try {
    const auto = get('SELECT * FROM automations WHERE id = @id', { id: req.params.id })
    if (!auto) return res.status(404).json({ error: 'Automatización no encontrada.' })

    const { name, description, trigger_type, trigger_config, conditions, actions, is_active } = req.body

    run(
      `UPDATE automations SET
        name = @name, description = @description, trigger_type = @trigger_type,
        trigger_event = @trigger_type,
        trigger_config = @trigger_config, conditions = @conditions, actions = @actions,
        is_active = @is_active
       WHERE id = @id`,
      {
        name: name || auto.name,
        description: description !== undefined ? description : auto.description,
        trigger_type: trigger_type || auto.trigger_type,
        trigger_config: JSON.stringify(trigger_config || JSON.parse(auto.trigger_config || '{}')),
        conditions: JSON.stringify(conditions || JSON.parse(auto.conditions || '[]')),
        actions: JSON.stringify(actions || JSON.parse(auto.actions || '[]')),
        is_active: is_active !== undefined ? (is_active ? 1 : 0) : auto.is_active,
        id: req.params.id,
      }
    )

    const updated = get('SELECT * FROM automations WHERE id = @id', { id: req.params.id })
    res.json({
      ...updated,
      conditions: JSON.parse(updated.conditions || '[]'),
      actions: JSON.parse(updated.actions || '[]'),
      trigger_config: JSON.parse(updated.trigger_config || '{}'),
    })
  } catch (error) {
    console.error('Error updating automation:', error)
    res.status(500).json({ error: 'Error al actualizar automatización.' })
  }
})

// DELETE /api/automations/:id
router.delete('/:id', (req, res) => {
  try {
    const auto = get('SELECT * FROM automations WHERE id = @id', { id: req.params.id })
    if (!auto) return res.status(404).json({ error: 'Automatización no encontrada.' })

    run('DELETE FROM automations WHERE id = @id', { id: req.params.id })
    res.json({ message: 'Automatización eliminada.' })
  } catch (error) {
    console.error('Error deleting automation:', error)
    res.status(500).json({ error: 'Error al eliminar automatización.' })
  }
})

// POST /api/automations/execute - Execute automations for a given trigger
router.post('/execute', async (req, res) => {
  try {
    const agencyId = req.user.agency_id || req.body.agency_id
    if (!agencyId) return res.status(400).json({ error: 'agency_id requerido' })

    const { trigger_type, lead_id, lead_data } = req.body
    if (!trigger_type || !lead_id) {
      return res.status(400).json({ error: 'trigger_type y lead_id son requeridos' })
    }

    // Get lead data from DB
    const lead = get('SELECT * FROM leads WHERE id = @id', { id: lead_id })
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' })

    // Build lead context
    const leadContext = {
      ...lead_data,
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
      agency_id: agencyId,
      agency_name: lead_data?.agency_name || '',
    }

    // Find matching automations
    const automations = all(
      'SELECT * FROM automations WHERE agency_id = @agency_id AND is_active = 1 AND trigger_type = @trigger_type',
      { agency_id: agencyId, trigger_type }
    )

    if (!automations.length) {
      return res.json({ message: 'No hay automatizaciones activas para este trigger', executed: 0, results: [] })
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
          const result = await executeAction(action, leadContext)
          actionResults.push({ action_type: action.type, ...result })
        } catch (err) {
          actionResults.push({ action_type: action.type, success: false, result: err.message, aiUsed: false })
        }
      }

      // Update run count
      run('UPDATE automations SET run_count = COALESCE(run_count, 0) + 1, last_run_at = datetime(\'now\') WHERE id = @id',
        { id: auto.id })

      // Log activity
      run(
        `INSERT INTO activities (id, agency_id, lead_id, type, description, metadata, created_at)
         VALUES (@id, @agency_id, @lead_id, @type, @description, @metadata, datetime('now'))`,
        {
          id: uuidv4(),
          agency_id: agencyId,
          lead_id,
          type: 'automation_triggered',
          description: `Automatización: ${auto.name}`,
          metadata: JSON.stringify({ automation_id: auto.id, trigger_type, actions_executed: actionResults.length }),
        }
      )

      // Log in automation_logs table if it exists (try/catch)
      try {
        run(
          `INSERT INTO automation_logs (id, automation_id, lead_id, status, actions_executed, created_at)
           VALUES (@id, @automation_id, @lead_id, @status, @actions_executed, datetime('now'))`,
          {
            id: uuidv4(),
            automation_id: auto.id,
            lead_id,
            status: 'success',
            actions_executed: JSON.stringify(actionResults),
          }
        )
      } catch { /* table might not exist */ }

      results.push({ automation_id: auto.id, name: auto.name, executed: true, actions: actionResults })
    }

    res.json({ executed: results.filter(r => r.executed).length, results })
  } catch (error) {
    console.error('Error executing automations:', error)
    res.status(500).json({ error: error.message || 'Error al ejecutar automatizaciones.' })
  }
})

// POST /api/automations/ai-builder - Generate automation from natural language
router.post('/ai-builder', async (req, res) => {
  try {
    const { description } = req.body
    if (!description || typeof description !== 'string') {
      return res.status(400).json({ error: 'description es requerido' })
    }

    const systemPrompt = `Eres un experto en automatizaciones para CRM inmobiliario.

Dado una descripción en lenguaje natural, genera una automatización completa en JSON.

TRIGGERS DISPONIBLES: lead_created, stage_changed, no_response_hours, message_received, visit_completed, document_received, score_threshold, time_schedule

ACCIONES DISPONIBLES: send_whatsapp, send_email, change_stage, assign_to, create_task, activate_agent, notify_team, add_tag, start_nurturing, generate_content

AGENTES DISPONIBLES: captador, vendedor, coordinador, copywriter, tasador, analista, agendador, nurturing, documentador, seo, financiero, notificador

VARIABLES PARA TEMPLATES: {{lead_name}}, {{phone}}, {{score}}, {{stage}}, {{zone}}, {{budget}}, {{agency_name}}, {{source}}

CONDICIONES: field (score, stage, source, zone, budget), operator (eq, neq, gt, gte, lt, lte, contains, is_null, not_null), value

Responde SOLO con JSON válido, sin explicaciones:
{
  "name": "nombre descriptivo",
  "description": "qué hace esta automatización",
  "trigger_type": "...",
  "trigger_config": {},
  "conditions": [{"field": "score", "operator": "gt", "value": 70}],
  "actions": [
    {
      "type": "activate_agent",
      "config": {
        "agent_type": "vendedor",
        "prompt_template": "El lead {{lead_name}} acaba de... genera un mensaje de seguimiento"
      }
    }
  ]
}`

    const response = await callOpenRouter({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: description },
      ],
      model: 'smart',
      temperature: 0.2,
      maxTokens: 1000,
      responseFormat: 'json',
    })

    let automation
    try {
      automation = JSON.parse(response)
    } catch {
      return res.status(422).json({ error: 'No se pudo parsear la automatización generada', raw: response })
    }

    res.json({ automation })
  } catch (error) {
    console.error('Error in AI builder:', error)
    res.status(500).json({ error: error.message || 'Error al generar automatización con IA.' })
  }
})

// POST /api/automations/test - Test an automation without persisting
router.post('/test', async (req, res) => {
  try {
    const { automation, lead_id, lead_data } = req.body
    if (!automation || !lead_id) {
      return res.status(400).json({ error: 'automation y lead_id son requeridos' })
    }

    const lead = get('SELECT * FROM leads WHERE id = @id', { id: lead_id })
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado.' })

    const leadContext = {
      ...lead_data,
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
    }

    const actions = automation.actions || []
    const actionResults = []

    for (const action of actions) {
      try {
        const result = await executeAction(action, leadContext)
        actionResults.push({ action_type: action.type, ...result })
      } catch (err) {
        actionResults.push({ action_type: action.type, success: false, result: err.message, aiUsed: false })
      }
    }

    res.json({ success: true, actions: actionResults })
  } catch (error) {
    console.error('Error testing automation:', error)
    res.status(500).json({ error: error.message || 'Error al probar automatización.' })
  }
})

export default router
