import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bot, UserPlus, Handshake, Brain, PenLine, Calculator,
  BarChart3, ArrowRight, Activity, Clock, Zap,
  X, Check, Users, MessageSquare, TrendingUp, Sparkles,
  PhoneCall, FileText, Database, Send, Globe, DollarSign, Bell, Calendar, RefreshCw, Tag, Copy
} from 'lucide-react'
import clsx from 'clsx'
import api from '../lib/api'
import { useStore } from '../lib/store'
import { usePlan } from '../hooks/usePlan'
import { PLANS } from '../lib/billing/plans'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

const AGENT_ICONS = {
  UserPlus, Handshake, Brain, PenLine, Calculator,
  BarChart3, Activity, Bot, PhoneCall, FileText,
  TrendingUp, Globe, DollarSign, Bell, Calendar,
  RefreshCw, Tag, Database,
}

const AGENTS_DATA = [
  {
    id: 'captador', name: 'Captador IA', title: 'Adquisición de leads', icon: 'UserPlus',
    color: 'from-emerald-500 to-emerald-600', lightColor: 'bg-emerald-50 text-emerald-600',
    description: 'Escanea portales inmobiliarios y redes sociales para captar leads calificados automáticamente.',
    fullDescription: 'El Captador IA monitorea 24/7 los principales portales inmobiliarios, redes sociales y fuentes de tráfico para identificar y capturar leads potenciales. Utiliza NLP para calificar el interés y la capacidad de compra antes de ingresarlos al CRM.',
    stats: { leadsMonth: 342, avgResponse: '1.2s', sources: 6, conversionRate: 23, dailyHistory: [65, 72, 58, 84, 71, 48, 63] },
  },
  {
    id: 'vendedor', name: 'Vendedor IA', title: 'Conversión y ventas', icon: 'Handshake',
    color: 'from-blue-500 to-blue-600', lightColor: 'bg-blue-50 text-blue-600',
    description: 'Automatiza el proceso de ventas y califica leads en tiempo real.',
    fullDescription: 'El Vendedor IA gestiona todo el ciclo de ventas digital: desde el primer contacto hasta el cierre. Realiza llamadas automatizadas, envía seguimientos personalizados y califica leads por probabilidad de compra usando modelos predictivos.',
    stats: { leadsMonth: 187, avgResponse: '3.7s', sources: 4, conversionRate: 31, dailyHistory: [42, 38, 51, 44, 39, 41, 37] },
  },
  {
    id: 'coordinador', name: 'Coordinador IA', title: 'Orquestación del sistema', icon: 'Brain',
    color: 'from-violet-500 to-violet-600', lightColor: 'bg-violet-50 text-violet-600',
    isBrain: true,
    description: 'Cerebro del sistema. Orquesta y optimiza el flujo entre todos los agentes.',
    fullDescription: 'El Coordinador IA es el cerebro del ecosistema. Supervisa, orquesta y optimiza el trabajo de todos los demás agentes. Asigna tareas según carga de trabajo, detecta cuellos de botella y rebalancea el flujo en tiempo real para máxima eficiencia.',
    stats: { leadsMonth: 421, avgResponse: '0.4s', sources: 12, conversionRate: 41, dailyHistory: [82, 79, 88, 85, 80, 83, 78] },
  },
  {
    id: 'copywriter', name: 'Copywriter IA', title: 'Redacción y contenido', icon: 'PenLine',
    color: 'from-amber-500 to-amber-600', lightColor: 'bg-amber-50 text-amber-600',
    description: 'Genera contenido persuasivo y descripciones de propiedades.',
    fullDescription: 'El Copywriter IA redacta descripciones de propiedades optimizadas para conversión, mensajes de seguimiento personalizados, respuestas automáticas y contenido para redes sociales.',
    stats: { leadsMonth: 89, avgResponse: '0.8s', sources: 3, conversionRate: 28, dailyHistory: [31, 28, 35, 42, 38, 34, 41] },
  },
  {
    id: 'tasador', name: 'Tasador IA', title: 'Valoración de propiedades', icon: 'Calculator',
    color: 'from-cyan-500 to-cyan-600', lightColor: 'bg-cyan-50 text-cyan-600',
    description: 'Calcula valoraciones precisas de propiedades en segundos.',
    fullDescription: 'El Tasador IA utiliza modelos de machine learning entrenados con miles de transacciones para calcular valoraciones precisas en segundos. Considera ubicación, metros, estado, comparables de mercado y tendencias del barrio.',
    stats: { leadsMonth: 156, avgResponse: '2.1s', sources: 5, conversionRate: 19, dailyHistory: [22, 18, 25, 20, 15, 21, 19] },
  },
  {
    id: 'analista', name: 'Analista IA', title: 'Inteligencia de negocio', icon: 'BarChart3',
    color: 'from-rose-500 to-rose-600', lightColor: 'bg-rose-50 text-rose-600',
    description: 'Analiza datos y genera insights accionables para la agencia.',
    fullDescription: 'El Analista IA procesa todos los datos del CRM para generar informes inteligentes, detectar tendencias del mercado, predecir estacionalidad y recomendar acciones estratégicas.',
    stats: { leadsMonth: 203, avgResponse: '1.5s', sources: 8, conversionRate: 34, dailyHistory: [18, 22, 16, 28, 21, 23, 20] },
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

function getAgentLightColor(id) {
  const agent = AGENTS_DATA.find(a => a.id === id)
  return agent ? agent.lightColor : 'bg-blue-50 text-blue-600'
}

function timeAgo(isoDate) {
  if (!isoDate) return null
  const diff = Date.now() - new Date(isoDate).getTime()
  if (isNaN(diff)) return null
  const s = Math.floor(diff / 1000)
  if (s < 5) return 'ahora'
  if (s < 60) return `hace ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

const CHAT_PLACEHOLDERS = {
  captador: 'Describe el perfil del lead para cualificar... Ej: "Carlos busca piso en Triana, presupuesto 280k"',
  vendedor: '¿Qué quieres que el Vendedor haga con este lead?',
  coordinador: 'Pide análisis o decisión de orquestación...',
  copywriter: '¿Qué contenido necesitas redactar?',
  tasador: 'Describe la propiedad para valorar...',
  analista: '¿Qué análisis necesitas? Ej: "Análisis del pipeline semanal"',
  agendador: '¿Qué visita hay que agendar?',
  nurturing: '¿Qué lead necesita reactivación?',
  documentador: '¿Qué documentación se necesita?',
  seo: '¿Qué contenido SEO necesitas optimizar?',
  financiero: 'Describe el perfil financiero para analizar...',
  notificador: '¿Qué notificación necesita el equipo?',
}

export default function AgentsIAPage() {
  const { user } = useStore()
  const [showInactive, setShowInactive] = useState(false)
  const [agents, setAgents] = useState(AGENTS_DATA.map(a => ({ ...a, active: false, metrics: { leads: 0, conversations: 0, successRate: null }, lastAction: null, lastActionAt: null })))
  const [activities, setActivities] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [dbAgents, setDbAgents] = useState({})

  const [chatAgent, setChatAgent] = useState(null)
  const [chatMessage, setChatMessage] = useState('')
  const [chatResponse, setChatResponse] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatHistory, setChatHistory] = useState([])
  const [leads, setLeads] = useState([])
  const [selectedLeadId, setSelectedLeadId] = useState('')

  const [upgradeModal, setUpgradeModal] = useState(null)
  const [tick, setTick] = useState(0)

  const feedRef = useRef(null)

  const loadAgents = useCallback(() => {
    api.get('/agents').then(data => {
      if (Array.isArray(data)) {
        const map = {}
        data.forEach(a => { map[a.type] = a })
        setDbAgents(prev => ({ ...prev, ...map }))
        setAgents(prev => prev.map(a => {
          const db = map[a.id]
          if (db) {
            const s = db.stats || {}
            return {
              ...a,
              active: db.is_active === 1 || db.status === 'active',
              metrics: {
                leads: s.leads_today ?? 0,
                conversations: s.messages_today ?? 0,
                successRate: s.success_rate !== undefined && s.success_rate !== null ? s.success_rate : null,
              },
              lastAction: s.last_action || null,
              lastActionAt: s.last_action_at || null,
            }
          }
          return a
        }))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => { loadAgents() }, [loadAgents, user?.id])

  // Auto-refresh agents every 60s (Fix 6)
  useEffect(() => {
    const interval = setInterval(loadAgents, 60000)
    return () => clearInterval(interval)
  }, [loadAgents])

  // Recalculate timeAgo every 10s
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10000)
    return () => clearInterval(interval)
  }, [])

  // Fetch activities and leads on mount
  useEffect(() => {
    api.get('/activities', { limit: 100 }).then(acts => {
      if (Array.isArray(acts)) {
        const agentActs = acts
          .filter(a => a.agent_type)
          .map(a => ({
            id: a.id,
            agent: a.agent_type,
            action: a.description || a.title || 'Acción ejecutada',
            type: a.type || 'ia_action',
            created_at: a.created_at,
          }))
        setActivities(agentActs)
      }
    }).catch(() => {})

    api.get('/leads', { limit: 100 }).then(res => {
      if (res && Array.isArray(res.leads)) {
        setLeads(res.leads)
        if (res.leads.length > 0) setSelectedLeadId(res.leads[0].id)
      } else if (Array.isArray(res)) {
        setLeads(res)
        if (res.length > 0) setSelectedLeadId(res[0].id)
      }
    }).catch(() => {})
  }, [user?.id])

  // WebSocket Live Subscription (Fix 3)
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`

    let socket
    let reconnectTimeout

    function connect() {
      try {
        socket = new WebSocket(wsUrl)

        socket.onopen = () => {
          socket.send(JSON.stringify({ type: 'subscribe', channels: ['activities'] }))
        }

        socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'activity' && msg.data) {
              const a = msg.data
              if (a.agent_type) {
                const newAct = {
                  id: a.id || Math.random(),
                  agent: a.agent_type,
                  action: a.description || a.title || 'Acción ejecutada',
                  type: a.type || 'ia_action',
                  created_at: a.created_at || new Date().toISOString(),
                }
                setActivities(prev => {
                  if (prev.some(p => p.id === newAct.id)) return prev
                  return [newAct, ...prev].slice(0, 50)
                })
              }
            }
          } catch (e) {}
        }

        socket.onclose = () => {
          reconnectTimeout = setTimeout(connect, 3000)
        }

        socket.onerror = () => { socket.close() }
      } catch (e) {}
    }

    connect()

    return () => {
      if (socket) socket.close()
      clearTimeout(reconnectTimeout)
    }
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
    let wasActive = false
    setAgents(prev => prev.map(a => {
      if (a.id === id) {
        wasActive = a.active
        return { ...a, active: !a.active }
      }
      return a
    }))

    const dbAgent = dbAgents[id]
    if (dbAgent?.id) {
      try {
        const updated = await api.patch(`/agents/${dbAgent.id}/toggle`, {
          is_active: !wasActive
        })
        setDbAgents(prev => ({
          ...prev,
          [id]: {
            ...prev[id],
            ...updated,
            is_active: updated.is_active,
            stats: updated.stats,
          }
        }))
      } catch (err) {
        setAgents(prev => prev.map(a => a.id === id ? { ...a, active: wasActive } : a))
        if (err.status === 402) {
          setUpgradeModal({ reason: err.body?.error || 'Agente no disponible en tu plan', upgrade_url: err.body?.upgrade_url || '/pricing' })
        } else {
          toast.error('No se pudo actualizar el agente')
        }
      }
    }
  }, [dbAgents])

  const filteredAgents = showInactive ? agents : agents.filter(a => a.active)

  const sendToAgent = async () => {
    if (!chatAgent || !chatMessage.trim()) return
    setChatLoading(true)
    setChatResponse('')

    const dbAgent = dbAgents[chatAgent]
    if (!dbAgent?.id) {
      setChatResponse('Error: Este agente no está configurado en el sistema.')
      setChatLoading(false)
      return
    }

    const lead = leads.find(l => l.id === selectedLeadId)
    const leadContext = lead ? {
      lead_id: lead.id,
      name: lead.name,
      score: lead.ia_score || 0,
      stage: lead.pipeline_stage || lead.status || '',
      zone: lead.zone || '',
      budget: lead.budget || 0,
      summary: lead.ia_summary || lead.property_interest || '',
    } : {}

    try {
      const res = await fetch(`/api/agents/${dbAgent.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...api.authHeaders },
        body: JSON.stringify({
          message: chatMessage,
          conversation_history: chatHistory,
          lead_context: leadContext,
          stream: true,
        }),
      })

      if (!res.ok || !res.body) {
        setChatResponse('Error al ejecutar el agente')
        setChatLoading(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let full = ''
      let lineBuffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        lineBuffer += decoder.decode(value, { stream: true })
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
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

  const copyResponse = () => {
    if (chatResponse) {
      navigator.clipboard.writeText(chatResponse)
      toast.success('Copiado al portapapeles')
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
        dbAgents={dbAgents}
        tick={tick}
      />

      <AgentFlow activities={activities} />

      <ActivityFeed activities={activities} feedRef={feedRef} tick={tick} />

      {/* Console de Agentes IA (Fix 4) */}
      <ConsoleSection
        chatAgent={chatAgent}
        setChatAgent={setChatAgent}
        chatMessage={chatMessage}
        setChatMessage={setChatMessage}
        chatResponse={chatResponse}
        chatLoading={chatLoading}
        chatHistory={chatHistory}
        sendToAgent={sendToAgent}
        copyResponse={copyResponse}
        selectedLeadId={selectedLeadId}
        setSelectedLeadId={setSelectedLeadId}
        leads={leads}
        dbAgents={dbAgents}
      />

      <AnimatePresence>
        {selectedAgent && (
          <AgentModal
            agent={selectedAgent}
            onClose={() => setSelectedAgent(null)}
            dbAgent={dbAgents[selectedAgent.id]}
          />
        )}
      </AnimatePresence>

      {/* Upgrade Modal (Fix 2) */}
      <AnimatePresence>
        {upgradeModal && (
          <UpgradeModal modal={upgradeModal} onClose={() => setUpgradeModal(null)} />
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

function AgentGrid({ agents, toggleAgent, onSelect, dbAgents, tick }) {
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
            tick={tick}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

function AgentCard({ agent, index, toggleAgent, onSelect, isAvailable, tick }) {
  const AgentIcon = AGENT_ICONS[agent.icon] || Bot
  const locked = !isAvailable

  const neededPlan = locked
    ? Object.entries(PLANS).find(([_, p]) =>
        (p.available_agents || []).includes(agent.id)
      )?.[0] ?? 'agencia'
    : null

  const hasActivity = agent.metrics.leads > 0 || agent.metrics.conversations > 0

  const lastActionText = agent.lastActionAt
    ? `${agent.lastAction || 'Última acción'} ${timeAgo(agent.lastActionAt) ? `(${timeAgo(agent.lastActionAt)})` : ''}`
    : 'Sin actividad reciente'

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
            locked ? 'opacity-30 cursor-not-allowed' : '',
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
        <Metric label="Leads hoy" value={hasActivity ? agent.metrics.leads : (locked ? '—' : 0)} icon={Users} color="text-blue-300" />
        <Metric label="Convers." value={hasActivity ? agent.metrics.conversations : (locked ? '—' : 0)} icon={MessageSquare} color="text-amber-300" />
        <Metric
          label="Éxito"
          value={locked ? '—' : (agent.metrics.successRate !== null && agent.metrics.successRate !== undefined ? `${agent.metrics.successRate}%` : (hasActivity ? '—' : '—'))}
          icon={TrendingUp}
          color={
            locked ? 'text-white/20' :
            agent.metrics.successRate >= 80 ? 'text-emerald-400' :
            agent.metrics.successRate >= 60 ? 'text-amber-400' :
            agent.metrics.successRate !== null ? 'text-red-400' :
            'text-white/20'
          }
        />
      </div>

      {!locked && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-2">
            <Zap size={12} className={hasActivity ? 'text-blue-300/60' : 'text-white/20'} />
            <p className={clsx(
              'text-[11px] leading-tight line-clamp-1',
              hasActivity ? 'text-white/50' : 'text-white/30 italic'
            )}>
              {lastActionText}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  )
}

function Metric({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white/[0.04] rounded-lg p-2 text-center">
      <div className="flex items-center justify-center gap-1 mb-0.5">
        <Icon size={10} className={color || 'text-white/20'} />
        <span className="text-[10px] text-white/40 uppercase tracking-wider">{label}</span>
      </div>
      <span className={clsx(
        'text-sm font-bold',
        value === '—' || value === 0 ? 'text-white/20' : 'text-white'
      )}>
        {value}
      </span>
    </div>
  )
}

function AgentFlow({ activities }) {
  const steps = [
    { id: 'captador', name: 'Captador IA', icon: UserPlus, color: 'from-emerald-500 to-emerald-600' },
    { id: 'crm', name: 'CRM', icon: Database, color: 'from-blue-400 to-blue-600', isSystem: true },
    { id: 'coordinador', name: 'Coordinador IA', icon: Brain, color: 'from-violet-500 to-violet-600', isBrain: true },
    { id: 'vendedor', name: 'Vendedor IA', icon: Handshake, color: 'from-blue-500 to-blue-600' },
    { id: 'cierre', name: 'Cierre', icon: Check, color: 'from-emerald-500 to-emerald-600', isSystem: true },
  ]

  const now = Date.now()
  const fiveMinAgo = now - 5 * 60 * 1000
  const recentAgentEvent = activities.find(a => {
    const t = new Date(a.created_at).getTime()
    return !isNaN(t) && t > fiveMinAgo
  })
  const activeAgentId = recentAgentEvent?.agent || null

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
        {steps.map((step, i) => {
          const isActive = !step.isSystem && activeAgentId === step.id
          return (
            <div key={step.id} className="flex items-center">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all duration-500',
                  step.isBrain
                    ? 'bg-gradient-to-r from-violet-500 to-blue-500 text-white border-transparent shadow-lg shadow-violet-500/20 scale-110 mx-1'
                    : step.isSystem
                      ? 'bg-white/5 text-white/50 border-white/5'
                      : isActive
                        ? 'bg-white/10 text-white border-purple-400/40 shadow-lg shadow-purple-500/10'
                        : 'bg-white/5 text-white/90 border-white/10'
                )}
                style={isActive ? { boxShadow: '0 0 20px rgba(139, 92, 246, 0.3)' } : {}}
              >
                {isActive && (
                  <motion.span
                    className="w-2 h-2 rounded-full bg-purple-400"
                    animate={{ opacity: [1, 0.3, 1], scale: [1, 0.7, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
                <step.icon size={14} className={step.isBrain ? 'text-white' : step.isSystem ? 'text-white/40' : isActive ? 'text-purple-300' : 'text-white/80'} />
                <span className={clsx(step.isBrain && 'font-bold tracking-wide')}>{step.name}</span>
                {step.isBrain && (
                  <span className="text-[9px] bg-white/20 text-white px-1.5 py-0.5 rounded-full ml-1 font-bold uppercase tracking-wider">Cerebro</span>
                )}
                {isActive && (
                  <span className="text-[9px] bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded-full ml-0.5 font-medium">Activo</span>
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
          )
        })}
      </div>
    </div>
  )
}

function ActivityFeed({ activities, feedRef, tick }) {
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
        <span className={clsx(
          'text-[10px] px-2 py-0.5 rounded-full font-medium',
          activities.length > 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-white/30 bg-white/5'
        )}>
          {activities.length} eventos
        </span>
      </div>

      <div ref={feedRef} className="space-y-1 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
        {activities.map((item, i) => {
          const agent = AGENTS_DATA.find(a => a.id === item.agent)
          const Icon = agent ? (AGENT_ICONS[agent.icon] || Bot) : Activity
          const ago = timeAgo(item.created_at)
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
                <span className="text-[10px] text-white/40 whitespace-nowrap">{ago || 'ahora'}</span>
              </div>
            </motion.div>
          )
        })}
        {activities.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Activity size={28} className="text-white/10 mb-3" />
            <p className="text-sm text-white/30 font-medium">Sin actividad reciente</p>
            <p className="text-xs text-white/20 mt-1">Las acciones de los agentes aparecerán aquí en tiempo real</p>
          </div>
        )}
      </div>
    </div>
  )
}

function AgentModal({ agent, onClose, dbAgent }) {
  const AgentIcon = AGENT_ICONS[agent.icon] || Bot
  const s = agent.stats || {}
  const maxVal = Math.max(...(s.dailyHistory || [1]))

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
            <ModalStat label="Leads/mes" value={s.leadsMonth} />
            <ModalStat label="Respuesta" value={s.avgResponse} />
            <ModalStat label="Fuentes" value={s.sources} />
            <ModalStat label="Conversión" value={`${s.conversionRate}%`} />
          </div>

          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-white">Rendimiento diario (7 días)</span>
              <span className="text-[10px] text-white/40">hoy: {s.dailyHistory?.[s.dailyHistory.length - 1] ?? 0}</span>
            </div>
            <div className="flex items-end gap-1.5 h-24">
              {(s.dailyHistory || []).map((val, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${(val / maxVal) * 100}%` }}
                  transition={{ delay: i * 0.06, type: 'spring', stiffness: 200, damping: 20 }}
                  className={clsx('flex-1 rounded-t-sm', `bg-gradient-to-t ${agent.color}`, i === s.dailyHistory.length - 1 ? 'opacity-100' : 'opacity-60')}
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
              <div className="flex items-center gap-2 text-[11px] text-white/40 mb-2">
                <Database size={11} />
                <span>Estado: {dbAgent.is_active ? 'Activo' : 'Inactivo'}</span>
                <span className="mx-1">·</span>
                <span>Ejecuciones: {dbAgent.metrics?.executions || 0}</span>
              </div>
              {dbAgent.stats && (
                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-white/5 text-center">
                  <div>
                    <div className="text-[10px] text-white/40 uppercase font-medium">Leads Hoy</div>
                    <div className="text-sm font-bold text-white">{dbAgent.stats.leads_today ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/40 uppercase font-medium">Mensajes Hoy</div>
                    <div className="text-sm font-bold text-white">{dbAgent.stats.messages_today ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/40 uppercase font-medium">Tasa Éxito</div>
                    <div className="text-sm font-bold text-white">
                      {dbAgent.stats.success_rate !== null && dbAgent.stats.success_rate !== undefined ? `${dbAgent.stats.success_rate}%` : '—'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
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

function extractDisplayText(raw) {
  if (!raw) return raw
  try {
    const data = JSON.parse(raw)
    const contenido = data?.contenido_generado
    if (typeof contenido === 'string' && contenido.trim()) return contenido.trim()
    if (contenido && typeof contenido === 'object') {
      const priorityKeys = ['whatsapp', 'mensaje', 'mensaje_whatsapp', 'respuesta', 'texto', 'contenido', 'body', 'text']
      for (const k of priorityKeys) {
        if (typeof contenido[k] === 'string' && contenido[k].trim()) return contenido[k].trim()
      }
      for (const v of Object.values(contenido)) {
        if (typeof v === 'string' && v.trim()) return v.trim()
      }
    }
    if (data?.analisis_ejecutivo) return data.analisis_ejecutivo
  } catch {
    // Aún streameando (JSON incompleto) o no es JSON — mostrar tal cual
  }
  return raw
}

function ConsoleSection({
  chatAgent, setChatAgent, chatMessage, setChatMessage,
  chatResponse, chatLoading, chatHistory,
  sendToAgent, copyResponse,
  selectedLeadId, setSelectedLeadId, leads, dbAgents
}) {
  const chatResponseDisplay = extractDisplayText(chatResponse)
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <Bot size={15} />
          </div>
          <h2 className="text-sm font-semibold text-white font-syne">Consola de Agentes IA</h2>
          <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full font-medium">OPENROUTER</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-white/50 whitespace-nowrap font-medium">Lead Objetivo:</span>
          <select
            value={selectedLeadId}
            onChange={e => setSelectedLeadId(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer min-w-[200px]"
          >
            {leads.length === 0 ? (
              <option value="" className="bg-ink text-white/60">No hay leads disponibles</option>
            ) : (
              leads.map(l => (
                <option key={l.id} value={l.id} className="bg-ink text-white">
                  {l.name} ({l.status || 'Nuevo'}) · Score: {l.ia_score || 0}%
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(AGENT_COLORS).map(([type, color]) => {
          const meta = AGENTS_DATA.find(a => a.id === type)
          return (
            <button
              key={type}
              onClick={() => { setChatAgent(type); setChatMessage(''); setChatResponse(''); }}
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
          {chatAgent === 'captador' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-1">
              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Genera un mensaje de WhatsApp Rompe-Hielo altamente personalizado e informal para un propietario 'Particular Vende' a partir de los datos de su anuncio. Haz que se sienta único y no una plantilla automática.\n\nTexto del Anuncio:\n\"Vendo precioso piso en el barrio de Nervión, Sevilla. 3 habitaciones, reformado hace 2 años. Vistas al parque. Precio: 215.000€. Abstenerse agencias con urgencia.\""
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">📱 Botón 1</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-indigo-300 transition-colors">
                  WhatsApp Rompe-Hielo (Particular Vende)
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Pega el texto o enlace del anuncio y la IA generará un mensaje de WhatsApp corto, educado y altamente personalizado.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Genera un Guion de Llamada Fría Anti-Rechazo paso a paso para mí (el agente humano). Dime qué decir exactamente en los primeros 15 segundos para enganchar y cómo rebatir la objeción típica de 'no quiero trabajar con agencias'.\n\nPropiedad del Particular:\n- Piso en Nervión (215.000€)\n- Estado: Reformado, urge venta por traslado laboral."
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">📞 Botón 2</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-amber-300 transition-colors">
                  Guion de Llamada Fría Anti-Rechazo
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Genera un guion paso a paso para los primeros 15 segundos y cómo rebatir el clásico "no quiero trabajar con agencias".
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Redacta una Carta de Propuesta de Valor Express en formato de correo electrónico elegante, dirigida a un propietario que lleva más de 3 meses con el piso estancado en internet. Demuéstrale matemáticamente el coste de oportunidad y por qué pierde dinero al no trabajar con un profesional.\n\nDatos:\n- Propietario: Javier\n- Zona: Nervión\n- Precio: 215.000€\n- Tiempo publicado: 4 meses en portales"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 hover:border-rose-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">📩 Botón 3</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-rose-300 transition-colors">
                  Carta de Propuesta de Valor Express
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Correo electrónico impecable enfocado a propietarios estancados, demostrando matemáticamente por qué pierden dinero.
                </p>
              </button>
            </div>
          )}

          {chatAgent === 'vendedor' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-1">
              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Actúa como un Destructor de Objeciones en Vivo. Genera tres opciones de respuesta inteligente para rebatir esta objeción de forma inmediata sin perder al comprador ni dañar el precio del propietario, enfocándote en desactivar el miedo real del comprador.\n\nObjeción del Cliente:\n\"Dice que la reforma que necesita el piso es demasiado cara y quiere rebajar 30.000€ del precio.\"\n\nDatos de la propiedad:\n- Piso de 3 habitaciones en Valencia\n- Precio de salida: 195.000€"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">🛡️ Botón 1</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-red-300 transition-colors">
                  Destructor de Objeciones en Vivo
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Introduce la objeción exacta del lead y la IA generará tres contra-argumentos brillantes para rebatirla al instante.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Genera un Guion de Cierre Post-Visita (El Calentón) para enviar por WhatsApp o guiar una llamada telefónica justo después de terminar el recorrido. Enfócalo en empujarlo a realizar una oferta de reserva hoy mismo, recordándole los puntos fuertes del piso que más le emocionaron.\n\nDatos del cliente y visita:\n- Comprador: David (tiene 2 hijos)\n- Propiedad visitada: Piso con terraza amplia cerca de colegios\n- Qué le encantó: La zona de juegos comunitaria y la gran terraza orientada al sur."
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">✍️ Botón 2</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-amber-300 transition-colors">
                  Guion de Cierre Post-Visita (El Calentón)
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Genera el mensaje perfecto para que el cliente pase a la acción justo después de la visita y formalice una oferta.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Redacta una Contraoferta Ganadora equilibrada para enviar por escrito, justificando técnicamente por qué el punto medio sugerido es un trato excelente para ambas partes (propietario y comprador).\n\nDatos:\n- Precio de venta solicitado: 280.000€\n- Oferta presentada por comprador: 245.000€\n- Punto medio sugerido: 262.500€\n- Justificaciones del inmueble: Excelentes acabados, zona de alta demanda que no se devaluará."
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">🤝 Botón 3</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-blue-300 transition-colors">
                  Redactor de Contraofertas Ganadoras
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Escribe una propuesta formal intermedia que equilibre los intereses del comprador y del vendedor usando justificaciones técnicas sólidas.
                </p>
              </button>
            </div>
          )}

          {chatAgent === 'coordinador' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-1">
              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Genera la Hoja de Ruta de la Mañana (Daily Briefing). Analiza de manera prioritaria las actividades de mayor impacto financiero y presenta un plan de acción estructurado y ordenado por estricta urgencia para mí o para el equipo.\n\nDatos de Actividad Reciente:\n- 2 llamadas críticas de cierre con leads calificados (Score > 75%)\n- 3 visitas presenciales programadas por el Agendador para hoy por la tarde\n- 1 borrador de contrato de arras pendiente de firmar (ya verificado por el Documentador)\n- 5 nuevos leads de captación sin procesar"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10 hover:border-violet-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
                  <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">🌅 Botón 1</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-violet-300 transition-colors">
                  Hoja de Ruta de la Mañana (Daily Briefing)
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Analiza el estado del CRM de hoy y genera un plan de acción y prioridades del día enfocado en cerrar comisiones.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Realiza una Auditoría de Inmuebles Estancados. Formula un plan de rescate inmediato coordinando el trabajo de los demás agentes de IA para reactivar la comercialización de este inmueble parado.\n\nPropiedad estancada:\n- Tipo: Chalet en la periferia de Sevilla\n- Tiempo en cartera: 120 días sin visitas recientes\n- Precio actual: 295.000€\n- Problema detectado: Muy pocos clics en portales"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 hover:border-rose-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">🚨 Botón 2</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-rose-300 transition-colors">
                  Auditoría de Inmuebles Estancados
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Genera un plan integral coordinado con otros agentes de IA para reactivar la comercialización de una propiedad inactiva.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Actúa como un Asignador de Leads Inteligente. Determina qué asesor de la plantilla es el más idóneo para gestionar este lead caliente basándote en la zona y especialización, redactando la nota de traspaso interna de inmediato.\n\nDatos:\n- Nuevo Lead: Alejandro (Presupuesto 450k, busca ático de diseño)\n- Zona deseada: Ruzafa, Valencia\n- Plantilla disponible:\n  1. Carlos (Especialista en pisos económicos y periferia, carga: baja)\n  2. Laura (Especialista en obra nueva y áticos de diseño en Ruzafa, carga: media)\n  3. Miguel (Especialista en locales y oficinas, carga: alta)"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">👥 Botón 3</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-emerald-300 transition-colors">
                  Asignador de Leads Inteligente
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Analiza el perfil del lead y la plantilla para asignar el prospecto al asesor humano idóneo y redactar la nota de traspaso.
                </p>
              </button>
            </div>
          )}

          {chatAgent === 'copywriter' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-1">
              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Escribe un Anuncio Hipnótico para Portales (Idealista/Fotocasa) usando el método AIDA y emojis estratégicos para romper el scroll.\n\nDatos de la propiedad:\n- Tipo: Piso familiar\n- Ubicación: Centro de Sevilla\n- Características: 3 habitaciones, 2 baños, balcón orientado al sur, cocina equipada\n- Precio: 245.000€\n- Beneficio clave a destacar: Espacio independiente para teletrabajar sin interrupciones."
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Botón 1</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-emerald-300 transition-colors">
                  Anuncio Hipnótico para Portales
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  El usuario introduce los datos básicos y la IA genera un texto optimizado para Idealista con emojis estratégicos para romper el scroll.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Genera un Filtro Anti-Cotillas para WhatsApp. Redacta un texto educado pero sumamente firme para enviar a un lead interesado antes de enseñarle el piso. Necesito asegurarme de que tiene el presupuesto y la financiación pre-aprobada para evitar visitas improductivas.\n\nPropiedad: Ático de lujo en Madrid (750.000€)"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10 hover:border-violet-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
                  <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Botón 2</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-violet-300 transition-colors">
                  Filtro Anti-Cotillas para WhatsApp
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Un texto educado pero firme para enviar a leads antes de enseñar un piso, asegurándose de que tienen presupuesto.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Redacta una Carta de Reactivación de Propietario. Es un email persuasivo basado en el método PAS (Problema, Agitación, Solución) dirigido a un propietario que infló el precio de su casa. Convéncelo con datos y tacto de bajar el precio sin que se ofenda.\n\nDatos:\n- Propietario: Manuel\n- Propiedad: Chalet adosado en la periferia\n- Precio actual: 320.000€ (Sugerido por mercado: 280.000€)\n- Tiempo en venta: 4 meses sin ofertas"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Botón 3</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-blue-300 transition-colors">
                  Carta de Reactivación de Propietario
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Un email persuasivo para ese propietario que infló el precio de su casa, convenciéndolo con datos de bajarlo sin que se ofenda.
                </p>
              </button>
            </div>
          )}

          {chatAgent === 'tasador' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-1">
              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Redacta un Argumentario de Reducción de Precio exquisito y científico para el propietario. Explícale matemáticamente por qué mantener el precio actual tan alto devalúa su vivienda frente a la competencia local.\n\nDatos:\n- Precio Actual: 350.000€\n- Precio sugerido por mercado: 295.000€\n- Meses en venta: 5 meses\n- Visitas recibidas: 12 visitas sin ninguna oferta"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">📈 Botón 1</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-cyan-300 transition-colors">
                  Argumentario de Reducción de Precio
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Redacta un correo persuasivo con bases analíticas y científicas explicando por qué mantener el precio inflado devalúa su propiedad.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Genera un Resumen de Tasación para PDF. Estructura el texto perfectamente maquetado con viñetas incluyendo: Análisis de la zona, Pros y Contras del inmueble, y una Horquilla de precios sugerida (Salida Inteligente, Mercado Real, Liquidación).\n\nDatos del Inmueble:\n- Tipo: Piso en el centro histórico\n- m² útiles: 85 m²\n- Estado: Buen estado\n- Planta: 3ª con ascensor\n- Extras: Balcón y trastero\n- Zona: Centro de Valencia"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">📋 Botón 2</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-emerald-300 transition-colors">
                  Resumen de Tasación para PDF
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Estructura un informe formal con viñetas que incluye análisis de la zona, pros y contras, y la horquilla de tres escenarios.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Redacta un Análisis de Competencia Local simulando cómo competiría este inmueble frente a otros similares de la zona, detallando qué características específicas lo diferencian para justificar su precio recomendado.\n\nDatos de la propiedad:\n- Piso de 90m² con terraza y piscina comunitaria en Valencia\n- Precio propuesto: 260.000€"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10 hover:border-violet-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
                  <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">🔍 Botón 3</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-violet-300 transition-colors">
                  Análisis de Competencia Local
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Comparativa de mercado teórica que muestra cómo destaca el inmueble sobre la oferta activa y justifica el precio de salida.
                </p>
              </button>
            </div>
          )}

          {chatAgent === 'agendador' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-1">
              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Redacta una Invitación de Cita por WhatsApp ultra-personalizada proponiendo dos opciones de horario diferentes para romper la fricción y facilitar la confirmación.\n\nDatos:\n- Cliente: Laura (Score: 85% - Muy Caliente)\n- Propiedad: Piso de 3 habs en Nervión\n- Horarios propuestos: Miércoles a las 17:00 o Viernes a las 09:30"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">💬 Botón 1</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-indigo-300 transition-colors">
                  Invitación de Cita por WhatsApp
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Propón dos opciones de horario diferentes y bien definidas para romper la fricción y facilitar que el cliente acepte inmediatamente.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Genera un Recordatorio de Asistencia de Alta Eficacia (Anti-Ghosting). Utiliza una estructura psicológica que apele al compromiso del cliente, recordándole con amabilidad que el asesor reservó esa hora en exclusiva y que hay otros compradores esperando.\n\nDatos:\n- Cliente: Laura\n- Cita: Mañana miércoles a las 17:00\n- Propiedad: Calle Luis Montoto, 45 (Sevilla)\n- Asesor asignado: Carlos Ruiz\n- CTA: Pídele responder con un 'SÍ' para confirmar."
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">⏰ Botón 2</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-emerald-300 transition-colors">
                  Recordatorio de Asistencia
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Redacta un recordatorio empático y psicológico 24 horas antes de la cita para asegurar la asistencia con una petición de confirmación explícita.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Redacta un mensaje de Reactivación y Re-agendación para un cliente que canceló o no se presentó (no-show) a la visita. Sé empático pero profesional, recordándole sutilmente la alta demanda del inmueble.\n\nDatos:\n- Cliente: Laura\n- Propiedad: Piso en Nervión (sigue recibiendo visitas e interés activo)"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 hover:border-rose-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">🔄 Botón 3</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-rose-300 transition-colors">
                  Reactivación / Re-agendación
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Mensaje persuasivo y comprensivo para repescar leads que se ausentaron de citas previas antes de que la propiedad sea reservada.
                </p>
              </button>
            </div>
          )}

          {chatAgent === 'nurturing' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-1">
              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Genera los primeros 3 emails de valor de una Secuencia de Bienvenida al Comprador que acaba de registrarse en la plataforma buscando piso. Asegúrate de cumplir con la regla del 80% valor y 20% comercial, usando asuntos gancho y párrafos cortos de máximo 3 líneas.\n\nContenido Requerido:\n- Email 1: \"Los 3 errores más comunes al pedir una hipoteca este año\".\n- Email 2: \"Guía rápida para revisar los gastos ocultos al comprar una casa\".\n- Email 3: \"Cómo detectar si un piso tiene vicios ocultos antes de visitarlo\"."
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">📧 Botón 1</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-indigo-300 transition-colors">
                  Secuencia de Bienvenida al Comprador
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Genera una secuencia automatizada de 3 correos educativos de alto valor para nuevos prospectos registrados.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Redacta una Alerta de Bajada de Precio Estratégica en un formato de correo sumamente persuasivo. No digas simplemente 'ha bajado', hazlo ver como una oportunidad única y de escasez antes de las vacaciones.\n\nDatos:\n- Zona: Barrio de Salamanca, Madrid\n- Ajuste: De 450.000€ a 415.000€\n- Contexto: El propietario busca acelerar el cierre antes de verano."
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">📉 Botón 2</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-emerald-300 transition-colors">
                  Alerta de Bajada de Precio Estratégica
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Envía una propuesta de oportunidad sumamente persuasiva a los interesados cuando un inmueble ajusta su valoración.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Genera un mensaje muy humano y nada comercial de Reactivación de Leads Dormidos (El café) para contactos con más de 3 meses sin interacción.\n\nDatos:\n- Lead: Alejandro\n- Zona de interés original: Ruzafa, Valencia"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 hover:border-rose-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">☕ Botón 3</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-rose-300 transition-colors">
                  Reactivación de Leads Dormidos (El café)
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Mensaje informal y empático diseñado para reanudar la conversación con leads inactivos desde hace meses.
                </p>
              </button>
            </div>
          )}

          {chatAgent === 'documentador' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-1">
              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Actúa como un Auditor de Nota Simple y Contratos. Analiza el siguiente texto de nota simple registral inmobiliaria, identifica banderas rojas o servidumbres activas, y genera un reporte estructurado indicando validez y alertas legales en un formato claro.\n\nTexto de la Nota Simple:\n\"REGISTRO DE LA PROPIEDAD Nº 3. FINCA REGISTRAL 12345. Titular actual: Don Francisco García López, titular del 100% por título de herencia no adjudicada definitivamente. Cargas: Afecta a una hipoteca activa a favor de Banco Central por importe pendiente de 85.000€, y una servidumbre de paso de acueducto activa en el lindero norte.\""
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">🔍 Botón 1</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-indigo-300 transition-colors">
                  Auditor de Nota Simple y Contratos
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Pega el texto de la nota simple o del borrador y la IA auditará el contenido al instante detectando cualquier riesgo o carga legal.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Actúa como un Generador de Cláusulas Especiales de Arras. Redacta la cláusula legal exacta, blindada y lista para copiar y pegar en el contrato de arras con numeración legal estándar.\n\nCondición especial requerida:\n\"El comprador necesita que el plazo de firma de la escritura de compraventa se prorrogue automáticamente hasta 30 días adicionales en caso de que la entidad bancaria se demore en la concesión u formalización definitiva del préstamo hipotecario, sin penalización alguna para la parte compradora.\""
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 hover:border-rose-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">✍️ Botón 2</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-rose-300 transition-colors">
                  Generador de Cláusulas Especiales de Arras
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Redacta cláusulas legales a medida perfectamente redactadas y blindadas para resolver cualquier imprevisto en los contratos.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Genera una Checklist de Documentación para Notaría detallada indicando todos los documentos físicos y digitales que debemos recabar antes de la firma para asegurar que la operación sea 100% fluida.\n\nTipo de Operación:\n- Compraventa de vivienda de segunda mano con préstamo hipotecario por parte del comprador, en la comunidad de Madrid."
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">📋 Botón 3</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-emerald-300 transition-colors">
                  Checklist de Documentación para Notaría
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Selecciona el tipo de operación y obtén la lista definitiva de documentos indispensables para evitar retrasos el día de la firma.
                </p>
              </button>
            </div>
          )}

          {chatAgent === 'financiero' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-1">
              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Realiza un Estudio de Viabilidad Hipotecaria Express basándote matemáticamente en la regla del 30-35% de ratio de endeudamiento y el esfuerzo de entrada (20% entrada + 10% gastos).\n\nDatos Financieros del Lead:\n- Ingresos Netos Mensuales: 3.200€ (pareja con contratos indefinidos de 4 años de antigüedad)\n- Ahorros Aportables: 45.000€\n- Deudas Activas: 250€/mes (préstamo de coche)\n- Precio de la Vivienda de Interés: 220.000€"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">🧮 Botón 1</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-cyan-300 transition-colors">
                  Estudio de Viabilidad Hipotecaria Express
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Introduce los ingresos, deudas, ahorros y precio del inmueble para obtener un cálculo preciso y veredicto definitivo: APTO, CON RIESGO o NO APTO.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Genera una Ficha de Perfil Financiero para Bancos. Redacta un resumen ejecutivo profesional y ordenado que pueda enviar directamente a directores de banco o brokers hipotecarios para agilizar la preaprobación definitiva.\n\nPerfil del Cliente:\n- Nombre: Laura y Manuel\n- Ingresos Conjuntos: 3.500€ netos/mes (Funcionaria y Contrato Indefinido)\n- Ahorros Aportables: 60.000€\n- Financiación solicitada: 80% LTV\n- Vivienda objetivo: Piso en Valencia (240.000€)"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">📋 Botón 2</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-indigo-300 transition-colors">
                  Ficha de Perfil Financiero para Bancos
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Recopila y estructura la información económica del comprador en un documento formal listo para enviar a brokers o directores de banco.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Genera una Estrategia de Reajuste de Presupuesto para un comprador calificado como 'NO APTO' para la casa que quería. Calcula matemáticamente cuál es su presupuesto de vivienda máximo viable y redacta un mensaje empático y sugerencias de reajuste.\n\nDatos de Entrada del Lead:\n- Comprador: Javier\n- Ingresos Netos: 1.800€/mes (indefinido de 1 año)\n- Ahorros: 15.000€\n- Deudas: Ninguna\n- Vivienda deseada: Piso en el centro de Madrid (230.000€)"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 hover:border-rose-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">📉 Botón 3</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-rose-300 transition-colors">
                  Estrategia de Reajuste de Presupuesto
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Calcula el presupuesto máximo de compra realista a partir de la capacidad del lead y redacta un mensaje de reajuste empático.
                </p>
              </button>
            </div>
          )}

          {chatAgent === 'analista' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-1">
              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Realiza una Auditoría de Rendimiento del Equipo de asesores de este mes. Procesa la actividad, identifica fugas específicas en la conversión de cada fase de venta de cada asesor y genera un informe ejecutivo confidencial estructurado.\n\nDatos de Asesores de la Agencia:\n- Asesor A: Excelente tasa de captación (15 propiedades este mes), pero pierde el 40% de los leads calificados en la fase de visita por falta de seguimiento comercial.\n- Asesor B: Poca captación activa (solo 3 propiedades), pero con una efectividad excepcional del 85% en cierres y firmas de arras tras las visitas presenciales."
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">📊 Botón 1</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-indigo-300 transition-colors">
                  Auditoría de Rendimiento del Equipo
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Genera un informe ejecutivo confidencial que analice el desempeño, conversiones e identifica fugas en el embudo de cada asesor del equipo.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Actúa como Detector de Fugas de Dinero (Leak Detector). Rastrea las propiedades estancadas y las interacciones de leads. Genera un diagnóstico estructurado alertándome dónde se está perdiendo la inversión y qué canales de publicidad descartar.\n\nDatos de Propiedades en Cartera:\n- Inmuebles estancados: 4 chalets de alto standing en zona norte con más de 90 días publicados en portales sin recibir ofertas.\n- Rastro de Leads: 45 leads captados de anuncios de Meta Ads; se concertaron 12 visitas pero se cayeron en el filtro financiero por falta de ahorros (20%+10%).\n- Gasto publicitario: 1.500€ invertidos en Meta Ads para estas propiedades."
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 hover:border-rose-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">💸 Botón 2</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-rose-300 transition-colors">
                  Detector de Fugas de Dinero (Leak Detector)
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Rastrea propiedades inactivas y desglosa técnicamente dónde se está perdiendo la inversión publicitaria y qué corregir.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Consolida todos los datos del negocio y elabora un Plan de Acción para el Próximo Mes. Establece la estrategia detallada y resumida para cumplir los objetivos de facturación en los próximos 30 días basándote en un Diagnóstico, Problema y Recomendaciones concretas.\n\nMétricas de la Inmobiliaria:\n- Carteras de Zona Sur: Alta acumulación de inmuebles sobrevalorados con media de 80 días sin vender.\n- Demanda de inversores: Aumento del 25% en búsquedas de pisos de 2 habitaciones en zona universitaria.\n- Leads huérfanos: 35 leads templados sin asesor asignado por bajas de personal."
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">🧭 Botón 3</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-emerald-300 transition-colors">
                  Plan de Acción para el Próximo Mes
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Consolida la información y emite una estrategia integral de 30 días para cumplir las metas mensuales y optimizar las conversiones de la cartera.
                </p>
              </button>
            </div>
          )}

          {chatAgent === 'seo' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-1">
              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Actúa como un Redactor de Blogs de Autoridad Local. Genera un artículo de blog completo, interesante para los vecinos y optimizado on-page para Google (H1, H2, H3, primer párrafo, meta-descripciones y términos en negrita).\n\nDatos de Localización:\n- Ciudad: Valencia\n- Barrio: Ruzafa\n- Enfoque temático: Guía definitiva para vivir en Ruzafa (Colegios, transporte, ocio, calidad de vida y coste del m²)."
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">✍️ Botón 1</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-indigo-300 transition-colors">
                  Redactor de Blogs de Autoridad Local
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Introduce la ciudad y el barrio para generar un artículo de blog inmobiliario optimizado para Google y súper interesante para los vecinos.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Genera Meta-Títulos y Descripciones Magnéticas. Redacta el meta-title (máx 60 caracteres) y la meta-description (máx 155 caracteres) on-page optimizados con técnicas de copywriting para conseguir clics orgánicos en Google.\n\nDescripción del Inmueble:\n\"Espectacular ático dúplex de diseño con terraza de 40m² y vistas a la Ciudad de las Ciencias en Valencia. 3 habitaciones, totalmente amueblado y reformado. Edificio con conserje y garaje incluido.\""
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 hover:border-rose-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">🏷️ Botón 2</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-rose-300 transition-colors">
                  Generador de Meta-Títulos y Descripciones
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Pega la descripción de la propiedad y obtén las etiquetas meta optimizadas para maximizar el CTR frente a la competencia de portales.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Actúa como un Estratega de Palabras Clave Inmobiliarias (Keyword Research). Analiza la zona y genera un calendario editorial con las 5 mejores temáticas transaccionales o informacionales que los propietarios locales están buscando en Google.\n\nZona de Operación:\n- Barrio de Chamberí, Madrid"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">🗺️ Botón 3</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-emerald-300 transition-colors">
                  Estratega de Palabras Clave (Keyword Research)
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Analiza el barrio o distrito y obtén un estudio de palabras clave con las búsquedas reales de los dueños de propiedades de la zona.
                </p>
              </button>
            </div>
          )}

          {chatAgent === 'notificador' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-1">
              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Actúa como Torre de Control y Sistema de Alertas Críticas en Tiempo Real. Redacta una Alerta Push/WhatsApp de Lead Caliente para el móvil de un asesor, aplicando etiquetas de urgencia máxima y una CTA directa de llamada.\n\nDatos del Lead Caliente:\n- Nombre: Ainhoa Cobacho\n- Actividad: Acaba de guardar en favoritos y solicitar visita a las 10:45\n- Propiedad: Piso en el Centro Histórico\n- Score del Lead: 70%"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">🚨 Botón 1</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-red-300 transition-colors">
                  Alerta Push / WhatsApp de Lead Caliente
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Redacta una alerta móvil inmediata de lead caliente con un Score superior al 70%, indicando detalles clave y la acción recomendada en un clic.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Genera un Aviso de Caducidad de Exclusiva / Plazos de Arras para enviar al asesor como alerta preventiva antes de que venza el plazo legal.\n\nDatos de Plazos:\n- Faltan 5 días para que venza el plazo de firma del contrato de arras de compraventa\n- Propiedad: Chalet en la Calle Mayor, 12\n- Asesor responsable: Carlos Ruiz\n- CTA: Confirmar estado de la hipoteca del comprador con el agente Financiero."
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">⏳ Botón 2</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-amber-300 transition-colors">
                  Aviso de Caducidad y Plazos de Arras
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Monitoriza las fechas del Documentador y genera alertas móviles para evitar retrasos o penalizaciones de plazos contractuales.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChatMessage(
                    "Redacta un Informe de Fin de Jornada (Resumen Push) muy humano e inspirador que se enviará automáticamente a las 19:00 al móvil de cada asesor.\n\nDatos del Día del Asesor:\n- Asesor: Carlos Ruiz\n- Visitas completadas con éxito: 2 visitas confirmadas hoy\n- Leads reactivados: El agente Nurturing reactivó a 3 leads fríos de su cartera\n- Agenda para mañana: Primera cita de captación a las 10:00"
                  );
                  setChatResponse("");
                }}
                className="flex flex-col items-start text-left p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">🔄 Botón 3</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-emerald-300 transition-colors">
                  Informe de Fin de Jornada (Resumen Push)
                </h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Genera una notificación push al final de la jornada que resuma los logros de hoy y fije con motivación el primer paso de mañana.
                </p>
              </button>
            </div>
          )}

          <textarea
            value={chatMessage}
            onChange={e => setChatMessage(e.target.value)}
            placeholder={CHAT_PLACEHOLDERS[chatAgent] || `Escribe un mensaje para ${AGENTS_DATA.find(a => a.id === chatAgent)?.name || chatAgent}...`}
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
              {chatLoading ? 'Procesando...' : `Ejecutar ${AGENTS_DATA.find(a => a.id === chatAgent)?.name?.split(' ')[0] || chatAgent}`}
            </button>
            <span className="text-xs text-white/30">
              Usando OpenRouter · {chatAgent === 'tasador' || chatAgent === 'analista' ? 'Claude Opus' : 'GPT-4o'}
            </span>
          </div>

          {chatResponse && (
            <div className="bg-black/40 border border-white/10 rounded-lg p-4 mt-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: AGENT_COLORS[chatAgent] + '30' }}>
                    <Bot size={12} style={{ color: AGENT_COLORS[chatAgent] }} />
                  </div>
                  <span className="text-xs text-white/40 font-medium">
                    {AGENTS_DATA.find(a => a.id === chatAgent)?.name || chatAgent}
                  </span>
                </div>
                {chatResponse && (
                  <button
                    onClick={copyResponse}
                    className="text-white/30 hover:text-white/60 transition-colors"
                  >
                    <Copy size={14} />
                  </button>
                )}
              </div>
              <pre className="text-sm text-white/90 whitespace-pre-wrap font-sans leading-relaxed">{chatResponseDisplay}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function UpgradeModal({ modal, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm bg-white/5 border border-white/10 rounded-xl p-6 shadow-modal text-center"
      >
        <span className="text-4xl mb-3 block">🔒</span>
        <h3 className="text-lg font-bold text-white font-syne mb-2">Plan no disponible</h3>
        <p className="text-sm text-white/60 mb-5">{modal?.reason || 'Actualiza tu plan para desbloquear este agente'}</p>
        <Link
          to={modal?.upgrade_url || '/pricing'}
          onClick={onClose}
          className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
        >
          Ver planes
        </Link>
      </motion.div>
    </motion.div>
  )
}
