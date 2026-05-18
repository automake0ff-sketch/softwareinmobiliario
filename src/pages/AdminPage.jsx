import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Users, Building2, TrendingUp, Activity, Zap, BarChart3, DollarSign, Clock, PhoneCall, MessageCircle, Shield } from 'lucide-react'
import api from '../lib/api'
import { useStore } from '../lib/store'

export default function AdminPage() {
  const [metrics, setMetrics] = useState(null)
  const [agencies, setAgencies] = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useStore()

  const isSuperAdmin = user?.role === 'super_admin'

  useEffect(() => {
    Promise.all([
      api.get('/admin/metrics'),
      api.get('/admin/agencies'),
    ]).then(([m, a]) => {
      setMetrics(m)
      setAgencies(a)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-medium text-white">Panel de Administración</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse border border-white/5" />
          ))}
        </div>
      </div>
    )
  }

  const cards = [
    { label: 'Agencias totales', value: metrics?.totalAgencies || 0, icon: Building2, color: 'from-indigo-500 to-purple-600' },
    { label: 'Agencias activas', value: metrics?.activeAgencies || 0, icon: Activity, color: 'from-emerald-500 to-teal-600' },
    { label: 'En trial', value: metrics?.trialAgencies || 0, icon: Clock, color: 'from-amber-500 to-orange-600' },
    { label: 'Canceladas', value: metrics?.canceledAgencies || 0, icon: Shield, color: 'from-red-500 to-rose-600' },
    { label: 'Nuevas esta semana', value: metrics?.newThisWeek || 0, icon: TrendingUp, color: 'from-blue-500 to-cyan-600' },
    { label: 'MRR', value: metrics?.mrr ? `${metrics.mrr}€` : '0€', icon: DollarSign, color: 'from-emerald-500 to-green-600' },
    { label: 'Total leads', value: metrics?.leadsTotal || 0, icon: Users, color: 'from-violet-500 to-purple-600' },
    { label: 'Leads hoy', value: metrics?.leadsToday || 0, icon: Zap, color: 'from-rose-500 to-pink-600' },
    { label: 'Usuarios', value: metrics?.usersTotal || 0, icon: BarChart3, color: 'from-sky-500 to-blue-600' },
    { label: 'Conversaciones hoy', value: metrics?.conversationsToday || 0, icon: MessageCircle, color: 'from-teal-500 to-cyan-600' },
    { label: 'Automatizaciones hoy', value: metrics?.automationsToday || 0, icon: Activity, color: 'from-green-500 to-emerald-600' },
    { label: 'Acciones IA hoy', value: metrics?.aiActionsToday || 0, icon: PhoneCall, color: 'from-orange-500 to-amber-600' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium text-white">Panel de Administración</h1>
        <p className="text-white/40 text-sm mt-1">Métricas globales del SaaS — PropIA</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white/5 border border-white/10 rounded-xl p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-white/40 text-xs font-medium uppercase tracking-wider">{card.label}</span>
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center`}>
                <card.icon size={16} className="text-white" />
              </div>
            </div>
            <p className="text-2xl font-bold text-white">{card.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h2 className="text-white font-medium mb-4">Distribución de planes</h2>
          <div className="space-y-3">
            {[
              { plan: 'Starter', count: metrics?.planStarter || 0, color: 'bg-slate-400' },
              { plan: 'Profesional', count: metrics?.planProfesional || 0, color: 'bg-indigo-400' },
              { plan: 'Agencia', count: metrics?.planAgencia || 0, color: 'bg-amber-400' },
            ].map((p) => {
              const total = (metrics?.planStarter || 0) + (metrics?.planProfesional || 0) + (metrics?.planAgencia || 0)
              const pct = total > 0 ? ((p.count / total) * 100).toFixed(1) : 0
              return (
                <div key={p.plan}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white/70">{p.plan}</span>
                    <span className="text-white/50">{p.count} ({pct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full ${p.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h2 className="text-white font-medium mb-4">Plantillas más instaladas</h2>
          <div className="space-y-2">
            {(metrics?.topTemplates || []).slice(0, 8).map((t, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-white/70 truncate flex-1">{t.name}</span>
                <span className="text-white/40 ml-2">{t.installs} inst.</span>
              </div>
            ))}
            {(!metrics?.topTemplates || metrics.topTemplates.length === 0) && (
              <p className="text-white/30 text-sm">Sin datos todavía</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h2 className="text-white font-medium mb-4">Agencias registradas</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-xs uppercase tracking-wider border-b border-white/10">
                <th className="text-left py-3 pr-4">Agencia</th>
                <th className="text-left py-3 pr-4">Plan</th>
                <th className="text-left py-3 pr-4">Ciudad</th>
                <th className="text-left py-3 pr-4">Usuarios</th>
                <th className="text-left py-3 pr-4">Leads</th>
                <th className="text-left py-3 pr-4">Onboarding</th>
                <th className="text-left py-3 pr-4">Registro</th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((a, i) => (
                <tr key={a.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 pr-4 text-white">{a.name}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      a.plan === 'agencia' ? 'text-amber-300 bg-amber-300/10' :
                      a.plan === 'profesional' ? 'text-indigo-300 bg-indigo-300/10' :
                      'text-white/50 bg-white/10'
                    }`}>{a.plan}</span>
                  </td>
                  <td className="py-3 pr-4 text-white/50">{a.city || '-'}</td>
                  <td className="py-3 pr-4 text-white/50">{a.user_count || 0}</td>
                  <td className="py-3 pr-4 text-white/50">{a.lead_count || 0}</td>
                  <td className="py-3 pr-4">
                    <span className={a.onboarding_completed ? 'text-emerald-400' : 'text-amber-400'}>
                      {a.onboarding_completed ? '✓ Completo' : 'Pendiente'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-white/30 text-xs">
                    {a.created_at ? new Date(a.created_at).toLocaleDateString('es-ES') : '-'}
                  </td>
                </tr>
              ))}
              {agencies.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-white/30">No hay agencias registradas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
