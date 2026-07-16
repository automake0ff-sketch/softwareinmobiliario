import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { Search, Check, Lock, Star, Shield, Zap } from 'lucide-react'
import api from '../lib/api'

const CATEGORIES = [
  { id: 'all', label: 'Todas' },
  { id: 'captacion', label: 'Captación' },
  { id: 'seguimiento', label: 'Seguimiento' },
  { id: 'visitas', label: 'Visitas' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'reportes', label: 'Reportes' },
  { id: 'n8n', label: 'Estilo n8n' },
]

const DIFFICULTY_COLOR = {
  basica: 'text-emerald-400 bg-emerald-400/10',
  intermedia: 'text-amber-400 bg-amber-400/10',
  avanzada: 'text-red-400 bg-red-400/10',
}

const PLAN_COLOR = {
  starter: 'text-slate-300 bg-slate-300/10',
  profesional: 'text-indigo-300 bg-indigo-300/10',
  agencia: 'text-amber-300 bg-amber-300/10',
}

const REQUIRES_ICONS = {
  whatsapp: '💬', email: '📧', slack: '💜',
  telegram: '✈️', notion: '📓', airtable: '🗃️',
  sheets: '📊', webhook: '🔗',
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [installing, setInstalling] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const url = category !== 'all' ? `/templates?category=${category}` : '/templates'
    api.get(url)
      .then(data => { setTemplates(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [category])

  const install = async (templateId) => {
    setInstalling(templateId)
    try {
      const res = await api.post(`/templates/${templateId}/install`)
      toast.success(`"${res.name}" instalada en tu agencia`)
      setTemplates(prev => prev.map(t =>
        t.id === templateId ? { ...t, already_installed: true } : t
      ))
    } catch (err) {
      toast.error(err.message || 'Error al instalar')
    } finally {
      setInstalling(null)
    }
  }

  const filtered = templates.filter(t =>
    !search || t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.description?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium text-white">Plantillas de automatización</h1>
        <p className="text-white/40 text-sm mt-1">
          Instala con 1 click. Se configuran con los datos de tu agencia automáticamente.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar plantilla..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-sm transition-all ${
                category === cat.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 bg-white/5 rounded-2xl animate-pulse border border-white/5" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(template => {
            const isInstalled = template.already_installed
            const isInstalling = installing === template.id
            const locked = !template.can_install
            const requires = template.requires || []

            return (
              <motion.div
                key={template.id}
                layout
                className={`relative rounded-2xl border p-5 flex flex-col gap-3 transition-all ${
                  locked
                    ? 'border-white/5 bg-white/[0.02] opacity-60'
                    : template.is_featured
                    ? 'border-indigo-500/40 bg-indigo-950/20'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                {template.is_featured && (
                  <span className="absolute -top-2.5 left-4 bg-indigo-600 text-white text-xs px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                    <Star size={10} /> Destacada
                  </span>
                )}

                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-white font-medium text-sm leading-snug">{template.name}</p>
                    <p className="text-white/40 text-xs mt-1 line-clamp-2">{template.description}</p>
                  </div>
                  {locked && <Lock size={18} className="text-white/20 flex-shrink-0" />}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLOR[template.difficulty] || DIFFICULTY_COLOR.basica}`}>
                    {template.difficulty}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${PLAN_COLOR[template.min_plan] || PLAN_COLOR.starter}`}>
                    {template.min_plan}
                  </span>
                  {requires.map(req => (
                    <span key={req} className="text-xs bg-white/10 text-white/50 px-2 py-0.5 rounded-full" title={req}>
                      {REQUIRES_ICONS[req] || '⚙️'}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-3 text-xs text-white/30">
                  <span>⬇️ {template.installs || 0} instalaciones</span>
                  {template.rating > 0 && <span>⭐ {template.rating.toFixed(1)}</span>}
                </div>

                <button
                  onClick={() => !locked && !isInstalled && install(template.id)}
                  disabled={locked || isInstalling || isInstalled}
                  className={`mt-auto w-full py-2.5 rounded-xl text-sm font-medium transition-all ${
                    locked
                      ? 'bg-white/5 text-white/20 cursor-not-allowed'
                      : isInstalled
                      ? 'bg-emerald-600/20 text-emerald-400 cursor-default'
                      : isInstalling
                      ? 'bg-indigo-600/50 text-white/50'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  {locked
                    ? `Requiere plan ${template.min_plan}`
                    : isInstalled
                    ? '✓ Instalada'
                    : isInstalling
                    ? 'Instalando...'
                    : 'Instalar en mi agencia'
                  }
                </button>
              </motion.div>
            )
          })}
        </div>
      )}

      {filtered.length === 0 && !loading && (
        <div className="text-center py-16 text-white/30">
          <p className="text-4xl mb-3">🔍</p>
          <p>No hay plantillas que coincidan con tu búsqueda</p>
        </div>
      )}
    </div>
  )
}
