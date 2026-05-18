import { Link } from 'react-router-dom'
import { usePlan } from '../../hooks/usePlan'

export function UsageBanner() {
  const { plan, usage, status, loading } = usePlan()
  if (loading || !plan) return null

  const showTrialBanner = status === 'trialing'
  const nearLeadsLimit = usage.leads_pct >= 80
  const atLeadsLimit = usage.leads_pct >= 100

  if (!showTrialBanner && !nearLeadsLimit) return null

  const isWarning = atLeadsLimit ? 'red' : nearLeadsLimit ? 'amber' : 'indigo'

  const colors = {
    red: 'bg-red-500/10 border-red-500/30 text-red-300',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    indigo: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
  }

  return (
    <div className={`mx-6 mt-4 rounded-xl border px-4 py-3 flex items-center justify-between text-sm ${colors[isWarning]}`}>
      <span>
        {atLeadsLimit
          ? `⚠️ Has alcanzado el límite de ${usage.leads_limit} leads/mes de tu plan`
          : nearLeadsLimit
          ? `⚡ ${usage.leads_this_month} de ${usage.leads_limit} leads usados este mes (${usage.leads_pct}%)`
          : `🎁 Estás en período de prueba`
        }
      </span>
      <Link to="/pricing" className="font-semibold underline ml-4 whitespace-nowrap shrink-0">
        {atLeadsLimit ? 'Ampliar plan' : 'Ver planes'}
      </Link>
    </div>
  )
}
