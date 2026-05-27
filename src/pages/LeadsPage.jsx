import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Plus, Search, Filter, ChevronLeft, ChevronRight,
  Mail, Phone, User, Target, Hash, Building2, MessageCircle,
  Globe, Star, TrendingUp, MoreHorizontal, Bot, Linkedin,
  ExternalLink, Instagram, Facebook, X
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import {
  formatCurrency, formatDate, getScoreColor, getScoreLabel,
  getStatusLabel, getStatusColor, getStatusDot, getInitials
} from '../utils/formatters'

const statusOptions = [
  { value: '', label: 'Todos los estados' },
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'contactado', label: 'Contactado' },
  { value: 'interesado', label: 'Interesado' },
  { value: 'visita_agendada', label: 'Visita agendada' },
  { value: 'negociacion', label: 'En negociación' },
  { value: 'reserva', label: 'Reserva' },
  { value: 'cerrado', label: 'Cerrado' },
  { value: 'perdido', label: 'Perdido' },
]

const sourceIcons = {
  whatsapp: MessageCircle,
  email: Mail,
  web: Globe,
  referral: Star,
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  ads: TrendingUp,
  call: Phone,
  manual: User,
  bot: Bot,
}

function SourceIcon({ source }) {
  const Icon = sourceIcons[source] || User
  return <Icon size={14} />
}

export default function LeadsPage() {
  const navigate = useNavigate()
  const { leads, fetchLeads, loading, createLead } = useStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [formData, setFormData] = useState({
    name: '', phone: '', email: '', budget: '', zone: '',
    property_interest: '', source: 'manual',
  })
  const [saving, setSaving] = useState(false)
  const perPage = 10

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchLeads({
        search: search.trim() || undefined,
        stage: statusFilter || undefined,
      })
    }, 300)

    return () => clearTimeout(delayDebounceFn)
  }, [search, statusFilter])

  const filtered = useMemo(() => {
    return leads || []
  }, [leads])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)

  useEffect(() => { setPage(1) }, [search, statusFilter])

  const handleCreateLead = async () => {
    if (!formData.name.trim()) return
    setSaving(true)
    try {
      await createLead({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        budget: formData.budget ? Number(formData.budget) : null,
        zone: formData.zone.trim(),
        property_interest: formData.property_interest.trim(),
        source: formData.source,
      })
      toast.success('Lead creado correctamente')
      setShowAddModal(false)
      setFormData({ name: '', phone: '', email: '', budget: '', zone: '', property_interest: '', source: 'manual' })
    } catch (e) {
      console.error('Error creating lead:', e)
    } finally {
      setSaving(false)
    }
  }

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.04 } }
  }

  const itemAnim = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0 }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 text-blue-500 flex items-center justify-center shadow-sm">
            <Users size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink font-syne">Leads</h1>
            <p className="text-sm text-muted">{filtered.length} clientes potenciales</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar leads..."
              className="w-56 lg:w-64 pl-9 pr-3 py-2.5 text-sm bg-surface border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="p-2.5 rounded-xl border border-border-secondary bg-surface text-muted hover:text-ink hover:border-accent transition-all"
            >
              <Filter size={18} />
            </button>
            {showFilters && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-surface rounded-xl shadow-elevated border border-border-secondary py-2 z-30 animate-fade-up">
                <div className="px-3 pb-2 border-b border-border">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider">Filtrar por</p>
                </div>
                <div className="p-2">
                  {statusOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setStatusFilter(opt.value); setShowFilters(false) }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        statusFilter === opt.value
                          ? 'bg-indigo-500/20 text-indigo-400 font-medium'
                          : 'text-muted hover:text-ink hover:bg-surface2'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary text-sm inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all font-medium shadow-sm"
          >
            <Plus size={16} />
            Nuevo lead
          </button>
        </div>
      </div>

      {loading.leads && leads.length === 0 ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            <p className="text-sm text-muted">Cargando leads...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card bg-surface rounded-2xl border border-border-secondary p-16 flex flex-col items-center justify-center text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-surface2 flex items-center justify-center mb-4">
            <Users size={32} className="text-muted2" />
          </div>
          <h3 className="text-lg font-semibold text-ink mb-1">No hay leads</h3>
          <p className="text-sm text-muted max-w-sm">
            {search || statusFilter
              ? 'No se encontraron leads con los filtros actuales.'
              : 'Comienza añadiendo tu primer lead para hacer seguimiento.'}
          </p>
          {!search && !statusFilter && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-500 hover:text-blue-600 transition-colors"
            >
              <Plus size={16} />
              Añadir lead
            </button>
          )}
        </motion.div>
      ) : (
        <>
          <div className="bg-surface rounded-2xl border border-border-secondary overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-secondary bg-surface2/50">
                    <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3.5">Nombre</th>
                    <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3.5 hidden md:table-cell">Contacto</th>
                    <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3.5 hidden lg:table-cell">Presupuesto</th>
                    <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3.5 hidden lg:table-cell">Interés</th>
                    <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3.5 hidden xl:table-cell">Origen</th>
                    <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3.5">IA Score</th>
                    <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3.5">Estado</th>
                    <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3.5 hidden xl:table-cell">Asignado</th>
                    <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3.5 hidden md:table-cell">Creado</th>
                  </tr>
                </thead>
                <motion.tbody
                  variants={container}
                  initial="hidden"
                  animate="show"
                >
                  <AnimatePresence mode="popLayout">
                    {paginated.map(lead => (
                      <motion.tr
                        key={lead.id}
                        variants={itemAnim}
                        layout
                        onClick={() => navigate(`/leads/${lead.id}`)}
                        className="border-b border-border-secondary last:border-0 hover:bg-indigo-500/5 cursor-pointer transition-colors group"
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-blue-500 flex items-center justify-center text-xs font-bold shrink-0">
                              {getInitials(lead.name)}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-ink group-hover:text-blue-500 transition-colors">{lead.name}</p>
                              <p className="text-xs text-muted md:hidden">{lead.phone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 text-sm text-muted">
                              <Phone size={12} className="text-muted2" />
                              <span>{lead.phone || '—'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-sm text-muted">
                              <Mail size={12} className="text-muted2" />
                              <span className="truncate max-w-[180px]">{lead.email || '—'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          <span className="text-sm font-medium text-ink">
                            {lead.budget ? formatCurrency(lead.budget) : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          <div className="flex items-center gap-1.5 text-sm text-muted">
                            <Building2 size={14} className="text-muted2" />
                            <span>{lead.property_interest || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 hidden xl:table-cell">
                          <div className="flex items-center gap-1.5 text-sm text-muted">
                            <SourceIcon source={lead.source} />
                            <span className="capitalize">{lead.source || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                              lead.ia_score >= 80 ? 'bg-ok/10 text-ok' : lead.ia_score >= 50 ? 'bg-warn/10 text-warn' : 'bg-err/10 text-err'
                            }`}>
                              <span className={`text-xs font-bold ${
                                lead.ia_score >= 80 ? 'text-ok' : lead.ia_score >= 50 ? 'text-warn' : 'text-err'
                              }`}>
                                {lead.ia_score ?? '—'}
                              </span>
                            </div>
                            <span className="text-xs text-muted hidden lg:inline">{getScoreLabel(lead.ia_score)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${getStatusColor(lead.status)}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(lead.status)}`} />
                            {getStatusLabel(lead.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 hidden xl:table-cell">
                          <div className="flex items-center gap-1.5 text-sm text-muted">
                            <User size={14} className="text-muted2" />
                            <span>{lead.assigned_name || lead.assigned_to || 'Sin asignar'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <span className="text-sm text-muted">{formatDate(lead.created_at)}</span>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </motion.tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">
              Mostrando {((currentPage - 1) * perPage) + 1}-{Math.min(currentPage * perPage, filtered.length)} de {filtered.length} leads
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-2 rounded-lg border border-border-secondary bg-surface text-muted hover:text-ink hover:border-accent disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                    n === currentPage
                      ? 'bg-indigo-500 text-white shadow-glow'
                      : 'text-muted hover:text-ink hover:bg-surface2 border border-border-secondary'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-2 rounded-lg border border-border-secondary bg-surface text-muted hover:text-ink hover:border-accent disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}

      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-surface rounded-2xl shadow-modal border border-border-secondary w-full max-w-lg p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold font-syne text-ink">Nuevo lead</h2>
                <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Nombre completo *</label>
                  <input
                    type="text" value={formData.name}
                    onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ej: Juan Pérez"
                    className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Teléfono</label>
                  <input
                    type="text" value={formData.phone}
                    onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+34 600 000 000"
                    className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Email</label>
                  <input
                    type="email" value={formData.email}
                    onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                    placeholder="juan@email.com"
                    className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Presupuesto (€)</label>
                  <input
                    type="number" value={formData.budget}
                    onChange={e => setFormData(f => ({ ...f, budget: e.target.value }))}
                    placeholder="300000"
                    className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Tipo de propiedad</label>
                  <input
                    type="text" value={formData.property_interest}
                    onChange={e => setFormData(f => ({ ...f, property_interest: e.target.value }))}
                    placeholder="Apartamento, Casa..."
                    className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted block mb-1">Zona de interés</label>
                  <input
                    type="text" value={formData.zone}
                    onChange={e => setFormData(f => ({ ...f, zone: e.target.value }))}
                    placeholder="Centro, Norte..."
                    className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-muted hover:text-ink bg-surface hover:bg-surface2 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateLead}
                  disabled={saving || !formData.name.trim()}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all"
                >
                  {saving ? 'Guardando...' : 'Crear lead'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
