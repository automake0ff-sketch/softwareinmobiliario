import { useState } from 'react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { Modal, Chip, Label, PrimaryButton, CHANNELS, WHEN_CHIPS } from './shared'

const OUTCOMES = [
  { id: 'answered', label: 'Hablamos', next: 3 },
  { id: 'no_answer', label: 'No contestó', next: 1 },
  { id: 'interested', label: 'Interesado/a', next: 2 },
  { id: 'visit_scheduled', label: 'Visita acordada', next: 3 },
  { id: 'not_interested', label: 'No le interesa', next: null },
  { id: 'other', label: 'Otro', next: 3 },
]

// Registrar un contacto + programar el siguiente paso, en una sola pantalla.
export default function LogContactModal({ item, defaultChannel = 'whatsapp', onClose, onDone }) {
  const [channel, setChannel] = useState(defaultChannel)
  const [outcome, setOutcome] = useState('answered')
  const [note, setNote] = useState('')
  const [nextDays, setNextDays] = useState(3) // null = sin siguiente seguimiento
  const [saving, setSaving] = useState(false)

  const pickOutcome = (o) => { setOutcome(o.id); setNextDays(o.next) }

  const save = async () => {
    setSaving(true)
    try {
      const r = await api.post(`/followup/leads/${item.lead.id}/log`, {
        channel, outcome, note: note.trim(),
        followup_id: item.followup_id || undefined,
        property_id: item.property?.id || undefined,
        next: nextDays == null ? null : { in_days: nextDays, channel: channel === 'visit' ? 'whatsapp' : channel, goal: outcome === 'visit_scheduled' ? 'post_visit' : undefined },
      })
      toast.success(r.status_changed ? 'Contacto registrado y etapa actualizada' : 'Contacto registrado')
      if (r.suggest_close) toast('Si ya no le interesa, puedes cerrar el lead desde Leads.', { icon: 'ℹ️' })
      onDone?.()
    } catch { /* api.js ya muestra el error */ } finally { setSaving(false) }
  }

  return (
    <Modal title="Registrar contacto" subtitle={item.lead.name} onClose={onClose}>
      <div className="space-y-5">
        <div><Label>¿Cómo fue?</Label><div className="flex flex-wrap gap-2">{CHANNELS.map((c) => <Chip key={c.id} active={channel === c.id} onClick={() => setChannel(c.id)}>{c.label}</Chip>)}</div></div>
        <div><Label>Resultado</Label><div className="flex flex-wrap gap-2">{OUTCOMES.map((o) => <Chip key={o.id} active={outcome === o.id} onClick={() => pickOutcome(o)}>{o.label}</Chip>)}</div></div>
        <div>
          <Label>Nota (opcional)</Label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="Ej.: Quiere verlo el viernes por la tarde, le preocupa el precio."
            className="w-full rounded-xl border border-[#2A2A3C] bg-[#0D0D14] p-3 text-sm text-[#F1F5F9] placeholder:text-[#64748B] focus:border-indigo-500 focus:outline-none" />
        </div>
        <div>
          <Label>Próximo seguimiento</Label>
          <div className="flex flex-wrap gap-2">
            {WHEN_CHIPS.map((w) => <Chip key={w.days} active={nextDays === w.days} onClick={() => setNextDays(w.days)}>{w.label}</Chip>)}
            <Chip tone="red" active={nextDays == null} onClick={() => setNextDays(null)}>Sin seguimiento</Chip>
          </div>
        </div>
        <PrimaryButton onClick={save} loading={saving} className="w-full">Guardar</PrimaryButton>
      </div>
    </Modal>
  )
}
