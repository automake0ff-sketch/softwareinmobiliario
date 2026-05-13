import { useStore, PLAN_ORDER, FEATURE_PLAN_MAP } from './store'

export function planIncludes(userPlan, requiredPlan) {
  return PLAN_ORDER[userPlan] >= PLAN_ORDER[requiredPlan]
}

export function useFeatureAccess(feature) {
  const subscription = useStore(s => s.subscription)
  const userPlan = subscription?.planId || 'starter'

  const required = FEATURE_PLAN_MAP[feature]
  if (!required) return { allowed: true, reason: '', upgradeUrl: '' }

  const allowed = planIncludes(userPlan, required)
  return {
    allowed,
    reason: allowed ? '' : `Esta función requiere el plan ${required.charAt(0).toUpperCase() + required.slice(1)}`,
    upgradeUrl: `/pricing?upgrade=${required}`,
  }
}

export function useUserPlan() {
  const subscription = useStore(s => s.subscription)
  const userPlan = subscription?.planId || 'starter'
  const status = subscription?.status || 'inactive'

  return {
    plan: userPlan,
    status,
    isActive: status === 'active' || status === 'trialing',
    planName: subscription?.planName || 'Starter',
    features: subscription?.features || {},
    limits: subscription?.limits || {},
  }
}
