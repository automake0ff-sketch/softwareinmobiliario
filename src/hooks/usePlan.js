import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'
import { PLANS } from '../lib/billing/plans'

export function usePlan() {
  const [plan, setPlan] = useState(null)
  const [status, setStatus] = useState(null)
  const [usage, setUsage] = useState({
    leads_this_month: 0, leads_limit: 500, leads_pct: 0,
    users_active: 0, users_limit: 5,
    offices_active: 0, offices_limit: 1,
    agents_active: 0, agents_limit: 3,
    automations_active: 0, automations_limit: 10,
  })
  const [features, setFeatures] = useState({})
  const [availableAgents, setAvailableAgents] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.get('/billing/status')
      setPlan(data.plan)
      setStatus(data.status)
      setFeatures(data.features || {})
      setAvailableAgents(data.available_agents || [])
      setUsage(data.usage || usage)
    } catch {
      // fallback a starter
      setPlan('starter')
      setStatus('inactive')
      setFeatures(PLANS.starter.features)
      setAvailableAgents(PLANS.starter.available_agents)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const can = useCallback((feature) => {
    if (!plan) return false
    if (features[feature] === true) return true
    if (features[feature] === false) return false
    return PLANS[plan]?.features[feature] ?? false
  }, [plan, features])

  const hasCapacity = useCallback((type, currentOverride) => {
    if (!plan) return false
    const planDef = PLANS[plan]
    if (!planDef) return false
    const maxMap = {
      leads: planDef.max_leads_per_month,
      users: planDef.max_users,
      offices: planDef.max_offices,
      agents: planDef.max_agents,
      automations: planDef.max_automations,
    }
    const max = maxMap[type]
    if (max === -1) return true
    const current = currentOverride ?? usage[`${type}_active`] ?? 0
    return current < max
  }, [plan, usage])

  const isAgentAvailable = useCallback((agentType) => {
    if (availableAgents.includes(agentType)) return true
    if (!plan) return false
    return (PLANS[plan]?.available_agents || []).includes(agentType)
  }, [plan, availableAgents])

  const upgradeUrl = useCallback((feature) => {
    const needed = Object.entries(PLANS).find(([_, p]) => p.features[feature])?.[0]
    return `/pricing?upgrade=${needed || 'profesional'}`
  }, [])

  return {
    plan,
    status,
    loading,
    usage,
    features,
    availableAgents,
    can,
    hasCapacity,
    isAgentAvailable,
    upgradeUrl,
    refresh: fetchStatus,
  }
}
