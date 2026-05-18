import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { PLANS } from '../../lib/billing/plans'

export function UpgradeModal({ reason, currentPlan, upgradeTo, onClose }) {
  const plan = PLANS[upgradeTo]
  if (!plan) return null

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#13131F] border border-indigo-500/30 rounded-2xl w-full max-w-md p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 flex items-center justify-center mx-auto mb-5">
          <span className="text-3xl">🚀</span>
        </div>

        <h2 className="text-white font-bold text-xl mb-2">Actualiza tu plan</h2>
        <p className="text-white/50 text-sm mb-6 leading-relaxed">{reason}</p>

        <div className="bg-white/5 rounded-xl p-5 mb-6 text-left">
          <p className="text-white font-semibold mb-3">Plan {plan.name} incluye:</p>
          <ul className="space-y-2">
            {Object.entries(plan.features)
              .filter(([_, v]) => v)
              .slice(0, 6)
              .map(([k]) => (
                <li key={k} className="flex items-center gap-2 text-sm text-white/70">
                  <span className="text-emerald-400">✓</span>
                  {k.replace(/_/g, ' ')}
                </li>
              ))}
          </ul>
        </div>

        <div className="space-y-3">
          <Link
            to={`/pricing?upgrade=${upgradeTo}`}
            onClick={onClose}
            className="block w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
          >
            Ver plan {plan.name} — desde {plan.price_monthly}€/mes
          </Link>
          <button onClick={onClose}
            className="block w-full py-2.5 text-white/40 hover:text-white/70 text-sm transition-colors">
            Ahora no
          </button>
        </div>
      </div>
    </div>
  )
}

// Hook para interceptar 402 y mostrar modal automáticamente
export function useUpgradeInterceptor() {
  const [modal, setModal] = useState(null)

  const clearModal = useCallback(() => setModal(null), [])

  // Envuelve fetch para interceptar 402
  const planFetch = useCallback(async (url, options) => {
    const res = await fetch(url, options)
    if (res.status === 402) {
      try {
        const data = await res.json()
        setModal({
          reason: data.error,
          currentPlan: data.current_plan || 'starter',
          upgradeTo: data.upgrade_to || 'profesional',
        })
      } catch {}
    }
    return res
  }, [])

  // Envuelve api.post para interceptar 402
  const planPost = useCallback(async (apiInstance, endpoint, data) => {
    try {
      return await apiInstance.post(endpoint, data)
    } catch (err) {
      if (err.status === 402 && err.body) {
        setModal({
          reason: err.body.error || 'Función no disponible en tu plan',
          currentPlan: err.body.current_plan || 'starter',
          upgradeTo: err.body.upgrade_to || 'profesional',
        })
      }
      throw err
    }
  }, [])

  return {
    planFetch,
    planPost,
    upgradeModal: modal ? (
      <UpgradeModal {...modal} onClose={clearModal} />
    ) : null,
  }
}
