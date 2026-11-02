import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Check, MessageCircle, NotebookPen } from 'lucide-react'
import api from '../../lib/api'
import { PropertyThumb, fmtDateTime, fmtDue, GOALS } from './shared'

const Empty = ({ children }) => <p className="rounded-2xl border border-[#1E1E2E] bg-[#13131A] px-6 py-12 text-center text-sm text-[#64748B]">{children}</p>

function Row({ item, actions }) {
  return (
    <article className="flex min-w-0 items-center gap-3 rounded-2xl border border-[#1E1E2E] bg-[#13131A] p-3">
      <PropertyThumb property={item.property} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[#F1F5F9]">{item.lead.name} <span className="font-normal text-[#64748B]">· {item.lead.status_label}</span></p>
        <p className="truncate text-xs text-[#94A3B8]">{item.property?.title || 'Sin inmueble'}{item.goal ? ` · ${GOALS[item.goal] || ''}` : ''}</p>
        <p className="text-[11px] text-[#64748B]">{item.status === 'done' ? `Completado ${fmtDue(item.completed_at)}` : `Para ${fmtDateTime(item.due_at)}`}{item.assigned_name ? ` · ${item.assigned_name}` : ''}</p>
      </div>
      <div className="flex shrink-0 gap-1.5">{actions}</div>
    </article>
  )
}

const iconBtn = 'inline-flex items-center justify-center rounded-lg border border-[#2A2A3C] p-2 text-[#E2E8F0] hover:bg-[#1A1A24]'

// Próximos seguimientos y completados
export function AgendaList({ view, mine, reloadKey, onMessage, onLog, onDone }) {
  const [items, setItems] = useState(null)
  useEffect(() => { let alive = true; setItems(null); api.get('/followup/agenda', { view, ...(mine ? { mine: 1 } : {}) }).then((r) => alive && setItems(r.items)).catch(() => alive && setItems([])); return () => { alive = false } }, [view, mine, reloadKey])
  if (!items) return <p className="py-10 text-center text-sm text-[#64748B]">Cargando…</p>
  if (items.length === 0) return <Empty>{view === 'upcoming' ? 'No hay seguimientos programados más adelante.' : 'Aún no has completado ningún seguimiento en los últimos 60 días.'}</Empty>
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      {items.map((i) => (
        <Row key={i.followup_id} item={i} actions={view === 'upcoming' ? (
          <>
            <button aria-label="Mensaje" onClick={() => onMessage(i)} className={iconBtn}><MessageCircle size={15} /></button>
            <button aria-label="Registrar" onClick={() => onLog(i)} className={iconBtn}><NotebookPen size={15} /></button>
            <button aria-label="Hecho" onClick={() => onDone(i)} className={`${iconBtn} border-emerald-500/40 text-emerald-300`}><Check size={15} /></button>
          </>
        ) : null} />
      ))}
    </div>
  )
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const pad = (n) => String(n).padStart(2, '0')

export function CalendarView({ reloadKey, onMessage, onLog }) {
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [days, setDays] = useState({})
  const [sel, setSel] = useState(null)
  const [dayData, setDayData] = useState(null)
  const month = `${ym.y}-${pad(ym.m + 1)}`

  useEffect(() => { let alive = true; api.get('/followup/calendar', { month }).then((r) => alive && setDays(r.days)).catch(() => {}); return () => { alive = false } }, [month, reloadKey])
  useEffect(() => { if (!sel) { setDayData(null); return } let alive = true; api.get('/followup/agenda', { view: 'day', date: sel }).then((r) => alive && setDayData(r)).catch(() => {}); return () => { alive = false } }, [sel, reloadKey])

  const first = new Date(ym.y, ym.m, 1)
  const lead = (first.getDay() + 6) % 7 // lunes = 0
  const total = new Date(ym.y, ym.m + 1, 0).getDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const go = (delta) => { const d = new Date(ym.y, ym.m + delta, 1); setYm({ y: d.getFullYear(), m: d.getMonth() }); setSel(null) }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#1E1E2E] bg-[#13131A] p-4">
        <div className="mb-3 flex items-center justify-between">
          <button aria-label="Mes anterior" onClick={() => go(-1)} className={iconBtn}><ChevronLeft size={16} /></button>
          <h3 className="text-sm font-semibold capitalize text-[#F1F5F9]">{MONTHS[ym.m]} {ym.y}</h3>
          <button aria-label="Mes siguiente" onClick={() => go(1)} className={iconBtn}><ChevronRight size={16} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-[#64748B]">{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => <span key={d}>{d}</span>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((n, i) => {
            if (!n) return <span key={`e${i}`} />
            const key = `${month}-${pad(n)}`; const c = days[key]
            return (
              <button key={key} onClick={() => setSel(key)} aria-label={`Día ${n}`}
                className={`flex min-h-[3.25rem] flex-col items-center rounded-lg border p-1 text-xs transition ${sel === key ? 'border-indigo-500 bg-indigo-500/15' : key === todayKey ? 'border-indigo-500/40' : 'border-[#1E1E2E] hover:bg-[#1A1A24]'} text-[#E2E8F0]`}>
                <span>{n}</span>
                <span className="mt-1 flex gap-1">
                  {c?.pending > 0 && <span className="rounded bg-indigo-500/30 px-1 text-[10px] text-indigo-100">{c.pending}</span>}
                  {c?.visits > 0 && <span className="rounded bg-[#F59E0B]/30 px-1 text-[10px] text-[#FDE68A]">{c.visits}v</span>}
                  {c?.done > 0 && <span className="rounded bg-emerald-500/25 px-1 text-[10px] text-emerald-200">{c.done}✓</span>}
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-[11px] text-[#64748B]">Morado: seguimientos pendientes · naranja «v»: visitas · verde ✓: completados</p>
      </div>
      {sel && dayData && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[#F1F5F9]">{new Date(`${sel}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          {dayData.items.length === 0 && dayData.visits.length === 0 && <Empty>Nada programado este día.</Empty>}
          {dayData.visits.map((v) => <div key={v.id} className="rounded-xl border border-[#F59E0B]/30 bg-[#13131A] px-3 py-2 text-sm text-[#E2E8F0]">Visita · {new Date(v.starts_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · {v.name}{v.property_title ? ` · ${v.property_title}` : ''}</div>)}
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {dayData.items.map((i) => <Row key={i.followup_id} item={i} actions={i.status === 'pending' ? (<><button aria-label="Mensaje" onClick={() => onMessage(i)} className={iconBtn}><MessageCircle size={15} /></button><button aria-label="Registrar" onClick={() => onLog(i)} className={iconBtn}><NotebookPen size={15} /></button></>) : null} />)}
          </div>
        </div>
      )}
    </div>
  )
}

export function AgentsView({ reloadKey }) {
  const [agents, setAgents] = useState(null)
  useEffect(() => { let alive = true; api.get('/followup/agenda', { view: 'agents' }).then((r) => alive && setAgents(r.agents)).catch(() => alive && setAgents([])); return () => { alive = false } }, [reloadKey])
  if (!agents) return <p className="py-10 text-center text-sm text-[#64748B]">Cargando…</p>
  if (agents.length === 0) return <Empty>Ningún agente tiene seguimientos pendientes.</Empty>
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#1E1E2E] bg-[#13131A]">
      <table className="w-full min-w-[460px] text-sm">
        <thead><tr className="border-b border-[#1E1E2E] text-left text-xs text-[#64748B]"><th className="px-4 py-3 font-medium">Agente</th><th className="px-3 py-3 text-right font-medium">Vencidos</th><th className="px-3 py-3 text-right font-medium">Hoy</th><th className="px-3 py-3 text-right font-medium">Próximos</th><th className="px-4 py-3 text-right font-medium">Contactos abiertos</th></tr></thead>
        <tbody>{agents.map((a) => (
          <tr key={a.user_id || 'none'} className="border-b border-[#1E1E2E] last:border-0 text-[#E2E8F0]">
            <td className="px-4 py-3">{a.name}</td>
            <td className={`px-3 py-3 text-right ${a.overdue ? 'font-semibold text-[#FCA5A5]' : ''}`}>{a.overdue}</td>
            <td className="px-3 py-3 text-right">{a.today}</td><td className="px-3 py-3 text-right">{a.upcoming}</td><td className="px-4 py-3 text-right">{a.open_contacts}</td>
          </tr>))}</tbody>
      </table>
    </div>
  )
}
