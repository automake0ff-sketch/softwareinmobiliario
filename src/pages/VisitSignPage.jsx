import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Eraser, Home, ShieldCheck } from 'lucide-react'

const inputCls = 'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-base text-white placeholder:text-[#6b7794] focus:border-indigo-400 focus:outline-none'

function SignaturePad({ onChange }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)

  useEffect(() => {
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
  }, [])

  function pos(e) {
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }
  }
  function start(e) {
    e.preventDefault()
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    canvasRef.current.setPointerCapture?.(e.pointerId)
  }
  function move(e) {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    hasInk.current = true
  }
  function end() {
    if (!drawing.current) return
    drawing.current = false
    if (hasInk.current) onChange(canvasRef.current.toDataURL('image/png'))
  }
  function clear() {
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
    hasInk.current = false
    onChange(null)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={640}
        height={220}
        className="w-full touch-none rounded-xl bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <button type="button" onClick={clear} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#9fb3d9] hover:text-white">
        <Eraser size={14} /> Borrar firma
      </button>
    </div>
  )
}

export default function VisitSignPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ visitor_name: '', visitor_doc: '', visitor_phone: '', visitor_email: '', consent_data: false, signature_name: '' })
  const [signature, setSignature] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/public/visit/${token}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Este enlace no es válido.')
        return json
      })
      .then((json) => {
        setData(json)
        if (json.prefill) setForm((f) => ({ ...f, ...json.prefill }))
        if (json.status === 'signed') setDone(true)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/visit/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, signature_image: signature }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'No se pudo registrar la firma.')
      setDone(true)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const shell = (children) => (
    <div className="min-h-screen bg-[#0b0b10] px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-lg">{children}</div>
    </div>
  )

  if (loading) return shell(<p className="text-center text-[#9fb3d9]">Cargando…</p>)
  if (error) return shell(<div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-6 text-center text-rose-100">{error}</div>)

  const dateLabel = new Date(data.visit_date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  if (done) {
    return shell(
      <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 text-emerald-300" size={44} />
        <h1 className="text-xl font-bold">Visita registrada</h1>
        <p className="mt-2 text-sm text-emerald-100/90">Gracias. {data.agency.name} ha guardado la constancia de tu visita a «{data.property.title}».</p>
      </div>
    )
  }

  return shell(
    <form onSubmit={submit} className="space-y-5">
      <header className="text-center">
        {data.agency.logo_url ? (
          <img src={data.agency.logo_url} alt={data.agency.name} className="mx-auto mb-3 h-12 object-contain" />
        ) : (
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-200"><Home size={22} /></div>
        )}
        <h1 className="text-xl font-bold">Parte de visita</h1>
        <p className="mt-1 text-sm text-[#9fb3d9]">{data.agency.name}</p>
      </header>

      <section className="rounded-2xl border border-[#27283a] bg-[#15151d] p-4 text-sm">
        <p className="font-semibold text-white">{data.property.title}</p>
        <p className="text-[#9fb3d9]">{[data.property.zone, data.property.city].filter(Boolean).join(', ')}{data.property.reference ? ` · Ref. ${data.property.reference}` : ''}</p>
        <p className="mt-2 capitalize text-[#c7d4ef]">{dateLabel}</p>
      </section>

      <section className="space-y-3 rounded-2xl border border-[#27283a] bg-[#15151d] p-4">
        <label className="block text-xs font-semibold text-[#9fb3d9]">Nombre y apellidos *
          <input className={`${inputCls} mt-1`} value={form.visitor_name} onChange={set('visitor_name')} autoComplete="name" />
        </label>
        <label className="block text-xs font-semibold text-[#9fb3d9]">DNI / NIE (opcional)
          <input className={`${inputCls} mt-1`} value={form.visitor_doc} onChange={set('visitor_doc')} />
        </label>
        <label className="block text-xs font-semibold text-[#9fb3d9]">Teléfono
          <input className={`${inputCls} mt-1`} type="tel" value={form.visitor_phone} onChange={set('visitor_phone')} autoComplete="tel" />
        </label>
        <label className="block text-xs font-semibold text-[#9fb3d9]">Correo electrónico
          <input className={`${inputCls} mt-1`} type="email" value={form.visitor_email} onChange={set('visitor_email')} autoComplete="email" />
        </label>
        <p className="text-xs text-[#7f91b3]">Indica al menos un teléfono o un correo.</p>
      </section>

      <section className="rounded-2xl border border-[#27283a] bg-[#15151d] p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold"><ShieldCheck size={16} className="text-indigo-300" /> Lo que firmas</h2>
        <div className="max-h-56 space-y-3 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-[#c7d4ef]">{data.terms_text}</div>
        <label className="mt-4 flex items-start gap-2 text-sm text-[#d7e2f7]">
          <input type="checkbox" className="mt-1" checked={form.consent_data} onChange={set('consent_data')} />
          <span>He leído el texto anterior y acepto el tratamiento de mis datos para esta finalidad.</span>
        </label>
      </section>

      <section className="rounded-2xl border border-[#27283a] bg-[#15151d] p-4">
        <h2 className="mb-2 text-sm font-bold">Firma</h2>
        <SignaturePad onChange={setSignature} />
        {!signature && (
          <label className="mt-3 block text-xs font-semibold text-[#9fb3d9]">…o escribe tu nombre completo como firma
            <input className={`${inputCls} mt-1`} value={form.signature_name} onChange={set('signature_name')} />
          </label>
        )}
      </section>

      {formError && <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{formError}</p>}

      <button type="submit" disabled={submitting} className="w-full rounded-2xl bg-indigo-500 px-4 py-4 text-base font-bold text-white disabled:opacity-60">
        {submitting ? 'Enviando…' : 'Firmar y registrar la visita'}
      </button>
    </form>
  )
}
