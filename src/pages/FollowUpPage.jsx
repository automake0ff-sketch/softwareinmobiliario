import { useCallback, useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { BellRing, Plus, FileText, PartyPopper, AlertOctagon, CalendarCheck, Ghost, SlidersHorizontal, Search, CalendarClock, MapPin } from 'lucide-react'
import api from '../lib/api'
import FollowUpCard from '../components/followup/FollowUpCard'
import LogContactModal from '../components/followup/LogContactModal'
import MessageDrawer from '../components/followup/MessageDrawer'
import SummaryModal from '../components/followup/SummaryModal'
import NewFollowUpModal from '../components/followup/NewFollowUpModal'
import SettingsModal from '../components/followup/SettingsModal'
import LeadPanel from '../components/followup/LeadPanel'
import LeadPicker from '../components/followup/LeadPicker'
import { AgendaList, CalendarView, AgentsView } from '../components/followup/AgendaViews'
import { Chip, Modal, ALERT_ORDER, ALERT_STYLE } from '../components/followup/shared'

const TABS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'riesgo', label: 'En riesgo' },
  { id: 'proximos', label: 'Próximos' },
  { id: 'completados', label: 'Completados' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'equipo', label: 'Equipo' },
]

function Section({ icon: Icon, title, hint, count, color = 'text-indigo-300', children }) {
  if (!count) return null
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

function Kpi({ label, value, tone, onClick }) {
  const color = tone === 'danger' ? 'text-[#FCA5A5]' : tone === 'warn' ? 'text-[#FCD34D]' : 'text-[#F1F5F9]'
  const border = tone === 'danger' && value > 0 ? 'border-[#EF4444]/30' : tone === 'warn' && value > 0 ? 'border-[#F59E0B]/30' : 'border-[#1E1E2E]'
  return (
    <button type="button" onClick={onClick} className={`rounded-2xl border ${border} bg-[#13131A] px-4 py-3 text-left transition hover:bg-[#1A1A24]`}>
      <p className={`text-2xl font-bold ${value > 0 ? color : 'text-[#475569]'}`}>{value}</p>
      <p className="mt-0.5 text-xs text-[#94A3B8]">{label}</p>
    </button>
  )
}

export default function FollowUpPage() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mine, setMine] = useState(false)
  const [tab, setTab] = useState('hoy')
  const [reloadKey, setReloadKey] = useState(0)
  const [modal, setModal] = useState(null) // { type, item?, channel?, leadId? }
  const [digest, setDigest] = useState(null) // { enabled, delivery_configured }

  const load = useCallback(async (fresh = false) => {
    try { setData(await api.get('/followup/today', { ...(mine ? { mine: 1 } : {}), ...(fresh ? { fresh: 1 } : {}) })) }
    catch { /* api.js muestra el error */ } finally { setLoading(false) }
  }, [mine])

  useEffect(() => { load() }, [load])
  useEffect(() => { api.get('/followup/digest').then(setDigest).catch(() => {}) }, [])

  const refresh = () => { load(true); setReloadKey((k) => k + 1) }

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
  const done = () => { close(); refresh() }

  const snooze = async (item, days) => { try { await api.patch(`/followup/followups/${item.followup_id}`, { action: 'snooze', days }); toast.success('Pospuesto'); refresh() } catch {} }
  const markDone = async (item) => { try { await api.patch(`/followup/followups/${item.followup_id}`, { action: 'done' }); toast.success('Marcado como hecho'); refresh() } catch {} }
  const schedule = async (item, days) => {
    try { await api.post('/followup/followups', { lead_id: item.lead.id, in_days: days, channel: item.channel, goal: item.goal, property_id: item.property?.id }); toast.success('Seguimiento programado'); refresh() } catch {}
  }

  const s = data?.summary
  const k = data?.kpis
  const cardProps = {
    onMessage: (item) => setModal({ type: 'message', item }),
    onLog: (item, channel) => setModal({ type: 'log', item, channel }),
    onSnooze: snooze, onDone: markDone, onSchedule: schedule,
    onOpenLead: (lead) => setModal({ type: 'lead', leadId: lead.id }),
  }
  const everything = data ? [...data.overdue, ...data.today, ...data.visits_no_followup, ...data.visits_unconfirmed, ...data.abandoned] : []
  const allClear = data && s.attention_total === 0 && data.visits_unconfirmed.length === 0
  const card = (i) => <FollowUpCard key={i.followup_id || i.appointment_id || i.lead.id} item={i} {...cardProps} />

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-[#F1F5F9]"><BellRing size={22} className="text-indigo-400" />Tu agenda comercial de hoy</h1>
          <p className="mt-1 text-sm text-[#94A3B8]">A quién atender primero y por qué, ordenado por urgencia.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setModal({ type: 'search' })} className="inline-flex items-center gap-2 rounded-xl border border-[#2A2A3C] px-3.5 py-2.5 text-sm text-[#E2E8F0] hover:bg-[#1A1A24]"><Search size={16} />Buscar cliente</button>
          <button onClick={() => setModal({ type: 'summary' })} className="inline-flex items-center gap-2 rounded-xl border border-[#2A2A3C] px-3.5 py-2.5 text-sm text-[#E2E8F0] hover:bg-[#1A1A24]"><FileText size={16} />Resumir conversación</button>
          <button onClick={() => setModal({ type: 'new' })} className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400"><Plus size={16} />Programar</button>
        </div>
      </header>

      {k && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Seguimientos vencidos" value={k.overdue} tone="danger" onClick={() => setTab('hoy')} />
            <Kpi label="Para hoy" value={k.today} onClick={() => setTab('hoy')} />
            <Kpi label="Visitas sin seguimiento" value={k.visits_no_followup} tone="danger" onClick={() => setTab('riesgo')} />
            <Kpi label="Sin próxima acción" value={s.abandoned} tone="warn" onClick={() => setTab('riesgo')} />
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#94A3B8]" aria-label="Resumen de contactos">
            <li><b className="text-[#E2E8F0]">{k.active_contacts}</b> contactos activos</li>
            <li><b className="text-[#E2E8F0]">{k.new_week}</b> nuevos (7 días)</li>
            <li><b className="text-[#E2E8F0]">{k.to_contact}</b> sin contactar aún</li>
            <li><b className="text-[#E2E8F0]">{k.inactive}</b> inactivos</li>
            <li><b className="text-[#E2E8F0]">{k.visits_pending}</b> visitas próximas</li>
            <li><b className="text-[#E2E8F0]">{k.priority_opportunities}</b> de atención inmediata</li>
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-[#1E1E2E] pb-3">
        <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="tablist" aria-label="Vistas de la agenda">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition ${tab === t.id ? 'bg-indigo-500/15 text-indigo-100' : 'text-[#94A3B8] hover:bg-[#1A1A24]'}`}>
              {t.label}{t.id === 'riesgo' && data?.alert_counts?.inmediata > 0 && <span className="ml-1.5 rounded-full bg-[#EF4444]/25 px-1.5 text-[11px] text-[#FCA5A5]">{data.alert_counts.inmediata}</span>}
            </button>
          ))}
        </nav>
        <div className="flex flex-wrap gap-2">
          <Chip active={false} onClick={() => setModal({ type: 'settings' })}><SlidersHorizontal size={12} className="mr-1 inline" />Reglas</Chip>
          {digest?.delivery_configured && <Chip active={digest.enabled} onClick={toggleDigest}>Resumen diario por email</Chip>}
          <Chip active={mine} onClick={() => setMine(!mine)}>Solo mis contactos</Chip>
        </div>
      </div>

      {loading && <p className="py-16 text-center text-sm text-[#64748B]">Cargando…</p>}

      {data && tab === 'hoy' && (
        <div className="space-y-8">
          <Section icon={AlertOctagon} color="text-[#FCA5A5]" title="Vencidos" hint="Debían atenderse antes de hoy." count={data.overdue.length}>{data.overdue.map(card)}</Section>
          <Section icon={CalendarCheck} title="Para hoy" count={data.today.length}>{data.today.map(card)}</Section>
          <Section icon={MapPin} color="text-[#FCA5A5]" title="Visitas sin seguimiento" hint="Se realizaron y no consta ningún contacto posterior." count={data.visits_no_followup.length}>{data.visits_no_followup.map(card)}</Section>
          <Section icon={CalendarClock} color="text-[#FCD34D]" title="Visitas por confirmar" hint="En las próximas 48 horas y el cliente aún no ha confirmado." count={data.visits_unconfirmed.length}>{data.visits_unconfirmed.map(card)}</Section>
          <Section icon={Ghost} color="text-[#FCD34D]" title="Oportunidades sin próxima acción" hint="Contactos abiertos sin ningún paso programado. Programa uno para que no se enfríen." count={data.abandoned.length}>{data.abandoned.map(card)}</Section>
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
        </div>
      )}

      {data && tab === 'riesgo' && (
        <div className="space-y-8">
          {ALERT_ORDER.map((cls) => {
            const items = everything.filter((i) => i.alert_class === cls).sort((a, b) => b.priority - a.priority)
            return <Section key={cls} icon={AlertOctagon} color={ALERT_STYLE[cls].title} title={ALERT_STYLE[cls].label} hint={ALERT_STYLE[cls].help} count={items.length}>{items.map(card)}</Section>
          })}
          {everything.length === 0 && <p className="rounded-2xl border border-[#1E1E2E] bg-[#13131A] px-6 py-12 text-center text-sm text-[#64748B]">No hay oportunidades en riesgo según tus reglas.</p>}
          <p className="text-center text-xs text-[#64748B]">La clasificación usa reglas objetivas (fechas, estados y visitas), no suposiciones sobre el interés del cliente.</p>
        </div>
      )}

      {tab === 'proximos' && <AgendaList view="upcoming" mine={mine} reloadKey={reloadKey} onMessage={cardProps.onMessage} onLog={cardProps.onLog} onDone={markDone} />}
      {tab === 'completados' && <AgendaList view="completed" mine={mine} reloadKey={reloadKey} />}
      {tab === 'calendario' && <CalendarView reloadKey={reloadKey} onMessage={cardProps.onMessage} onLog={cardProps.onLog} />}
      {tab === 'equipo' && <AgentsView reloadKey={reloadKey} />}

      {modal?.type === 'message' && <MessageDrawer item={modal.item} onClose={close} onSent={(channel) => setModal({ type: 'log', item: modal.item, channel })} />}
      {modal?.type === 'log' && <LogContactModal item={modal.item} defaultChannel={modal.channel || 'whatsapp'} onClose={close} onDone={done} />}
      {modal?.type === 'summary' && <SummaryModal aiAvailable={!!data?.ai_available} onClose={() => { close(); refresh() }} onDone={refresh} />}
      {modal?.type === 'new' && <NewFollowUpModal initialLead={modal.lead ? { id: modal.lead.id, name: modal.lead.name } : null} onClose={close} onDone={done} />}
      {modal?.type === 'settings' && <SettingsModal onClose={close} onSaved={refresh} />}
      {modal?.type === 'search' && (
        <Modal title="Buscar cliente" onClose={close}>
          <LeadPicker value={null} autoFocus onChange={(l) => l && setModal({ type: 'lead', leadId: l.id })} />
        </Modal>
      )}
      {modal?.type === 'lead' && (
        <LeadPanel leadId={modal.leadId} onClose={close}
          onMessage={(item) => setModal({ type: 'message', item })} onLog={(item) => setModal({ type: 'log', item })}
          onSchedule={(lead) => setModal({ type: 'new', lead })} />
      )}
    </div>
  )
}
