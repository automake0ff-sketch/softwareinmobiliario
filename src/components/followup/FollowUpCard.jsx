import { useState } from 'react'
import { Phone, MessageCircle, NotebookPen, Clock, Check, Building2, AlarmClock, ChevronDown, Lightbulb, Flag } from 'lucide-react'
import { fmtDue, GOALS, WHEN_CHIPS, ALERT_STYLE, PropertyThumb, clientTypeLabel, fmtDateTime } from './shared'

const STATUS_STYLE = {
  nuevo: 'bg-sky-500/15 text-sky-300', contactado: 'bg-violet-500/15 text-violet-300', interesado: 'bg-indigo-500/15 text-indigo-300',
  visita_agendada: 'bg-[#F59E0B]/15 text-[#FCD34D]', negociacion: 'bg-orange-500/15 text-orange-300', reserva: 'bg-emerald-500/15 text-emerald-300',
}

// Tarjeta de la agenda. Separa HECHOS (datos registrados) de RECOMENDACIÓN (sugerencia del sistema).
export default function FollowUpCard({ item, onMessage, onLog, onSnooze, onDone, onSchedule, onOpenLead }) {
  const [menu, setMenu] = useState(null) // 'snooze' | 'schedule' | null
  const { lead } = item
  const isFollowup = !!item.followup_id
  const alert = ALERT_STYLE[item.alert_class]
  const border = alert?.border || 'border-[#1E1E2E]'
  const canWhatsApp = lead.has_whatsapp && !lead.whatsapp_opt_out
  const facts = item.facts?.length ? item.facts : item.reasons || []
  const when = isFollowup ? `Para ${fmtDue(item.due_at)}` : item.visit_at ? `Visita: ${fmtDateTime(item.visit_at)}` : 'Sin próxima acción'

  return (
    <article className={`min-w-0 rounded-2xl border ${border} bg-[#13131A] p-4`}>
      <div className="flex gap-3">
        <PropertyThumb property={item.property} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button type="button" onClick={() => onOpenLead?.(lead)} className="truncate text-sm font-semibold text-[#F1F5F9] hover:underline">{lead.name}</button>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[lead.status] || 'bg-[#64748B]/15 text-[#CBD5E1]'}`}>{lead.status_label}</span>
            {lead.priority === 'alta' && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#FCA5A5]"><Flag size={11} />Alta</span>}
            {lead.client_type && <span className="text-[11px] text-[#64748B]">· {clientTypeLabel(lead.client_type)}</span>}
          </div>
          {item.property?.title
            ? <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-[#94A3B8]"><Building2 size={13} className="shrink-0" /><span className="truncate">{item.property.title}</span></p>
            : <p className="mt-1 text-xs text-[#475569]">Sin inmueble asociado</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {alert && <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${alert.badge}`}>{alert.label}</span>}
            <span className="text-[11px] text-[#64748B]">{when}</span>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">Hechos</p>
        <ul className="space-y-0.5">{facts.slice(0, 5).map((f) => <li key={f} className="text-xs text-[#CBD5E1]">• {f}</li>)}</ul>
      </div>
      {item.recommendation?.text && (
        <div className="mt-3 flex gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3 py-2">
          <Lightbulb size={14} className="mt-0.5 shrink-0 text-indigo-300" />
          <p className="text-xs text-indigo-100"><span className="font-semibold">Recomendación:</span> {item.recommendation.text}</p>
        </div>
      )}
      {item.note && <p className="mt-2 rounded-lg bg-[#0D0D14] px-3 py-2 text-xs text-[#94A3B8]">“{item.note}”</p>}
      {item.last_interaction?.description && <p className="mt-2 truncate text-xs italic text-[#64748B]">Última nota: {item.last_interaction.description}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <button onClick={() => onMessage(item)} className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-white ${canWhatsApp ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-indigo-500 hover:bg-indigo-400'}`}><MessageCircle size={14} />Mensaje</button>
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
        ) : item.kind !== 'visit_unconfirmed' && (
          <div className="relative ml-auto">
            <button onClick={() => setMenu(menu === 'schedule' ? null : 'schedule')} className="inline-flex items-center gap-1.5 rounded-xl border border-[#F59E0B]/40 px-2.5 py-2 text-xs text-[#FCD34D] hover:bg-[#F59E0B]/10"><AlarmClock size={14} />Programar<ChevronDown size={12} /></button>
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
