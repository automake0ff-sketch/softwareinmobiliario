import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, Bath, Bed, Bot, Building2, CalendarClock, CheckCircle2,
  ChevronLeft, ChevronRight, Copy, Download, ExternalLink, Eye, Filter, Home, Image as ImageIcon,
  Mail, MapPin, Maximize, MessageCircle, Pencil, Plus, Search, Share2,
  Sparkles, Star, Target, Trash2, Upload, Wand2, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useStore } from '../lib/store'
import { formatCurrency, formatDate, getPropertyTypeLabel } from '../utils/formatters'

const tabs = [
  { id: 'all', label: 'Todas' },
  { id: 'manual', label: 'Manuales' },
  { id: 'idealista', label: 'Idealista' },
  { id: 'sale', label: 'Venta' },
  { id: 'rent', label: 'Alquiler' },
  { id: 'available', label: 'Disponibles' },
  { id: 'incomplete', label: 'Incompletas' },
]

const detailTabs = [
  { id: 'summary', label: 'Resumen', icon: Eye },
  { id: 'images', label: 'Imagenes', icon: ImageIcon },
  { id: 'interested', label: 'Interesados', icon: Star },
  { id: 'compatible', label: 'Compatibles', icon: Target },
  { id: 'activity', label: 'Actividad', icon: Activity },
  { id: 'marketing', label: 'Marketing', icon: Share2 },
  { id: 'ai', label: 'Mejora IA', icon: Sparkles },
]

const statusLabels = {
  disponible: 'Disponible',
  reservado: 'Reservada',
  vendido: 'Vendida',
  alquilado: 'Alquilada',
  available: 'Disponible',
  reserved: 'Reservada',
  sold: 'Vendida',
}

const statusClasses = {
  disponible: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  reservado: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  vendido: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  alquilado: 'border-blue-400/30 bg-blue-400/10 text-blue-200',
}

const portalClasses = {
  manual: 'border-slate-400/30 bg-slate-400/10 text-slate-200',
  idealista: 'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-200',
  fotocasa: 'border-orange-400/30 bg-orange-400/10 text-orange-200',
  habitaclia: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
  csv: 'border-lime-400/30 bg-lime-400/10 text-lime-200',
  portal: 'border-indigo-400/30 bg-indigo-400/10 text-indigo-200',
  ia: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
}

const emptyForm = {
  title: '',
  description: '',
  price: '',
  operation_type: 'sale',
  type: 'apartment',
  city: '',
  zone: '',
  address: '',
  bedrooms: '',
  bathrooms: '',
  surface: '',
  floor: '',
  has_elevator: false,
  has_terrace: false,
  has_garage: false,
  images: '',
  features: '',
}

function safeJson(value, fallback = []) {
  if (!value) return fallback
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return String(value).split(/[\n,]/).map((x) => x.trim()).filter(Boolean)
  }
}

function normalizeProperty(p) {
  const images = safeJson(p.images)
  const features = safeJson(p.features)
  const source = p.source || p.external_source || 'manual'
  const operation = p.operation_type || p.operation || 'sale'
  const status = p.status || 'disponible'
  const missing = [
    !images.length && 'Sin fotos',
    !p.description && 'Sin descripcion',
    !Number(p.price) && 'Sin precio',
    !Number(p.surface) && 'Sin superficie',
    !(p.city || p.zone || p.address) && 'Sin ubicacion',
  ].filter(Boolean)
  const quality = p.quality_score ?? Math.max(0, 100 - missing.length * 18)
  return { ...p, images, features, source, operation, status, missing, quality }
}

function portalLabel(source) {
  if (!source) return 'Manual'
  return source === 'ia' ? 'IA' : source.charAt(0).toUpperCase() + source.slice(1)
}

function PropertyImage({ property, className = '' }) {
  const [failed, setFailed] = useState(false)
  const image = property.images?.[0]
  if (image && !failed) {
    return (
      <img
        src={image}
        alt={property.title}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover ${className}`}
      />
    )
  }
  return (
    <div className={`h-full w-full bg-gradient-to-br from-indigo-500/20 via-sky-500/10 to-fuchsia-500/20 flex items-center justify-center ${className}`}>
      <div className="text-center">
        <Building2 size={34} className="mx-auto text-indigo-200/80" />
        <p className="mt-2 text-xs text-slate-400">Sin imagen</p>
      </div>
    </div>
  )
}

function StatCard({ value, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border p-5 text-center transition-all ${active ? 'border-violet-400/60 bg-violet-500/10' : 'border-[#27283a] bg-[#15151d] hover:border-violet-400/40'}`}
    >
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-1 text-sm text-[#9fb3d9]">{label}</p>
    </button>
  )
}

export default function PropertiesPage() {
  const { properties, fetchProperties, createProperty } = useStore()
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [selected, setSelected] = useState(null)
  const [detailTab, setDetailTab] = useState('summary')
  const [form, setForm] = useState(emptyForm)
  const [importMode, setImportMode] = useState('url')
  const [urls, setUrls] = useState('')
  const [csv, setCsv] = useState('')
  const [loading, setLoading] = useState(false)
  const [marketing, setMarketing] = useState(null)
  const [aiResult, setAiResult] = useState(null)
  const [matches, setMatches] = useState([])

  useEffect(() => {
    fetchProperties?.()
  }, [fetchProperties])

  const normalized = useMemo(() => properties.map(normalizeProperty), [properties])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return normalized.filter((p) => {
      if (q && !`${p.title} ${p.city} ${p.zone} ${p.external_url}`.toLowerCase().includes(q)) return false
      if (activeTab === 'manual' && p.source !== 'manual') return false
      if (activeTab === 'idealista' && p.source !== 'idealista') return false
      if (activeTab === 'sale' && p.operation !== 'sale') return false
      if (activeTab === 'rent' && p.operation !== 'rent') return false
      if (activeTab === 'available' && p.status !== 'disponible' && p.status !== 'available') return false
      if (activeTab === 'incomplete' && !p.missing.length) return false
      return true
    })
  }, [normalized, search, activeTab])

  const stats = useMemo(() => {
    const total = normalized.length
    const avg = total ? Math.round(normalized.reduce((sum, p) => sum + Number(p.price || 0), 0) / total) : 0
    return {
      total,
      available: normalized.filter((p) => ['disponible', 'available'].includes(p.status)).length,
      reserved: normalized.filter((p) => ['reservado', 'reserved'].includes(p.status)).length,
      closed: normalized.filter((p) => ['vendido', 'alquilado', 'sold'].includes(p.status)).length,
      avg,
      noImages: normalized.filter((p) => !p.images.length).length,
      noDescription: normalized.filter((p) => !p.description).length,
      idealista: normalized.filter((p) => p.source === 'idealista').length,
    }
  }, [normalized])

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submitCreate(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await createProperty({
        ...form,
        price: Number(form.price || 0),
        bedrooms: Number(form.bedrooms || 0),
        bathrooms: Number(form.bathrooms || 0),
        surface: Number(form.surface || 0),
        images: form.images,
        features: form.features,
      })
      await fetchProperties()
      setShowCreate(false)
      setForm(emptyForm)
      toast.success('Propiedad creada')
    } catch (err) {
      toast.error(err.message || 'No se pudo crear')
    } finally {
      setLoading(false)
    }
  }

  async function submitImport(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const endpoint = importMode === 'csv' ? '/properties/import/csv' : '/properties/import/url'
      const payload = importMode === 'csv' ? { csv } : { urls }
      const res = await api.post(endpoint, payload)
      await fetchProperties()
      setShowImport(false)
      setUrls('')
      setCsv('')
      const created = res.created?.length || 0
      const updated = res.updated?.length || 0
      toast.success(`${created} importadas, ${updated} actualizadas`)
    } catch (err) {
      toast.error(err.message || 'No se pudo importar')
    } finally {
      setLoading(false)
    }
  }

  async function deleteProperty(property) {
    if (!confirm(`Eliminar "${property.title}"?`)) return
    await api.delete(`/properties/${property.id}`)
    await fetchProperties()
    setSelected(null)
    toast.success('Propiedad eliminada')
  }

  async function loadMarketing(type) {
    if (!selected) return
    const res = await api.post(`/properties/${selected.id}/marketing`, { type })
    setMarketing(res)
  }

  async function loadAi() {
    if (!selected) return
    const res = await api.post(`/properties/${selected.id}/improve-ai`, {})
    setAiResult(res.improved)
  }

  async function loadMatches() {
    if (!selected) return
    const res = await api.post(`/properties/${selected.id}/match-leads`, {})
    setMatches(res.leads || [])
  }

  function openDetail(property, tab = 'summary') {
    setSelected(property)
    setDetailTab(tab)
    setMarketing(null)
    setAiResult(null)
    setMatches([])
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-200">
            <Building2 size={24} />
          </div>
          <div>
            <h1 className="font-syne text-3xl font-bold text-white">Propiedades</h1>
            <p className="text-sm text-[#9fb3d9]">{filtered.length} inmuebles</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7f91b3]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar propiedades..."
              className="h-12 w-72 rounded-2xl border border-[#27283a] bg-[#15151d] pl-12 pr-4 text-sm text-white outline-none transition focus:border-indigo-400/60"
            />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className="h-12 w-12 rounded-2xl border border-[#27283a] bg-[#15151d] text-[#9fb3d9] hover:text-white">
            <Filter className="mx-auto" size={19} />
          </button>
          <button onClick={() => setShowImport(true)} className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[#27283a] bg-[#15151d] px-5 text-sm font-semibold text-white hover:border-indigo-400/60">
            <Download size={17} /> Importar
          </button>
          <button onClick={() => setShowCreate(true)} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20">
            <Plus size={18} /> Nueva propiedad
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard value={stats.total} label="Total" onClick={() => setActiveTab('all')} active={activeTab === 'all'} />
        <StatCard value={stats.available} label="Disponibles" onClick={() => setActiveTab('available')} active={activeTab === 'available'} />
        <StatCard value={stats.reserved} label="Reservadas" />
        <StatCard value={stats.closed} label="Vendidas/Alq." />
        <StatCard value={formatCurrency(stats.avg)} label="Precio medio" />
        <StatCard value={stats.noImages} label="Sin fotos" onClick={() => setActiveTab('incomplete')} />
        <StatCard value={stats.noDescription} label="Sin descripcion" onClick={() => setActiveTab('incomplete')} />
        <StatCard value={stats.idealista} label="Idealista" onClick={() => setActiveTab('idealista')} active={activeTab === 'idealista'} />
      </div>

      <div className="flex flex-wrap gap-3">
        {[
          [stats.noImages, 'sin fotos', ImageIcon],
          [stats.noDescription, 'sin descripcion', Copy],
          [normalized.filter((p) => !Number(p.surface)).length, 'sin superficie', Maximize],
          [normalized.filter((p) => !Number(p.price)).length, 'sin precio', Home],
        ].map(([count, label, Icon]) => (
          <button key={label} onClick={() => setActiveTab('incomplete')} className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300">
            <Icon size={15} /> {count} {label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-[#27283a] bg-[#15151d] p-1.5">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-xl px-5 py-3 text-sm font-semibold transition ${activeTab === tab.id ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white' : 'text-[#9fb3d9] hover:bg-white/5 hover:text-white'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {showFilters && (
        <div className="rounded-2xl border border-[#27283a] bg-[#15151d] p-5 text-sm text-[#9fb3d9]">
          Usa el buscador y los tabs para filtrar. Los filtros avanzados por precio, ciudad y tipo quedan preparados para la siguiente capa.
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-[#27283a] bg-[#15151d] p-16 text-center">
          <Building2 size={42} className="mx-auto text-indigo-200" />
          <h3 className="mt-4 text-xl font-bold text-white">No hay propiedades visibles</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#9fb3d9]">Crea una propiedad manual o importa desde URL/CSV para verla aqui con imagenes, portal, precio y caracteristicas.</p>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={() => setShowImport(true)} className="rounded-2xl border border-[#27283a] px-5 py-3 text-sm font-semibold text-white">Importar</button>
            <button onClick={() => setShowCreate(true)} className="rounded-2xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white">Nueva propiedad</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((property) => (
            <motion.article
              key={property.id}
              layout
              className="overflow-hidden rounded-3xl border border-[#27283a] bg-[#15151d] shadow-2xl shadow-black/10"
            >
              <button onClick={() => openDetail(property)} className="relative block h-56 w-full overflow-hidden text-left">
                <PropertyImage property={property} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <div className="absolute left-4 top-4 flex gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${portalClasses[property.source] || portalClasses.portal}`}>{portalLabel(property.source)}</span>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClasses[property.status] || statusClasses.disponible}`}>{statusLabels[property.status] || property.status}</span>
                </div>
                {property.images.length > 1 && (
                  <span className="absolute right-4 top-4 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white">+{property.images.length - 1} fotos</span>
                )}
                <div className="absolute bottom-4 left-4 right-4">
                  <p className="text-2xl font-bold text-white">{formatCurrency(property.price)}</p>
                  <h2 className="mt-1 line-clamp-1 text-lg font-bold text-white">{property.title}</h2>
                  <p className="mt-1 flex items-center gap-1 text-sm text-slate-200"><MapPin size={14} /> {[property.zone, property.city].filter(Boolean).join(', ') || 'Ubicacion pendiente'}</p>
                </div>
              </button>

              <div className="space-y-4 p-5">
                <div className="grid grid-cols-4 gap-2 text-center text-xs text-[#9fb3d9]">
                  <span className="rounded-2xl bg-white/5 p-3"><Bed className="mx-auto mb-1" size={16} />{property.bedrooms || 0}</span>
                  <span className="rounded-2xl bg-white/5 p-3"><Bath className="mx-auto mb-1" size={16} />{property.bathrooms || 0}</span>
                  <span className="rounded-2xl bg-white/5 p-3"><Maximize className="mx-auto mb-1" size={16} />{property.surface || 0} m2</span>
                  <span className="rounded-2xl bg-white/5 p-3"><Home className="mx-auto mb-1" size={16} />{property.operation === 'rent' ? 'Alq.' : 'Venta'}</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-xs text-indigo-200">{getPropertyTypeLabel(property.type)}</span>
                  {property.has_elevator ? <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">Ascensor</span> : null}
                  {property.has_terrace ? <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">Terraza</span> : null}
                  {property.has_garage ? <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">Garaje</span> : null}
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[#7f91b3]">Calidad anuncio</p>
                    <div className="mt-1 h-2 w-32 rounded-full bg-white/10">
                      <div className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-emerald-400" style={{ width: `${property.quality}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-white">{property.quality}%</span>
                </div>

                {property.missing.length ? (
                  <div className="flex flex-wrap gap-2">
                    {property.missing.slice(0, 3).map((item) => (
                      <span key={item} className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">{item}</span>
                    ))}
                  </div>
                ) : (
                  <p className="inline-flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 size={16} /> Lista para trabajar</p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => openDetail(property, 'compatible')} className="rounded-xl bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">Compatibles</button>
                  <button onClick={() => openDetail(property, 'ai')} className="rounded-xl bg-violet-500/15 px-3 py-2 text-sm font-semibold text-violet-200 hover:bg-violet-500/25">Mejora IA</button>
                  <button onClick={() => openDetail(property, 'marketing')} className="rounded-xl bg-blue-500/15 px-3 py-2 text-sm font-semibold text-blue-200 hover:bg-blue-500/25">Marketing</button>
                  {property.external_url ? (
                    <a href={property.external_url} target="_blank" rel="noreferrer" className="rounded-xl bg-white/5 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-white/10">Portal</a>
                  ) : (
                    <button onClick={() => openDetail(property)} className="rounded-xl bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">Detalle</button>
                  )}
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreate && (
          <Modal title="Nueva propiedad" onClose={() => setShowCreate(false)}>
            <form onSubmit={submitCreate} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input label="Titulo" value={form.title} onChange={(v) => updateForm('title', v)} required className="md:col-span-2" />
              <Input label="Precio" type="number" value={form.price} onChange={(v) => updateForm('price', v)} />
              <Select label="Operacion" value={form.operation_type} onChange={(v) => updateForm('operation_type', v)} options={[['sale', 'Venta'], ['rent', 'Alquiler']]} />
              <Input label="Tipo" value={form.type} onChange={(v) => updateForm('type', v)} />
              <Input label="Ciudad" value={form.city} onChange={(v) => updateForm('city', v)} required />
              <Input label="Zona" value={form.zone} onChange={(v) => updateForm('zone', v)} />
              <Input label="Direccion" value={form.address} onChange={(v) => updateForm('address', v)} />
              <Input label="Habitaciones" type="number" value={form.bedrooms} onChange={(v) => updateForm('bedrooms', v)} />
              <Input label="Banos" type="number" value={form.bathrooms} onChange={(v) => updateForm('bathrooms', v)} />
              <Input label="Superficie" type="number" value={form.surface} onChange={(v) => updateForm('surface', v)} />
              <Input label="Planta" value={form.floor} onChange={(v) => updateForm('floor', v)} />
              <Textarea label="URLs de imagenes" value={form.images} onChange={(v) => updateForm('images', v)} placeholder="Una URL por linea o separadas por coma" className="md:col-span-2" />
              <Textarea label="Descripcion" value={form.description} onChange={(v) => updateForm('description', v)} className="md:col-span-2" />
              <div className="md:col-span-2 flex justify-end gap-3">
                <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl bg-white/5 px-5 py-3 text-sm font-semibold text-white">Cancelar</button>
                <button disabled={loading} className="rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white">Guardar propiedad</button>
              </div>
            </form>
          </Modal>
        )}

        {showImport && (
          <Modal title="Importar propiedades" onClose={() => setShowImport(false)}>
            <form onSubmit={submitImport} className="space-y-5">
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-black/20 p-1">
                <button type="button" onClick={() => setImportMode('url')} className={`rounded-xl py-3 text-sm font-semibold ${importMode === 'url' ? 'bg-indigo-500 text-white' : 'text-[#9fb3d9]'}`}>URL portal</button>
                <button type="button" onClick={() => setImportMode('csv')} className={`rounded-xl py-3 text-sm font-semibold ${importMode === 'csv' ? 'bg-indigo-500 text-white' : 'text-[#9fb3d9]'}`}>CSV</button>
              </div>
              {importMode === 'url' ? (
                <Textarea label="URLs de Idealista, Fotocasa u otro portal" value={urls} onChange={setUrls} rows={7} placeholder="https://www.idealista.com/inmueble/..." />
              ) : (
                <Textarea label="CSV" value={csv} onChange={setCsv} rows={9} placeholder="title,price,city,images,external_url" />
              )}
              <p className="text-xs text-[#9fb3d9]">Si el portal bloquea el scraping, se creara una ficha preliminar con URL, portal y campos pendientes para completarla.</p>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowImport(false)} className="rounded-xl bg-white/5 px-5 py-3 text-sm font-semibold text-white">Cancelar</button>
                <button disabled={loading} className="rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white">Importar</button>
              </div>
            </form>
          </Modal>
        )}

        {selected && (
          <DetailDrawer
            property={selected}
            activeTab={detailTab}
            setActiveTab={setDetailTab}
            onClose={() => setSelected(null)}
            onDelete={() => deleteProperty(selected)}
            marketing={marketing}
            loadMarketing={loadMarketing}
            aiResult={aiResult}
            loadAi={loadAi}
            matches={matches}
            loadMatches={loadMatches}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.96, y: 18 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 18 }} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-[#27283a] bg-[#17171f] p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="rounded-xl p-2 text-[#9fb3d9] hover:bg-white/5 hover:text-white"><X size={19} /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

function Input({ label, value, onChange, className = '', ...props }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-bold uppercase text-[#7f91b3]">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-[#27283a] bg-[#0d0d12] px-4 py-3 text-sm text-white outline-none focus:border-indigo-400/60" {...props} />
    </label>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase text-[#7f91b3]">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-[#27283a] bg-[#0d0d12] px-4 py-3 text-sm text-white outline-none focus:border-indigo-400/60">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

function Textarea({ label, value, onChange, className = '', ...props }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-bold uppercase text-[#7f91b3]">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-[#27283a] bg-[#0d0d12] px-4 py-3 text-sm text-white outline-none focus:border-indigo-400/60" {...props} />
    </label>
  )
}

function DetailDrawer({ property, activeTab, setActiveTab, onClose, onDelete, marketing, loadMarketing, aiResult, loadAi, matches, loadMatches }) {
  const images = property.images || []
  const [imageIndex, setImageIndex] = useState(0)
  const heroImage = images[imageIndex]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm">
      <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="ml-auto flex h-full w-full max-w-6xl flex-col border-l border-[#27283a] bg-[#0b0b10] shadow-2xl">
        <div className="relative h-64 shrink-0 overflow-hidden">
          {heroImage ? (
            <img src={heroImage} alt={property.title} className="h-full w-full object-cover" />
          ) : (
            <PropertyImage property={property} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b10] via-black/20 to-black/40" />
          <button onClick={onClose} className="absolute right-5 top-5 rounded-2xl bg-black/40 p-3 text-white hover:bg-black/70"><X size={20} /></button>
          {images.length > 1 && (
            <>
              <button
                onClick={() => setImageIndex((prev) => (prev - 1 + images.length) % images.length)}
                className="absolute left-5 top-1/2 -translate-y-1/2 rounded-2xl bg-black/45 p-3 text-white hover:bg-black/70"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => setImageIndex((prev) => (prev + 1) % images.length)}
                className="absolute right-20 top-1/2 -translate-y-1/2 rounded-2xl bg-black/45 p-3 text-white hover:bg-black/70"
              >
                <ChevronRight size={20} />
              </button>
              <div className="absolute right-5 top-20 rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white">
                {imageIndex + 1}/{images.length}
              </div>
            </>
          )}
          <div className="absolute bottom-6 left-7 right-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-indigo-200">{portalLabel(property.source)} · {statusLabels[property.status] || property.status}</p>
              <h2 className="mt-1 text-3xl font-bold text-white">{property.title}</h2>
              <p className="mt-1 text-[#c7d4ef]">{[property.zone, property.city].filter(Boolean).join(', ') || 'Ubicacion pendiente'}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-white">{formatCurrency(property.price)}</p>
              <p className="text-sm text-[#9fb3d9]">{property.operation === 'rent' ? 'Alquiler' : 'Venta'}</p>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-b border-[#27283a] px-6">
          <div className="flex gap-2 overflow-x-auto py-3">
            {detailTabs.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => { setActiveTab(id); if (id === 'compatible') loadMatches(); if (id === 'ai') loadAi(); }} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold whitespace-nowrap ${activeTab === id ? 'bg-indigo-500 text-white' : 'text-[#9fb3d9] hover:bg-white/5 hover:text-white'}`}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-7">
          {activeTab === 'summary' && <SummaryTab property={property} />}
          {activeTab === 'images' && <ImagesTab images={images} />}
          {activeTab === 'interested' && <InterestedTab />}
          {activeTab === 'compatible' && <CompatibleTab matches={matches} />}
          {activeTab === 'activity' && <ActivityTab property={property} />}
          {activeTab === 'marketing' && <MarketingTab marketing={marketing} loadMarketing={loadMarketing} />}
          {activeTab === 'ai' && <AiTab aiResult={aiResult} loadAi={loadAi} />}
        </div>

        <div className="flex shrink-0 justify-between border-t border-[#27283a] p-5">
          <button onClick={onDelete} className="inline-flex items-center gap-2 rounded-xl bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200"><Trash2 size={16} /> Eliminar</button>
          <div className="flex gap-3">
            {property.external_url && <a href={property.external_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-4 py-3 text-sm font-semibold text-white"><ExternalLink size={16} /> Ver portal</a>}
            <button className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white"><Pencil size={16} /> Editar</button>
          </div>
        </div>
      </motion.aside>
    </motion.div>
  )
}

function SummaryTab({ property }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Descripcion">
        <p className="leading-relaxed text-[#d7e2f7]">{property.description || 'Descripcion pendiente. Usa Mejora IA para generar un anuncio listo para publicar.'}</p>
      </Panel>
      <Panel title="Caracteristicas">
        <div className="grid grid-cols-2 gap-3 text-sm text-[#d7e2f7]">
          <Feature icon={Bed} label="Habitaciones" value={property.bedrooms || 0} />
          <Feature icon={Bath} label="Banos" value={property.bathrooms || 0} />
          <Feature icon={Maximize} label="Superficie" value={`${property.surface || 0} m2`} />
          <Feature icon={Building2} label="Planta" value={property.floor || '-'} />
          <Feature icon={CheckCircle2} label="Ascensor" value={property.has_elevator ? 'Si' : 'No'} />
          <Feature icon={Home} label="Garaje" value={property.has_garage ? 'Si' : 'No'} />
        </div>
      </Panel>
      <Panel title="Calidad y pendientes">
        <div className="flex flex-wrap gap-2">
          {property.missing.length ? property.missing.map((x) => <span key={x} className="rounded-full bg-amber-500/10 px-3 py-1 text-sm text-amber-300">{x}</span>) : <span className="text-emerald-300">Anuncio completo</span>}
        </div>
      </Panel>
      <Panel title="Origen">
        <p className="text-[#d7e2f7]">{portalLabel(property.source)} {property.external_url ? `· ${property.external_url}` : ''}</p>
      </Panel>
    </div>
  )
}

function ImagesTab({ images }) {
  if (!images.length) return <Panel title="Imagenes"><p className="text-[#9fb3d9]">Esta propiedad no tiene imagenes. Anade URLs o importa desde un portal para mostrarlas aqui.</p></Panel>
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{images.map((src) => <img key={src} src={src} alt="" className="h-56 w-full rounded-2xl object-cover" />)}</div>
}

// Keep it simple
function InterestedTab() {
  return <Panel title="Interesados"><p className="text-[#9fb3d9]">Aqui apareceran los leads que hayan pedido informacion, recibido esta propiedad o agendado visita. Acciones preparadas: WhatsApp, email, llamada y calendario.</p></Panel>
}

function CompatibleTab({ matches }) {
  return (
    <Panel title="Leads compatibles">
      {matches.length ? (
        <div className="space-y-3">{matches.map((lead) => <div key={lead.id} className="flex items-center justify-between rounded-2xl bg-white/5 p-4"><div><p className="font-semibold text-white">{lead.name}</p><p className="text-sm text-[#9fb3d9]">{lead.zone} · {formatCurrency(lead.budget)}</p></div><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-bold text-emerald-300">{lead.match_score}%</span></div>)}</div>
      ) : <p className="text-[#9fb3d9]">Pulsa la pestana Compatibles para calcular leads que encajan por zona, presupuesto y tipo de propiedad.</p>}
    </Panel>
  )
}

function ActivityTab({ property }) {
  return <Panel title="Actividad"><p className="text-[#9fb3d9]">Creada/importada {formatDate(property.created_at)}. Las proximas acciones de envio, edicion y marketing quedaran registradas aqui.</p></Panel>
}

function MarketingTab({ marketing, loadMarketing }) {
  const options = [['idealista', 'Idealista'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['redes', 'Redes']]
  return (
    <Panel title="Herramientas de marketing">
      <div className="mb-4 flex flex-wrap gap-2">{options.map(([type, label]) => <button key={type} onClick={() => loadMarketing(type)} className="rounded-xl bg-indigo-500/15 px-4 py-2 text-sm font-semibold text-indigo-200">{label}</button>)}</div>
      <pre className="whitespace-pre-wrap rounded-2xl bg-black/25 p-4 text-sm text-[#d7e2f7]">{marketing?.content || 'Elige una herramienta para generar copy listo para publicar o enviar.'}</pre>
    </Panel>
  )
}

function AiTab({ aiResult, loadAi }) {
  return (
    <Panel title="Mejora IA">
      <button onClick={loadAi} className="mb-4 inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white"><Wand2 size={16} /> Generar mejora IA</button>
      {aiResult ? (
        <div className="space-y-4 text-[#d7e2f7]">
          <p><strong className="text-white">Titulo:</strong> {aiResult.title}</p>
          <p><strong className="text-white">Descripcion:</strong> {aiResult.description}</p>
          <div><strong className="text-white">Fortalezas:</strong><ul className="mt-2 list-disc pl-5">{aiResult.strengths?.map((x) => <li key={x}>{x}</li>)}</ul></div>
        </div>
      ) : <p className="text-[#9fb3d9]">Genera titulo, descripcion, fortalezas y acciones para dejar el anuncio listo para publicar.</p>}
    </Panel>
  )
}

function Panel({ title, children }) {
  return <section className="rounded-3xl border border-[#27283a] bg-[#15151d] p-5"><h3 className="mb-4 text-lg font-bold text-white">{title}</h3>{children}</section>
}

function Feature({ icon: Icon, label, value }) {
  return <div className="rounded-2xl bg-white/5 p-4"><Icon size={17} className="mb-2 text-indigo-200" /><p className="text-xs text-[#7f91b3]">{label}</p><p className="font-semibold text-white">{value}</p></div>
}
