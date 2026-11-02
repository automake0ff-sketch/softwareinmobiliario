import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { MessageCircle, NotebookPen, AlarmClock, Phone, CalendarDays } from 'lucide-react'
import api from '../../lib/api'
import { Modal, Select, PRIORITIES, CLIENT_TYPES, fmtDateTime, fmtDue } from './shared'

const TYPE_LABEL = { contact: 'Contacto', summary: 'Resumen', note: 'Nota' }

// Ficha rápida de un contacto: datos, prioridad, tipo, próximos pasos, visitas y línea de tiempo.
export default function LeadPanel({ leadId, onClose, onMessage, onLog, onSchedule }) {
  const [d, setD] = useState(null)
  const load = useCallback(() => api.get(`/followup/leads/${leadId}`).then(setD).catch(() => onClose()), [leadId, onClose])
  useEffect(() => { load() }, [load])

  if (!d) return <Modal title="Contacto" onClose={onClose}><p className="py-8 text-center text-sm text-[#64748B]">Cargando…</p></Modal>
  const { lead } = d
  const item = { kind: 'direct', followup_id: null, property: null, goal: null, channel: 'whatsapp', lead: { id: lead.id, name: lead.name, phone: lead.phone, email: lead.email, status: lead.status, status_label: lead.status_label, has_whatsapp: lead.has_whatsapp, whatsapp_opt_out: lead.whatsapp_opt_out } }

  const setMeta = async (patch) => {
    try { await api.patch(`/followup/leads/${lead.id}/meta`, patch); setD({ ...d, lead: { ...d.lead, ...patch } }); toast.success('Guardado') } catch { /* api.js */ }
  }

  return (
    <Modal title={lead.name} subtitle={`${lead.status_label}${lead.phone ? ` · ${lead.phone}` : ''}`} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onMessage(item)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-400"><MessageCircle size={14} />Mensaje</button>
          {lead.phone && <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 rounded-xl border border-[#2A2A3C] px-3 py-2 text-xs text-[#E2E8F0] hover:bg-[#1A1A24]"><Phone size={14} />Llamar</a>}
          <button onClick={() => onLog(item)} className="inline-flex items-center gap-1.5 rounded-xl border border-[#2A2A3C] px-3 py-2 text-xs text-[#E2E8F0] hover:bg-[#1A1A24]"><NotebookPen size={14} />Registrar contacto</button>
          <button onClick={() => onSchedule(lead)} className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/40 px-3 py-2 text-xs text-indigo-200 hover:bg-indigo-500/10"><AlarmClock size={14} />Programar</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select label="Prioridad" value={lead.priority} options={PRIORITIES} onChange={(v) => setMeta({ priority: v })} />
          <Select label="Tipo de cliente" value={lead.client_type || ''} options={CLIENT_TYPES} onChange={(v) => setMeta({ client_type: v || null })} />
        </div>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Próximos seguimientos</h3>
          {d.pending_followups.length === 0
            ? <p className="rounded-xl border border-[#1E1E2E] px-3 py-3 text-sm text-[#64748B]">Sin próxima acción programada.</p>
            : <ul className="space-y-1.5">{d.pending_followups.map((f) => <li key={f.id} className="flex items-center justify-between rounded-xl border border-[#1E1E2E] bg-[#0D0D14] px-3 py-2 text-sm text-[#E2E8F0]"><span>{fmtDue(f.due_at)}{f.property_title ? ` · ${f.property_title}` : ''}</span><span className="text-xs text-[#64748B]">{f.channel}</span></li>)}</ul>}
        </section>

        {d.appointments?.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Visitas</h3>
            <ul className="space-y-1.5">{d.appointments.map((a) => <li key={a.id} className="flex items-center gap-2 rounded-xl border border-[#1E1E2E] bg-[#0D0D14] px-3 py-2 text-sm text-[#E2E8F0]"><CalendarDays size={14} className="text-[#64748B]" /><span className="flex-1">{fmtDateTime(a.starts_at)}{a.property_title ? ` · ${a.property_title}` : ''}</span><span className="text-xs text-[#64748B]">{a.status}</span></li>)}</ul>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Historial</h3>
          {d.timeline.length === 0
            ? <p className="rounded-xl border border-[#1E1E2E] px-3 py-3 text-sm text-[#64748B]">Aún no hay interacciones registradas.</p>
            : <ol className="space-y-2 border-l border-[#1E1E2E] pl-4">{d.timeline.map((t) => (
              <li key={t.id} className="relative"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-indigo-400" />
                <p className="text-xs text-[#64748B]">{TYPE_LABEL[t.type] || t.type} · {fmtDateTime(t.created_at)}</p>
                <p className="text-sm text-[#E2E8F0]">{t.description}</p></li>))}</ol>}
        </section>
      </div>
    </Modal>
  )
}
