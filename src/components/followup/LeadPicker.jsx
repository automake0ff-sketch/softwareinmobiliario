import { useEffect, useState } from 'react'
import { Search, Check } from 'lucide-react'
import api from '../../lib/api'

// Buscador mínimo de contactos (nombre, teléfono o email)
export default function LeadPicker({ value, onChange, autoFocus }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])

  useEffect(() => {
    if (value) return
    let alive = true
    const t = setTimeout(() => {
      api.get('/followup/leads/search', { q }).then((r) => alive && setResults(r || [])).catch(() => {})
    }, 220)
    return () => { alive = false; clearTimeout(t) }
  }, [q, value])

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 py-2.5 text-sm text-indigo-100">
        <span className="flex items-center gap-2"><Check size={16} /> {value.name}</span>
        <button type="button" onClick={() => onChange(null)} className="text-xs text-indigo-300 underline">Cambiar</button>
      </div>
    )
  }
  return (
    <div>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
        <input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca por nombre, teléfono o email"
          className="w-full rounded-xl border border-[#2A2A3C] bg-[#0D0D14] py-2.5 pl-9 pr-3 text-sm text-[#F1F5F9] placeholder:text-[#64748B] focus:border-indigo-500 focus:outline-none" />
      </div>
      <ul className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-[#1E1E2E]">
        {results.length === 0 && <li className="px-3 py-3 text-xs text-[#64748B]">Sin resultados. Añade contactos en la sección Leads.</li>}
        {results.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onChange(r)} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-[#E2E8F0] hover:bg-[#1A1A24]">
              <span className="truncate">{r.name}</span><span className="ml-3 shrink-0 text-xs text-[#64748B]">{r.phone || ''}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
