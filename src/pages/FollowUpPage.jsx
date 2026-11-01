import { useCallback, useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { BellRing, Plus, FileText, PartyPopper, AlertOctagon, CalendarCheck, Ghost } from 'lucide-react'
import api from '../lib/api'
import FollowUpCard from '../components/followup/FollowUpCard'
import LogContactModal from '../components/followup/LogContactModal'
import MessageDrawer from '../components/followup/MessageDrawer'
import SummaryModal from '../components/followup/SummaryModal'
import NewFollowUpModal from '../components/followup/NewFollowUpModal'
import { Chip } from '../components/followup/shared'

function Section({ icon: Icon, title, hint, count, tone, children }) {
  if (!count) return null
  const color = tone === 'danger' ? 'text-[#FCA5A5]' : tone === 'warn' ? 'text-[#FCD34D]' : 'text-indigo-300'
  return (
    <section className="space-y-3">
      <div>
        <h2 className={`flex items-center gap-2 text-sm font-semibold ${color}`}><Icon size={16} />{title} <span className="rounded-full bg-[#1E1E2E] px-2 py-0.5 text-xs text-[#CBD5E1]">{count}</span></h2>
        {hint && <p className="mt-0.5 text-xs text-[#64748B]">{hint}</p>}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{children}</div>
    </section>
  )
}

export default function FollowUpPage() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mine, setMine] = useState(false)
  const [modal, setModal] = useState(null) // { type, item?, channel? }
  const [digest, setDigest] = useState(null) // { enabled, delivery_configured }

  const load = useCallback(async (fresh = false) => {
    try { setData(await api.get('/followup/today', { ...(mine ? { mine: 1 } : {}), ...(fresh ? { fresh: 1 } : {}) })) }
    catch { /* api.js muestra el error */ } finally { setLoading(false) }
  }, [mine])

  useEffect(() => { load() }, [load])
  useEffect(() => { api.get('/followup/digest').then(setDigest).catch(() => {}) }, [])

  const toggleDigest = async () => {
    try {
      const r = await api.put('/followup/digest', { enabled: !digest.enabled })
      setDigest({ ...digest, enabled: r.enabled })
      toast.success(r.enabled ? 'Recibirás un resumen cada mañana' : 'Resumen diario desactivado')
    } catch { /* api.js muestra el error */ }
  }

  // /seguimiento?lead=ID abre directamente el mensaje para ese contacto (enlace desde la ficha)
  useEffect(() => {
    const id = params.get('lead')
    if (!id) return
    api.get(`/followup/leads/${id}`).then((r) => {
      const l = r.lead
      setModal({ type: 'message', item: { kind: 'direct', followup_id: null, property: null, goal: null, channel: 'whatsapp', lead: { id: l.id, name: l.name, phone: l.phone, email: l.email, status: l.status, status_label: l.status_label, has_whatsapp: l.has_whatsapp, whatsapp_opt_out: l.whatsapp_opt_out } } })
    }).catch(() => {}).finally(() => { params.delete('lead'); setParams(params, { replace: true }) })
    // eslint-disable-next-line
  }, [])

  const close = () => setModal(null)
  const done = () => { close(); load(true) }

  const snooze = async (item, days) => { try { await api.patch(`/followup/followups/${item.followup_id}`, { action: 'snooze', days }); toast.success('Pospuesto'); load(true) } catch {} }
  const markDone = async (item) => { try { await api.patch(`/followup/followups/${item.followup_id}`, { action: 'done' }); toast.success('Marcado como hecho'); load(true) } catch {} }
  const schedule = async (item, days) => {
    try { await api.post('/followup/followups', { lead_id: item.lead.id, in_days: days, channel: item.channel, goal: item.goal, property_id: item.property?.id }); toast.success('Seguimiento programado'); load(true) } catch {}
  }

  const s = data?.summary
  const cardProps = {
    onMessage: (item) => setModal({ type: 'message', item }),
    onLog: (item, channel) => setModal({ type: 'log', item, channel }),
    onSnooze: snooze, onDone: markDone, onSchedule: schedule,
  }
  const allClear = data && s.attention_total === 0

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-[#F1F5F9]"><BellRing size={22} className="text-indigo-400" />Seguimiento de hoy</h1>
          <p className="mt-1 text-sm text-[#94A3B8]">Los contactos que necesitan atención, ordenados por urgencia.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setModal({ type: 'summary' })} className="inline-flex items-center gap-2 rounded-xl border border-[#2A2A3C] px-3.5 py-2.5 text-sm text-[#E2E8F0] hover:bg-[#1A1A24]"><FileText size={16} />Resumir conversación</button>
          <button onClick={() => setModal({ type: 'new' })} className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400"><Plus size={16} />Programar</button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {s && <>
          <span className="rounded-full border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-1 text-xs text-[#FECACA]">{s.overdue} vencidos</span>
          <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-200">{s.today} para hoy</span>
          <span className="rounded-full border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-1 text-xs text-[#FDE68A]">{s.abandoned} sin seguimiento</span>
          <span className="rounded-full border border-[#2A2A3C] px-3 py-1 text-xs text-[#94A3B8]">{s.upcoming_week} próximos 7 días</span>
        </>}
        <span className="ml-auto flex flex-wrap gap-2">
          {digest?.delivery_configured && <Chip active={digest.enabled} onClick={toggleDigest}>Resumen diario por email</Chip>}
          <Chip active={mine} onClick={() => setMine(!mine)}>Solo mis contactos</Chip>
        </span>
      </div>

      {loading && <p className="py-16 text-center text-sm text-[#64748B]">Cargando…</p>}

      {data && (
        <>
          <Section icon={AlertOctagon} tone="danger" title="Vencidos" hint="Debían atenderse antes de hoy." count={data.overdue.length}>
            {data.overdue.map((i) => <FollowUpCard key={i.followup_id} item={i} tone="danger" {...cardProps} />)}
          </Section>
          <Section icon={CalendarCheck} title="Para hoy" count={data.today.length}>
            {data.today.map((i) => <FollowUpCard key={i.followup_id} item={i} {...cardProps} />)}
          </Section>
          <Section icon={Ghost} tone="warn" title="Oportunidades abandonadas" hint="Contactos abiertos sin ningún próximo paso. Programa uno para que no se enfríen." count={data.abandoned.length}>
            {data.abandoned.map((i) => <FollowUpCard key={i.lead.id} item={i} tone="warn" {...cardProps} />)}
          </Section>
          {(data.abandoned_hidden > 0 || data.truncated) && <p className="text-center text-xs text-[#64748B]">Mostrando los más urgentes. Atiende estos y aparecerán los siguientes.</p>}

          {allClear && (
            <div className="rounded-2xl border border-[#1E1E2E] bg-[#13131A] px-6 py-14 text-center">
              <PartyPopper size={32} className="mx-auto text-emerald-400" />
              <h2 className="mt-3 text-base font-semibold text-[#F1F5F9]">Todo al día</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-[#94A3B8]">No hay contactos pendientes de atender. {s.upcoming_week > 0 ? `Tienes ${s.upcoming_week} seguimientos programados esta semana.` : 'Programa un seguimiento o añade nuevos contactos para empezar.'}</p>
              <div className="mt-5 flex justify-center gap-2">
                <Link to="/leads" className="rounded-xl border border-[#2A2A3C] px-4 py-2 text-sm text-[#E2E8F0] hover:bg-[#1A1A24]">Ver leads</Link>
                <button onClick={() => setModal({ type: 'new' })} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400">Programar seguimiento</button>
              </div>
            </div>
          )}
        </>
      )}

      {modal?.type === 'message' && <MessageDrawer item={modal.item} onClose={close} onSent={(channel) => setModal({ type: 'log', item: modal.item, channel })} />}
      {modal?.type === 'log' && <LogContactModal item={modal.item} defaultChannel={modal.channel || 'whatsapp'} onClose={close} onDone={done} />}
      {modal?.type === 'summary' && <SummaryModal aiAvailable={!!data?.ai_available} onClose={() => { close(); load(true) }} onDone={() => load(true)} />}
      {modal?.type === 'new' && <NewFollowUpModal onClose={close} onDone={done} />}
    </div>
  )
}
