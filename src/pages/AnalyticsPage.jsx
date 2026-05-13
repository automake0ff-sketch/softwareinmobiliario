import { motion } from 'framer-motion'
import { useState } from 'react'
import {
  BarChart3, TrendingUp, Target, Clock, Users,
  Home, MapPin, ArrowUpRight, Zap, Globe,
  BarChart as BarChartIcon, PieChart,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell, AreaChart, Area,
  LineChart, Line,
} from 'recharts'

const periods = [
  { value: 'month', label: 'Este mes' },
  { value: 'week', label: 'Esta semana' },
  { value: 'today', label: 'Hoy' },
]

const funnelStages = [
  { name: 'Impresiones', value: 2840, color: '#dce8fd' },
  { name: 'Visitas', value: 1240, color: '#b0c8fa' },
  { name: 'Leads', value: 384, color: '#5b8afb' },
  { name: 'Contactados', value: 210, color: '#2d64f5' },
  { name: 'Calificados', value: 98, color: '#1849c6' },
  { name: 'Propuesta', value: 52, color: '#1237a0' },
  { name: 'Cerrados', value: 28, color: '#0e2a7a' },
]

const conversionRates = [
  { from: 'Visitas → Leads', rate: '31.0%' },
  { from: 'Leads → Contactados', rate: '54.7%' },
  { from: 'Contactados → Calificados', rate: '46.7%' },
  { from: 'Calificados → Propuesta', rate: '53.1%' },
  { from: 'Propuesta → Cerrados', rate: '53.8%' },
]

const agentData = [
  { name: 'Elena Martinez', leads: 42, visits: 18, closures: 7, rate: '16.7%' },
  { name: 'Carlos Ruiz', leads: 38, visits: 22, closures: 9, rate: '23.7%' },
  { name: 'Laura Gomez', leads: 29, visits: 15, closures: 5, rate: '17.2%' },
  { name: 'Pedro Sanchez', leads: 34, visits: 12, closures: 4, rate: '11.8%' },
  { name: 'Ana Torres', leads: 47, visits: 25, closures: 11, rate: '23.4%' },
]

const marketInsights = [
  {
    title: 'Mejores Zonas',
    icon: MapPin,
    color: 'text-blue-400 bg-blue-500/10',
    items: [
      { label: 'Salamanca', value: '+24% demanda' },
      { label: 'Chamberi', value: '+18% precio' },
      { label: 'Retiro', value: '+15% interes' },
    ]
  },
  {
    title: 'Tendencias Precio',
    icon: TrendingUp,
    color: 'text-ok bg-ok/10',
    items: [
      { label: 'Precio medio m2', value: '3.450 €' },
      { label: 'Variacion mensual', value: '+2.3%' },
      { label: 'Variacion anual', value: '+8.7%' },
    ]
  },
  {
    title: 'Oportunidades',
    icon: Zap,
    color: 'text-amber bg-amber/10',
    items: [
      { label: 'Leads sin asignar', value: '14' },
      { label: 'Prop. sin visitar', value: '23' },
      { label: 'Seguimientos pend.', value: '31' },
    ]
  },
]

const leadSources = [
  { name: 'WhatsApp', value: 35, color: '#156840' },
  { name: 'Web', value: 22, color: '#5b8afb' },
  { name: 'Idealista', value: 18, color: '#e8b84b' },
  { name: 'Meta Ads', value: 14, color: '#1849c6' },
  { name: 'Email', value: 7, color: '#737680' },
  { name: 'Manual', value: 4, color: '#a8aab5' },
]

const kpiData = [
  { label: 'Total leads', value: '847', change: '+12.3%', trend: 'up', icon: Users, color: 'text-blue-400 bg-blue-500/10' },
  { label: 'Tasa cierre', value: '12.5%', change: '+2.1pp', trend: 'up', icon: Target, color: 'text-ok bg-ok/10' },
  { label: 'Score promedio', value: '76', change: '+4pts', trend: 'up', icon: BarChart3, color: 'text-purple-400 bg-purple-500/10' },
  { label: 'Tiempo medio cierre', value: '18 dias', change: '-2d', trend: 'down', icon: Clock, color: 'text-amber bg-amber/10' },
]

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface px-3 py-2 rounded-lg border border-border-secondary shadow-elevated text-xs">
        <p className="font-semibold text-ink mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} className="flex items-center gap-2 py-0.5" style={{ color: p.color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span>{p.name}: {p.value}</span>
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('month')

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shadow-sm">
            <BarChart3 size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink font-syne">Analytics</h1>
            <p className="text-sm text-muted">Metricas y rendimiento de la agencia</p>
          </div>
        </div>
        <div className="flex items-center gap-1 p-1 bg-surface2 rounded-lg">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                period === p.value
                  ? 'bg-indigo-500 text-white shadow-glow border border-indigo-400/20'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* KPI Row */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {kpiData.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            className="bg-surface rounded-xl border border-border-secondary shadow-card p-5 hover:shadow-glow transition-all duration-300"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-xl ${kpi.color} flex items-center justify-center`}>
                <kpi.icon size={18} />
              </div>
              <span className={`text-xs font-medium flex items-center gap-0.5 ${
                kpi.trend === 'up' ? 'text-ok' : 'text-err'
              }`}>
                {kpi.trend === 'up' ? <ArrowUpRight size={12} /> : <ArrowUpRight size={12} className="rotate-180" />}
                {kpi.change}
              </span>
            </div>
            <div className="text-2xl font-bold text-ink font-syne">{kpi.value}</div>
            <div className="text-xs text-muted mt-0.5">{kpi.label}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Pipeline Funnel + Conversion Rates */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-surface rounded-xl border border-border-secondary shadow-card p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-ink font-syne">Embudos de Conversion</h3>
              <p className="text-xs text-muted">Distribucion por etapa del pipeline</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelStages} layout="vertical" barCategoryGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" strokeOpacity={0.5} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#737680' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#737680' }} axisLine={false} tickLine={false} width={90} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
                  {funnelStages.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-surface rounded-xl border border-border-secondary shadow-card p-5"
        >
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-ink font-syne">Tasas de Conversion</h3>
            <p className="text-xs text-muted">Entre etapas del pipeline</p>
          </div>
          <div className="space-y-4">
            {conversionRates.map((cr, i) => (
              <div key={cr.from}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted">{cr.from}</span>
                  <span className="text-xs font-semibold text-ink">{cr.rate}</span>
                </div>
                <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: cr.rate }}
                    transition={{ duration: 0.8, delay: i * 0.1, ease: 'easeOut' }}
                    className="h-full rounded-full bg-blue-400"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-border-secondary">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Conversion global</span>
              <span className="text-sm font-bold text-ink font-syne">12.5%</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-ok">
              <ArrowUpRight size={12} />
              <span>+2.3% vs mes anterior</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Agent Performance */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-surface rounded-xl border border-border-secondary shadow-card p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-ink font-syne">Rendimiento Comercial</h3>
            <p className="text-xs text-muted">Agentes ordenados por conversion</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-secondary">
                <th className="text-left text-xs font-semibold text-muted pb-3 pr-4">Agente</th>
                <th className="text-right text-xs font-semibold text-muted pb-3 px-4">Leads</th>
                <th className="text-right text-xs font-semibold text-muted pb-3 px-4">Visitas</th>
                <th className="text-right text-xs font-semibold text-muted pb-3 px-4">Cierres</th>
                <th className="text-right text-xs font-semibold text-muted pb-3 pl-4">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {agentData.map((agent, i) => (
                <motion.tr
                  key={agent.name}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                   transition={{ delay: i * 0.04 }}
                  className="border-b border-border-secondary last:border-0 hover:bg-indigo-500/5 transition-colors"
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold shadow-sm">
                        {agent.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                      <span className="font-medium text-ink text-sm">{agent.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-ink font-medium">{agent.leads}</td>
                  <td className="py-3 px-4 text-right text-ink font-medium">{agent.visits}</td>
                  <td className="py-3 px-4 text-right text-ink font-medium">{agent.closures}</td>
                  <td className="py-3 pl-4 text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${
                      parseFloat(agent.rate) >= 20 ? 'bg-ok/10 text-ok' :
                      parseFloat(agent.rate) >= 15 ? 'bg-amber/10 text-amber' :
                      'bg-indigo-500/10 text-indigo-400'
                    }`}>
                      {agent.rate}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Market Insights + Lead Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Market Insights */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          {marketInsights.map((insight) => (
            <div key={insight.title} className="bg-surface rounded-xl border border-border-secondary shadow-card p-5 hover:shadow-glow transition-all duration-300">
              <div className="flex items-center gap-2.5 mb-4">
                <div className={`w-8 h-8 rounded-lg ${insight.color} flex items-center justify-center`}>
                  <insight.icon size={16} />
                </div>
                <span className="text-sm font-semibold text-ink font-syne">{insight.title}</span>
              </div>
              <div className="space-y-3">
                {insight.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs text-muted">{item.label}</span>
                    <span className="text-xs font-semibold text-ink">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </motion.div>

        {/* Lead Source Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-surface rounded-xl border border-border-secondary shadow-card p-5"
        >
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-ink font-syne">Origen de Leads</h3>
            <p className="text-xs text-muted">Distribucion por canal de captacion</p>
          </div>
          <div className="flex items-center justify-center h-44">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={leadSources}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {leadSources.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </RePieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-2">
            {leadSources.map((source) => (
              <div key={source.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: source.color }} />
                  <span className="text-muted">{source.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{source.value}%</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
