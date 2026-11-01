import { useState } from 'react'
import toast from 'react-hot-toast'
import { Sparkles, ListChecks, CalendarClock } from 'lucide-react'
import api from '../../lib/api'
import { Modal, Chip, Label, PrimaryButton, GOALS, fmtDue } from './shared'
import LeadPicker from './LeadPicker'

const INTEREST = { alto: ['Interés alto', 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'], neutro: ['Interés neutro', 'text-[#CBD5E1] border-[#64748B]/40 bg-[#64748B]/10'], bajo: ['Interés bajo', 'text-[#FCA5A5] border-[#EF4444]/40 bg-[#EF4444]/10'] }
const OBJ = { precio: 'Precio', financiacion: 'Financiación', decision: 'Decisión compartida', timing: 'Plazos', competencia: 'Otras opciones', vivienda: 'Vivienda' }

export default function SummaryModal({ aiAvailable, onClose, onDone }) {
  const [text, setText] = useState('')
  const [lead, setLead] = useState(null)
  const [useAi, setUseAi] = useState(false)
  const [save, setSave] = useState(true)
  const [createFollowup, setCreateFollowup] = useState(true)
  const [res, setRes] = useState(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true)
    try {
      const r = await api.post('/followup/ai/summarize', {
        text, lead_id: lead?.id, use_ai: useAi, save: !!lead && save, create_followup: !!lead && createFollowup,
      })
      setRes(r)
      r.warnings?.forEach((w) => toast(w, { icon: '⚠️' }))
      if (r.saved || r.followup_id) { toast.success('Guardado en la ficha del contacto'); onDone?.() }
    } catch { /* api.js muestra el error */ } finally { setLoading(false) }
  }

  const tooShort = text.trim().length < 20

  return (
    <Modal title="Resumir conversación" subtitle="Pega el chat o tus notas y obtén los próximos pasos" onClose={onClose} wide>
      {!res ? (
        <div className="space-y-4">
          <div>
            <Label>Conversación</Label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} maxLength={8000}
              placeholder="Pega aquí la conversación de WhatsApp, el email o tus notas de la llamada…"
              className="w-full rounded-xl border border-[#2A2A3C] bg-[#0D0D14] p-3 text-sm text-[#F1F5F9] placeholder:text-[#64748B] focus:border-indigo-500 focus:outline-none" />
            <p className="mt-1 text-right text-xs text-[#64748B]">{text.length}/8000</p>
          </div>
          <div>
            <Label>Contacto (opcional, para guardar el resumen)</Label>
            <LeadPicker value={lead} onChange={setLead} />
          </div>
          {lead && (
            <div className="flex flex-wrap gap-2">
              <Chip active={save} onClick={() => setSave(!save)}>Guardar resumen en su ficha</Chip>
              <Chip active={createFollowup} onClick={() => setCreateFollowup(!createFollowup)}>Crear el seguimiento sugerido</Chip>
            </div>
          )}
          {aiAvailable && <Chip active={useAi} onClick={() => setUseAi(!useAi)}><Sparkles size={12} className="mr-1 inline" />Usar IA (más preciso)</Chip>}
          <PrimaryButton onClick={run} loading={loading} disabled={tooShort} className="w-full">Resumir</PrimaryButton>
          {!aiAvailable && <p className="text-xs text-[#64748B]">Modo básico: detecta fechas, dudas, importes y señales de interés con reglas, sin enviar tu conversación a ningún servicio externo.</p>}
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-[#E2E8F0]">{res.summary}</p>
          <div className="flex flex-wrap gap-2">
            {res.signals?.interest && <span className={`rounded-full border px-3 py-1 text-xs ${INTEREST[res.signals.interest]?.[1]}`}>{INTEREST[res.signals.interest]?.[0]}</span>}
            {res.signals?.objections?.map((o) => <span key={o} className="rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3 py-1 text-xs text-[#FDE68A]">{OBJ[o] || o}</span>)}
          </div>
          <div>
            <Label><ListChecks size={13} className="mr-1 inline" />Próximos pasos</Label>
            <ul className="space-y-1.5">{res.next_steps.map((s, i) => <li key={i} className="flex gap-2 text-sm text-[#CBD5E1]"><span className="text-indigo-400">•</span>{s}</li>)}</ul>
          </div>
          <div className="rounded-xl border border-[#1E1E2E] bg-[#0D0D14] p-3 text-sm text-[#CBD5E1]">
            <CalendarClock size={15} className="mr-2 inline text-indigo-400" />
            Seguimiento sugerido: <b className="text-white">{fmtDue(res.suggested_followup.due_at)}</b> · {GOALS[res.suggested_followup.goal] || 'Seguimiento'} <span className="text-[#64748B]">({res.suggested_followup.reason})</span>
          </div>
          <p className="text-xs text-[#64748B]">{res.source === 'ai' ? 'Resumido con IA.' : 'Resumen básico por reglas.'}{res.saved ? ' · Guardado en la ficha.' : ''}{res.followup_id ? ' · Seguimiento creado.' : ''}</p>
          <div className="flex gap-2">
            <button onClick={() => setRes(null)} className="rounded-xl border border-[#2A2A3C] px-4 py-2.5 text-sm text-[#CBD5E1] hover:bg-[#1A1A24]">Otra conversación</button>
            <PrimaryButton onClick={onClose} className="flex-1">Listo</PrimaryButton>
          </div>
        </div>
      )}
    </Modal>
  )
}
