import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play, Bot, X, Check, Loader2, Copy,
  UserPlus, ArrowRight, MessageCircle, Mail,
  Bell, Tag, CheckCircle2, RefreshCw, FileText,
  Zap, AlertTriangle, Clock
} from 'lucide-react'
import api from '../lib/api'

const ACTION_LABELS = {
  activate_agent: { label: '🤖 Agente IA', color: '#6366f1' },
  generate_and_send: { label: '✍️ Generar y enviar', color: '#8b5cf6' },
  generate_content: { label: '✍️ Generar contenido', color: '#8b5cf6' },
  send_whatsapp: { label: '💬 WhatsApp', color: '#25d366' },
  send_email: { label: '📧 Email', color: '#3b82f6' },
  change_stage: { label: '🔄 Cambiar etapa', color: '#f59e0b' },
  create_task: { label: '📋 Crear tarea', color: '#ec4899' },
  notify_team: { label: '🔔 Notificar equipo', color: '#ef4444' },
  add_tag: { label: '🏷️ Añadir etiqueta', color: '#06b6d4' },
  assign_to: { label: '👤 Asignar', color: '#84cc16' },
  update_score: { label: '📊 Actualizar score', color: '#f97316' },
  start_nurturing: { label: '🌱 Start nurturing', color: '#84cc16' },
}

const AGENT_NAMES = {
  captador: 'Captador IA',
  vendedor: 'Vendedor IA',
  coordinador: 'Coordinador IA',
  copywriter: 'Copywriter IA',
  tasador: 'Tasador IA',
  analista: 'Analista IA',
  agendador: 'Agendador IA',
  nurturing: 'Nurturing IA',
  documentador: 'Documentador IA',
  seo: 'SEO IA',
  financiero: 'Financiero IA',
  notificador: 'Notificador IA',
}

const TEST_CONTEXT = {
  lead_id: 'test-lead-001',
  lead_name: 'Carlos García (TEST)',
  phone: '+34 600 000 000',
  score: 72,
  stage: 'interesado',
  lead_summary: 'Busca piso 3 habitaciones en Triana, presupuesto 280.000€, quiere mudarse antes de verano. Tiene pre-aprobación hipotecaria.',
  budget: 280000,
  zone: 'Triana',
  agency_name: 'PropIA Demo',
  agency_city: 'Sevilla',
}

function getActionLabel(action) {
  const info = ACTION_LABELS[action.type] || { label: action.type, color: '#6b7280' }
  let label = info.label
  if (action.type === 'activate_agent' && action.config?.agent_type) {
    const agentName = AGENT_NAMES[action.config.agent_type] || action.config.agent_type
    label = `🤖 ${agentName}`
  }
  return { label, color: info.color }
}

async function executeAutomationStream({ automation_id, lead_id, test_mode, onEvent }) {
  const res = await fetch('/api/automations/execute-realtime', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...api.authHeaders },
    body: JSON.stringify({
      automation_id,
      lead_id: test_mode ? null : lead_id,
      test_mode,
      stream: true,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Error ${res.status}` }))
    throw new Error(err.error || `Error ${res.status}`)
  }

  if (!res.body) throw new Error('No response body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value)
    const lines = text.split('\n').filter(l => l.startsWith('data: '))

    for (const line of lines) {
      const json = line.slice(6)
      if (json === '[DONE]') return

      try {
        const event = JSON.parse(json)
        onEvent(event)
      } catch { /* skip malformed */ }
    }
  }
}

export function ExecutionModal({ automation, leads, onClose }) {
  const [selectedLeadId, setSelectedLeadId] = useState(leads[0]?.id ?? '')
  const [testMode, setTestMode] = useState(false)
  const [running, setRunning] = useState(false)
  const [globalStatus, setGlobalStatus] = useState('idle')
  const [actionResults, setActionResults] = useState([])
  const [streamingText, setStreamingText] = useState({})
  const [copiedIndex, setCopiedIndex] = useState(null)

  const actions = Array.isArray(automation.actions) ? automation.actions : []

  useEffect(() => {
    setActionResults(
      actions.map(() => ({
        status: 'pending',
        result: '',
        aiMessage: '',
        aiUsed: false,
        durationMs: null,
      }))
    )
  }, [automation])

  const handleCopy = (index, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    })
  }

  const execute = async () => {
    if (!selectedLeadId && !testMode) return
    setRunning(true)
    setGlobalStatus('running')
    setStreamingText({})

    setActionResults(
      actions.map(() => ({
        status: 'pending',
        result: '',
        aiMessage: '',
        aiUsed: false,
        durationMs: null,
      }))
    )

    try {
      await executeAutomationStream({
        automation_id: automation.id,
        lead_id: selectedLeadId,
        test_mode: testMode,
        onEvent: (event) => {
          if (event.type === 'action_start') {
            setActionResults(prev => prev.map((r, i) =>
              i === event.index ? { ...r, status: 'running' } : r
            ))
          }

          if (event.type === 'ai_chunk') {
            setStreamingText(prev => ({
              ...prev,
              [event.index]: (prev[event.index] ?? '') + event.chunk,
            }))
          }

          if (event.type === 'action_done') {
            setActionResults(prev => prev.map((r, i) =>
              i === event.index
                ? { ...r, status: 'success', result: event.result, aiMessage: event.aiMessage, aiUsed: event.aiUsed, durationMs: event.durationMs }
                : r
            ))
            setStreamingText(prev => {
              const n = { ...prev }
              delete n[event.index]
              return n
            })
          }

          if (event.type === 'action_error') {
            setActionResults(prev => prev.map((r, i) =>
              i === event.index ? { ...r, status: 'error', result: event.error } : r
            ))
          }

          if (event.type === 'execution_complete') {
            setGlobalStatus('done')
          }
        },
      })
    } catch (err) {
      setGlobalStatus('error')
      console.error(err)
    } finally {
      setRunning(false)
    }
  }

  const reset = () => {
    setGlobalStatus('idle')
    setActionResults(
      actions.map(() => ({
        status: 'pending',
        result: '',
        aiMessage: '',
        aiUsed: false,
        durationMs: null,
      }))
    )
    setStreamingText({})
  }

  const statusIcons = {
    pending: '○',
    running: '⟳',
    success: '✓',
    error: '✗',
  }

  const statusColors = {
    pending: 'opacity-40',
    running: 'border-indigo-500/40 bg-indigo-950/20',
    success: 'border-emerald-500/30 bg-emerald-950/10',
    error: 'border-red-500/30 bg-red-950/10',
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          onClick={e => e.stopPropagation()}
          className="bg-[#13131F] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap size={16} className="text-indigo-400" />
                <span className="text-xs text-indigo-400 font-medium uppercase tracking-wider">Ejecución de automatización</span>
              </div>
              <h2 className="text-white font-semibold text-lg">{automation.name}</h2>
              {automation.description && (
                <p className="text-white/40 text-sm mt-0.5">{automation.description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-white/30 hover:text-white/70 text-xl ml-4 p-1"
            >
              <X size={18} />
            </button>
          </div>

          {/* Configuración o Resultados */}
          <div className="p-6 space-y-5">
            {globalStatus === 'idle' && (
              <>
                {/* Selector de lead */}
                <div className="space-y-2">
                  <label className="text-white/60 text-sm font-medium">Lead para ejecutar</label>
                  <div className="flex gap-3">
                    <select
                      value={selectedLeadId}
                      onChange={e => { setSelectedLeadId(e.target.value); setTestMode(false) }}
                      disabled={testMode}
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-40"
                    >
                      {leads.length === 0 && <option value="">Sin leads disponibles</option>}
                      {leads.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.name} — Score {l.ia_score ?? l.score ?? '?'}/100 ({l.status ?? l.pipeline_stage ?? l.stage ?? 'contactado'})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setTestMode(!testMode)}
                      className={`px-4 py-2.5 rounded-lg text-sm border transition-all whitespace-nowrap ${
                        testMode
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-white/10 text-white/50 hover:border-white/20'
                      }`}
                    >
                      Modo prueba
                    </button>
                  </div>
                  {testMode && (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                      <p className="text-xs text-indigo-400">Modo prueba: se ejecuta con datos ficticios, sin afectar al CRM real</p>
                    </div>
                  )}
                </div>

                {/* Preview de acciones */}
                <div className="space-y-2">
                  <label className="text-white/60 text-sm font-medium">Acciones que se ejecutarán</label>
                  <div className="space-y-2">
                    {actions.map((action, i) => {
                      const { label, color } = getActionLabel(action)
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-3 bg-white/5 rounded-lg px-4 py-3"
                        >
                          <span className="text-white/60 text-sm w-5 shrink-0">{i + 1}.</span>
                          <span className="w-0.5 h-5 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-white text-sm">{label}</span>
                          {action.type === 'activate_agent' && action.config?.prompt_template && (
                            <span className="text-white/30 text-xs ml-auto truncate max-w-[200px]">
                              "{action.config.prompt_template.substring(0, 60)}..."
                            </span>
                          )}
                        </div>
                      )
                    })}
                    {actions.length === 0 && (
                      <div className="text-center py-6">
                        <AlertTriangle size={20} className="mx-auto text-amber-400 mb-2" />
                        <p className="text-white/40 text-sm">Esta automatización no tiene acciones configuradas</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Botón ejecutar */}
                <button
                  onClick={execute}
                  disabled={!selectedLeadId && !testMode || running}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {running ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Ejecutando...
                    </>
                  ) : (
                    <>
                      <Play size={16} />
                      Ejecutar automatización ahora
                    </>
                  )}
                </button>
              </>
            )}

            {/* Ejecución en tiempo real */}
            {(globalStatus === 'running' || globalStatus === 'done' || globalStatus === 'error') && (
              <>
                {/* Status bar */}
                <div className="flex items-center gap-2 mb-2">
                  {globalStatus === 'running' && (
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                  )}
                  {globalStatus === 'done' && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  )}
                  {globalStatus === 'error' && (
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                  )}
                  <span className="text-white/60 text-sm">
                    {globalStatus === 'running' && 'Ejecutando...'}
                    {globalStatus === 'done' && 'Completado'}
                    {globalStatus === 'error' && 'Error en la ejecución'}
                  </span>
                </div>

                {/* Action cards */}
                <div className="space-y-3">
                  {actionResults.map((result, i) => {
                    const action = actions[i]
                    const { label, color } = getActionLabel(action || {})
                    const streaming = streamingText[i]

                    return (
                      <div
                        key={i}
                        className={`rounded-xl border p-4 transition-all ${statusColors[result.status]}`}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <span
                            className={`text-lg font-mono ${
                              result.status === 'success' ? 'text-emerald-400' :
                              result.status === 'error' ? 'text-red-400' :
                              result.status === 'running' ? 'text-indigo-400' :
                              'text-white/30'
                            }`}
                          >
                            {result.status === 'running' ? <Loader2 size={16} className="animate-spin" /> : statusIcons[result.status]}
                          </span>
                          <span className="text-white text-sm font-medium">{label}</span>
                          {result.aiUsed && (
                            <span className="ml-2 text-xs bg-indigo-600/30 text-indigo-300 px-2 py-0.5 rounded-full">
                              IA
                            </span>
                          )}
                          {result.durationMs && (
                            <span className="ml-auto text-xs text-white/30">{result.durationMs}ms</span>
                          )}
                        </div>

                        {/* Streaming text */}
                        {streaming && (
                          <div className="mt-2 bg-black/30 rounded-lg p-3">
                            <p className="text-xs text-indigo-300 mb-1">Generando respuesta...</p>
                            <p className="text-sm text-white/80 whitespace-pre-wrap">
                              {streaming}
                              <span className="animate-pulse text-white/40">▋</span>
                            </p>
                          </div>
                        )}

                        {/* Mensaje final de IA */}
                        {result.aiMessage && !streaming && (
                          <div className="mt-2 bg-black/30 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs text-indigo-300">Respuesta generada por IA:</p>
                               <button
                                 onClick={() => handleCopy(i, result.aiMessage)}
                                 className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1"
                               >
                                {copiedIndex === i ? (
                                  <><Check size={10} className="text-emerald-400" /> Copiado</>
                                ) : (
                                  <><Copy size={10} /> Copiar</>
                                )}
                              </button>
                            </div>
                            <p className="text-sm text-white/90 whitespace-pre-wrap">{result.aiMessage}</p>
                          </div>
                        )}

                        {/* Resultado técnico */}
                        {result.result && !result.aiMessage && (
                          <p className="text-xs text-white/50 mt-1 font-mono truncate">{result.result}</p>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Botones finales */}
                {globalStatus === 'done' && (
                  <div className="flex gap-3 mt-4 pt-4 border-t border-white/5">
                    <button
                      onClick={onClose}
                      className="flex-1 py-2.5 border border-white/10 text-white/60 rounded-xl text-sm hover:border-white/20"
                    >
                      Cerrar
                    </button>
                    <button
                      onClick={reset}
                      className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm"
                    >
                      Ejecutar de nuevo
                    </button>
                  </div>
                )}

                {globalStatus === 'error' && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-sm text-red-300">
                      Error durante la ejecución. Verifica que el backend esté corriendo y que la API key de OpenRouter esté configurada.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default ExecutionModal
