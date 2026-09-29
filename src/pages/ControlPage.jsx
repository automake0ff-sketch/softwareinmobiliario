import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Clock, Users, CalendarCheck, Trophy, MessageSquare, Ban,
  Check, X, Copy, ShieldAlert, Bot, UserCheck, RefreshCw,
} from 'lucide-react'
import api from '../lib/api'

function fmtSeconds(s) {
  if (s == null) return '—'
  if (s < 60) return `${Math.round(s)} s`
  if (s < 3600) return `${Math.round(s / 60)} min`
  return `${(s / 3600).toFixed(1)} h`
}

function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1.5">
        <Icon size={14} /> {label}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {hint && <div className="text-xs text-gray-400 mt-0.5">{hint}</div>}
    </div>
  )
}

export default function ControlPage() {
  const [roi, setRoi] = useState(null)
  const [approvals, setApprovals] = useState([])
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    try {
      const [roiData, approvalsData, settingsData] = await Promise.all([
        api.get('/control/roi', { days: 30 }),
        api.get('/control/approvals', { status: 'pending' }),
        api.get('/control/settings'),
      ])
      setRoi(roiData)
      setApprovals(approvalsData.items || [])
      setSettings(settingsData)
    } catch (e) {
      toast.error('No se pudo cargar el panel de control')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const updateSetting = async (patch) => {
    const prev = settings
    setSettings((s) => ({ ...s, ...patch }))
    try {
      await api.patch('/control/settings', patch)
      toast.success('Ajuste guardado')
    } catch (e) {
      setSettings(prev)
      toast.error('No se pudo guardar el ajuste')
    }
  }

  const approve = async (item) => {
    setBusyId(item.id)
    try {
      const content = editing[item.id] !== undefined ? editing[item.id] : item.content
      await api.post(`/control/approvals/${item.id}/approve`, { content })
      toast.success('Mensaje enviado')
      setApprovals((list) => list.filter((x) => x.id !== item.id))
    } catch (e) {
      toast.error(e?.response?.data?.error || 'No se pudo enviar')
    } finally {
      setBusyId(null)
    }
  }

  const reject = async (item) => {
    setBusyId(item.id)
    try {
      await api.post(`/control/approvals/${item.id}/reject`)
      setApprovals((list) => list.filter((x) => x.id !== item.id))
    } catch (e) {
      toast.error('No se pudo descartar')
    } finally {
      setBusyId(null)
    }
  }

  const copyPortalUrl = () => {
    if (!settings?.portal_inbox_url && !settings?.portal_inbox_path) return
    navigator.clipboard.writeText(settings.portal_inbox_url || settings.portal_inbox_path)
    toast.success('URL copiada')
  }

  const exportData = async () => {
    setExporting(true)
    try {
      const data = await api.get('/control/export')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `propia-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error('No se pudo generar la exportación')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-gray-400 text-sm">Cargando panel de control…</div>
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Control y ROI</h1>
          <p className="text-sm text-gray-500 mt-0.5">Últimos 30 días. Aquí se ve si el "responde en menos de 2 minutos" es real.</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* ROI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Leads nuevos" value={roi?.leads ?? '—'} />
        <StatCard
          icon={Clock}
          label="Tiempo de 1ª respuesta (mediana)"
          value={fmtSeconds(roi?.first_response?.median_seconds)}
          hint={`${roi?.first_response?.answered ?? 0} respondidos`}
        />
        <StatCard icon={CalendarCheck} label="Visitas agendadas" value={roi?.visits_booked ?? '—'} />
        <StatCard icon={Trophy} label="Reservas / cierres" value={roi?.won ?? '—'} />
        <StatCard icon={MessageSquare} label="Mensajes enviados por la IA" value={roi?.ai_messages_sent ?? '—'} />
        <StatCard icon={ShieldAlert} label="Pendientes de aprobar" value={roi?.pending_approvals ?? 0} />
        <StatCard icon={Ban} label="Leads dados de baja" value={roi?.opted_out_leads ?? 0} />
        <StatCard
          icon={Bot}
          label="Gasto de IA este mes"
          value={roi?.ai_usage ? `${roi.ai_usage.aiCostUsd.toFixed(2)} $` : '—'}
          hint={roi?.ai_usage ? `de ${roi.ai_usage.aiBudgetUsd} $ (plan ${roi.ai_usage.plan})` : undefined}
        />
      </div>

      {roi?.leads_by_source?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Leads por origen</h2>
          <div className="space-y-1.5">
            {roi.leads_by_source.map((s) => (
              <div key={s.source} className="flex items-center justify-between text-sm">
                <span className="text-gray-600 capitalize">{s.source}</span>
                <span className="font-medium text-gray-900">{s.n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ajustes */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Ajustes de automatización</h2>

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-800">Modo de envío de la IA</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {settings?.ai_mode === 'approve'
                ? 'Cada mensaje que redacta la IA queda pendiente de tu aprobación antes de enviarse.'
                : 'La IA responde directamente a los leads, sin revisión previa.'}
            </p>
          </div>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
            <button
              onClick={() => updateSetting({ ai_mode: 'auto' })}
              className={`px-3 py-1.5 text-xs font-medium ${settings?.ai_mode !== 'approve' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'}`}
            >
              Automático
            </button>
            <button
              onClick={() => updateSetting({ ai_mode: 'approve' })}
              className={`px-3 py-1.5 text-xs font-medium ${settings?.ai_mode === 'approve' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'}`}
            >
              Aprobar antes de enviar
            </button>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 pt-2 border-t border-gray-100">
          <div>
            <p className="text-sm font-medium text-gray-800">Reparto automático de leads</p>
            <p className="text-xs text-gray-500 mt-0.5">Asigna cada lead nuevo al comercial con menos leads abiertos.</p>
          </div>
          <button
            onClick={() => updateSetting({ auto_assign: !settings?.auto_assign })}
            className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${settings?.auto_assign ? 'bg-indigo-600' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${settings?.auto_assign ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        <div className="pt-2 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-800 mb-1">Entrada de leads de portales (Idealista, Fotocasa…)</p>
          <p className="text-xs text-gray-500 mb-2">
            Configura en tu portal (o en un reenviador de email como SendGrid/Mailgun) que los avisos de nuevos contactos
            se reenvíen por POST a esta URL. Cada lead se crea automáticamente.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 truncate">
              {settings?.portal_inbox_url || settings?.portal_inbox_path || '—'}
            </code>
            <button onClick={copyPortalUrl} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 shrink-0">
              <Copy size={14} />
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-800">Exportar todos mis datos</p>
            <p className="text-xs text-gray-500 mt-0.5">Descarga en JSON de tus leads, conversaciones, propiedades y actividad.</p>
          </div>
          <button
            onClick={exportData}
            disabled={exporting}
            className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 disabled:opacity-50"
          >
            {exporting ? 'Generando…' : 'Descargar JSON'}
          </button>
        </div>
      </div>

      {/* Cola de aprobación */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Mensajes pendientes de aprobación</h2>
        <p className="text-xs text-gray-500 mb-4">Solo aparecen aquí si el modo está en "Aprobar antes de enviar".</p>

        {approvals.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No hay mensajes pendientes.</p>
        ) : (
          <div className="space-y-3">
            {approvals.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="border border-gray-200 rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-gray-800">
                    {item.lead_name} <span className="text-gray-400 font-normal">· {item.lead_phone}</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide text-gray-400">{item.agent_type}</span>
                </div>
                <textarea
                  value={editing[item.id] !== undefined ? editing[item.id] : item.content}
                  onChange={(e) => setEditing((m) => ({ ...m, [item.id]: e.target.value }))}
                  rows={3}
                  className="w-full text-sm border border-gray-200 rounded-lg p-2 mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => reject(item)}
                    disabled={busyId === item.id}
                    className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <X size={13} /> Descartar
                  </button>
                  <button
                    onClick={() => approve(item)}
                    disabled={busyId === item.id}
                    className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Check size={13} /> Aprobar y enviar
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <UserCheck size={12} /> Recuerda: cuando un comercial responde a mano desde Conversaciones, la IA deja de escribirle a ese lead hasta que la reactivéis.
      </p>
    </div>
  )
}
