import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { Modal, PrimaryButton } from './shared'

const STATUS_ROWS = [
  ['nuevo', 'Nuevo'], ['contactado', 'Contactado'], ['interesado', 'Interesado'],
  ['visita_agendada', 'Visita agendada'], ['negociacion', 'Negociación'], ['reserva', 'Reserva'],
]

function Num({ label, value, onChange, min, max, disabled, hint }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-[#1E1E2E] bg-[#0D0D14] px-3 py-2.5">
      <span className="text-sm text-[#E2E8F0]">{label}{hint && <span className="block text-[11px] text-[#64748B]">{hint}</span>}</span>
      <span className="flex items-center gap-2">
        <input type="number" min={min} max={max} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-20 rounded-lg border border-[#2A2A3C] bg-[#13131A] px-2 py-1.5 text-right text-sm text-[#F1F5F9] focus:border-indigo-500 focus:outline-none disabled:opacity-60" />
        <span className="w-9 text-xs text-[#64748B]">días</span>
      </span>
    </label>
  )
}

// Reglas de alerta configurables por agencia. Solo las edita un administrador.
export default function SettingsModal({ onClose, onSaved }) {
  const [data, setData] = useState(null)
  const [s, setS] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { api.get('/followup/settings').then((r) => { setData(r); setS(r.settings) }).catch(() => onClose()) }, [onClose])
  if (!s) return <Modal title="Reglas de alerta" onClose={onClose}><p className="py-8 text-center text-sm text-[#64748B]">Cargando…</p></Modal>

  const edit = data.can_edit
  const setStale = (k, v) => setS({ ...s, stale_days: { ...s.stale_days, [k]: v } })

  const save = async () => {
    setSaving(true)
    try { const r = await api.put('/followup/settings', { stale_days: s.stale_days, inactive_days: s.inactive_days, visit_followup_days: s.visit_followup_days }); setS(r.settings); toast.success('Reglas guardadas'); onSaved?.() }
    catch { /* api.js muestra el error */ } finally { setSaving(false) }
  }
  const reset = async () => {
    try { const r = await api.post('/followup/settings/reset'); setS(r.settings); toast.success('Reglas restablecidas'); onSaved?.() } catch { /* api.js */ }
  }

  return (
    <Modal title="Reglas de alerta" subtitle="Cuándo avisarte de un contacto sin seguimiento" onClose={onClose}>
      <div className="space-y-5">
        {!edit && <p className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2 text-xs text-[#FCD34D]">Solo un administrador puede cambiar estas reglas.</p>}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Días sin contacto, por estado</p>
          <div className="space-y-2">{STATUS_ROWS.map(([k, label]) => <Num key={k} label={label} value={s.stale_days[k]} min={1} max={120} disabled={!edit} onChange={(v) => setStale(k, v)} />)}</div>
        </div>
        <div className="space-y-2">
          <Num label="Contacto inactivo" hint="A partir de aquí se marca «Sin actividad»" value={s.inactive_days} min={7} max={365} disabled={!edit} onChange={(v) => setS({ ...s, inactive_days: v })} />
          <Num label="Visita realizada sin seguimiento" hint="Días desde la visita hasta avisarte" value={s.visit_followup_days} min={0} max={30} disabled={!edit} onChange={(v) => setS({ ...s, visit_followup_days: v })} />
        </div>
        <p className="text-xs text-[#64748B]">Estas reglas son fijas y objetivas: no usan IA ni suponen que un cliente ha perdido el interés.</p>
        {edit && (
          <div className="flex gap-2">
            <button onClick={reset} className="rounded-xl border border-[#2A2A3C] px-4 py-2.5 text-sm text-[#CBD5E1] hover:bg-[#1A1A24]">Restablecer</button>
            <PrimaryButton onClick={save} loading={saving} className="flex-1">Guardar reglas</PrimaryButton>
          </div>
        )}
      </div>
    </Modal>
  )
}
