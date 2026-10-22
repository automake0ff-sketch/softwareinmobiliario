import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, Copy, ExternalLink, FileSignature,
  Plus, Printer, RefreshCw, ShieldCheck, Trash2, X,
} from 'lucide-react'
import api from '../lib/api'

const inputCls = 'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-[#6b7794] focus:border-indigo-400 focus:outline-none'
const labelCls = 'mb-1.5 block text-xs font-semibold text-[#9fb3d9]'
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const absolute = (path) => `${window.location.origin}${path}`

const ALERT_STYLES = {
  ok: 'bg-emerald-500/10 text-emerald-200',
  aviso: 'bg-amber-500/15 text-amber-200',
  urgente: 'bg-rose-500/15 text-rose-200',
  vencido: 'bg-rose-500/15 text-rose-200',
  renovada_auto: 'bg-orange-500/15 text-orange-200',
  inactivo: 'bg-slate-500/15 text-slate-300',
}
const ALERT_LABELS = { ok: 'Vigente', aviso: 'Revisar pronto', urgente: 'Urgente', vencido: 'Vencido', renovada_auto: 'Plazo de aviso pasado', inactivo: 'Inactivo' }
const INTEREST = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' }

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm print:static print:bg-white print:p-0">
      <div className={`mt-10 w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-3xl border border-[#27283a] bg-[#15151d] p-6 print:mt-0 print:max-w-none print:border-0 print:bg-white print:text-black`}>
        <div className="mb-4 flex items-center justify-between print:hidden">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="rounded-xl bg-white/5 p-2 text-white hover:bg-white/10"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return <div><label className={labelCls}>{label}</label>{children}</div>
}

// ── Nuevo parte de visita ─────────────────────────────────────────────────────
function NewVisitModal({ properties, leads, onClose, onCreated }) {
  const [form, setForm] = useState({ property_id: '', lead_id: '', visitor_name: '', visitor_phone: '', visitor_email: '' })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit() {
    if (!form.property_id) return toast.error('Elige el inmueble visitado')
    setSaving(true)
    try {
      const body = { property_id: form.property_id }
      for (const k of ['lead_id', 'visitor_name', 'visitor_phone', 'visitor_email']) if (form[k]) body[k] = form[k]
      const created = await api.post('/visit-reports', body)
      onCreated(created)
    } catch (e) {
      toast.error(e.message || 'No se pudo crear el parte')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Nuevo parte de visita" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Inmueble visitado *">
          <select className={inputCls} value={form.property_id} onChange={set('property_id')}>
            <option value="">Elige un inmueble…</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.title}{p.city ? ` · ${p.city}` : ''}</option>)}
          </select>
        </Field>
        <Field label="Contacto existente (opcional)">
          <select className={inputCls} value={form.lead_id} onChange={set('lead_id')}>
            <option value="">Persona nueva</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        {!form.lead_id && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Nombre"><input className={inputCls} value={form.visitor_name} onChange={set('visitor_name')} /></Field>
            <Field label="Teléfono"><input className={inputCls} value={form.visitor_phone} onChange={set('visitor_phone')} /></Field>
            <Field label="Correo"><input className={inputCls} value={form.visitor_email} onChange={set('visitor_email')} /></Field>
          </div>
        )}
        <p className="text-xs text-[#7f91b3]">El visitante completará y firmará sus datos desde su móvil. Tú solo le enseñas el código QR.</p>
        <button onClick={submit} disabled={saving} className="w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
          {saving ? 'Creando…' : 'Crear parte y mostrar QR'}
        </button>
      </div>
    </Modal>
  )
}

// ── QR y enlace ───────────────────────────────────────────────────────────────
function QrModal({ visit, onClose }) {
  const url = absolute(visit.public_path || `/visita/${visit.token}`)
  const [qr, setQr] = useState('')
  useEffect(() => { QRCode.toDataURL(url, { width: 280, margin: 1 }).then(setQr).catch(() => {}) }, [url])
  const msg = encodeURIComponent(`Hola, aquí puedes firmar el parte de tu visita: ${url}`)
  return (
    <Modal title="Que el visitante firme" onClose={onClose}>
      <div className="space-y-4 text-center">
        {qr && <img src={qr} alt="Código QR del parte de visita" className="mx-auto rounded-2xl bg-white p-2" width={280} height={280} />}
        <p className="text-sm text-[#c7d4ef]">Pídele que escanee el código con la cámara de su móvil, o envíale el enlace.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button onClick={() => { navigator.clipboard?.writeText(url); toast.success('Enlace copiado') }} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white"><Copy size={15} /> Copiar enlace</button>
          <a href={`sms:?&body=${msg}`} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white">Enviar por SMS</a>
          <a href={`mailto:${visit.visitor_email || ''}?subject=${encodeURIComponent('Parte de visita')}&body=${msg}`} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white">Enviar por correo</a>
        </div>
      </div>
    </Modal>
  )
}

// ── Constancia imprimible ─────────────────────────────────────────────────────
function EvidenceModal({ visit, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.get(`/visit-reports/${visit.id}/evidence`).then(setData).catch((e) => setError(e.message))
  }, [visit.id])
  const r = data?.report
  return (
    <Modal title="Constancia de visita" onClose={onClose} wide>
      {error && <p className="text-rose-300">{error}</p>}
      {!data && !error && <p className="text-[#9fb3d9]">Cargando…</p>}
      {data && (
        <div className="space-y-4 text-sm text-[#d7e2f7] print:text-black">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-white print:text-black">{data.agency.name}</p>
              <p className="text-xs text-[#9fb3d9] print:text-gray-600">Parte de visita firmado</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${data.integrity_ok ? 'bg-emerald-500/15 text-emerald-200' : 'bg-rose-500/20 text-rose-200'}`}>
              {data.integrity_ok ? 'Integridad verificada' : 'Los datos han sido modificados'}
            </span>
          </div>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div><dt className="text-xs text-[#7f91b3]">Inmueble</dt><dd>{r.property_title}{r.property_reference ? ` (ref. ${r.property_reference})` : ''}</dd></div>
            <div><dt className="text-xs text-[#7f91b3]">Fecha de la visita</dt><dd>{fmtDateTime(r.visit_date)}</dd></div>
            <div><dt className="text-xs text-[#7f91b3]">Visitante</dt><dd>{r.visitor_name}{r.visitor_doc ? ` · ${r.visitor_doc}` : ''}</dd></div>
            <div><dt className="text-xs text-[#7f91b3]">Contacto</dt><dd>{[r.visitor_phone, r.visitor_email].filter(Boolean).join(' · ')}</dd></div>
            <div><dt className="text-xs text-[#7f91b3]">Firmado el</dt><dd>{fmtDateTime(r.signed_at)}</dd></div>
            <div><dt className="text-xs text-[#7f91b3]">Dirección IP</dt><dd>{r.signed_ip || '—'}</dd></div>
          </dl>
          <div>
            <p className="mb-1 text-xs text-[#7f91b3]">Texto que firmó</p>
            <p className="whitespace-pre-line rounded-xl bg-white/5 p-3 text-xs leading-relaxed print:bg-gray-100">{r.terms_text}</p>
          </div>
          <div>
            <p className="mb-1 text-xs text-[#7f91b3]">Firma</p>
            {r.signature_image
              ? <img src={r.signature_image} alt="Firma del visitante" className="h-24 rounded-lg bg-white p-1" />
              : <p className="italic">{r.signature_name}</p>}
          </div>
          <p className="break-all text-[10px] text-[#7f91b3]">Huella (SHA-256): {r.content_hash}</p>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-bold text-white print:hidden"><Printer size={15} /> Imprimir o guardar en PDF</button>
        </div>
      )}
    </Modal>
  )
}

// ── Valoración tras la visita ─────────────────────────────────────────────────
function FeedbackModal({ visit, onClose, onSaved }) {
  const [level, setLevel] = useState(visit.interest_level || '')
  const [feedback, setFeedback] = useState(visit.feedback || '')
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    try {
      const updated = await api.patch(`/visit-reports/${visit.id}`, { interest_level: level || null, feedback })
      onSaved(updated)
    } catch (e) {
      toast.error(e.message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal title="Valoración de la visita" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Interés del visitante">
          <div className="flex gap-2">
            {['alto', 'medio', 'bajo'].map((l) => (
              <button key={l} onClick={() => setLevel(l === level ? '' : l)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${level === l ? 'bg-indigo-500 text-white' : 'bg-white/5 text-[#c7d4ef]'}`}>{INTEREST[l]}</button>
            ))}
          </div>
        </Field>
        <Field label="Comentario para el propietario (sin datos personales)">
          <textarea rows={4} className={inputCls} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Qué le gustó, qué objeciones puso, próximos pasos…" />
        </Field>
        <p className="text-xs text-[#7f91b3]">Este comentario aparece en el informe que ve el propietario. No escribas aquí nombres ni teléfonos del visitante.</p>
        <button onClick={save} disabled={saving} className="w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">Guardar</button>
      </div>
    </Modal>
  )
}

// ── Pestaña: partes de visita ─────────────────────────────────────────────────
function VisitsTab({ properties, leads }) {
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [qrFor, setQrFor] = useState(null)
  const [evidenceFor, setEvidenceFor] = useState(null)
  const [feedbackFor, setFeedbackFor] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setVisits(await api.get('/visit-reports', filter ? { status: filter } : undefined))
    } catch (e) {
      toast.error(e.message || 'No se pudieron cargar los partes')
    } finally {
      setLoading(false)
    }
  }, [filter])
  useEffect(() => { load() }, [load])

  async function cancel(v) {
    if (!window.confirm('¿Anular este parte pendiente? El enlace dejará de funcionar.')) return
    try { await api.post(`/visit-reports/${v.id}/cancel`, {}); toast.success('Parte anulado'); load() }
    catch (e) { toast.error(e.message) }
  }

  const badge = (s) => s === 'signed'
    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200"><CheckCircle2 size={12} /> Firmado</span>
    : s === 'pending'
      ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-200"><Clock size={12} /> Pendiente de firma</span>
      : <span className="rounded-full bg-slate-500/20 px-3 py-1 text-xs font-semibold text-slate-300">Anulado</span>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select className={`${inputCls} max-w-[220px]`} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Todos los partes</option>
          <option value="pending">Pendientes de firma</option>
          <option value="signed">Firmados</option>
          <option value="cancelled">Anulados</option>
        </select>
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-bold text-white"><Plus size={16} /> Nuevo parte de visita</button>
      </div>

      {loading && <p className="text-[#9fb3d9]">Cargando…</p>}
      {!loading && visits.length === 0 && (
        <div className="rounded-3xl border border-dashed border-[#27283a] p-10 text-center">
          <FileSignature className="mx-auto mb-3 text-indigo-300" size={32} />
          <p className="font-semibold text-white">Aún no hay partes de visita</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-[#9fb3d9]">Cuando enseñes un inmueble, crea un parte y que el visitante lo firme desde su móvil: tendrás una prueba fechada de que la visita la hizo tu agencia.</p>
        </div>
      )}

      <div className="space-y-3">
        {visits.map((v) => (
          <article key={v.id} className="rounded-2xl border border-[#27283a] bg-[#15151d] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-white">{v.property_title}</p>
                <p className="text-sm text-[#9fb3d9]">{v.visitor_name || v.lead_name || 'Visitante sin nombre'} · {fmtDateTime(v.visit_date)}</p>
                {v.interest_level && <p className="mt-1 text-xs text-[#c7d4ef]">Interés {INTEREST[v.interest_level].toLowerCase()}{v.feedback ? ` · ${v.feedback}` : ''}</p>}
              </div>
              {badge(v.status)}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {v.status === 'pending' && (
                <>
                  <button onClick={() => api.get(`/visit-reports/${v.id}`).then(setQrFor).catch((e) => toast.error(e.message))} className="rounded-xl bg-indigo-500/20 px-3 py-2 text-xs font-bold text-indigo-100">Mostrar QR / enlace</button>
                  <button onClick={() => cancel(v)} className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-[#c7d4ef]">Anular</button>
                </>
              )}
              {v.status === 'signed' && (
                <>
                  <button onClick={() => setEvidenceFor(v)} className="rounded-xl bg-indigo-500/20 px-3 py-2 text-xs font-bold text-indigo-100">Ver constancia</button>
                  <button onClick={() => setFeedbackFor(v)} className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-[#c7d4ef]">Valorar visita</button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>

      {showNew && <NewVisitModal properties={properties} leads={leads} onClose={() => setShowNew(false)} onCreated={(created) => { setShowNew(false); setQrFor(created); load() }} />}
      {qrFor && <QrModal visit={qrFor} onClose={() => setQrFor(null)} />}
      {evidenceFor && <EvidenceModal visit={evidenceFor} onClose={() => setEvidenceFor(null)} />}
      {feedbackFor && <FeedbackModal visit={feedbackFor} onClose={() => setFeedbackFor(null)} onSaved={() => { setFeedbackFor(null); load() }} />}
    </div>
  )
}

// ── Nuevo encargo ─────────────────────────────────────────────────────────────
function NewAgreementModal({ properties, onClose, onCreated }) {
  const todayIso = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    property_id: '', owner_name: '', owner_phone: '', owner_email: '', agreement_type: 'exclusiva',
    start_date: todayIso, end_date: '', auto_renew: true, notice_days: 15, commission_text: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit() {
    setSaving(true)
    try {
      await api.post('/agreements', { ...form, notice_days: Number(form.notice_days) })
      onCreated()
    } catch (e) {
      toast.error(e.message || 'No se pudo crear el encargo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Nuevo encargo" onClose={onClose} wide>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Inmueble *">
            <select className={inputCls} value={form.property_id} onChange={set('property_id')}>
              <option value="">Elige un inmueble…</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.title}{p.city ? ` · ${p.city}` : ''}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Propietario *"><input className={inputCls} value={form.owner_name} onChange={set('owner_name')} /></Field>
        <Field label="Tipo">
          <select className={inputCls} value={form.agreement_type} onChange={set('agreement_type')}>
            <option value="exclusiva">Exclusiva</option>
            <option value="no_exclusiva">Sin exclusiva</option>
          </select>
        </Field>
        <Field label="Teléfono"><input className={inputCls} value={form.owner_phone} onChange={set('owner_phone')} /></Field>
        <Field label="Correo"><input className={inputCls} value={form.owner_email} onChange={set('owner_email')} /></Field>
        <Field label="Inicio *"><input type="date" className={inputCls} value={form.start_date} onChange={set('start_date')} /></Field>
        <Field label="Fin *"><input type="date" className={inputCls} value={form.end_date} onChange={set('end_date')} /></Field>
        <label className="flex items-center gap-2 text-sm text-[#d7e2f7]"><input type="checkbox" checked={form.auto_renew} onChange={set('auto_renew')} /> Se renueva automáticamente</label>
        {form.auto_renew && (
          <Field label="Días de preaviso para no renovar"><input type="number" min="0" className={inputCls} value={form.notice_days} onChange={set('notice_days')} /></Field>
        )}
        <div className="sm:col-span-2"><Field label="Honorarios pactados"><input className={inputCls} value={form.commission_text} onChange={set('commission_text')} placeholder="Ej.: 3 % + IVA" /></Field></div>
        <div className="sm:col-span-2"><Field label="Notas"><textarea rows={2} className={inputCls} value={form.notes} onChange={set('notes')} /></Field></div>
        <p className="text-xs text-[#7f91b3] sm:col-span-2">Copia aquí las fechas y el preaviso tal y como figuran en el contrato firmado. La app te avisa; la fecha que vale es la del contrato.</p>
        <button onClick={submit} disabled={saving} className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60 sm:col-span-2">{saving ? 'Guardando…' : 'Guardar encargo'}</button>
      </div>
    </Modal>
  )
}

// ── Pestaña: encargos ─────────────────────────────────────────────────────────
function AgreementsTab({ properties }) {
  const [data, setData] = useState({ agreements: [], attention_count: 0 })
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await api.get('/agreements')) }
    catch (e) { toast.error(e.message || 'No se pudieron cargar los encargos') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function renew(a, months) {
    try { await api.post(`/agreements/${a.id}/renew`, { months }); toast.success(`Renovado ${months} meses`); load() }
    catch (e) { toast.error(e.message) }
  }
  async function close(a) {
    if (!window.confirm('¿Marcar este encargo como cerrado (vendido o finalizado)?')) return
    try { await api.patch(`/agreements/${a.id}`, { status: 'cerrado' }); load() } catch (e) { toast.error(e.message) }
  }
  async function remove(a) {
    if (!window.confirm('¿Eliminar este encargo? No se puede deshacer.')) return
    try { await api.delete(`/agreements/${a.id}`); load() } catch (e) { toast.error(e.message) }
  }
  function copyReport(a) {
    navigator.clipboard?.writeText(absolute(`/informe/${a.report_token}`))
    toast.success('Enlace del informe copiado. Pásaselo al propietario.')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {data.attention_count > 0
          ? <p className="flex items-center gap-2 text-sm font-semibold text-amber-200"><AlertTriangle size={16} /> {data.attention_count} encargo{data.attention_count === 1 ? '' : 's'} necesita{data.attention_count === 1 ? '' : 'n'} tu atención</p>
          : <span />}
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-bold text-white"><Plus size={16} /> Nuevo encargo</button>
      </div>

      {loading && <p className="text-[#9fb3d9]">Cargando…</p>}
      {!loading && data.agreements.length === 0 && (
        <div className="rounded-3xl border border-dashed border-[#27283a] p-10 text-center">
          <CalendarClock className="mx-auto mb-3 text-indigo-300" size={32} />
          <p className="font-semibold text-white">Aún no has registrado encargos</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-[#9fb3d9]">Anota cada exclusiva con su fecha de fin y su preaviso. Te avisamos antes de que se renueve sola o se te escape el inmueble.</p>
        </div>
      )}

      <div className="space-y-3">
        {data.agreements.map((a) => (
          <article key={a.id} className="rounded-2xl border border-[#27283a] bg-[#15151d] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-white">{a.property_title}</p>
                <p className="text-sm text-[#9fb3d9]">{a.owner_name} · {a.agreement_type === 'exclusiva' ? 'Exclusiva' : 'Sin exclusiva'}{a.commission_text ? ` · ${a.commission_text}` : ''}</p>
                <p className="mt-1 text-xs text-[#7f91b3]">{fmtDate(a.start_date)} → {fmtDate(a.end_date)}{a.auto_renew ? ` · renovación automática, preaviso ${a.notice_days} días${a.notice_deadline ? ` (hasta el ${fmtDate(a.notice_deadline)})` : ''}` : ' · sin renovación automática'}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ALERT_STYLES[a.alert]}`}>{ALERT_LABELS[a.alert]}</span>
            </div>
            {a.alert_text && <p className={`mt-3 rounded-xl px-3 py-2 text-xs ${ALERT_STYLES[a.alert]}`}>{a.alert_text}</p>}
            {a.status === 'activo' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {[3, 6, 12].map((m) => <button key={m} onClick={() => renew(a, m)} className="inline-flex items-center gap-1 rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-[#c7d4ef]"><RefreshCw size={12} /> +{m} meses</button>)}
                <button onClick={() => copyReport(a)} className="inline-flex items-center gap-1 rounded-xl bg-indigo-500/20 px-3 py-2 text-xs font-bold text-indigo-100"><Copy size={12} /> Enlace del informe al propietario</button>
                <a href={`/informe/${a.report_token}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-[#c7d4ef]"><ExternalLink size={12} /> Ver informe</a>
                <button onClick={() => close(a)} className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-[#c7d4ef]">Cerrar</button>
                <button onClick={() => remove(a)} className="inline-flex items-center rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200"><Trash2 size={12} /></button>
              </div>
            )}
          </article>
        ))}
      </div>

      {showNew && <NewAgreementModal properties={properties} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load() }} />}
    </div>
  )
}

export default function ComisionPage() {
  const [tab, setTab] = useState('visitas')
  const [properties, setProperties] = useState([])
  const [leads, setLeads] = useState([])

  useEffect(() => {
    api.get('/properties', { page_size: 100 }).then((r) => setProperties(r.properties || [])).catch(() => {})
    api.get('/leads').then((r) => setLeads(Array.isArray(r) ? r : (r.leads || []))).catch(() => {})
  }, [])

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><ShieldCheck className="text-indigo-300" /> Protege tu comisión</h1>
        <p className="mt-1 text-sm text-[#9fb3d9]">Prueba de cada visita y control de tus exclusivas, para que ninguna comisión se pierda por falta de papeles.</p>
      </header>

      <div className="flex gap-2 border-b border-[#27283a] pb-3">
        {[['visitas', 'Partes de visita'], ['encargos', 'Encargos y exclusivas']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === id ? 'bg-indigo-500 text-white' : 'bg-white/5 text-[#c7d4ef]'}`}>{label}</button>
        ))}
      </div>

      {tab === 'visitas' ? <VisitsTab properties={properties} leads={leads} /> : <AgreementsTab properties={properties} />}

      <p className="text-xs leading-relaxed text-[#7f91b3]">
        Esta herramienta organiza y conserva pruebas, pero no sustituye al contrato ni al asesoramiento de un abogado. El texto que firma el visitante se puede personalizar en Ajustes de la agencia.
      </p>
    </div>
  )
}
