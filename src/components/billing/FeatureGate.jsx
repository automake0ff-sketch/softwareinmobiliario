import { useFeatureAccess, useUserPlan } from '../../lib/plan-guard'
import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'

export function FeatureGate({ feature, children, fallback }) {
  const { allowed, reason, upgradeUrl } = useFeatureAccess(feature)

  if (allowed) return <>{children}</>

  if (fallback) return <>{fallback}</>

  return (
    <div className="flex flex-col items-center justify-center h-64 text-center p-8">
      <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 flex items-center justify-center mb-4">
        <Lock size={24} className="text-indigo-400" />
      </div>
      <h3 className="text-white font-semibold text-lg mb-2">Función bloqueada</h3>
      <p className="text-white/50 text-sm mb-6 max-w-sm">{reason}</p>
      <Link
        to={upgradeUrl}
        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors"
      >
        Ver planes →
      </Link>
    </div>
  )
}

export function PlanBadge({ requiredPlan }) {
  const colors = {
    starter: 'bg-slate-600',
    profesional: 'bg-indigo-600',
    agencia: 'bg-amber-600',
  }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full text-white font-medium ${
      colors[requiredPlan] || 'bg-slate-600'
    }`}>
      {requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)}
    </span>
  )
}

export function UpgradeLink({ feature, children }) {
  const { allowed, upgradeUrl } = useFeatureAccess(feature)
  if (allowed) return <>{children}</>
  return (
    <Link
      to={upgradeUrl}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20 rounded-lg text-xs font-medium transition-colors"
    >
      <Lock size={12} />
      {feature === 'fullAnalytics' ? 'Requiere Profesional' :
       feature === 'whiteLabel' ? 'Requiere Agencia' :
       `Requiere ${feature.charAt(0).toUpperCase() + feature.slice(1)}`}
    </Link>
  )
}
