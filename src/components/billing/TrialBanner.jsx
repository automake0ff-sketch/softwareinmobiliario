import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, AlertTriangle } from 'lucide-react'
import api from '../../lib/api'
import { TRIAL_DISCOUNT_PCT } from '../../lib/billing/plans'

// Banner de la demo gratuita: días restantes y, al caducar, llamada a suscribirse con descuento.
export function TrialBanner() {
  const [info, setInfo] = useState(null)

  useEffect(() => {
    let alive = true
    api.get('/billing/subscription')
      .then((d) => { if (alive) setInfo(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  if (!info) return null
  const end = info.trialEnd ? new Date(info.trialEnd) : null

  if (info.status === 'trial_expired') {
    return (
      <div className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#FECACA]">
        <AlertTriangle size={18} />
        <span className="flex-1">Tu demo de 3 días ha terminado. Suscríbete ahora con un {TRIAL_DISCOUNT_PCT}% de descuento.</span>
        <Link to="/pricing" className="rounded-lg bg-[#EF4444] px-3 py-1.5 font-semibold text-white">Ver planes</Link>
      </div>
    )
  }

  if (info.status === 'trialing' && end && !Number.isNaN(end.getTime())) {
    const ms = end.getTime() - Date.now()
    const days = Math.max(0, Math.ceil(ms / 86400000))
    const label = days <= 1 ? 'Te queda menos de 1 día' : `Te quedan ${days} días`
    return (
      <div className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100">
        <Clock size={18} />
        <span className="flex-1">Demo gratuita: {label}. Al terminar, suscríbete con un {TRIAL_DISCOUNT_PCT}% de descuento.</span>
        <Link to="/pricing" className="rounded-lg bg-indigo-500 px-3 py-1.5 font-semibold text-white">Ver planes</Link>
      </div>
    )
  }
  return null
}
