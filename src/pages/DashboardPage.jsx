import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef } from 'react'
import {
  Bot, Users, MessageSquare, Zap,
  TrendingUp, Target, Clock, Home,
  UserPlus, Phone, Calendar, CheckCircle2,
  ArrowUpRight, ArrowDownRight,
  Sparkles, Activity, Mail, Globe,
  BarChart3, PieChart, Layers
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart
} from 'recharts'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { useStore } from '../lib/store'

const pulseDot = `
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.4); }
  }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
`

const conversionData = [
  { day: 'Lun', leads: 4, conversions: 1 },
  { day: 'Mar', leads: 7, conversions: 3 },
  { day: 'Mie', leads: 5, conversions: 2 },
  { day: 'Jue', leads: 9, conversions: 4 },
  { day: 'Vie', leads: 6, conversions: 2 },
  { day: 'Sab', leads: 3, conversions: 1 },
  { day: 'Dom', leads: 2, conversions: 0 },
  { day: 'Lun', leads: 8, conversions: 3 },
  { day: 'Mar', leads: 11, conversions: 5 },
  { day: 'Mie', leads: 6, conversions: 2 },
  { day: 'Jue', leads: 10, conversions: 4 },
  { day: 'Vie', leads: 7, consultations: 3 },
  { day: 'Sab', leads: 4, conversions: 1 },
  { day: 'Dom', leads: 3, conversions: 1 },
]

const pipelineStages = [
  { label: 'Nuevo', count: 24, color: 'bg-blue-400' },
  { label: 'Contactado', count: 18, color: 'bg-gold-300' },
  { label: 'Calificado', count: 12, color: 'bg-blue-300' },
  { label: 'En propuesta', count: 8, color: 'bg-amber' },
  { label: 'Negociacion', count: 5, color: 'bg-warn' },
  { label: 'Cerrado', count: 3, color: 'bg-ok' },
]

const demoActivities = [
  { id: 1, type: 'new_lead', icon: UserPlus, color: 'text-blue-500 bg-blue-50', text: 'Nuevo lead de Idealista: Maria Garcia busca piso en Centro', time: new Date(Date.now() - 2 * 60000) },
  { id: 2, type: 'status', icon: CheckCircle2, color: 'text-amber bg-amber/10', text: 'Lead Carlos Lopez movido a Negociacion', time: new Date(Date.now() - 15 * 60000) },
  { id: 3, type: 'ia_action', icon: Sparkles, color: 'text-purple-500 bg-purple-50', text: 'IA envio propuesta personalizada a Ana Martinez', time: new Date(Date.now() - 37 * 60000) },
  { id: 4, type: 'visit', icon: Calendar, color: 'text-ok bg-ok/10', text: 'Visita programada: Paseo de la Castellana 123 - 16:00', time: new Date(Date.now() - 62 * 60000) },
  { id: 5, type: 'new_lead', icon: UserPlus, color: 'text-blue-500 bg-blue-50', text: 'Nuevo lead via Web: Javier Ruiz interesado en alquiler Chamberi', time: new Date(Date.now() - 90 * 60000) },
  { id: 6, type: 'ia_action', icon: Sparkles, color: 'text-purple-500 bg-purple-50', text: 'Analista IA identifico 3 propiedades optimas para lead premium', time: new Date(Date.now() - 130 * 60000) },
  { id: 7, type: 'status', icon: CheckCircle2, color: 'text-amber bg-amber/10', text: 'Lead Laura Sanchez calificado como comprador urgente', time: new Date(Date.now() - 185 * 60000) },
  { id: 8, type: 'visit', icon: Calendar, color: 'text-ok bg-ok/10', text: 'Visita completada: Cliente satisfecho con atico en Salamanca', time: new Date(Date.now() - 240 * 60000) },
  { id: 9, type: 'message', icon: MessageSquare, color: 'text-blue-300 bg-blue-50', text: 'WhatsApp entrante: consulta sobre precio Calle Serrano 45', time: new Date(Date.now() - 300 * 60000) },
  { id: 10, type: 'ia_action', icon: Sparkles, color: 'text-purple-500 bg-purple-50', text: 'IA actualizo descripciones de 12 propiedades con SEO optimizado', time: new Date(Date.now() - 380 * 60000) },
]

const demoAgents = [
  { id: 1, name: 'Elena Martinez', role: 'Comercial Senior', online: true, lastAction: 'Calificando lead premium', leadsToday: 3, icon: 'EM' },
  { id: 2, name: 'Carlos Ruiz', role: 'Agente IA', online: true, lastAction: 'Analizando mercado', leadsToday: 7, icon: 'CR', ia: true },
  { id: 3, name: 'Laura Gomez', role: 'Comercial', online: false, lastAction: 'En visita comercial', leadsToday: 1, icon: 'LG' },
  { id: 4, name: 'Analista IA', role: 'IA - Datos', online: true, lastAction: 'Generando reporte semanal', leadsToday: 0, icon: 'AI', ia: true },
  { id: 5, name: 'Pedro Sanchez', role: 'Comercial Junior', online: true, lastAction: 'Seguimiento leads nuevos', leadsToday: 2, icon: 'PS' },
]

const liveStats = [
  { id: 1, label: 'Agentes IA activos', value: 4, icon: Bot, color: 'text-blue-500 bg-blue-50', change: '+2', trend: 'up' },
  { id: 2, label: 'Leads hoy', value: 24, icon: Users, color: 'text-ok bg-ok/10', change: '+35%', trend: 'up' },
  { id: 3, label: 'Mensajes enviados hoy', value: 89, icon: MessageSquare, color: 'text-purple-500 bg-purple-50', change: '+12%', trend: 'up' },
  { id: 4, label: 'Automatizaciones ejecutadas', value: 156, icon: Zap, color: 'text-amber bg-amber/10', change: '+8%', trend: 'up' },
]

export default function DashboardPage() {
  const { activities, leads, stats } = useStore()
  const [currentTime, setCurrentTime] = useState(new Date())
  const [visibleActivities, setVisibleActivities] = useState(demoActivities)
  const [agentStatuses, setAgentStatuses] = useState(demoAgents)
  const feedRef = useRef(null)

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const types = [
        { type: 'new_lead', icon: UserPlus, color: 'text-blue-500 bg-blue-50', text: 'Nuevo lead de WhatsApp: consulta sobre alquiler en Malasana' },
        { type: 'status', icon: CheckCircle2, color: 'text-amber bg-amber/10', text: 'Lead David Romero movido a Calificado' },
        { type: 'ia_action', icon: Sparkles, color: 'text-purple-500 bg-purple-50', text: 'IA recomendo 5 propiedades para lead Carmen Torres' },
        { type: 'visit', icon: Calendar, color: 'text-ok bg-ok/10', text: 'Visita agendada: Calle Velazquez 45 - manana 12:00' },
      ]
      const pick = types[Math.floor(Math.random() * types.length)]
      const newActivity = {
        id: Date.now(),
        ...pick,
        time: new Date(),
      }
      setVisibleActivities(prev => [newActivity, ...prev].slice(0, 20))
    }, 18000)
    return () => clearInterval(interval)
  }, [])

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06 }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      <style>{pulseDot}</style>

      {/* Header: Tu equipo IA esta trabajando ahora mismo */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ink via-ink2 to-slate px-6 py-5 lg:px-8 lg:py-6"
      >
        <div className="absolute inset-0 opacity-5">
          <div className="absolute -top-12 -right-12 w-64 h-64 bg-blue-400 rounded-full blur-3xl" />
          <div className="absolute -bottom-8 -left-8 w-48 h-48 bg-blue-300 rounded-full blur-3xl" />
        </div>
        <div className="relative flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Bot size={24} className="text-blue-300" />
            </div>
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-ok rounded-full border-2 border-ink"
              style={{ animation: 'pulse-dot 2s ease-in-out infinite' }}
            />
          </div>
          <div className="flex-1">
            <h1 className="text-xl lg:text-2xl font-bold text-white font-syne flex items-center gap-3">
              Tu equipo IA esta trabajando ahora mismo
              <span className="flex gap-1">
                <span className="w-2 h-2 bg-ok rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-ok rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-ok rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </h1>
            <p className="text-blue-200/70 text-sm mt-1">
              {currentTime.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              {' · '}
              Analizando mercado, calificando leads y optimizando conversiones
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="hidden lg:flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Activity size={16} />
            Ver actividad en vivo
          </motion.button>
        </div>
      </motion.div>

      {/* Live Stats Row */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {liveStats.map((stat) => (
          <motion.div
            key={stat.id}
            variants={itemVariants}
            className="relative group bg-surface rounded-xl border border-border-secondary shadow-card p-5 hover:shadow-glow transition-all duration-300"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl ${stat.color.replace('bg-blue-50', 'bg-blue-500/10').replace('bg-purple-50', 'bg-purple-500/10')} flex items-center justify-center`}>
                <stat.icon size={20} />
              </div>
              {stat.id === 1 && (
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ok opacity-40" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-ok" />
                </span>
              )}
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-2xl font-bold text-ink font-syne">{stat.value}</div>
                <div className="text-xs text-muted mt-0.5">{stat.label}</div>
              </div>
              <div className={`flex items-center gap-0.5 text-xs font-medium ${stat.trend === 'up' ? 'text-ok' : 'text-err'}`}>
                {stat.trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {stat.change}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Middle Row: Conversion Chart + Pipeline Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversion Chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-surface rounded-xl border border-border-secondary shadow-card p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-ink font-syne">Conversiones</h3>
              <p className="text-xs text-muted">Ultimos 14 dias</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                <span className="text-xs text-muted">Leads</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-ok" />
                <span className="text-xs text-muted">Conversiones</span>
              </div>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={conversionData}>
                <defs>
                  <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5b8afb" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#5b8afb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#156840" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#156840" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbd8d0" strokeOpacity={0.5} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#737680' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#737680' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: '#13131A',
                    border: '1px solid #2A2A3E',
                    borderRadius: 8,
                    boxShadow: '0 4px 20px rgba(0,0,0,.4)',
                    fontSize: 12,
                    color: '#F1F5F9'
                  }}
                  itemStyle={{ color: '#F1F5F9' }}
                />
                <Area type="monotone" dataKey="leads" stroke="#5b8afb" strokeWidth={2} fill="url(#leadsGrad)" dot={false} />
                <Area type="monotone" dataKey="conversions" stroke="#156840" strokeWidth={2} fill="url(#convGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Pipeline Summary */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-surface rounded-xl border border-border-secondary shadow-card p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-ink font-syne">Pipeline</h3>
              <p className="text-xs text-muted">{pipelineStages.reduce((a, b) => a + b.count, 0)} leads totales</p>
            </div>
          </div>
          <div className="space-y-3">
            {pipelineStages.map((stage, i) => {
              const max = Math.max(...pipelineStages.map(s => s.count))
              const pct = (stage.count / max) * 100
              return (
                <div key={stage.label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${stage.color}`} />
                      <span className="text-xs text-muted font-medium">{stage.label}</span>
                    </div>
                    <span className="text-xs font-semibold text-ink">{stage.count}</span>
                  </div>
                  <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: i * 0.08, ease: 'easeOut' }}
                      className={`h-full rounded-full ${stage.color}`}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-border">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Tasa de conversion total</span>
              <span className="font-semibold text-ink">12.5%</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1.5">
              <span className="text-muted">Valor total pipeline</span>
              <span className="font-semibold text-ink">2.4M €</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Bottom Row: Activity Feed + Agent Status + Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 bg-surface rounded-xl border border-border-secondary shadow-card"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold text-ink font-syne">Actividad Reciente</h3>
              <p className="text-xs text-muted">Eventos en tiempo real</p>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-ok font-medium">
              <span className="w-1.5 h-1.5 bg-ok rounded-full animate-pulse" />
              En vivo
            </span>
          </div>
          <div ref={feedRef} className="overflow-y-auto max-h-[380px] divide-y divide-border/50">
            <AnimatePresence initial={false}>
              {visibleActivities.map((act, i) => (
                <motion.div
                  key={act.id}
                  initial={{ opacity: 0, x: -12, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: 'auto' }}
                  exit={{ opacity: 0, x: 12, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-start gap-3 px-5 py-3.5 hover:bg-surface/50 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-lg ${act.color} flex items-center justify-center shrink-0`}>
                    <act.icon size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink leading-snug">{act.text}</p>
                    <p className="text-[11px] text-muted mt-0.5">
                      {formatDistanceToNow(act.time, { addSuffix: true, locale: es })}
                    </p>
                  </div>
                  {i === 0 && (
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-2 shrink-0" />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Agent Status + Quick Stats */}
        <div className="space-y-6">
          {/* Agent Status Bar */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-surface rounded-xl border border-border-secondary shadow-card p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-ink font-syne">Agentes</h3>
              <span className="text-xs text-muted">
                {agentStatuses.filter(a => a.online).length}/{agentStatuses.length} activos
              </span>
            </div>
            <div className="space-y-2.5">
              {agentStatuses.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-surface/50 transition-colors"
                >
                  <div className="relative shrink-0">
                    <div className={`w-9 h-9 rounded-full ${agent.ia ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'} flex items-center justify-center text-xs font-bold`}>
                      {agent.icon}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface ${agent.online ? 'bg-ok' : 'bg-muted2'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{agent.name}</p>
                    <p className="text-[11px] text-muted truncate">{agent.lastAction}</p>
                  </div>
                  {agent.ia && (
                    <span className="text-[10px] font-semibold text-purple-500 bg-purple-50 px-1.5 py-0.5 rounded">IA</span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Quick Stats */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-surface rounded-xl border border-border-secondary shadow-card p-5"
          >
            <h3 className="text-sm font-semibold text-ink font-syne mb-4">Stats Rapidas</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total leads', value: '847', icon: Users, color: 'text-blue-500' },
                { label: 'Tasa conversion', value: '12.5%', icon: TrendingUp, color: 'text-ok' },
                { label: 'Respuesta media', value: '3.2 min', icon: Clock, color: 'text-amber' },
                { label: 'Prop. destacadas', value: '28', icon: Home, color: 'text-purple-500' },
              ].map((q, i) => (
                <div key={i} className="p-3 rounded-lg bg-surface/50">
                  <div className="flex items-center gap-2 mb-1.5">
                    <q.icon size={14} className={q.color} />
                    <span className="text-[11px] text-muted">{q.label}</span>
                  </div>
                  <span className="text-lg font-bold text-ink font-syne">{q.value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}
