import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { BellRing } from 'lucide-react'
import api from '../../lib/api'
import { Select, PRIORITIES, CLIENT_TYPES, fmtDue } from './shared'

// Bloque de seguimiento dentro de la ficha del contacto (reutiliza la ficha existente, no la duplica).
export default function LeadFollowUpCard({ leadId }) {
  const [d, setD] = useState(null)
  const load = useCallback(() => api.get(`/followup/leads/${leadId}`).then(setD).catch(() => {}), [leadId])
  useEffect(() => { load() }, [load])
  if (!d) return null
  const { lead } = d
  const setMeta = async (patch) => { try { await api.patch(`/followup/leads/${lead.id}/meta`, patch); setD({ ...d, lead: { ...lead, ...patch } }); toast.success('Guardado') } catch { /* api.js */ } }
  const next = d.pending_followups[0]
  const last = d.timeline[0]

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md" data-testid="lead-followup-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><BellRing size={16} className="text-indigo-400" />Seguimiento comercial</h3>
        <Link to={`/seguimiento?lead=${lead.id}`} className="text-xs font-medium text-indigo-300 hover:underline">Preparar mensaje</Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Prioridad" value={lead.priority} options={PRIORITIES} onChange={(v) => setMeta({ priority: v })} />
        <Select label="Tipo de cliente" value={lead.client_type || ''} options={CLIENT_TYPES} onChange={(v) => setMeta({ client_type: v || null })} />
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-[#94A3B8]">Próximo seguimiento</dt><dd className="text-right text-white">{next ? `${fmtDue(next.due_at)} (${next.channel})` : <span className="text-[#F59E0B]">Sin próxima acción</span>}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-[#94A3B8]">Última interacción</dt><dd className="max-w-[60%] truncate text-right text-white">{last ? last.description : 'Ninguna registrada'}</dd></div>
      </dl>
    </div>
  )
}
