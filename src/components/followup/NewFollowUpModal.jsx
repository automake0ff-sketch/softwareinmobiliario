import { useState } from 'react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { Modal, Chip, Label, PrimaryButton, CHANNELS, WHEN_CHIPS, GOALS } from './shared'
import LeadPicker from './LeadPicker'

export default function NewFollowUpModal({ initialLead = null, onClose, onDone }) {
  const [lead, setLead] = useState(initialLead)
  const [days, setDays] = useState(1)
  const [channel, setChannel] = useState('whatsapp')
  const [goal, setGoal] = useState('follow_up')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await api.post('/followup/followups', { lead_id: lead.id, in_days: days, channel, goal, note: note.trim() || undefined })
      toast.success('Seguimiento programado'); onDone?.()
    } catch { /* api.js muestra el error */ } finally { setSaving(false) }
  }

  return (
    <Modal title="Programar seguimiento" onClose={onClose}>
      <div className="space-y-5">
        <div><Label>Contacto</Label><LeadPicker value={lead} onChange={setLead} autoFocus /></div>
        <div><Label>¿Cuándo?</Label><div className="flex flex-wrap gap-2">{[{ days: 0, label: 'Hoy' }, ...WHEN_CHIPS].map((w) => <Chip key={w.days} active={days === w.days} onClick={() => setDays(w.days)}>{w.label}</Chip>)}</div></div>
        <div><Label>Por dónde</Label><div className="flex flex-wrap gap-2">{CHANNELS.map((c) => <Chip key={c.id} active={channel === c.id} onClick={() => setChannel(c.id)}>{c.label}</Chip>)}</div></div>
        <div><Label>Objetivo</Label><div className="flex flex-wrap gap-2">{Object.entries(GOALS).map(([id, l]) => <Chip key={id} active={goal === id} onClick={() => setGoal(id)}>{l}</Chip>)}</div></div>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Nota (opcional)"
          className="w-full rounded-xl border border-[#2A2A3C] bg-[#0D0D14] px-3 py-2.5 text-sm text-[#F1F5F9] placeholder:text-[#64748B] focus:border-indigo-500 focus:outline-none" />
        <PrimaryButton onClick={save} loading={saving} disabled={!lead} className="w-full">Programar</PrimaryButton>
      </div>
    </Modal>
  )
}
