import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bot, UserPlus, Handshake, Brain, PenLine, Calculator,
  BarChart3, ArrowRight, Activity, Clock, Zap,
  X, Check, Users, MessageSquare, TrendingUp, Sparkles,
  PhoneCall, FileText, Database, Send, Globe, DollarSign, Bell, Calendar, RefreshCw, Tag
} from 'lucide-react'
import clsx from 'clsx'
import api from '../lib/api'
import { usePlan } from '../hooks/usePlan'
import { PLANS } from '../lib/billing/plans'
import { Link } from 'react-router-dom'

const AGENT_ICON_MAP = {
  UserPlus, Handshake, Brain, PenLine, Calculator,
  BarChart3, Activity, Bot, PhoneCall, FileText,
  TrendingUp, Globe, DollarSign, Bell, Calendar,
  RefreshCw, Tag, Database,
}

const AGENTS_DATA = [
  {
    id: 'captador', name: 'Captador IA', title: 'Adquisición de leads', icon: 'UserPlus',
    color: 'from-emerald-500 to-emerald-600', lightColor: 'bg-emerald-50 text-emerald-600',
    active: true, metrics: { leads: 48, conversations: 32, successRate: 87 },
    lastAction: 'Captó 3 nuevos leads hace 2 min',
    description: 'Escanea portales inmobiliarios y redes sociales para captar leads calificados automáticamente.',
    fullDescription: 'El Captador IA monitorea 24/7 los principales portales inmobiliarios, redes sociales y fuentes de tráfico para identificar y capturar leads potenciales. Utiliza NLP para calificar el interés y la capacidad de compra antes de ingresarlos al CRM.',
    stats: { leadsMonth: 342, avgResponse: '1.2s', sources: 6, conversionRate: 23, dailyHistory: [65, 72, 58, 84, 71, 48, 63] },
    recentActions: [
      { action: 'Nuevo lead captado desde Idealista', time: 'hace 2 min' },
      { action: 'Lead calificado como "caliente"', time: 'hace 5 min' },
    ],
  },
  {
    id: 'vendedor', name: 'Vendedor IA', title: 'Conversión y ventas', icon: 'Handshake',
    color: 'from-blue-500 to-blue-600', lightColor: 'bg-blue-50 text-blue-600',
    active: true, metrics: { leads: 18, conversations: 41, successRate: 73 },
    lastAction: 'Programó 2 visitas para mañana a las 11:00',
    description: 'Automatiza el proceso de ventas y califica leads en tiempo real.',
    fullDescription: 'El Vendedor IA gestiona todo el ciclo de ventas digital: desde el primer contacto hasta el cierre. Realiza llamadas automatizadas, envía seguimientos personalizados y califica leads por probabilidad de compra usando modelos predictivos.',
    stats: { leadsMonth: 187, avgResponse: '3.7s', sources: 4, conversionRate: 31, dailyHistory: [42, 38, 51, 44, 39, 41, 37] },
    recentActions: [
      { action: 'Follow-up enviado a lead María G.', time: 'hace 1 min' },
      { action: 'Visita programada: Piso Centro', time: 'hace 7 min' },
    ],
  },
  {
    id: 'coordinador', name: 'Coordinador IA', title: 'Orquestación del sistema', icon: 'Brain',
    color: 'from-violet-500 to-violet-600', lightColor: 'bg-violet-50 text-violet-600',
    active: true, isBrain: true, metrics: { leads: 66, conversations: 73, successRate: 96 },
    lastAction: 'Reasignó tareas entre agentes para optimizar carga',
    description: 'Cerebro del sistema. Orquesta y optimiza el flujo entre todos los agentes.',
    fullDescription: 'El Coordinador IA es el cerebro del ecosistema. Supervisa, orquesta y optimiza el trabajo de todos los demás agentes. Asigna tareas según carga de trabajo, detecta cuellos de botella y rebalancea el flujo en tiempo real para máxima eficiencia.',
    stats: { leadsMonth: 421, avgResponse: '0.4s', sources: 12, conversionRate: 41, dailyHistory: [82, 79, 88, 85, 80, 83, 78] },
    recentActions: [
      { action: 'Flujo optimizado: Captador -> Vendedor', time: 'hace 0 min' },
      { action: 'Carga rebalanceada entre agentes', time: 'hace 4 min' },
    ],
  },
  {
    id: 'copywriter', name: 'Copywriter IA', title: 'Redacción y contenido', icon: 'PenLine',
    color: 'from-amber-500 to-amber-600', lightColor: 'bg-amber-50 text-amber-600',
    active: true, metrics: { leads: 12, conversations: 56, successRate: 91 },
    lastAction: 'Redactó descripción para Chalet en La Moraleja',
    description: 'Genera contenido persuasivo y descripciones de propiedades.',
    fullDescription: 'El Copywriter IA redacta descripciones de propiedades optimizadas para conversión, mensajes de seguimiento personalizados, respuestas automáticas y contenido para redes sociales.',
    stats: { leadsMonth: 89, avgResponse: '0.8s', sources: 3, conversionRate: 28, dailyHistory: [31, 28, 35, 42, 38, 34, 41] },
    recentActions: [
      { action: 'Descripción generada: Chalet Moraleja', time: 'hace 3 min' },
      { action: 'Email personalizado enviado a lead', time: 'hace 6 min' },
    ],
  },
  {
    id: 'tasador', name: 'Tasador IA', title: 'Valoración de propiedades', icon: 'Calculator',
    color: 'from-cyan-500 to-cyan-600', lightColor: 'bg-cyan-50 text-cyan-600',
    active: false, metrics: { leads: 9, conversations: 22, successRate: 94 },
    lastAction: 'Actualizó tasación de Piso en Salamanca',
    description: 'Calcula valoraciones precisas de propiedades en segundos.',
    fullDescription: 'El Tasador IA utiliza modelos de machine learning entrenados con miles de transacciones para calcular valoraciones precisas en segundos. Considera ubicación, metros, estado, comparables de mercado y tendencias del barrio.',
    stats: { leadsMonth: 156, avgResponse: '2.1s', sources: 5, conversionRate: 19, dailyHistory: [22, 18, 25, 20, 15, 21, 19] },
    recentActions: [
      { action: 'Tasación completada: Local Comercial', time: 'hace 8 min' },
      { action: 'Comparables de mercado actualizados', time: 'hace 14 min' },
    ],
  },
  {
    id: 'analista', name: 'Analista IA', title: 'Inteligencia de negocio', icon: 'BarChart3',
    color: 'from-rose-500 to-rose-600', lightColor: 'bg-rose-50 text-rose-600',
    active: true, metrics: { leads: 23, conversations: 38, successRate: 89 },
    lastAction: 'Generó reporte semanal con +12% en conversiones',
    description: 'Analiza datos y genera insights accionables para la agencia.',
    fullDescription: 'El Analista IA procesa todos los datos del CRM para generar informes inteligentes, detectar tendencias del mercado, predecir estacionalidad y recomendar acciones estratégicas.',
    stats: { leadsMonth: 203, avgResponse: '1.5s', sources: 8, conversionRate: 34, dailyHistory: [18, 22, 16, 28, 21, 23, 20] },
    recentActions: [
      { action: 'Reporte semanal enviado al equipo', time: 'hace 4 min' },
      { action: 'Tendencia detectada: +18% búsquedas áticos', time: 'hace 10 min' },
    ],
  },
]

const ACTIVITY_ICONS = {
  lead: UserPlus, coordinate: Brain, call: PhoneCall,
  content: FileText, insight: TrendingUp, valuation: Calculator,
  ia_action: Bot, automation_triggered: Zap,
}

const AGENT_COLORS = {
  captador: '#6366f1', vendedor: '#10b981', coordinador: '#f59e0b',
  copywriter: '#ec4899', tasador: '#3b82f6', analista: '#8b5cf6',
  agendador: '#14b8a6', nurturing: '#84cc16', documentador: '#f97316',
  seo: '#06b6d4', financiero: '#22c55e', notificador: '#a855f7',
}

function ActivityDot({ type }) {
  const Icon = ACTIVITY_ICONS[type] || Activity
  return (
    <div className="w-8 h-8 rounded-lg bg-ink2/50 border border-white/5 flex items-center justify-center shrink-0">
      <Icon size={14} className="text-blue-300" />
    </div>
  )
}

function getAgentColor(id) {
  const agent = AGENTS_DATA.find(a => a.id === id)
  return agent ? agent.color : 'from-blue-500 to-blue-600'
}

function getAgentLightColor(id) {
  const agent = AGENTS_DATA.find(a => a.id === id)
  return agent ? agent.lightColor : 'bg-blue-50 text-blue-600'
}

export default function AgentsIAPage() {
  const [showInactive, setShowInactive] = useState(false)
  const [agents, setAgents] = useState(AGENTS_DATA.map(a => ({ ...a, active: a.active })))
  const [activities, setActivities] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [dbAgents, setDbAgents] = useState({})

  // Agent testing/chat state
  const [chatAgent, setChatAgent] = useState(null)
  const [chatMessage, setChatMessage] = useState('')
  const [chatResponse, setChatResponse] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatHistory, setChatHistory] = useState([])

  const feedRef = useRef(null)

  // Fetch agents from backend on mount
  useEffect(() => {
    api.get('/agents').then(data => {
      if (Array.isArray(data)) {
        const map = {}
        data.forEach(a => { map[a.type] = a })
        setDbAgents(map)
      }
    }).catch(() => {})
  }, [])

  // Fetch real activities
  useEffect(() => {
    api.get('/agents').then(async () => {
      try {
        const acts = await api.get('/conversations', { limit: 20 })
        if (Array.isArray(acts)) {
          setActivities(acts.slice(0, 20).map((a, i) => ({
            id: i + 1,
            agent: a.agent_type || 'coordinador',
            action: a.description || 'Actividad registrada',
            time: 'ahora',
            type: a.type || 'coordinate',
          })))
        }
      } catch {}
    }).catch(() => {})

    // Still seed with mock activities for visual
    const mockActs = [
      { id: 1, agent: 'captador', action: 'Captó 2 nuevos leads de Fotocasa', time: 'hace 30s', type: 'lead' },
      { id: 2, agent: 'coordinador', action: 'Balanceó carga entre agentes', time: 'hace 1m', type: 'coordinate' },
      { id: 3, agent: 'vendedor', action: 'Llamada automática exitosa a lead premium', time: 'hace 2m', type: 'call' },
      { id: 4, agent: 'copywriter', action: 'Generó descripción para dúplex premium', time: 'hace 3m', type: 'content' },
      { id: 5, agent: 'analista', action: 'Detectó oportunidad en zona centro', time: 'hace 4m', type: 'insight' },
      { id: 6, agent: 'captador', action: 'Lead calificado como "muy caliente"', time: 'hace 5m', type: 'lead' },
      { id: 7, agent: 'coordinador', action: 'Reasignó tarea de seguimiento a Vendedor', time: 'hace 6m', type: 'coordinate' },
      { id: 8, agent: 'tasador', action: 'Actualizó tasación de 3 propiedades', time: 'hace 8m', type: 'valuation' },
    ]
    setActivities(mockActs)
  }, [])

  // Simulate live activities
  useEffect(() => {
    const activityDescriptions = [
      { agent: 'captador', action: 'Nuevo lead captado desde portal externo', type: 'lead' },
      { agent: 'coordinador', action: 'Flujo de trabajo optimizado automáticamente', type: 'coordinate' },
      { agent: 'vendedor', action: 'Seguimiento automático enviado a lead cálido', type: 'call' },
      { agent: 'copywriter', action: 'Contenido personalizado generado para campaña', type: 'content' },
      { agent: 'analista', action: 'Nueva tendencia de mercado identificada', type: 'insight' },
      { agent: 'tasador', action: 'Valoración actualizada con nuevos comparables', type: 'valuation' },
      { agent: 'captador', action: 'Lead duplicado detectado y fusionado automáticamente', type: 'lead' },
      { agent: 'coordinador', action: 'Prioridades reordenadas según urgencia', type: 'coordinate' },
      { agent: 'vendedor', action: 'Propuesta comercial enviada con éxito', type: 'call' },
      { agent: 'analista', action: 'Reporte de eficiencia semanal generado', type: 'insight' },
    ]
    let idRef = 100

    const interval = setInterval(() => {
      const entry = activityDescriptions[Math.floor(Math.random() * activityDescriptions.length)]
      setActivities(prev => [{ id: idRef++, ...entry, time: 'ahora' }, ...prev].slice(0, 50))
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  // Time progression
  useEffect(() => {
    const timeInterval = setInterval(() => {
      setActivities(prev => prev.map((a, i) => {
        if (i === 0) return { ...a, time: 'ahora' }
        const units = ['s', 'm', 'm', 'm', 'm', 'm']
        const nums = [30, 1, 2, 4, 7, 12]
        const idx = Math.min(i - 1, units.length - 1)
        return { ...a, time: `hace ${nums[idx]}${units[idx]}` }
      }))
    }, 5000)
    return () => clearInterval(timeInterval)
  }, [])

  useEffect(() => {
    if (feedRef.current) {
      const el = feedRef.current
      if (el.scrollTop < 30) {
        setTimeout(() => el.scrollTo({ top: 0, behavior: 'smooth' }), 100)
      }
    }
  }, [activities])

  const toggleAgent = useCallback(async (id) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a))

    // Sync with backend if agent exists in DB
    const dbAgent = dbAgents[id]
    if (dbAgent?.id) {
      try {
        await api.post(`/agents/${dbAgent.id}/toggle`)
      } catch {}
    }
  }, [dbAgents])

  const filteredAgents = showInactive ? agents : agents.filter(a => a.active)

  // Send message to agent via OpenRouter
  const sendToAgent = async () => {
    if (!chatAgent || !chatMessage.trim()) return
    setChatLoading(true)
    setChatResponse('')

    const dbAgent = dbAgents[chatAgent]
    if (!dbAgent?.id) {
      setChatResponse('Error: Este agente no está configurado en el sistema. Ejecuta primero el seed de datos.')
      setChatLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/agents/${dbAgent.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...api.authHeaders },
        body: JSON.stringify({
          message: chatMessage,
          conversation_history: chatHistory,
          lead_context: { agency_name: 'Mi Agencia', agency_city: 'Sevilla' },
          stream: true,
        }),
      })

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let full = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        const lines = text.split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          const json = line.slice(6)
          if (json === '[DONE]') break
          try {
            const { chunk, error } = JSON.parse(json)
            if (error) { full += `\nError: ${error}`; break }
            if (chunk) full += chunk
            setChatResponse(full)
          } catch { /* skip */ }
        }
      }

      setChatHistory(prev => [
        ...prev.slice(-9),
        { role: 'user', content: chatMessage },
        { role: 'assistant', content: full },
      ])
    } catch (e) {
      setChatResponse('Error: ' + String(e))
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      <Header showInactive={showInactive} setShowInactive={setShowInactive} />

      <AgentGrid
        agents={filteredAgents}
        toggleAgent={toggleAgent}
        onSelect={setSelectedAgent}
      />

      <AgentFlow />

      <ActivityFeed activities={activities} feedRef={feedRef} />

      {/* Agent Testing Console */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <Bot size={15} />
          </div>
          <h2 className="text-sm font-semibold text-white font-syne">Consola de Agentes IA</h2>
          <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full">OPENROUTER</span>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(AGENT_COLORS).map(([type, color]) => {
            const meta = AGENTS_DATA.find(a => a.id === type)
            return (
              <button
                key={type}
                onClick={() => { setChatAgent(type); setChatResponse(''); setChatHistory([]) }}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                  chatAgent === type
                    ? 'text-white border-white/20'
                    : 'text-white/50 border-white/5 hover:border-white/10 hover:text-white/80'
                )}
                style={chatAgent === type ? { background: color + '30', borderColor: color + '60' } : {}}
              >
                {meta?.name?.split(' ')[0] || type}
              </button>
            )
          })}
        </div>

        {chatAgent && (
          <div className="space-y-3">
            <textarea
              value={chatMessage}
              onChange={e => setChatMessage(e.target.value)}
              placeholder={`Escribe un mensaje para ${AGENTS_DATA.find(a => a.id === chatAgent)?.name || chatAgent}... Ej: "Analiza este lead: Carlos busca piso en Triana, presupuesto 280k"`}
              className="w-full h-24 bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-indigo-500"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={sendToAgent}
                disabled={chatLoading || !chatMessage.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
              >
                {chatLoading ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                {chatLoading ? 'Procesando...' : `Enviar a ${AGENTS_DATA.find(a => a.id === chatAgent)?.name?.split(' ')[0] || chatAgent}`}
              </button>
              <span className="text-xs text-white/30">
                Usando OpenRouter · {chatAgent === 'tasador' || chatAgent === 'analista' ? 'Claude Opus' : 'GPT-4o'}
              </span>
            </div>

            {chatResponse && (
              <div className="bg-black/40 border border-white/10 rounded-lg p-4 mt-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: AGENT_COLORS[chatAgent] + '30' }}>
                    <Bot size={12} style={{ color: AGENT_COLORS[chatAgent] }} />
                  </div>
                  <span className="text-xs text-white/40 font-medium">
                    {AGENTS_DATA.find(a => a.id === chatAgent)?.name || chatAgent}
                  </span>
                </div>
                <pre className="text-sm text-white/90 whitespace-pre-wrap font-sans leading-relaxed">{chatResponse}</pre>
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedAgent && (
          <AgentModal
            agent={selectedAgent}
            onClose={() => setSelectedAgent(null)}
            dbAgent={dbAgents[selectedAgent.id]}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function Header({ showInactive, setShowInactive }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Bot size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white font-syne">Agentes IA</h1>
          <p className="text-sm text-white/50">Tu equipo de inteligencia artificial trabajando 24/7</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-white/50 font-medium">Inactivos</span>
        <button
          onClick={() => setShowInactive(!showInactive)}
          className={clsx(
            'relative w-10 h-5 rounded-full transition-colors duration-300',
            showInactive ? 'bg-blue-500' : 'bg-white/10'
          )}
        >
          <motion.div
            className={clsx(
              'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm',
              showInactive ? 'left-[22px]' : 'left-[2px]'
            )}
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </button>
      </div>
    </div>
  )
}

function AgentGrid({ agents, toggleAgent, onSelect }) {
  const { isAgentAvailable } = usePlan()
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <AnimatePresence mode="popLayout">
        {agents.map((agent, i) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            index={i}
            toggleAgent={toggleAgent}
            onSelect={onSelect}
            isAvailable={isAgentAvailable(agent.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

function AgentCard({ agent, index, toggleAgent, onSelect, isAvailable }) {
  const AgentIcon = AGENT_ICON_MAP[agent.icon] || Bot
  const locked = !isAvailable

  const neededPlan = locked
    ? Object.entries(PLANS).find(([_, p]) =>
        (p.available_agents || []).includes(agent.id)
      )?.[0] ?? 'agencia'
    : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 300, damping: 25 }}
      onClick={() => !locked && onSelect(agent)}
      className={clsx(
        'group relative rounded-xl p-5 cursor-pointer transition-shadow duration-300',
        'border border-white/10',
        locked
          ? 'bg-white/[0.02] border-white/5'
          : agent.active
            ? 'bg-gradient-to-b from-white/5 to-white/[0.02] shadow-card hover:shadow-modal'
            : 'bg-white/[0.02] border-white/5 shadow-sm hover:shadow-card'
      )}
    >
      {locked && (
        <div className="absolute inset-0 rounded-xl bg-black/50 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 z-10">
          <span className="text-2xl">🔒</span>
          <span className="text-white/60 text-xs text-center px-4">
            Disponible en plan {neededPlan ? PLANS[neededPlan]?.name || neededPlan : 'superior'}
          </span>
          <Link
            to={`/pricing?upgrade=${neededPlan || 'profesional'}`}
            className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg font-medium hover:bg-indigo-500 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            Actualizar
          </Link>
        </div>
      )}
      {agent.isBrain && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-violet-500 to-blue-500 text-[10px] font-bold text-white uppercase tracking-wider shadow-lg">
          Cerebro del sistema
        </div>
      )}

      <div className={clsx('flex items-start justify-between', agent.isBrain && 'mt-1')}>
        <div className="flex items-center gap-3">
          <div className={clsx(
            'w-11 h-11 rounded-xl flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110',
            `bg-gradient-to-br ${agent.color}`
          )}>
            <AgentIcon size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              {agent.name}
              <span className={clsx(
                'w-2 h-2 rounded-full inline-block',
                agent.active ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-white/20'
              )} />
            </h3>
            <p className="text-[11px] text-white/40">{agent.title}</p>
          </div>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); toggleAgent(agent.id) }}
          className={clsx(
            'relative w-9 h-5 rounded-full transition-colors duration-300 shrink-0',
            agent.active ? 'bg-emerald-500/70' : 'bg-white/10'
          )}
        >
          <motion.div
            className={clsx(
              'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm',
              agent.active ? 'left-[18px]' : 'left-[2px]'
            )}
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric label="Leads hoy" value={agent.metrics.leads} icon={Users} color="text-blue-300" />
        <Metric label="Convers." value={agent.metrics.conversations} icon={MessageSquare} color="text-amber-300" />
        <Metric label="Éxito" value={`${agent.metrics.successRate}%`} icon={TrendingUp} color="text-emerald-300" />
      </div>

      <div className="mt-3 pt-3 border-t border-white/5">
        <div className="flex items-center gap-2">
          <Zap size={12} className="text-white/30 shrink-0" />
          <p className="text-[11px] text-white/50 leading-tight line-clamp-1">{agent.lastAction}</p>
        </div>
      </div>
    </motion.div>
  )
}

function Metric({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white/[0.04] rounded-lg p-2 text-center">
      <div className="flex items-center justify-center gap-1 mb-0.5">
        <Icon size={10} className={color} />
        <span className="text-[10px] text-white/40 uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-sm font-bold text-white">{value}</span>
    </div>
  )
}

function AgentFlow() {
  const steps = [
    { id: 'captador', name: 'Captador IA', icon: UserPlus, color: 'from-emerald-500 to-emerald-600' },
    { id: 'crm', name: 'CRM', icon: Database, color: 'from-blue-400 to-blue-600', isSystem: true },
    { id: 'coordinador', name: 'Coordinador IA', icon: Brain, color: 'from-violet-500 to-violet-600', isBrain: true },
    { id: 'vendedor', name: 'Vendedor IA', icon: Handshake, color: 'from-blue-500 to-blue-600' },
    { id: 'cierre', name: 'Cierre', icon: Check, color: 'from-emerald-500 to-emerald-600', isSystem: true },
  ]

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-7 h-7 rounded-lg bg-violet-500/20 text-violet-400 flex items-center justify-center">
          <Sparkles size={15} />
        </div>
        <h2 className="text-sm font-semibold text-white font-syne">Flujo de trabajo</h2>
        <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full font-medium">EN VIVO</span>
      </div>

      <div className="flex items-center justify-center gap-0 overflow-x-auto pb-2">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-center">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-medium whitespace-nowrap border transition-shadow duration-300',
                step.isBrain
                  ? 'bg-gradient-to-r from-violet-500 to-blue-500 text-white border-transparent shadow-lg shadow-violet-500/20 scale-110 mx-1'
                  : step.isSystem
                    ? 'bg-white/5 text-white/50 border-white/5'
                    : 'bg-white/5 text-white/90 border-white/10'
              )}
            >
              <step.icon size={14} className={step.isBrain ? 'text-white' : step.isSystem ? 'text-white/40' : 'text-white/80'} />
              <span className={clsx(step.isBrain && 'font-bold tracking-wide')}>{step.name}</span>
              {step.isBrain && (
                <span className="text-[9px] bg-white/20 text-white px-1.5 py-0.5 rounded-full ml-1 font-bold uppercase tracking-wider">Cerebro</span>
              )}
            </motion.div>

            {i < steps.length - 1 && (
              <div className="flex items-center mx-2">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: i * 0.1 + 0.15 }}
                  className="w-6 h-[2px] bg-gradient-to-r from-blue-300/60 to-blue-400/60 origin-left"
                />
                <ArrowRight size={12} className="text-blue-400 -ml-1" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ActivityFeed({ activities, feedRef }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
            <Activity size={15} />
          </div>
          <h2 className="text-sm font-semibold text-white font-syne">Actividad en tiempo real</h2>
          <motion.span
            className="w-2 h-2 rounded-full bg-emerald-400 inline-block"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
        <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full font-medium">
          {activities.length} eventos
        </span>
      </div>

      <div ref={feedRef} className="space-y-1 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
        {activities.map((item, i) => {
          const agent = AGENTS_DATA.find(a => a.id === item.agent)
          const Icon = agent ? (AGENT_ICON_MAP[agent.icon] || Bot) : Activity
          return (
            <motion.div
              key={item.id}
              initial={i === 0 ? { opacity: 0, x: -8 } : undefined}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                i === 0 ? 'bg-white/5' : 'hover:bg-white/[0.02]'
              )}
            >
              <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', getAgentLightColor(item.agent))}>
                <Icon size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/80 font-medium truncate">
                  {agent?.name?.split(' ')[0] || 'Agente'}: {item.action}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Clock size={11} className="text-white/30" />
                <span className="text-[10px] text-white/40 whitespace-nowrap">{item.time}</span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function AgentModal({ agent, onClose, dbAgent }) {
  const AgentIcon = AGENT_ICON_MAP[agent.icon] || Bot
  const maxVal = Math.max(...agent.stats.dailyHistory)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-white/5 border border-white/10 rounded-xl shadow-modal overflow-hidden"
      >
        <div className={clsx('h-2 bg-gradient-to-r', agent.color)} />

        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center shadow-lg', `bg-gradient-to-br ${agent.color}`)}>
                <AgentIcon size={24} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white font-syne">{agent.name}</h2>
                  <span className={clsx('w-2.5 h-2.5 rounded-full inline-block', agent.active ? 'bg-emerald-400' : 'bg-white/20')} />
                </div>
                <p className="text-xs text-white/50">{agent.title}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <p className="text-sm text-white/60 leading-relaxed mb-5">{agent.fullDescription}</p>

          <div className="grid grid-cols-4 gap-2 mb-5">
            <ModalStat label="Leads/mes" value={agent.stats.leadsMonth} />
            <ModalStat label="Respuesta" value={agent.stats.avgResponse} />
            <ModalStat label="Fuentes" value={agent.stats.sources} />
            <ModalStat label="Conversión" value={`${agent.stats.conversionRate}%`} />
          </div>

          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-white">Rendimiento diario (7 días)</span>
              <span className="text-[10px] text-white/40">hoy: {agent.stats.dailyHistory[agent.stats.dailyHistory.length - 1]}</span>
            </div>
            <div className="flex items-end gap-1.5 h-24">
              {agent.stats.dailyHistory.map((val, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${(val / maxVal) * 100}%` }}
                  transition={{ delay: i * 0.06, type: 'spring', stiffness: 200, damping: 20 }}
                  className={clsx('flex-1 rounded-t-sm', `bg-gradient-to-t ${agent.color}`, i === agent.stats.dailyHistory.length - 1 ? 'opacity-100' : 'opacity-60')}
                />
              ))}
            </div>
            <div className="flex items-center justify-between mt-1.5">
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
                <span key={d} className="text-[9px] text-white/40 flex-1 text-center">{d}</span>
              ))}
            </div>
          </div>

          {dbAgent && (
            <div className="mb-4 p-3 bg-black/20 rounded-lg">
              <div className="flex items-center gap-2 text-[11px] text-white/40 mb-1">
                <Database size={11} />
                <span>Estado en DB: {dbAgent.status === 'active' ? 'Activo' : 'Inactivo'}</span>
                <span className="mx-1">·</span>
                <span>Ejecuciones: {dbAgent.metrics?.executions || 0}</span>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold text-white mb-2">Acciones recientes</h4>
            <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1">
              {agent.recentActions.map((ra, i) => (
                <div key={i} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.02] transition-colors">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-300 shrink-0" />
                  <span className="text-xs text-white/60 flex-1">{ra.action}</span>
                  <span className="text-[10px] text-white/30 whitespace-nowrap">{ra.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function ModalStat({ label, value }) {
  return (
    <div className="bg-white/[0.03] rounded-lg p-2.5 text-center">
      <div className="text-xs font-bold text-white">{value}</div>
      <div className="text-[9px] text-white/40 uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  )
}
