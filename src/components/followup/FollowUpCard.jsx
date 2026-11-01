import { useState } from 'react'
import { Phone, MessageCircle, NotebookPen, Clock, Check, Building2, AlarmClock, ChevronDown } from 'lucide-react'
import { fmtAgo, fmtDue, GOALS, WHEN_CHIPS } from './shared'

const STATUS_STYLE = {
  nuevo: 'bg-sky-500/15 text-sky-300', contactado: 'bg-violet-500/15 text-violet-300', interesado: 'bg-indigo-500/15 text-indigo-300',
  visita_agendada: 'bg-[#F59E0B]/15 text-[#FCD34D]', negociacion: 'bg-orange-500/15 text-orange-300', reserva: 'bg-emerald-500/15 text-emerald-300',
}

export default function FollowUpCard({ item, tone = 'default', onMessage, onLog, onSnooze, onDone, onSchedule }) {
  const [menu, setMenu] = useState(null) // 'snooze' | 'schedule' | null
  const { lead } = item
  const isFollowup = item.kind === 'followup'
  const border = tone === 'danger' ? 'border-[#EF4444]/30' : tone === 'warn' ? 'border-[#F59E0B]/25' : 'border-[#1E1E2E]'
  const canWhatsApp = lead.has_whatsapp && !lead.whatsapp_opt_out

  return (
    <article className={`min-w-0 rounded-2xl border ${border} bg-[#13131A] p-4`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-[#F1F5F9]">{lead.name}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[lead.status] || 'bg-[#64748B]/15 text-[#CBD5E1]'}`}>{lead.status_label}</span>
            {item.goal && <span className="text-[11px] text-[#64748B]">· {GOALS[item.goal]}</span>}
          </div>
          {item.property?.title && <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-[#94A3B8]"><Building2 size={13} />{item.property.title}</p>}
        </div>
        <div className="sm:shrink-0 sm:text-right">
          <p className="text-[11px] text-[#64748B]">{isFollowup ? `Para ${fmtDue(item.due_at)}` : 'Sin próximo paso'}</p>
          <p className="text-[11px] text-[#64748B]">Último contacto: {fmtAgo(item.days_since_contact)}</p>
        </div>
      </div>

      <ul className="mt-3 space-y-1">
        {item.reasons.slice(0, 3).map((r) => <li key={r} className="text-xs text-[#CBD5E1]">• {r}</li>)}
      </ul>
      {item.note && <p className="mt-2 rounded-lg bg-[#0D0D14] px-3 py-2 text-xs text-[#94A3B8]">“{item.note}”</p>}
      {item.last_interaction?.description && <p className="mt-2 truncate text-xs italic text-[#64748B]">Última nota: {item.last_interaction.description}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {canWhatsApp
          ? <button onClick={() => onMessage(item)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-400"><MessageCircle size={14} />Mensaje</button>
          : <button onClick={() => onMessage(item)} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-400"><MessageCircle size={14} />Mensaje</button>}
        {lead.phone && <a href={`tel:${lead.phone}`} onClick={() => setTimeout(() => onLog(item, 'call'), 500)} className="inline-flex items-center gap-1.5 rounded-xl border border-[#2A2A3C] px-2.5 py-2 text-xs text-[#E2E8F0] hover:bg-[#1A1A24]"><Phone size={14} />Llamar</a>}
        <button onClick={() => onLog(item)} className="inline-flex items-center gap-1.5 rounded-xl border border-[#2A2A3C] px-2.5 py-2 text-xs text-[#E2E8F0] hover:bg-[#1A1A24]"><NotebookPen size={14} />Registrar</button>

        {isFollowup ? (
          <>
            <div className="relative">
              <button onClick={() => setMenu(menu === 'snooze' ? null : 'snooze')} className="inline-flex items-center gap-1 rounded-xl border border-[#2A2A3C] px-2.5 py-2 text-xs text-[#E2E8F0] hover:bg-[#1A1A24]"><Clock size={14} />Posponer<ChevronDown size={12} /></button>
              {menu === 'snooze' && (
                <div className="absolute left-0 z-20 mt-1 w-40 rounded-xl border border-[#2A2A3C] bg-[#13131A] p-1 shadow-xl">
                  {WHEN_CHIPS.slice(0, 3).map((w) => <button key={w.days} onClick={() => { setMenu(null); onSnooze(item, w.days) }} className="block w-full rounded-lg px-3 py-2 text-left text-xs text-[#E2E8F0] hover:bg-[#1A1A24]">{w.label}</button>)}
                </div>
              )}
            </div>
            <button onClick={() => onDone(item)} className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 px-2.5 py-2 text-xs text-emerald-300 hover:bg-emerald-500/10"><Check size={14} />Hecho</button>
          </>
        ) : (
          <div className="relative ml-auto">
            <button onClick={() => setMenu(menu === 'schedule' ? null : 'schedule')} className="inline-flex items-center gap-1.5 rounded-xl border border-[#F59E0B]/40 px-2.5 py-2 text-xs text-[#FDE68A] hover:bg-[#F59E0B]/10"><AlarmClock size={14} />Programar<ChevronDown size={12} /></button>
            {menu === 'schedule' && (
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-[#2A2A3C] bg-[#13131A] p-1 shadow-xl">
                {[{ days: 0, label: 'Hoy' }, ...WHEN_CHIPS.slice(0, 3)].map((w) => <button key={w.days} onClick={() => { setMenu(null); onSchedule(item, w.days) }} className="block w-full rounded-lg px-3 py-2 text-left text-xs text-[#E2E8F0] hover:bg-[#1A1A24]">{w.label}</button>)}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
