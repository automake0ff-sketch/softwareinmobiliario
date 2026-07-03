// Middleware de comprobación de plan para Express
// Cada endpoint llama a checkFeature/checkLimit/checkAgentAccess antes de ejecutar

import { PLANS, PLAN_RANK, planIncludes, minPlanForFeature, upgradeMessage, limitLabel } from './plans.js'

function getAgencyPlan(req) {
  const agencyId = req.user?.agency_id || req.headers['x-auth-agency']
  const planId = req.user?.plan_id || 'starter'
  const planStatus = req.user?.plan_status || 'active'
  return { agencyId, planId, planStatus }
}

function make402(res, { error, code, current_plan, upgrade_to, current, limit }) {
  return res.status(402).json({
    error,
    code: code || 'PLAN_LIMIT',
    current_plan: current_plan || 'starter',
    upgrade_to: upgrade_to || 'profesional',
    upgrade_url: `/pricing?upgrade=${upgrade_to || 'profesional'}`,
    current,
    limit,
  })
}

// ── checkFeature(feature) ──────────────────────────────────────────
// Bloquea si el plan del usuario no incluye esa feature booleana
export function checkFeature(feature) {
  return (req, res, next) => {
    const { planId } = getAgencyPlan(req)
    const plan = PLANS[planId]
    if (!plan || !plan.features[feature]) {
      const needed = minPlanForFeature(feature)
      return make402(res, {
        error: upgradeMessage(feature, planId),
        code: 'FEATURE_LOCKED',
        current_plan: planId,
        upgrade_to: needed,
      })
    }
    next()
  }
}

// ── checkLimit(type) ───────────────────────────────────────────────
// Bloquea si el plan ha excedido un límite numérico
// type: 'leads' | 'users' | 'offices' | 'agents' | 'automations'
export function checkLimit(type) {
  return async (req, res, next) => {
    try {
      const { agencyId, planId } = getAgencyPlan(req)
      if (!agencyId) return next()

      const plan = PLANS[planId] || PLANS.starter

      const limitMap = {
        leads: 'max_leads_per_month',
        users: 'max_users',
        offices: 'max_offices',
        agents: 'max_agents',
        automations: 'max_automations',
      }
      const planLimitKey = limitMap[type]
      const planLimit = plan[planLimitKey]
      if (planLimit === -1) return next() // ilimitado

      const { all, get } = await import('../db/db.js')
      let currentCount = 0

      if (type === 'leads') {
        const row = await get("SELECT COUNT(*) as count FROM leads WHERE agency_id = @aid AND created_at >= date('now', 'start of month')", { aid: agencyId })
        currentCount = row?.count || 0
      } else if (type === 'users') {
        const row = await get("SELECT COUNT(*) as count FROM users WHERE agency_id = @aid AND active = 1", { aid: agencyId })
        currentCount = row?.count || 0
      } else if (type === 'offices') {
        const row = await get("SELECT COUNT(*) as count FROM offices WHERE agency_id = @aid", { aid: agencyId })
        currentCount = row?.count || 0
      } else if (type === 'agents') {
        const row = await get("SELECT COUNT(*) as count FROM ai_agents WHERE agency_id = @aid AND status = 'active'", { aid: agencyId })
        currentCount = row?.count || 0
      } else if (type === 'automations') {
        const row = await get("SELECT COUNT(*) as count FROM automations WHERE agency_id = @aid AND is_active = 1", { aid: agencyId })
        currentCount = row?.count || 0
      }

      if (currentCount >= planLimit) {
        return make402(res, {
          error: `Has alcanzado el límite de ${limitLabel(type, planId)} de tu plan`,
          code: 'QUOTA_EXCEEDED',
          current_plan: planId,
          upgrade_to: planId === 'starter' ? 'profesional' : 'agencia',
          current: currentCount,
          limit: planLimit,
        })
      }

      next()
    } catch (e) {
      console.error('[PlanChecker] Error:', e.message)
      next()
    }
  }
}

// ── checkAgentAccess(agentType) ────────────────────────────────────
// Bloquea si el tipo de agente no está en el plan del usuario
export async function checkAgentAccessMiddleware(req, res, next) {
  try {
    const { planId } = getAgencyPlan(req)
    const agentType = req.params.type || req.body.agentType
    if (!agentType) return next()

    const plan = PLANS[planId] || PLANS.starter
    const available = plan.available_agents || []
    if (!available.includes(agentType)) {
      const needed = Object.entries(PLANS).find(([_, p]) =>
        (p.available_agents || []).includes(agentType)
      )?.[0] || 'agencia'
      return make402(res, {
        error: `El agente "${agentType}" está disponible desde el plan ${PLANS[needed]?.name || 'Agencia'}`,
        code: 'AGENT_LOCKED',
        current_plan: planId,
        upgrade_to: needed,
      })
    }
    next()
  } catch (e) {
    console.error('[PlanChecker] Agent check error:', e.message)
    next()
  }
}
