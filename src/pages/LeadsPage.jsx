import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Plus, Search, Filter, ChevronLeft, ChevronRight,
  Mail, Phone, User, Target, Hash, Building2, MessageCircle,
  Globe, Star, TrendingUp, MoreHorizontal, Bot, Linkedin,
  ExternalLink, Instagram, Facebook
} from 'lucide-react'
import { useStore } from '../lib/store'
import {
  formatCurrency, formatDate, getScoreColor, getScoreLabel,
  getStatusLabel, getStatusColor, getInitials
} from '../utils/formatters'

const statusOptions = [
  { value: '', label: 'Todos los estados' },
  { value: 'new', label: 'Nuevo' },
  { value: 'contacted', label: 'Contactado' },
  { value: 'qualified', label: 'Calificado' },
  { value: 'proposal', label: 'En propuesta' },
  { value: 'negotiation', label: 'En negociación' },
  { value: 'closed_won', label: 'Ganado' },
  { value: 'closed_lost', label: 'Perdido' },
  { value: 'follow_up', label: 'Seguimiento' },
  { value: 'inactive', label: 'Inactivo' },
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

const initialLeads = [
  { id: '1', name: 'María García López', phone: '+34 612 345 678', email: 'maria.garcia@email.com', budget: 350000, property_interest: 'Ático', source: 'whatsapp', ia_score: 92, status: 'qualified', assigned_to: 'Carlos Ruiz', created_at: '2026-05-10T09:30:00Z', zone: 'Centro' },
  { id: '2', name: 'Antonio Martínez Ruiz', phone: '+34 623 456 789', email: 'antonio.martinez@email.com', budget: 180000, property_interest: 'Apartamento', source: 'web', ia_score: 78, status: 'new', assigned_to: 'Laura Sánchez', created_at: '2026-05-09T14:15:00Z', zone: 'Norte' },
  { id: '3', name: 'Carmen Fernández Díaz', phone: '+34 634 567 890', email: 'carmen.fernandez@email.com', budget: 520000, property_interest: 'Casa', source: 'referral', ia_score: 88, status: 'proposal', assigned_to: 'Carlos Ruiz', created_at: '2026-05-08T11:00:00Z', zone: 'Sur' },
  { id: '4', name: 'David López Sánchez', phone: '+34 645 678 901', email: 'david.lopez@email.com', budget: 220000, property_interest: 'Apartamento', source: 'instagram', ia_score: 45, status: 'contacted', assigned_to: 'Marta Pérez', created_at: '2026-05-07T16:45:00Z', zone: 'Este' },
  { id: '5', name: 'Elena Torres Moreno', phone: '+34 656 789 012', email: 'elena.torres@email.com', budget: 680000, property_interest: 'Villa', source: 'linkedin', ia_score: 95, status: 'negotiation', assigned_to: 'Carlos Ruiz', created_at: '2026-05-06T08:30:00Z', zone: 'Oeste' },
  { id: '6', name: 'Francisco Jiménez Ortiz', phone: '+34 667 890 123', email: 'francisco.jimenez@email.com', budget: 150000, property_interest: 'Estudio', source: 'web', ia_score: 32, status: 'inactive', assigned_to: 'Laura Sánchez', created_at: '2026-05-05T10:00:00Z', zone: 'Centro' },
  { id: '7', name: 'Gloria Ramírez Castro', phone: '+34 678 901 234', email: 'gloria.ramirez@email.com', budget: 410000, property_interest: 'Dúplex', source: 'facebook', ia_score: 71, status: 'follow_up', assigned_to: 'Marta Pérez', created_at: '2026-05-04T13:20:00Z', zone: 'Norte' },
  { id: '8', name: 'Héctor Navarro Gil', phone: '+34 689 012 345', email: 'hector.navarro@email.com', budget: 295000, property_interest: 'Apartamento', source: 'whatsapp', ia_score: 83, status: 'qualified', assigned_to: 'Carlos Ruiz', created_at: '2026-05-03T15:30:00Z', zone: 'Sur' },
  { id: '9', name: 'Isabel Cruz Vega', phone: '+34 690 123 456', email: 'isabel.cruz@email.com', budget: 750000, property_interest: 'Ático', source: 'referral', ia_score: 97, status: 'closed_won', assigned_to: 'Laura Sánchez', created_at: '2026-05-02T09:00:00Z', zone: 'Este' },
  { id: '10', name: 'Javier Molina Ríos', phone: '+34 601 234 567', email: 'javier.molina@email.com', budget: 120000, property_interest: 'Garaje', source: 'email', ia_score: 18, status: 'closed_lost', assigned_to: 'Marta Pérez', created_at: '2026-05-01T11:45:00Z', zone: 'Oeste' },
  { id: '11', name: 'Karen Silva Paredes', phone: '+34 612 345 679', email: 'karen.silva@email.com', budget: 430000, property_interest: 'Casa', source: 'ads', ia_score: 65, status: 'new', assigned_to: 'Carlos Ruiz', created_at: '2026-04-30T08:15:00Z', zone: 'Centro' },
  { id: '12', name: 'Luis Herrera Campos', phone: '+34 623 456 790', email: 'luis.herrera@email.com', budget: 890000, property_interest: 'Villa', source: 'bot', ia_score: 91, status: 'proposal', assigned_to: 'Laura Sánchez', created_at: '2026-04-29T14:30:00Z', zone: 'Norte' },
]

export default function LeadsPage() {
  const navigate = useNavigate()
  const { leads, fetchLeads, setLoading, loading, createLead } = useStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const perPage = 5

  useEffect(() => {
    if (leads.length === 0) {
      useStore.setState({ leads: [...initialLeads] })
    }
  }, [])

  const filtered = useMemo(() => {
    let result = leads.length > 0 ? leads : initialLeads
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(l =>
        l.name?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.phone?.includes(q) ||
        l.property_interest?.toLowerCase().includes(q)
      )
    }
    if (statusFilter) {
      result = result.filter(l => l.status === statusFilter)
    }
    return result
  }, [leads, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)

  useEffect(() => { setPage(1) }, [search, statusFilter])

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

      {filtered.length === 0 ? (
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
                              <span>{lead.phone}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-sm text-muted">
                              <Mail size={12} className="text-muted2" />
                              <span className="truncate max-w-[180px]">{lead.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          <span className="text-sm font-medium text-ink">{formatCurrency(lead.budget)}</span>
                        </td>
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          <div className="flex items-center gap-1.5 text-sm text-muted">
                            <Building2 size={14} className="text-muted2" />
                            <span>{lead.property_interest}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 hidden xl:table-cell">
                          <div className="flex items-center gap-1.5 text-sm text-muted">
                            <SourceIcon source={lead.source} />
                            <span className="capitalize">{lead.source}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${getScoreColor(lead.ia_score)} bg-opacity-10`}
                              style={{ backgroundColor: `var(--${lead.ia_score >= 80 ? 'ok' : lead.ia_score >= 50 ? 'warn' : 'err'}-bg)` }}
                            >
                              <span className="opacity-0 absolute">bg</span>
                              <span className={`text-xs font-bold ${
                                lead.ia_score >= 80 ? 'text-ok' : lead.ia_score >= 50 ? 'text-warn' : 'text-err'
                              }`}>
                                {lead.ia_score}
                              </span>
                            </div>
                            <span className="text-xs text-muted hidden lg:inline">{getScoreLabel(lead.ia_score)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${getStatusColor(lead.status)}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              lead.status === 'new' ? 'bg-blue-300' :
                              lead.status === 'contacted' ? 'bg-gold-300' :
                              lead.status === 'qualified' ? 'bg-ok' :
                              lead.status === 'proposal' ? 'bg-warn' :
                              lead.status === 'negotiation' ? 'bg-err' :
                              lead.status === 'closed_won' ? 'bg-ok' :
                              lead.status === 'closed_lost' ? 'bg-err' :
                              lead.status === 'follow_up' ? 'bg-blue-300' : 'bg-muted'
                            }`} />
                            {getStatusLabel(lead.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 hidden xl:table-cell">
                          <div className="flex items-center gap-1.5 text-sm text-muted">
                            <User size={14} className="text-muted2" />
                            <span>{lead.assigned_to}</span>
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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Nombre completo', placeholder: 'Ej: Juan Pérez' },
                  { label: 'Teléfono', placeholder: '+34 600 000 000' },
                  { label: 'Email', placeholder: 'juan@email.com' },
                  { label: 'Presupuesto (€)', placeholder: '300000' },
                  { label: 'Tipo de propiedad', placeholder: 'Apartamento, Casa...' },
                  { label: 'Zona de interés', placeholder: 'Centro, Norte...' },
                ].map(field => (
                  <div key={field.label}>
                    <label className="text-xs font-medium text-muted block mb-1">{field.label}</label>
                    <input
                      type="text"
                      placeholder={field.placeholder}
                      className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-muted hover:text-ink bg-surface hover:bg-surface2 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    useStore.setState(s => ({
                      leads: [{
                        id: String(Date.now()),
                        name: 'Nuevo Lead',
                        phone: '+34 600 000 000',
                        email: 'nuevo@email.com',
                        budget: 200000,
                        property_interest: 'Apartamento',
                        source: 'manual',
                        ia_score: 50,
                        status: 'new',
                        assigned_to: 'Sin asignar',
                        created_at: new Date().toISOString(),
                        zone: 'Centro',
                      }, ...s.leads]
                    }))
                    setShowAddModal(false)
                  }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-xl transition-all"
                >
                  Crear lead
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
