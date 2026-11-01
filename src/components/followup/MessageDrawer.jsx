import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Copy, RefreshCw, Sparkles, MessageCircle, Mail, AlertTriangle } from 'lucide-react'
import api from '../../lib/api'
import { Modal, Chip, Label, PrimaryButton, GOALS } from './shared'

// Genera un borrador editable. Funciona siempre con plantillas; la IA es opcional.
export default function MessageDrawer({ item, onClose, onSent }) {
  const [goal, setGoal] = useState(item.goal || undefined)
  const [tone, setTone] = useState('cercano')
  const [channel, setChannel] = useState(item.channel === 'email' ? 'email' : 'whatsapp')
  const [variant, setVariant] = useState(0)
  const [data, setData] = useState(null)
  const [text, setText] = useState('')
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(true)
  const [aiOn, setAiOn] = useState(false)
  const edited = useRef(false)

  const load = useCallback(async (over = {}) => {
    setLoading(true)
    try {
      const r = await api.post('/followup/ai/message', {
        lead_id: item.lead.id, goal, tone, channel, variant,
        property_id: item.property?.id || undefined, use_ai: aiOn, ...over,
      })
      setData(r); setText(r.message); setSubject(r.subject || ''); setGoal(r.goal); edited.current = false
      r.warnings?.forEach((w) => toast(w, { icon: '⚠️' }))
    } catch { /* api.js muestra el error */ } finally { setLoading(false) }
  }, [item, goal, tone, channel, variant, aiOn])

  useEffect(() => { load() /* eslint-disable-next-line */ }, [])

  const regenerate = (over) => {
    if (edited.current && !window.confirm('Has editado el texto. ¿Generar uno nuevo y perder tus cambios?')) return
    load(over)
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(channel === 'email' && subject ? `Asunto: ${subject}\n\n${text}` : text); toast.success('Copiado') }
    catch { toast.error('No se pudo copiar. Selecciona el texto manualmente.') }
  }

  const waHref = data?.wa_phone ? `https://wa.me/${data.wa_phone}?text=${encodeURIComponent(text)}` : null
  const mailHref = item.lead.email ? `mailto:${item.lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}` : null

  return (
    <Modal title="Mensaje para enviar" subtitle={`${item.lead.name}${item.property?.title ? ` · ${item.property.title}` : ''}`} onClose={onClose} wide>
      <div className="space-y-5">
        <div>
          <Label>¿Qué quieres conseguir?</Label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(GOALS).map(([id, label]) => (
              <Chip key={id} active={goal === id} onClick={() => { setGoal(id); setVariant(0); regenerate({ goal: id, variant: 0 }) }}>{label}</Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip active={channel === 'whatsapp'} onClick={() => { setChannel('whatsapp'); regenerate({ channel: 'whatsapp' }) }}>WhatsApp</Chip>
          <Chip active={channel === 'email'} onClick={() => { setChannel('email'); regenerate({ channel: 'email' }) }}>Email</Chip>
          <span className="mx-1 h-5 w-px bg-[#2A2A3C]" />
          <Chip active={tone === 'cercano'} onClick={() => { setTone('cercano'); regenerate({ tone: 'cercano' }) }}>Cercano</Chip>
          <Chip active={tone === 'formal'} onClick={() => { setTone('formal'); regenerate({ tone: 'formal' }) }}>Formal</Chip>
        </div>

        {data?.warnings?.filter((w) => /WhatsApp|teléfono/.test(w)).map((w) => (
          <div key={w} className="flex items-start gap-2 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-3 text-xs text-[#FDE68A]"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{w}</div>
        ))}

        {channel === 'email' && (
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto" maxLength={150}
            className="w-full rounded-xl border border-[#2A2A3C] bg-[#0D0D14] px-3 py-2.5 text-sm text-[#F1F5F9] focus:border-indigo-500 focus:outline-none" />
        )}
        <div>
          <textarea value={loading ? 'Preparando el mensaje…' : text} disabled={loading} rows={channel === 'email' ? 8 : 6}
            onChange={(e) => { setText(e.target.value); edited.current = true }}
            className="w-full resize-y rounded-xl border border-[#2A2A3C] bg-[#0D0D14] p-3 text-sm leading-relaxed text-[#F1F5F9] focus:border-indigo-500 focus:outline-none disabled:opacity-60" />
          <p className="mt-1.5 text-xs text-[#64748B]">
            {data?.source === 'ai' ? 'Redactado con IA. Revísalo antes de enviar.' : 'Borrador a partir de una plantilla. Edítalo si quieres.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => { const v = variant + 1; setVariant(v); regenerate({ variant: v, use_ai: false }); setAiOn(false) }}
            className="inline-flex items-center gap-2 rounded-xl border border-[#2A2A3C] px-3 py-2 text-sm text-[#CBD5E1] hover:bg-[#1A1A24]"><RefreshCw size={15} /> Otra versión</button>
          {data?.ai_available && (
            <button onClick={() => { setAiOn(true); regenerate({ use_ai: true }) }}
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/40 px-3 py-2 text-sm text-indigo-200 hover:bg-indigo-500/10"><Sparkles size={15} /> Redactar con IA</button>
          )}
          <button onClick={copy} className="inline-flex items-center gap-2 rounded-xl border border-[#2A2A3C] px-3 py-2 text-sm text-[#CBD5E1] hover:bg-[#1A1A24]"><Copy size={15} /> Copiar</button>
        </div>

        <div className="flex flex-col gap-2 border-t border-[#1E1E2E] pt-4 sm:flex-row">
          {channel === 'whatsapp' ? (
            waHref
              ? <a href={waHref} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => onSent?.('whatsapp'), 400)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400"><MessageCircle size={16} /> Abrir WhatsApp</a>
              : <PrimaryButton disabled className="flex-1">WhatsApp no disponible</PrimaryButton>
          ) : (
            mailHref
              ? <a href={mailHref} onClick={() => setTimeout(() => onSent?.('email'), 400)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400"><Mail size={16} /> Abrir correo</a>
              : <PrimaryButton disabled className="flex-1">Sin email del contacto</PrimaryButton>
          )}
          <button onClick={() => onSent?.(channel)} className="rounded-xl border border-[#2A2A3C] px-4 py-2.5 text-sm text-[#CBD5E1] hover:bg-[#1A1A24]">Ya lo envié → registrar</button>
        </div>
      </div>
    </Modal>
  )
}
