import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { all, get, run } from '../db/db.js'
import { auth } from '../middleware/auth.js'
import { AGENT_META } from '../agents/index.js'

const router = Router()
router.use(auth)

const AGENT_TYPES = [
  'captador', 'vendedor', 'coordinador', 'copywriter',
  'tasador', 'analista', 'agendador', 'nurturing',
  'documentador', 'seo', 'financiero', 'notificador',
]

const ACTION_TEXTS = {
  captador: 'Cualificó un lead',
  vendedor: 'Envió mensaje de seguimiento',
  coordinador: 'Asignó lead al equipo',
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

function getDefaultAgents(agencyId) {
  const now = new Date().toISOString()
  return AGENT_TYPES.map(type => ({
    id: uuidv4(),
    agency_id: agencyId,
    type,
    name: AGENT_META[type]?.name || type,
    is_active: ['captador', 'vendedor', 'coordinador'].includes(type) ? 1 : 0,
    status: ['captador', 'vendedor', 'coordinador'].includes(type) ? 'active' : 'inactive',
    stats: JSON.stringify({ leads_today: 0, messages_today: 0, success_rate: null, last_action: null, last_action_at: null }),
    created_at: now,
    updated_at: now,
  }))
}

// GET /api/ai-agents - List AI agents with live metrics
router.get('/', (req, res) => {
  try {
    const agencyId = req.user.agency_id

    let agents = all('SELECT * FROM ai_agents WHERE agency_id = @agency_id ORDER BY created_at ASC', { agency_id: agencyId })

    // Auto-create default agents if none exist
    if (!agents || agents.length === 0) {
      const defaults = getDefaultAgents(agencyId)
      for (const agent of defaults) {
        run(
          `INSERT INTO ai_agents (id, agency_id, type, name, is_active, status, stats, created_at, updated_at)
           VALUES (@id, @agency_id, @type, @name, @is_active, @status, @stats, @created_at, @updated_at)`,
          agent
        )
      }
      agents = defaults
    }

    // Enrich with live metrics from today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString()

    const enriched = agents.map(a => {
      const rawStats = a.stats ? (() => { try { return JSON.parse(a.stats) } catch { return null } })() : null

      const todayActivities = all(
        `SELECT id, lead_id, created_at FROM activities
         WHERE agency_id = @agency_id AND agent_type = @agent_type AND created_at >= @today`,
        { agency_id: agencyId, agent_type: a.type, today: todayStr }
      )

      const leadsToday = new Set(todayActivities.map(ta => ta.lead_id).filter(Boolean)).size
      const actCount = todayActivities.length
      const lastActivity = actCount > 0 ? todayActivities[actCount - 1] : null

      const messagesTodayRes = all(
        `SELECT COUNT(*) as count FROM messages
         WHERE agency_id = @agency_id AND sender_id = @sender_id AND created_at >= @today`,
        { agency_id: agencyId, sender_id: a.type, today: todayStr }
      )

      const successRateRes = all(
        `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful
         FROM automation_logs
         WHERE agency_id = @agency_id AND created_at >= @today`,
        { agency_id: agencyId, today: todayStr }
      )

      const totalLogs = successRateRes[0]?.total || 0
      const successfulLogs = successRateRes[0]?.successful || 0
      const successRate = totalLogs > 0 ? Math.round((successfulLogs / totalLogs) * 100) : null

      return {
        ...a,
        stats: {
          leads_today: leadsToday,
          messages_today: messagesTodayRes[0]?.count || 0,
          success_rate: successRate,
          last_action: lastActivity ? (ACTION_TEXTS[a.type] || 'Ejecutó acción') : (rawStats?.last_action || null),
          last_action_at: lastActivity?.created_at || rawStats?.last_action_at || null,
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
    console.error('Error listing AI agents:', error)
    res.status(500).json({ error: 'Error al obtener agentes IA.' })
  }
})

export default router
