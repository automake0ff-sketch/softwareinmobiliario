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
import api from '../lib/api'

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

const ICONS = {
  Bot: Bot, Users: Users, MessageSquare: MessageSquare, Zap: Zap
}

export default function DashboardPage() {
  const { activities: storeActivities, leads, stats } = useStore()
  const [currentTime, setCurrentTime] = useState(new Date())
  const [visibleActivities, setVisibleActivities] = useState([])
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)
  const feedRef = useRef(null)

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [])

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base = import.meta.env.VITE_API_URL || '';
    let wsUrl = '';
    if (base.startsWith('http')) {
      wsUrl = base.replace(/^http/, 'ws');
    } else {
      wsUrl = `${protocol}//${window.location.hostname}:3002`;
    }

    let socket;
    let reconnectTimeout;

    function connect() {
      try {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          console.log('[WebSocket] Conectado al servidor de tiempo real');
          socket.send(JSON.stringify({ type: 'subscribe', channels: ['activities'] }));
        };

        socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'activity' && msg.data) {
              const a = msg.data;
              const newAct = {
                id: a.id || Math.random(),
                type: a.type,
                icon: a.type === 'new_lead' ? UserPlus : a.type === 'ia_action' ? Sparkles : a.type === 'visit' ? Calendar : a.type === 'status' ? CheckCircle2 : MessageSquare,
                color: a.type === 'new_lead' ? 'text-blue-500 bg-blue-500/10' : a.type === 'ia_action' ? 'text-purple-500 bg-purple-500/10' : a.type === 'visit' ? 'text-emerald-500 bg-emerald-500/10' : a.type === 'status' ? 'text-amber-500 bg-amber-500/10' : 'text-indigo-500 bg-indigo-500/10',
                text: a.description || a.title || '',
                time: new Date(a.created_at || new Date()),
              };
              setVisibleActivities(prev => [newAct, ...prev].slice(0, 20));
            }
          } catch (e) {
            console.error('[WebSocket] Error parsing message:', e);
          }
        };

        socket.onclose = () => {
          console.log('[WebSocket] Desconectado, reintentando...');
          reconnectTimeout = setTimeout(connect, 3000);
        };

        socket.onerror = () => {
          socket.close();
        };
      } catch (e) {
        console.error('[WebSocket] Connection error:', e);
      }
    }

    connect();

    return () => {
      if (socket) socket.close();
      clearTimeout(reconnectTimeout);
    };
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true)
      const data = await api.get('/stats/dashboard')
      setDashboardData(data)
      setVisibleActivities(
        (data.activities || []).map((a, i) => ({
          id: a.id || i,
          type: a.type,
          icon: a.type === 'new_lead' ? UserPlus : a.type === 'ia_action' ? Sparkles : a.type === 'visit' ? Calendar : a.type === 'status' ? CheckCircle2 : MessageSquare,
          color: a.type === 'new_lead' ? 'text-blue-500 bg-blue-500/10' : a.type === 'ia_action' ? 'text-purple-500 bg-purple-500/10' : a.type === 'visit' ? 'text-emerald-500 bg-emerald-500/10' : a.type === 'status' ? 'text-amber-500 bg-amber-500/10' : 'text-indigo-500 bg-indigo-500/10',
          text: a.text,
          time: new Date(a.time),
        }))
      )
    } catch (e) {
      console.error('Error fetching dashboard:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!dashboardData) return
    const interval = setInterval(() => {
      fetchDashboard()
    }, 30000)
    return () => clearInterval(interval)
  }, [dashboardData])

  const liveStats = dashboardData?.liveStats || [
    { id: 1, label: 'Agentes IA activos', value: 0, icon: 'Bot', change: '', trend: 'up' },
    { id: 2, label: 'Leads hoy', value: 0, icon: 'Users', change: '0%', trend: 'down' },
    { id: 3, label: 'Mensajes enviados hoy', value: 0, icon: 'MessageSquare', change: '0', trend: 'down' },
    { id: 4, label: 'Automatizaciones ejecutadas', value: 0, icon: 'Zap', change: '', trend: 'up' },
  ]

  const pipelineStages = dashboardData?.pipelineStages || []
  const pipelineTotal = pipelineStages.reduce((a, b) => a + b.count, 0)

  const conversionData = dashboardData?.conversionData?.length > 0
    ? dashboardData.conversionData
    : []

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

  if (loading && !dashboardData) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-sm text-[#64748B]">Cargando dashboard...</p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      <style>{pulseDot}</style>

      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#13131A] via-[#1A1A24] to-[#0F0F15] px-6 py-5 lg:px-8 lg:py-6 border border-[#1E1E2E]"
      >
        <div className="absolute inset-0 opacity-5">
          <div className="absolute -top-12 -right-12 w-64 h-64 bg-indigo-400 rounded-full blur-3xl" />
          <div className="absolute -bottom-8 -left-8 w-48 h-48 bg-indigo-300 rounded-full blur-3xl" />
        </div>
        <div className="relative flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <Bot size={24} className="text-indigo-300" />
            </div>
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-[#13131A]"
              style={{ animation: 'pulse-dot 2s ease-in-out infinite' }}
            />
          </div>
          <div className="flex-1">
            <h1 className="text-xl lg:text-2xl font-bold text-[#F1F5F9] font-syne flex items-center gap-3">
              Tu equipo IA está trabajando ahora mismo
              <span className="flex gap-1">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </h1>
            <p className="text-indigo-200/70 text-sm mt-1">
              {currentTime.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              {' · '}
              Analizando mercado, calificando leads y optimizando conversiones
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={fetchDashboard}
            className="hidden lg:flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Activity size={16} />
            Actualizar
          </motion.button>
        </div>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {liveStats.map((stat) => {
          const IconComp = ICONS[stat.icon] || Users
          return (
            <motion.div
              key={stat.id}
              variants={itemVariants}
              className="relative group bg-[#13131A] border border-[#1E1E2E] rounded-xl p-5 hover:border-[#2A2A3E] transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                  <IconComp size={20} />
                </div>
                {stat.id === 1 && (
                  <span className="flex h-2.5 w-2.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                  </span>
                )}
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-bold text-[#F1F5F9] font-syne">{stat.value}</div>
                  <div className="text-xs text-[#64748B] mt-0.5">{stat.label}</div>
                </div>
                {stat.change && (
                  <div className={`flex items-center gap-0.5 text-xs font-medium ${stat.trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {stat.trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {stat.change}
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-[#13131A] border border-[#1E1E2E] rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#F1F5F9] font-syne">Leads</h3>
              <p className="text-xs text-[#64748B]">Últimos 14 días</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                <span className="text-xs text-[#64748B]">Leads</span>
              </div>
            </div>
          </div>
          <div className="h-56">
            {conversionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={conversionData}>
                  <defs>
                    <linearGradient id="leadsGradDark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" strokeOpacity={0.5} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
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
                  <Area type="monotone" dataKey="leads" stroke="#6366f1" strokeWidth={2} fill="url(#leadsGradDark)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-[#64748B]">
                No hay datos de leads aún. ¡Comienza añadiendo tus primeros leads!
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-[#13131A] border border-[#1E1E2E] rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#F1F5F9] font-syne">Pipeline</h3>
              <p className="text-xs text-[#64748B]">{pipelineTotal} leads totales</p>
            </div>
          </div>
          {pipelineStages.length > 0 ? (
            <div className="space-y-3">
              {pipelineStages.map((stage, i) => {
                const max = Math.max(...pipelineStages.map(s => s.count), 1)
                const pct = (stage.count / max) * 100
                return (
                  <div key={stage.label}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${stage.color}`} />
                        <span className="text-xs text-[#64748B] font-medium">{stage.label}</span>
                      </div>
                      <span className="text-xs font-semibold text-[#F1F5F9]">{stage.count}</span>
                    </div>
                    <div className="h-2 bg-[#0A0A0F] rounded-full overflow-hidden">
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
          ) : (
            <div className="flex items-center justify-center h-32 text-sm text-[#64748B]">
              Pipeline vacío
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-[#1E1E2E]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#64748B]">Total leads</span>
              <span className="font-semibold text-[#F1F5F9]">{dashboardData?.totalLeads || 0}</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1.5">
              <span className="text-[#64748B]">Propiedades</span>
              <span className="font-semibold text-[#F1F5F9]">{dashboardData?.totalProperties || 0}</span>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 bg-[#13131A] border border-[#1E1E2E] rounded-xl"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E1E2E]">
            <div>
              <h3 className="text-sm font-semibold text-[#F1F5F9] font-syne">Actividad Reciente</h3>
              <p className="text-xs text-[#64748B]">Eventos en tu agencia</p>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              Tiempo real
            </span>
          </div>
          <div ref={feedRef} className="overflow-y-auto max-h-[380px] divide-y divide-[#1E1E2E]/50">
            {visibleActivities.length > 0 ? (
              <AnimatePresence initial={false}>
                {visibleActivities.map((act, i) => (
                  <motion.div
                    key={act.id}
                    initial={{ opacity: 0, x: -12, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: 'auto' }}
                    exit={{ opacity: 0, x: 12, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-start gap-3 px-5 py-3.5 hover:bg-[#1A1A24] transition-colors"
                  >
                    <div className={`w-8 h-8 rounded-lg ${act.color} flex items-center justify-center shrink-0`}>
                      <act.icon size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#F1F5F9] leading-snug">{act.text}</p>
                      <p className="text-[11px] text-[#64748B] mt-0.5">
                        {formatDistanceToNow(act.time, { addSuffix: true, locale: es })}
                      </p>
                    </div>
                    {i === 0 && (
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-2 shrink-0" />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            ) : (
              <div className="flex items-center justify-center h-32 text-sm text-[#64748B]">
                Sin actividad reciente
              </div>
            )}
          </div>
        </motion.div>

        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-[#13131A] border border-[#1E1E2E] rounded-xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#F1F5F9] font-syne">Stats Rápidas</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total leads', value: String(dashboardData?.totalLeads || 0), icon: Users, color: 'text-indigo-400' },
                { label: 'Propiedades', value: String(dashboardData?.totalProperties || 0), icon: Home, color: 'text-emerald-400' },
                { label: 'Pipeline', value: String(pipelineTotal), icon: Layers, color: 'text-amber-400' },
                { label: 'Agentes IA', value: String(liveStats[0]?.value || 0), icon: Bot, color: 'text-purple-400' },
              ].map((q, i) => (
                <div key={i} className="p-3 rounded-lg bg-[#0A0A0F]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <q.icon size={14} className={q.color} />
                    <span className="text-[11px] text-[#64748B]">{q.label}</span>
                  </div>
                  <span className="text-lg font-bold text-[#F1F5F9] font-syne">{q.value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}
