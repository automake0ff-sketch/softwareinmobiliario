import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Eye, Home, Printer, Users } from 'lucide-react'

const fmtDate = (d) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
const fmtPrice = (n, op) => `${new Intl.NumberFormat('es-ES').format(Math.round(Number(n || 0)))} €${op === 'rent' ? '/mes' : ''}`
const LEVELS = { alto: ['Interés alto', 'bg-emerald-500/15 text-emerald-200'], medio: ['Interés medio', 'bg-amber-500/15 text-amber-200'], bajo: ['Interés bajo', 'bg-slate-500/20 text-slate-300'] }

function Kpi({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-[#27283a] bg-[#15151d] p-4">
      <Icon size={16} className="mb-2 text-indigo-300" />
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-[#9fb3d9]">{label}</p>
    </div>
  )
}

export default function OwnerReportPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/public/owner-report/${token}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Este enlace no es válido.')
        setData(json)
      })
      .catch((e) => setError(e.message))
  }, [token])

  if (error) return <div className="min-h-screen bg-[#0b0b10] p-6 text-center text-rose-200">{error}</div>
  if (!data) return <div className="min-h-screen bg-[#0b0b10] p-6 text-center text-[#9fb3d9]">Cargando informe…</div>

  const { agency, property, agreement, totals, visits } = data

  return (
    <div className="min-h-screen bg-[#0b0b10] px-4 py-8 text-white print:bg-white print:text-black">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            {agency.logo_url
              ? <img src={agency.logo_url} alt={agency.name} className="mb-2 h-10 object-contain" />
              : <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-200"><Home size={18} /></div>}
            <h1 className="text-xl font-bold">Informe de seguimiento</h1>
            <p className="text-sm text-[#9fb3d9]">{agency.name}{agency.phone ? ` · ${agency.phone}` : ''}{agency.email ? ` · ${agency.email}` : ''}</p>
          </div>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white print:hidden">
            <Printer size={14} /> Imprimir
          </button>
        </header>

        <section className="rounded-2xl border border-[#27283a] bg-[#15151d] p-5">
          <p className="text-lg font-bold">{property.title}</p>
          <p className="text-sm text-[#9fb3d9]">{[property.zone, property.city].filter(Boolean).join(', ')}{property.reference ? ` · Ref. ${property.reference}` : ''}</p>
          <p className="mt-2 text-xl font-bold text-indigo-200">{fmtPrice(property.price, property.operation)}</p>
          <p className="mt-3 text-xs text-[#9fb3d9]">
            Encargo {agreement.type === 'exclusiva' ? 'en exclusiva' : 'sin exclusiva'} desde el {fmtDate(agreement.start_date)} hasta el {fmtDate(agreement.end_date)}.
          </p>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <Kpi icon={Eye} label="Visitas realizadas" value={totals.visits} />
          <Kpi icon={Users} label="Personas interesadas" value={totals.interested} />
        </section>

        {totals.visits > 0 && (
          <p className="text-xs text-[#9fb3d9]">
            Interés tras la visita: {totals.interest_high} alto · {totals.interest_medium} medio · {totals.interest_low} bajo
          </p>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-bold">Detalle de las visitas</h2>
          {visits.length === 0 && <p className="text-sm text-[#9fb3d9]">Todavía no se han registrado visitas con parte firmado.</p>}
          {visits.map((v) => (
            <article key={v.label + v.date} className="rounded-2xl border border-[#27283a] bg-[#15151d] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{v.label} · {fmtDate(v.date)}</p>
                {v.interest_level && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${LEVELS[v.interest_level][1]}`}>{LEVELS[v.interest_level][0]}</span>}
              </div>
              {v.feedback && <p className="mt-2 text-sm leading-relaxed text-[#d7e2f7]">{v.feedback}</p>}
            </article>
          ))}
        </section>

        <footer className="text-xs text-[#7f91b3]">
          Informe generado el {fmtDate(data.generated_at)}. Por privacidad no se muestran los datos personales de los visitantes.
        </footer>
      </div>
    </div>
  )
}
