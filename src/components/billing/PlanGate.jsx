import { usePlan } from '../../hooks/usePlan'
import { upgradeMessage } from '../../lib/billing/plans'
import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'

export function PlanGate({ feature, children, fallback, inline }) {
  const { can, upgradeUrl } = usePlan()

  if (can(feature)) return <>{children}</>
  if (fallback) return <>{fallback}</>

  const url = upgradeUrl(feature)

  if (inline) {
    return (
      <div className="relative group cursor-not-allowed" title="Requiere plan superior">
        <div className="pointer-events-none opacity-40 select-none">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Link
            to={url}
            className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium pointer-events-auto"
          >
            Actualizar plan
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-8">
      <div className="w-16 h-16 rounded-2xl bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center mb-5">
        <Lock size={24} className="text-indigo-400" />
      </div>
      <h3 className="text-white font-semibold text-lg mb-2">Función bloqueada</h3>
      <p className="text-white/50 text-sm mb-6 max-w-xs leading-relaxed">
        Esta función no está incluida en tu plan actual.
      </p>
      <Link
        to={url}
        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors"
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
      {requiredPlan?.charAt(0).toUpperCase() + requiredPlan?.slice(1)}
    </span>
  )
}

export function UpgradeLink({ feature, children }) {
  const { can, upgradeUrl } = usePlan()
  if (can(feature)) return <>{children}</>
  return (
    <Link
      to={upgradeUrl(feature)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20 rounded-lg text-xs font-medium transition-colors"
    >
      <Lock size={12} />
      {feature === 'analytics_advanced' ? 'Requiere Profesional' :
       feature === 'white_label' ? 'Requiere Agencia' :
       `Requiere ${feature.replace(/_/g, ' ')}`}
    </Link>
  )
}
