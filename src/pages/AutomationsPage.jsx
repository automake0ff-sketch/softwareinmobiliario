import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, UserPlus, Bell, Calendar, RefreshCw, ArrowRight,
  Clock, MessageCircle, Mail, Bot, Sparkles,
  Users, Send, AlertTriangle, Gift,
  CheckCircle2, FileText, BarChart3, Sun,
  ChevronDown, Plus, Trash2, Play, Globe, DollarSign, Tag,
  X, Check, Home, ArrowDown, ArrowUpDown, TrendingUp,
  LayoutDashboard, Layers, Network, BookTemplate, Download,
  ChevronRight
} from 'lucide-react'
import api from '../lib/api'
import { formatDate } from '../utils/formatters'
import { usePlan } from '../hooks/usePlan'
import { Link } from 'react-router-dom'
import ExecutionModal from '../components/ExecutionModal.jsx'

const TRIGGER_ICONS = {
  lead_created: UserPlus, stage_changed: ArrowRight,
  no_response_hours: Clock, message_received: MessageCircle,
  visit_completed: Calendar, visit_no_show: X,
  document_received: FileText, score_threshold: TrendingUp,
  score_dropped: ArrowDown, time_schedule: Clock,
  property_matched: Home,
}

const ACTION_ICONS = {
  activate_agent: Bot, send_whatsapp: MessageCircle, send_email: Mail,
  change_stage: ArrowRight, assign_to: UserPlus, create_task: CheckCircle2,
  notify_team: Bell, add_tag: Tag, start_nurturing: RefreshCw,
  generate_content: FileText, update_score: ArrowUpDown,
}

const TRIGGER_COLORS = {
  lead_created: '#6366f1', stage_changed: '#f59e0b',
  no_response_hours: '#ef4444', score_threshold: '#10b981',
  score_dropped: '#ef4444', time_schedule: '#3b82f6',
  message_received: '#8b5cf6', visit_completed: '#14b8a6',
  visit_no_show: '#dc2626', document_received: '#f97316',
  property_matched: '#10b981',
}

const itemAnim = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
}

export default function AutomationsPage() {
  const { hasCapacity, usage, plan, refresh } = usePlan()
  const canCreate = hasCapacity('automations')

  const [automations, setAutomations] = useState([])
  const [loading, setLoading] = useState(true)
  const [aiBuilderOpen, setAiBuilderOpen] = useState(false)
  const [aiDescription, setAiDescription] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedAutomation, setGeneratedAutomation] = useState(null)
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [leads, setLeads] = useState([])
  const [executingAutomation, setExecutingAutomation] = useState(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [templateBlocks, setTemplateBlocks] = useState([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [expandedBlocks, setExpandedBlocks] = useState({})
  const [installing, setInstalling] = useState(null)

  // Fetch automations and leads on mount
  useEffect(() => {
    loadAutomations()
    loadLeads()
  }, [])

  const loadLeads = async () => {
    try {
      const data = await api.get('/leads', { limit: 20 })
      setLeads(Array.isArray(data) ? data : Array.isArray(data.leads) ? data.leads : [])
    } catch {
      setLeads([])
    }
  }

  const loadAutomations = async () => {
    setLoading(true)
    try {
      const data = await api.get('/automations')
      setAutomations(Array.isArray(data) ? data : [])
    } catch {
      setAutomations([])
    } finally {
      setLoading(false)
    }
  }

  const toggleAutomation = async (id) => {
    const prev = automations.find(a => a.id === id)
    if (!prev) return
    const nextActive = prev.is_active ? 0 : 1

    try {
      const updated = await api.patch(`/automations/${id}`, { is_active: nextActive })
      setAutomations(prev => prev.map(a =>
        a.id === id ? { ...a, is_active: updated.is_active } : a
      ))
      refresh()
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Error al cambiar estado de la automatización')
    }
  }

  const deleteAutomation = async (id) => {
    const prev = automations
    setAutomations(prev => prev.filter(a => a.id !== id))
    try {
      await api.delete(`/automations/${id}`)
      refresh()
    } catch {
      setAutomations(prev)
    }
  }

  // AI Builder
  const generateAutomation = async () => {
    if (!aiDescription.trim()) return
    setGenerating(true)
    setGeneratedAutomation(null)
    try {
      const data = await api.post('/automations/ai-builder', { description: aiDescription })
      setGeneratedAutomation(data.automation)
    } catch (e) {
      setGeneratedAutomation({ error: e.message })
    } finally {
      setGenerating(false)
    }
  }

  const saveGeneratedAutomation = async () => {
    if (!generatedAutomation) return
    try {
      const saved = await api.post('/automations', generatedAutomation)
      setAutomations(prev => [saved, ...prev])
      setAiBuilderOpen(false)
      setAiDescription('')
      setGeneratedAutomation(null)
      refresh()
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Error al guardar')
    }
  }

  // Test automation
  const testAutomation = async (auto) => {
    setTesting(true)
    setTestResult(null)
    try {
      // Get first lead for testing
      let leadId = null
      try {
        const leads = await api.get('/leads', { limit: 1 })
        if (Array.isArray(leads) && leads.length > 0) {
          leadId = leads[0].id
        }
      } catch {}

      if (!leadId) {
        setTestResult({ error: 'No hay leads disponibles para probar. Crea un lead primero.' })
        setTesting(false)
        return
      }

      const data = await api.post('/automations/test', {
        automation: {
          trigger_type: auto.trigger_type,
          conditions: auto.conditions || [],
          actions: auto.actions || [],
        },
        lead_id: leadId,
        lead_data: {
          lead_name: 'Lead de prueba',
          score: 75,
          stage: 'interesado',
          zone: 'Triana',
        },
      })
      setTestResult(data)
    } catch (e) {
      setTestResult({ error: e.message })
    } finally {
      setTesting(false)
    }
  }

  const loadTemplates = async () => {
    setLoadingTemplates(true)
    try {
      const data = await api.get('/automations/templates')
      setTemplateBlocks(Array.isArray(data) ? data : [])
      setExpandedBlocks(Object.fromEntries((Array.isArray(data) ? data : []).map(b => [b.id, false])))
    } catch { setTemplateBlocks([]) }
    finally { setLoadingTemplates(false) }
  }

  const installTemplate = async (name) => {
    setInstalling(name)
    try {
      await api.post('/automations/install-template', { name })
      loadAutomations()
      // Mark as installed in templates
      setTemplateBlocks(prev => prev.map(b => ({
        ...b,
        automations: b.automations.map(a => a.name === name ? { ...a, installed: true } : a),
      })))
      refresh()
    } catch (e) { console.error(e) }
    finally { setInstalling(null) }
  }

  const toggleBlock = (id) => {
    setExpandedBlocks(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const activeCount = automations.filter(a => a.is_active).length

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-8"
    >
      <motion.div variants={itemAnim} initial="hidden" animate="show" className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-syne bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Automatizaciones
          </h1>
          <p className="text-white/50 mt-1">
            Automatiza tu flujo de trabajo con reglas inteligentes potenciadas por IA
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CapacityBadge />
          <button
            onClick={() => setAiBuilderOpen(!aiBuilderOpen)}
            disabled={!canCreate}
            className={`flex items-center gap-2 px-4 py-2 text-white text-sm rounded-xl transition-all ${
              canCreate ? 'bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/10' : 'bg-indigo-950/40 border border-white/5 text-white/30 cursor-not-allowed'
            }`}
            title={!canCreate ? 'Has alcanzado el límite de automatizaciones activas de tu plan' : ''}
          >
            <Sparkles size={16} />
            Crear con IA
          </button>
        </div>
      </motion.div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-white/50">
          <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
          {activeCount} activas
        </div>
        <span className="text-white/10">|</span>
        <span className="text-sm text-white/50">{automations.length} automatizaciones</span>
        <button
          onClick={loadAutomations}
          className="ml-auto p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* AI Builder Panel */}
      {aiBuilderOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-indigo-400" />
            <p className="font-medium text-white text-sm">Describe la automatización en lenguaje natural</p>
            <button onClick={() => setAiBuilderOpen(false)} className="ml-auto text-white/30 hover:text-white/60">
              <X size={16} />
            </button>
          </div>
          <textarea
            value={aiDescription}
            onChange={e => setAiDescription(e.target.value)}
            placeholder='Ej: "Cuando un lead no responde en 48 horas y tiene score mayor de 60, que el Vendedor IA le envíe un mensaje de seguimiento personalizado"'
            className="w-full h-24 bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-indigo-500"
          />
          <div className="flex gap-3">
            <button
              onClick={generateAutomation}
              disabled={generating || !aiDescription.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm rounded-lg"
            >
              {generating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {generating ? 'Generando...' : 'Generar automatización'}
            </button>
          </div>

          {generatedAutomation && (
            <div className="space-y-3">
              {generatedAutomation.error ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                  <p className="text-sm text-red-300">Error: {generatedAutomation.error}</p>
                </div>
              ) : (
                <>
                  <div className="bg-black/40 border border-white/10 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Bot size={14} className="text-emerald-400" />
                      <span className="text-xs text-emerald-400 font-medium">Automatización generada</span>
                    </div>
                    <p className="text-sm text-white/80 mb-1">
                      <span className="text-white/40">Nombre:</span> {generatedAutomation.name}
                    </p>
                    <p className="text-sm text-white/80 mb-1">
                      <span className="text-white/40">Trigger:</span> {generatedAutomation.trigger_type}
                    </p>
                    <p className="text-sm text-white/80 mb-2">
                      <span className="text-white/40">Acciones:</span>{' '}
                      {generatedAutomation.actions?.map(a => a.type).join(' -> ') || 'Ninguna'}
                    </p>
                    <pre className="text-xs text-white/40 overflow-auto max-h-40 bg-black/30 rounded p-2">
                      {JSON.stringify(generatedAutomation, null, 2)}
                    </pre>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveGeneratedAutomation}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg"
                    >
                      Guardar automatización
                    </button>
                    <button
                      onClick={() => { setGeneratedAutomation(null); setAiDescription('') }}
                      className="px-4 py-2 border border-white/10 text-white/50 text-sm rounded-lg hover:border-white/20"
                    >
                      Descartar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Templates Section */}
      <div>
        <button
          onClick={() => { setShowTemplates(!showTemplates); if (!showTemplates && templateBlocks.length === 0) loadTemplates() }}
          className="flex items-center gap-2 text-sm text-white/50 hover:text-indigo-400 transition-colors"
        >
          <Layers size={16} />
          <span>Plantillas ({templateBlocks.reduce((s, b) => s + b.automations.length, 0) || '...'})</span>
          <ChevronRight size={14} className={`transition-transform ${showTemplates ? 'rotate-90' : ''}`} />
        </button>

        <AnimatePresence>
          {showTemplates && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="pt-4 space-y-3">
                {loadingTemplates ? (
                  <div className="flex items-center justify-center py-8"><RefreshCw size={20} className="text-indigo-400 animate-spin" /></div>
                ) : templateBlocks.length === 0 ? (
                  <div className="text-center py-6 text-white/30 text-sm">No se pudieron cargar las plantillas</div>
                ) : (
                  templateBlocks.map(block => (
                    <div key={block.id} className="border border-white/10 rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleBlock(block.id)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: block.color }} />
                          <span className="text-sm font-medium text-white">{block.label}</span>
                          <span className="text-xs text-white/30">{block.automations.length} flujos</span>
                        </div>
                        <ChevronDown size={14} className={`text-white/30 transition-transform ${expandedBlocks[block.id] ? 'rotate-180' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {expandedBlocks[block.id] && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                            <div className="divide-y divide-white/5">
                              {block.automations.map(auto => (
                                <div key={auto.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-white font-medium">{auto.name}</span>
                                      {auto.installed && (
                                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">Instalada</span>
                                      )}
                                    </div>
                                    <p className="text-xs text-white/40 mt-0.5 line-clamp-1">{auto.description}</p>
                                    <div className="flex items-center gap-2 mt-1.5">
                                      <span className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded">{auto.trigger_type}</span>
                                      <span className="text-[10px] text-white/20">→</span>
                                      {auto.actions?.slice(0, 3).map((a, i) => (
                                        <span key={i} className="text-[10px] text-indigo-300/60 bg-indigo-500/5 px-1.5 py-0.5 rounded">{a.type}</span>
                                      ))}
                                      {auto.actions?.length > 3 && (
                                        <span className="text-[10px] text-white/30">+{auto.actions.length - 3}</span>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => installTemplate(auto.name)}
                                    disabled={auto.installed || installing === auto.name}
                                    className={`shrink-0 px-3 py-1.5 text-xs rounded-lg transition-all ${
                                      auto.installed
                                        ? 'bg-emerald-500/10 text-emerald-400/50 cursor-default'
                                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                                    }`}
                                  >
                                    {installing === auto.name ? <RefreshCw size={12} className="animate-spin" /> : auto.installed ? <Check size={12} /> : <Plus size={12} />}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Automations List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={24} className="text-indigo-400 animate-spin" />
        </div>
      ) : automations.length === 0 ? (
        <div className="bg-white/5 border border-dashed border-white/10 rounded-2xl p-12 text-center">
          <Bot size={40} className="mx-auto text-white/20 mb-3" />
          <p className="text-white/50 text-sm">Aún no hay automatizaciones creadas.</p>
          <p className="text-white/30 text-xs mt-1">Usa "Crear con IA" o pídele al Coordinador IA que genere algunas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {automations.map((auto, i) => {
            const TriggerIcon = TRIGGER_ICONS[auto.trigger_type] || Zap
            const triggerColor = TRIGGER_COLORS[auto.trigger_type] || '#6b7280'
            const actionsList = Array.isArray(auto.actions) ? auto.actions : []

            return (
              <motion.div
                key={auto.id}
                variants={itemAnim}
                initial="hidden"
                animate="show"
                transition={{ delay: i * 0.04 }}
                className={`bg-white/5 border rounded-2xl overflow-hidden transition-all ${
                  auto.is_active ? 'border-white/10' : 'border-white/5 opacity-60'
                } hover:border-white/20`}
              >
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-medium"
                      style={{ background: triggerColor + '20', color: triggerColor }}
                    >
                      {auto.trigger_type?.replace(/_/g, ' ')}
                    </span>
                    <button
                      onClick={() => toggleAutomation(auto.id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                        auto.is_active ? 'bg-indigo-500' : 'bg-white/10'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                        auto.is_active ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-white">{auto.name}</h3>
                    {auto.description && (
                      <p className="text-xs text-white/40 mt-0.5 line-clamp-2">{auto.description}</p>
                    )}
                  </div>

                  <div className="space-y-2 bg-black/30 rounded-xl p-3">
                    <div className="flex items-center gap-2.5 text-xs">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: triggerColor + '20', color: triggerColor }}>
                        <TriggerIcon size={12} />
                      </div>
                      <span className="text-white/50 flex-1 min-w-0">
                        <span className="text-white/80 font-medium">Si:</span> {auto.trigger_type?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-center text-white/10">
                      <ArrowRight size={14} />
                    </div>
                    <div className="flex items-center gap-2.5 text-xs">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-indigo-500/10 text-indigo-400">
                        <Bot size={12} />
                      </div>
                      <span className="text-white/50 flex-1 min-w-0">
                        <span className="text-white/80 font-medium">Entonces:</span>{' '}
                        {actionsList.map(a => a.type?.replace(/_/g, ' ')).join(' -> ') || 'Sin acciones'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2 text-[10px] text-white/40">
                      <Clock size={11} />
                      <span>{auto.last_run_at ? formatDate(auto.last_run_at) : 'Nunca ejecutada'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {auto.run_count > 0 && (
                        <span className="text-[10px] text-white/40">{auto.run_count} ejec.</span>
                      )}
                      <button
                        onClick={() => setExecutingAutomation(auto)}
                        className="p-1.5 rounded-lg text-white/30 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                        title="Ejecutar automatización"
                      >
                        <Play size={12} />
                      </button>
                      <button
                        onClick={() => deleteAutomation(auto.id)}
                        className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="Eliminar"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

       {/* Test Result Panel */}
      {testResult && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-white/10 bg-black/40 p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {testResult.error ? (
                <AlertTriangle size={14} className="text-red-400" />
              ) : (
                <Check size={14} className="text-emerald-400" />
              )}
              <span className="text-xs text-white/40 font-medium">
                {testResult.error ? 'Error en test' : 'Resultado del test'}
              </span>
            </div>
            <button onClick={() => setTestResult(null)} className="text-white/30 hover:text-white/60">
              <X size={14} />
            </button>
          </div>
          <pre className="text-xs text-emerald-300 overflow-auto max-h-48 whitespace-pre-wrap">
            {JSON.stringify(testResult, null, 2)}
          </pre>
        </motion.div>
      )}

      {/* Execution Modal */}
      <AnimatePresence>
        {executingAutomation && (
          <ExecutionModal
            automation={executingAutomation}
            leads={leads}
            onClose={() => setExecutingAutomation(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function CapacityBadge() {
  const { hasCapacity, usage, plan } = usePlan()
  const canCreate = hasCapacity('automations')
  const pct = plan === 'starter' ? Math.round((usage.automations_active / usage.automations_limit) * 100) : 0

  return (
    <div className="flex items-center gap-2 text-xs">
      {plan === 'starter' && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
          <span className={`w-1.5 h-1.5 rounded-full ${pct >= 80 ? 'bg-amber-400' : 'bg-emerald-400'}`} />
          <span className="text-white/50">
            {usage.automations_active}/{usage.automations_limit}
          </span>
          {!canCreate && (
            <Link to="/pricing" className="text-indigo-400 hover:text-indigo-300 font-medium ml-1">
              Ampliar
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
