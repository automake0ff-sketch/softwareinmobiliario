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

  useEffect(() => { loadAgents() }, [loadAgents])

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
  }, [])

  // WebSocket Live Subscription (Fix 3)
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const base = import.meta.env.VITE_API_URL || ''
    let wsUrl = ''
    if (base.startsWith('http')) {
      wsUrl = base.replace(/^http/, 'ws')
    } else {
      wsUrl = `${protocol}//${window.location.hostname}:3002`
    }

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

function ConsoleSection({
  chatAgent, setChatAgent, chatMessage, setChatMessage,
  chatResponse, chatLoading, chatHistory,
  sendToAgent, copyResponse,
  selectedLeadId, setSelectedLeadId, leads, dbAgents
}) {
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
              <pre className="text-sm text-white/90 whitespace-pre-wrap font-sans leading-relaxed">{chatResponse}</pre>
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
