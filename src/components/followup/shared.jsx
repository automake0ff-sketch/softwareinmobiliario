import { useState } from 'react'
import { X, Building2 } from 'lucide-react'

export const CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'call', label: 'Llamada' },
  { id: 'email', label: 'Email' },
  { id: 'visit', label: 'Visita' },
]

export const GOALS = {
  first_contact: 'Primer contacto',
  follow_up: 'Seguimiento',
  visit_proposal: 'Proponer visita',
  post_visit: 'Tras la visita',
  reactivation: 'Reactivar',
  seller_prospecting: 'Captar propietario',
  price_update: 'Cambio de precio',
}

// Atajos de "cuándo" — el usuario no tiene que elegir fechas con un calendario
export const WHEN_CHIPS = [
  { days: 1, label: 'Mañana' },
  { days: 3, label: 'En 3 días' },
  { days: 7, label: '1 semana' },
  { days: 14, label: '2 semanas' },
  { days: 30, label: '1 mes' },
]

export function Modal({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-[#1E1E2E] bg-[#13131A] shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#1E1E2E] bg-[#13131A] px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-[#F1F5F9]">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-xs text-[#94A3B8]">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[#94A3B8] hover:bg-[#1E1E2E] hover:text-white" aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Chip({ active, onClick, children, tone = 'indigo', disabled }) {
  const on = tone === 'red' ? 'border-[#EF4444]/60 bg-[#EF4444]/15 text-[#FECACA]' : 'border-indigo-500/60 bg-indigo-500/15 text-indigo-100'
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${active ? on : 'border-[#2A2A3C] text-[#CBD5E1] hover:border-[#3B3B52] hover:bg-[#1A1A24]'}`}>
      {children}
    </button>
  )
}

export const Label = ({ children }) => <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">{children}</p>

export function PrimaryButton({ children, loading, ...rest }) {
  return (
    <button {...rest} disabled={loading || rest.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50 ${rest.className || ''}`}>
      {loading ? 'Un momento…' : children}
    </button>
  )
}

export function fmtDue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - start.getTime()) / 86400000)
  if (diff === 0) return 'hoy'
  if (diff === 1) return 'mañana'
  if (diff === -1) return 'ayer'
  if (diff < 0) return `hace ${-diff} días`
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function fmtAgo(days) {
  if (days == null) return 'sin contacto registrado'
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  return `hace ${days} días`
}

// ── Fase 2-4 ──────────────────────────────────────────────────────────
// Ojo: este proyecto define red/amber/slate como colores planos; por eso aquí se usan valores hex.
export const ALERT_ORDER = ['inmediata', 'recomendada', 'pendiente_confirmar', 'sin_actividad']
export const ALERT_STYLE = {
  inmediata: { label: 'Atención inmediata', border: 'border-[#EF4444]/30', badge: 'border-[#EF4444]/40 bg-[#EF4444]/15 text-[#FCA5A5]', title: 'text-[#FCA5A5]', help: 'Conviene actuar hoy.' },
  recomendada: { label: 'Seguimiento recomendado', border: 'border-indigo-500/25', badge: 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200', title: 'text-indigo-300', help: 'Toca retomar el contacto.' },
  pendiente_confirmar: { label: 'Pendiente de confirmar', border: 'border-[#F59E0B]/30', badge: 'border-[#F59E0B]/40 bg-[#F59E0B]/15 text-[#FCD34D]', title: 'text-[#FCD34D]', help: 'Visitas próximas que el cliente no ha confirmado.' },
  sin_actividad: { label: 'Sin actividad', border: 'border-[#2A2A3C]', badge: 'border-[#64748B]/40 bg-[#64748B]/15 text-[#CBD5E1]', title: 'text-[#CBD5E1]', help: 'Llevan mucho tiempo sin movimiento: reactívalos o archívalos.' },
}
export const PRIORITIES = [{ id: 'alta', label: 'Alta' }, { id: 'media', label: 'Media' }, { id: 'baja', label: 'Baja' }]
export const CLIENT_TYPES = [
  { id: '', label: 'Sin indicar' }, { id: 'comprador', label: 'Comprador' }, { id: 'vendedor', label: 'Vendedor' },
  { id: 'propietario', label: 'Propietario' }, { id: 'inquilino', label: 'Inquilino' }, { id: 'otro', label: 'Otro' },
]
export const clientTypeLabel = (id) => CLIENT_TYPES.find((c) => c.id === id)?.label || ''

export const fmtDateTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
}

export function PropertyThumb({ property, size = 56 }) {
  const [broken, setBroken] = useState(false)
  const box = { width: size, height: size }
  if (property?.photo && !broken) {
    return <img src={property.photo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={box} className="shrink-0 rounded-xl border border-[#1E1E2E] object-cover" />
  }
  return <div style={box} className="flex shrink-0 items-center justify-center rounded-xl border border-[#1E1E2E] bg-[#0D0D14] text-[#475569]"><Building2 size={Math.round(size / 2.6)} /></div>
}

export function Select({ value, onChange, options, label, disabled }) {
  return (
    <label className="block text-xs text-[#94A3B8]">
      {label}
      <select value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-[#2A2A3C] bg-[#0D0D14] px-2.5 py-2 text-sm text-[#F1F5F9] focus:border-indigo-500 focus:outline-none disabled:opacity-60">
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  )
}
