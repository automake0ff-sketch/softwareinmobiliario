import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { all, get, run } from '../db/db.js'
import { auth, requireRole } from '../middleware/auth.js'
import { callOpenRouter } from '../services/openrouter.js'
import { evaluateConditions, executeAction, checkTrigger, triggerAutomations } from '../services/automation-engine.js'
import { checkLimit } from '../services/plan-checker.js'
import { PLANS, limitLabel } from '../services/plans.js'
import { automationSchema, validateBody } from '../middleware/validators.js'

const router = Router()
router.use(auth)

// GET /api/automations - List all automations for agency
router.get('/', async (req, res) => {
  try {
    const agencyId = req.user.agency_id
    if (!agencyId) return res.status(400).json({ error: 'agency_id requerido' })

    const automations = await all(
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
router.get('/triggers', async (req, res) => {
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
router.get('/actions', async (req, res) => {
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
router.post('/', checkLimit('automations'), validateBody(automationSchema), async (req, res) => {
  try {
    const agencyId = req.user.agency_id || req.body.agency_id
    if (!agencyId) return res.status(400).json({ error: 'agency_id requerido' })

    const { name, description, trigger_type, trigger_config, conditions, actions } = req.body
    if (!name || !trigger_type) {
      return res.status(400).json({ error: 'name y trigger_type son requeridos' })
    }

    const id = uuidv4()
    await run(
      `INSERT INTO automations (id, agency_id, name, description, is_active, trigger_type, trigger_event, trigger_config, conditions, actions, action, run_count, created_at)
       VALUES (@id, @agency_id, @name, @description, 1, @trigger_type, @trigger_type, @trigger_config, @conditions, @actions, '', 0, NOW())`,
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

    const created = await get('SELECT * FROM automations WHERE id = @id', { id })
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
router.post('/:id/toggle', async (req, res) => {
  try {
    const agencyId = req.user.agency_id
    const auto = await get('SELECT * FROM automations WHERE id = @id AND agency_id = @agency_id',
      { id: req.params.id, agency_id: agencyId })
    if (!auto) return res.status(404).json({ error: 'Automatización no encontrada.' })

    const newStatus = auto.is_active ? 0 : 1

    // Check quota if activating
    if (newStatus === true) {
      const planId = req.user?.plan_id || 'starter'
      const plan = PLANS[planId] || PLANS.starter
      const planLimit = plan.max_automations

      if (planLimit !== -1) {
        const row = await get("SELECT COUNT(*) as count FROM automations WHERE agency_id = @aid AND is_active = true", { aid: agencyId })
        const currentCount = row?.count || 0
        if (currentCount >= planLimit) {
          return res.status(402).json({
            error: `Has alcanzado el límite de ${limitLabel('automations', planId)} de tu plan`,
            code: 'QUOTA_EXCEEDED',
            current_plan: planId,
            upgrade_to: 'profesional',
            current: currentCount,
            limit: planLimit,
          })
        }
      }
    }

    await run('UPDATE automations SET is_active = @is_active, active = @active WHERE id = @id AND agency_id = @agency_id',
      { is_active: newStatus, active: newStatus, id: req.params.id, agency_id: agencyId })

    const updated = await get('SELECT * FROM automations WHERE id = @id AND agency_id = @agency_id',
      { id: req.params.id, agency_id: agencyId })
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

// PATCH /api/automations/:id - Update partial fields of an automation (e.g. is_active)
router.patch('/:id', validateBody(automationSchema.partial()), async (req, res) => {
  try {
    const agencyId = req.user.agency_id
    const auto = await get('SELECT * FROM automations WHERE id = @id AND agency_id = @agency_id',
      { id: req.params.id, agency_id: agencyId })
    if (!auto) return res.status(404).json({ error: 'Automatización no encontrada.' })

    const { is_active, name, description } = req.body

    // Check quota if attempting to activate
    if (is_active !== undefined && (is_active === true || is_active === true) && !auto.is_active) {
      const planId = req.user?.plan_id || 'starter'
      const plan = PLANS[planId] || PLANS.starter
      const planLimit = plan.max_automations

      if (planLimit !== -1) {
        const row = await get("SELECT COUNT(*) as count FROM automations WHERE agency_id = @aid AND is_active = true", { aid: agencyId })
        const currentCount = row?.count || 0
        if (currentCount >= planLimit) {
          return res.status(402).json({
            error: `Has alcanzado el límite de ${limitLabel('automations', planId)} de tu plan`,
            code: 'QUOTA_EXCEEDED',
            current_plan: planId,
            upgrade_to: 'profesional',
            current: currentCount,
            limit: planLimit,
          })
        }
      }
    }

    const updates = []
    const params = { id: req.params.id, agency_id: agencyId }

    if (is_active !== undefined) {
      updates.push('is_active = @is_active')
      updates.push('active = @active')
      params.is_active = is_active ? true : false
      params.active = is_active ? true : false
    }
    if (name !== undefined) {
      updates.push('name = @name')
      params.name = name
    }
    if (description !== undefined) {
      updates.push('description = @description')
      params.description = description
    }

    if (updates.length > 0) {
      await run(`UPDATE automations SET ${updates.join(', ')} WHERE id = @id AND agency_id = @agency_id`, params)
    }

    const updated = await get('SELECT * FROM automations WHERE id = @id AND agency_id = @agency_id',
      { id: req.params.id, agency_id: agencyId })
    res.json({
      ...updated,
      conditions: JSON.parse(updated.conditions || '[]'),
      actions: JSON.parse(updated.actions || '[]'),
      trigger_config: JSON.parse(updated.trigger_config || '{}'),
    })
  } catch (error) {
    console.error('Error updating automation (patch):', error)
    res.status(500).json({ error: error.message || 'Error al actualizar automatización.' })
  }
})

// POST /api/automations/trigger - Execute automations in background for a given trigger
router.post('/trigger', async (req, res) => {
  try {
    const { trigger_type, lead_id, agency_id, trigger_payload } = req.body
    const aid = agency_id || req.user?.agency_id
    if (!trigger_type || !lead_id) {
      return res.status(400).json({ error: 'trigger_type y lead_id son requeridos' })
    }

    const result = await triggerAutomations({ trigger_type, lead_id, agency_id: aid, trigger_payload })
    res.json(result)
  } catch (error) {
    console.error('Error executing automations in trigger:', error)
    res.status(500).json({ error: error.message || 'Error al ejecutar automatizaciones.' })
  }
})

// PUT /api/automations/:id - Update automation
router.put('/:id', validateBody(automationSchema.partial()), async (req, res) => {
  try {
    const agencyId = req.user.agency_id
    const auto = await get('SELECT * FROM automations WHERE id = @id AND agency_id = @agency_id',
      { id: req.params.id, agency_id: agencyId })
    if (!auto) return res.status(404).json({ error: 'Automatización no encontrada.' })

    const { name, description, trigger_type, trigger_config, conditions, actions, is_active } = req.body

    await run(
      `UPDATE automations SET
        name = @name, description = @description, trigger_type = @trigger_type,
        trigger_event = @trigger_type,
        trigger_config = @trigger_config, conditions = @conditions, actions = @actions,
        is_active = @is_active, active = @active
       WHERE id = @id AND agency_id = @agency_id`,
      {
        name: name || auto.name,
        description: description !== undefined ? description : auto.description,
        trigger_type: trigger_type || auto.trigger_type,
        trigger_config: JSON.stringify(trigger_config || JSON.parse(auto.trigger_config || '{}')),
        conditions: JSON.stringify(conditions || JSON.parse(auto.conditions || '[]')),
        actions: JSON.stringify(actions || JSON.parse(auto.actions || '[]')),
        is_active: is_active !== undefined ? (is_active ? true : false) : auto.is_active,
        active: is_active !== undefined ? (is_active ? true : false) : auto.is_active,
        id: req.params.id,
        agency_id: agencyId,
      }
    )

    const updated = await get('SELECT * FROM automations WHERE id = @id AND agency_id = @agency_id',
      { id: req.params.id, agency_id: agencyId })
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
router.delete('/:id', async (req, res) => {
  try {
    const agencyId = req.user.agency_id
    const auto = await get('SELECT * FROM automations WHERE id = @id AND agency_id = @agency_id',
      { id: req.params.id, agency_id: agencyId })
    if (!auto) return res.status(404).json({ error: 'Automatización no encontrada.' })

    await run('DELETE FROM automations WHERE id = @id AND agency_id = @agency_id',
      { id: req.params.id, agency_id: agencyId })
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
    const lead = await get('SELECT * FROM leads WHERE id = @id', { id: lead_id })
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
    const automations = await all(
      'SELECT * FROM automations WHERE agency_id = @agency_id AND is_active = true AND trigger_type = @trigger_type',
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
      await run('UPDATE automations SET run_count = COALESCE(run_count, 0) + 1, last_run_at = NOW() WHERE id = @id',
        { id: auto.id })

      // Log activity
      await run(
        `INSERT INTO activities (id, agency_id, lead_id, type, description, metadata, created_at)
         VALUES (@id, @agency_id, @lead_id, @type, @description, @metadata, NOW())`,
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
        await run(
          `INSERT INTO automation_logs (id, automation_id, lead_id, agency_id, status, actions_executed, created_at)
           VALUES (@id, @automation_id, @lead_id, @agency_id, @status, @actions_executed, NOW())`,
          {
            id: uuidv4(),
            automation_id: auto.id,
            lead_id,
            agency_id: agencyId,
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

// GET /api/automations/templates - Get premium automation templates
router.get('/templates', async (req, res) => {
  try {
    const { N8N_AUTOMATIONS, BLOCKS } = await import('../services/seed-automations.js')
    const agencyId = req.user.agency_id

    const existing = new Set(
      await all('SELECT name FROM automations WHERE agency_id = @aid', { aid: agencyId })
        .map(a => a.name)
    )

    // Assign automations to blocks by index ranges matching seed-automations.js order
    const blockSizes = [5, 7, 6, 6, 6, 5]
    let cursor = 0
    const result = BLOCKS.map((block, bi) => {
      const size = blockSizes[bi] || 0
      const automations = N8N_AUTOMATIONS.slice(cursor, cursor + size).map(a => ({
        id: a.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
        name: a.name,
        description: a.description,
        trigger_type: a.trigger_type,
        actions: JSON.parse(a.actions),
        installed: existing.has(a.name),
      }))
      cursor += size
      return { ...block, automations }
    })

    res.json(result)
  } catch (error) {
    console.error('Error listing templates:', error)
    res.status(500).json({ error: 'Error al obtener plantillas' })
  }
})

// POST /api/automations/install-template - Install a template by name
router.post('/install-template', checkLimit('automations'), async (req, res) => {
  try {
    const agencyId = req.user.agency_id
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'name requerido' })

    const existing = await get('SELECT id FROM automations WHERE agency_id = @aid AND name = @name', { aid: agencyId, name })
    if (existing) return res.status(409).json({ error: 'Ya existe' })

    const { N8N_AUTOMATIONS } = await import('../services/seed-automations.js')
    const template = N8N_AUTOMATIONS.find(a => a.name === name)
    if (!template) return res.status(404).json({ error: 'Plantilla no encontrada' })

    const id = uuidv4()
    const templateId = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
    await run(
      `INSERT INTO automations (id, agency_id, name, description, is_active, active, trigger_type, trigger_event, trigger_config, conditions, actions, run_count, created_at, template_id)
       VALUES (@id, @agency_id, @name, @description, 1, 1, @trigger_type, @trigger_type, @trigger_config, @conditions, @actions, 0, NOW(), @template_id)`,
      {
        id, agency_id: agencyId,
        name: template.name, description: template.description,
        trigger_type: template.trigger_type,
        trigger_config: template.trigger_config,
        conditions: template.conditions,
        actions: template.actions,
        template_id: templateId,
      }
    )

    const created = await get('SELECT * FROM automations WHERE id = @id', { id })
    res.json({
      ...created,
      conditions: JSON.parse(created.conditions || '[]'),
      actions: JSON.parse(created.actions || '[]'),
      trigger_config: JSON.parse(created.trigger_config || '{}'),
    })
  } catch (error) {
    console.error('Error installing template:', error)
    res.status(500).json({ error: error.message || 'Error al instalar plantilla' })
  }
})

// POST /api/automations/test - Test an automation without persisting
router.post('/test', async (req, res) => {
  try {
    const { automation, lead_id, lead_data } = req.body
    if (!automation || !lead_id) {
      return res.status(400).json({ error: 'automation y lead_id son requeridos' })
    }

    const lead = await get('SELECT * FROM leads WHERE id = @id', { id: lead_id })
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
