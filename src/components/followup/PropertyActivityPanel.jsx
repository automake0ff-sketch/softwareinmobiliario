import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../lib/api'
import { fmtDue, fmtDateTime } from './shared'

const Tile = ({ label, value }) => (
  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center">
    <p className="text-lg font-bold text-white">{value}</p><p className="text-[11px] text-[#94A3B8]">{label}</p>
  </div>
)

// Actividad comercial real del inmueble: interesados, consultas, visitas y seguimientos.
export default function PropertyActivityPanel({ propertyId }) {
  const [d, setD] = useState(null)
  useEffect(() => { let alive = true; setD(null); api.get(`/followup/property/${propertyId}`).then((r) => alive && setD(r)).catch(() => {}); return () => { alive = false } }, [propertyId])
  if (!d) return null
  const c = d.counts
  return (
    <section className="mt-6 space-y-4" data-testid="property-activity">
      <h4 className="text-sm font-semibold text-white">Actividad comercial</h4>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Interesados" value={c.interested} /><Tile label="Visitas realizadas" value={c.visits_done} />
        <Tile label="Visitas próximas" value={c.visits_upcoming} /><Tile label="Seguimientos pendientes" value={c.pending_followups} />
      </div>
      {d.pending_followups.length > 0 && (
        <div><p className="mb-1.5 text-xs font-medium text-[#94A3B8]">Seguimientos pendientes</p>
          <ul className="space-y-1">{d.pending_followups.slice(0, 5).map((f) => <li key={f.id} className="flex justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"><Link to={`/seguimiento?lead=${f.lead_id}`} className="hover:underline">{f.name}</Link><span className="text-xs text-[#94A3B8]">{fmtDue(f.due_at)}</span></li>)}</ul></div>
      )}
      {d.last_interactions.length > 0 && (
        <div><p className="mb-1.5 text-xs font-medium text-[#94A3B8]">Últimas interacciones</p>
          <ul className="space-y-1">{d.last_interactions.slice(0, 5).map((x, i) => <li key={i} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"><span className="font-medium">{x.name}</span> · {fmtDateTime(x.created_at)}<br /><span className="text-[#94A3B8]">{x.description}</span></li>)}</ul></div>
      )}
    </section>
  )
}
