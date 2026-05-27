import { useEffect, useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Columns3, X, Phone, MessageCircle, Mail, Calendar,
  User, MapPin, Home, Euro, Sparkles, Globe,
  MessageSquare, ChevronDown, Clock, Building2,
  Target, Zap, AlertCircle, ChevronRight, Plus,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { formatCurrency } from '../utils/formatters'

const PIPELINE_COLUMNS = [
  { id: 'nuevo', label: 'Nuevos Leads', dot: 'bg-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', iconBg: 'bg-blue-500/20' },
  { id: 'contactado', label: 'Contactado', dot: 'bg-indigo-500', bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20', iconBg: 'bg-indigo-500/20' },
  { id: 'interesado', label: 'Interesado', dot: 'bg-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', iconBg: 'bg-purple-500/20' },
  { id: 'visita_agendada', label: 'Visita agendada', dot: 'bg-pink-500', bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/20', iconBg: 'bg-pink-500/20' },
  { id: 'negociacion', label: 'Negociación', dot: 'bg-orange-500', bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', iconBg: 'bg-orange-500/20' },
  { id: 'reserva', label: 'Reserva', dot: 'bg-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', iconBg: 'bg-amber-500/20' },
  { id: 'cerrado', label: 'Cerrado', dot: 'bg-green-500', bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20', iconBg: 'bg-green-500/20' },
]

const SOURCE_CONFIG = {
  whatsapp: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: MessageCircle, label: 'WhatsApp' },
  web: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Globe, label: 'Web' },
  idealista: { bg: 'bg-amber-100', text: 'text-amber-700', icon: Building2, label: 'Idealista' },
  fotocasa: { bg: 'bg-purple-100', text: 'text-purple-700', icon: Home, label: 'Fotocasa' },
  llamada: { bg: 'bg-indigo-100', text: 'text-indigo-700', icon: Phone, label: 'Llamada' },
  email: { bg: 'bg-sky-100', text: 'text-sky-700', icon: Mail, label: 'Email' },
  referencia: { bg: 'bg-gray-100', text: 'text-gray-700', icon: User, label: 'Referencia' },
  visita: { bg: 'bg-teal-100', text: 'text-teal-700', icon: MapPin, label: 'Visita' },
}

const DEFAULT_SOURCE = { bg: 'bg-gray-100', text: 'text-gray-600', icon: Globe, label: 'Otro' }

function getScoreInfo(score) {
  if (score == null) return { emoji: '', label: '—', barColor: 'bg-gray-200', textColor: 'text-gray-400', bgColor: 'bg-gray-50' }
  if (score > 70) return { emoji: '🔥', label: `${score}`, barColor: 'bg-red-500', textColor: 'text-red-400', bgColor: 'bg-red-500/10' }
  if (score >= 40) return { emoji: '🟡', label: `${score}`, barColor: 'bg-amber-500', textColor: 'text-amber-400', bgColor: 'bg-amber-500/10' }
  return { emoji: '❄️', label: `${score}`, barColor: 'bg-blue-500', textColor: 'text-blue-400', bgColor: 'bg-blue-500/10' }
}

function getInitials(name) {
  if (!name) return '??'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

function SourceBadge({ source }) {
  const key = source?.toLowerCase().trim()
  const config = SOURCE_CONFIG[key] || DEFAULT_SOURCE
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${config.bg} ${config.text}`}>
      <Icon size={10} />
      {config.label}
    </span>
  )
}

function ScoreIndicator({ score }) {
  const info = getScoreInfo(score)
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${info.bgColor} w-fit`}>
      <span className="text-xs leading-none">{info.emoji}</span>
      <span className={`text-xs font-semibold tabular-nums ${info.textColor}`}>
        {info.label}
      </span>
      {score != null && (
        <div className="w-12 h-1.5 rounded-full bg-white/60 overflow-hidden ml-1">
          <div
            className={`h-full rounded-full transition-all duration-500 ${info.barColor}`}
            style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
          />
        </div>
      )}
    </div>
  )
}

function QuickActions({ lead, onAction }) {
  const actions = [
    { icon: MessageCircle, href: `https://wa.me/${lead.phone?.replace(/[^0-9]/g, '')}`, label: 'WhatsApp', color: 'hover:text-emerald-600 hover:bg-emerald-50' },
    { icon: Phone, href: `tel:${lead.phone}`, label: 'Llamar', color: 'hover:text-blue-600 hover:bg-blue-50' },
    { icon: Mail, href: `mailto:${lead.email}`, label: 'Email', color: 'hover:text-sky-600 hover:bg-sky-50' },
    { icon: Calendar, href: '#', label: 'Calendario', color: 'hover:text-purple-600 hover:bg-purple-50' },
  ]
  return (
    <div className="flex items-center gap-0.5">
      {actions.map((action) => (
        <a
          key={action.label}
          href={action.href}
          target={action.href !== '#' ? '_blank' : undefined}
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation()
            if (action.href === '#') {
              e.preventDefault()
              onAction?.(action.label, lead)
            }
          }}
          className={`w-7 h-7 rounded-md flex items-center justify-center text-gray-400 opacity-0 group-hover:opacity-100 transition-all duration-200 ${action.color}`}
          title={action.label}
        >
          <action.icon size={14} />
        </a>
      ))}
    </div>
  )
}

function LeadCard({ lead, index, onSelect }) {
  const hasProperty = lead.propertyInterest || (lead.propertyType && lead.propertyType !== 'none')
  const hasLocation = lead.location || lead.propertyLocation

  return (
    <Draggable draggableId={lead.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onSelect(lead)}
          className={`group relative bg-surface rounded-xl border border-border-secondary shadow-sm hover:shadow-glow transition-all duration-200 cursor-pointer ${
            snapshot.isDragging ? 'shadow-elevated ring-2 ring-indigo-500/50 rotate-[2deg] scale-[1.02] z-50' : ''
          }`}
        >
          <div className="p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 shadow-sm">
                  {getInitials(lead.name)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate leading-tight">{lead.name || 'Sin nombre'}</p>
                  <p className="text-[11px] text-muted truncate leading-tight mt-0.5">
                    {lead.email || 'Sin email'}
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0 -mt-0.5">
                <ScoreIndicator score={lead.score} />
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-muted">
              {lead.phone && (
                <span className="flex items-center gap-1 truncate">
                  <Phone size={11} className="flex-shrink-0" />
                  <span>{lead.phone}</span>
                </span>
              )}
              {(lead.budget || lead.budget === 0) && lead.budget > 0 && (
                <span className="flex items-center gap-1 flex-shrink-0 font-medium text-text2">
                  <Euro size={11} />
                  {formatCurrency(lead.budget)}
                </span>
              )}
            </div>

            {(hasProperty || hasLocation) && (
              <div className="flex items-center gap-2 text-[11px] text-text2">
                {hasProperty && (
                  <span className="flex items-center gap-1 truncate">
                    <Home size={11} className="flex-shrink-0 text-text3" />
                    <span>{lead.propertyInterest || lead.propertyType}</span>
                  </span>
                )}
                {hasLocation && (
                  <span className="flex items-center gap-1 truncate">
                    <MapPin size={11} className="flex-shrink-0 text-text3" />
                    <span>{lead.location || lead.propertyLocation}</span>
                  </span>
                )}
              </div>
            )}

            {lead.insight && (
              <div className="flex items-start gap-1.5 text-[11px] text-text2 leading-relaxed bg-surface2 rounded-lg px-2.5 py-1.5">
                <Sparkles size={11} className="flex-shrink-0 mt-0.5 text-amber" />
                <span className="line-clamp-2">{lead.insight}</span>
              </div>
            )}

            {lead.last_contact_at && (
              <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-1">
                <Clock size={10} />
                <span>Contacto: {formatDistanceToNow(new Date(lead.last_contact_at), { addSuffix: true, locale: es })}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-0.5">
              <SourceBadge source={lead.source} />
              <QuickActions lead={lead} />
            </div>
          </div>
        </div>
      )}
    </Draggable>
  )
}

function ColumnEmptyState({ columnLabel }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2.5">
        <Target size={16} className="text-gray-300" />
      </div>
      <p className="text-xs text-gray-400 font-medium">Sin leads</p>
      <p className="text-[11px] text-gray-300 mt-0.5">Arrastra leads aquí</p>
    </div>
  )
}

function Column({ column, leads, onSelectLead, onAddLead }) {
  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      <div className="flex items-center gap-2 px-1 pb-3 group/header">
        <div className={`w-2.5 h-2.5 rounded-full ${column.dot} shadow-sm`} />
        <h3 className="text-sm font-semibold text-ink">{column.label}</h3>
        <span className={`ml-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md ${column.bg} ${column.text}`}>
          {leads.length}
        </span>
        <button
          onClick={() => onAddLead(column.id)}
          className="ml-auto p-1 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-md transition-all opacity-0 group-hover/header:opacity-100"
          title={`Añadir lead a ${column.label}`}
        >
          <Plus size={14} />
        </button>
      </div>

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 min-h-[200px] rounded-xl border-2 border-dashed transition-all duration-200 overflow-y-auto ${
              snapshot.isDraggingOver
                ? `${column.bg} ${column.border}`
                : 'border-transparent'
            }`}
            style={{ maxHeight: 'calc(100vh - 220px)' }}
          >
            <div className="p-1.5 space-y-2">
              {leads.length === 0 && !snapshot.isDraggingOver && (
                <ColumnEmptyState columnLabel={column.label} />
              )}
              {leads.map((lead, index) => (
                <LeadCard key={lead.id} lead={lead} index={index} onSelect={onSelectLead} />
              ))}
              {provided.placeholder}
            </div>
          </div>
        )}
      </Droppable>
    </div>
  )
}

function LeadDetailModal({ lead, onClose }) {
  if (!lead) return null

  const property = lead.propertyInterest || lead.propertyType || null
  const location = lead.location || lead.propertyLocation || null
  const scoreInfo = getScoreInfo(lead.score)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', duration: 0.4, bounce: 0.1 }}
          onClick={(e) => e.stopPropagation()}
          className="relative bg-surface rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto border border-border-secondary"
        >
          <div className="sticky top-0 bg-surface/90 backdrop-blur-md z-10 flex items-center justify-between px-6 py-4 border-b border-border-secondary">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold shadow-sm">
                {getInitials(lead.name)}
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink font-syne">{lead.name || 'Sin nombre'}</h2>
                <p className="text-xs text-gray-400">{lead.email || 'Sin email'}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Teléfono</p>
                <a href={`tel:${lead.phone}`} className="text-sm font-medium text-ink hover:text-blue-600 transition-colors flex items-center gap-1.5">
                  <Phone size={13} className="text-gray-400" />
                  {lead.phone || '—'}
                </a>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Presupuesto</p>
                <p className="text-sm font-semibold text-ink flex items-center gap-1.5">
                  <Euro size={13} className="text-gray-400" />
                  {lead.budget ? formatCurrency(lead.budget) : '—'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Origen</p>
                <SourceBadge source={lead.source} />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">IA Score</p>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${scoreInfo.bgColor}`}>
                  <span className="text-sm">{scoreInfo.emoji}</span>
                  <span className={`text-sm font-bold ${scoreInfo.textColor}`}>{scoreInfo.label}</span>
                </div>
              </div>
            </div>

            {(property || location) && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Interés</p>
                <div className="flex flex-wrap gap-2">
                  {property && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-300 text-sm font-medium border border-indigo-500/20">
                      <Home size={14} />
                      {property}
                    </span>
                  )}
                  {location && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface2 text-muted text-sm border border-border-secondary">
                      <MapPin size={14} />
                      {location}
                    </span>
                  )}
                </div>
              </div>
            )}

            {lead.insight && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Insight IA</p>
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <Sparkles size={16} className="flex-shrink-0 mt-0.5 text-amber" />
                  <p className="text-sm text-text2 leading-relaxed">{lead.insight}</p>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Acciones rápidas</p>
              <div className="flex items-center gap-2">
                {[
                  { icon: MessageCircle, href: `https://wa.me/${lead.phone?.replace(/[^0-9]/g, '')}`, label: 'WhatsApp', color: 'bg-emerald-500 hover:bg-emerald-600' },
                  { icon: Phone, href: `tel:${lead.phone}`, label: 'Llamar', color: 'bg-blue-500 hover:bg-blue-600' },
                  { icon: Mail, href: `mailto:${lead.email}`, label: 'Email', color: 'bg-sky-500 hover:bg-sky-600' },
                  { icon: Calendar, href: '#', label: 'Agendar', color: 'bg-purple-500 hover:bg-purple-600' },
                ].map((action) => (
                  <a
                    key={action.label}
                    href={action.href}
                    target={action.href !== '#' ? '_blank' : undefined}
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (action.href === '#') e.preventDefault()
                      e.stopPropagation()
                    }}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-white text-xs font-medium transition-all ${action.color} shadow-sm`}
                  >
                    <action.icon size={14} />
                    {action.label}
                  </a>
                ))}
              </div>
            </div>

            {lead.createdAt && (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400 pt-2 border-t border-border/30">
                <Clock size={12} />
                <span>Creado el {new Date(lead.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default function PipelinePage() {
  const { leads, fetchLeads, loading, moveLeadStatus, createLead } = useStore()
  const navigate = useNavigate()
  const [selectedLead, setSelectedLead] = useState(null)
  const [showAddModalForStage, setShowAddModalForStage] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    budget: '',
    property_interest: '',
    zone: '',
    source: 'manual'
  })

  useEffect(() => {
    fetchLeads()
  }, [])

  const groupedLeads = useMemo(() => {
    const groups = {}
    PIPELINE_COLUMNS.forEach((col) => {
      groups[col.id] = []
    })
    leads.forEach((lead) => {
      const status = lead.status || lead.pipeline_stage || 'nuevo'
      if (groups[status]) {
        groups[status].push(lead)
      }
    })
    return groups
  }, [leads])

  const totalLeads = leads.length

  const handleDragEnd = useCallback(
    (result) => {
      if (!result.destination) return
      const { draggableId, destination } = result
      const newStatus = destination.droppableId
      moveLeadStatus(draggableId, newStatus, destination.index)
    },
    [moveLeadStatus]
  )

  const handleSelectLead = useCallback((lead) => {
    navigate(`/leads/${lead.id}`)
  }, [navigate])

  const handleOpenAddModal = (stageId) => {
    setFormData({
      name: '',
      phone: '',
      email: '',
      budget: '',
      property_interest: '',
      zone: '',
      source: 'manual'
    })
    setShowAddModalForStage(stageId)
  }

  const handleCreateLead = async () => {
    if (!formData.name.trim()) return
    try {
      setSaving(true)
      const payload = {
        ...formData,
        budget: formData.budget ? parseFloat(formData.budget) : 0,
        status: showAddModalForStage,
        pipeline_stage: showAddModalForStage
      }
      await createLead(payload)
      toast.success('Lead creado correctamente')
      setShowAddModalForStage(null)
      fetchLeads()
    } catch (e) {
      console.error(e)
      toast.error('Error al crear lead: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading.leads && leads.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center text-white shadow-sm">
            <Columns3 size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink font-syne">Pipeline</h1>
            <p className="text-sm text-muted">Gestiona el embudo de ventas</p>
          </div>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin" />
            <p className="text-sm text-muted">Cargando leads...</p>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center text-white shadow-sm">
            <Columns3 size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink font-syne">Pipeline</h1>
            <p className="text-sm text-muted">
              {totalLeads} {totalLeads === 1 ? 'lead' : 'leads'} en el embudo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {PIPELINE_COLUMNS.map((col) => (
            <div key={col.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border-secondary shadow-sm">
              <div className={`w-2 h-2 rounded-full ${col.dot}`} />
              <span className="text-[11px] font-medium text-muted">{col.label.split(' ')[0]}</span>
              <span className={`text-[11px] font-semibold ${col.text}`}>{groupedLeads[col.id]?.length || 0}</span>
            </div>
          ))}
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 pb-4 overflow-x-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
          {PIPELINE_COLUMNS.map((column) => (
            <Column
              key={column.id}
              column={column}
              leads={groupedLeads[column.id] || []}
              onSelectLead={handleSelectLead}
              onAddLead={handleOpenAddModal}
            />
          ))}
        </div>
      </DragDropContext>

      <AnimatePresence>
        {showAddModalForStage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowAddModalForStage(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#13131A] rounded-2xl shadow-modal border border-[#1E1E2E] w-full max-w-lg p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold font-syne text-[#F1F5F9]">
                  Nuevo Lead en etapa: <span className="text-indigo-400 capitalize">{PIPELINE_COLUMNS.find(c => c.id === showAddModalForStage)?.label}</span>
                </h2>
                <button onClick={() => setShowAddModalForStage(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-400 block mb-1">Nombre completo *</label>
                  <input
                    type="text" value={formData.name}
                    onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ej: Juan Pérez"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#0A0A0F] border border-[#1E1E2E] text-white rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 block mb-1">Teléfono</label>
                  <input
                    type="text" value={formData.phone}
                    onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+34 600 000 000"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#0A0A0F] border border-[#1E1E2E] text-white rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 block mb-1">Email</label>
                  <input
                    type="email" value={formData.email}
                    onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                    placeholder="juan@email.com"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#0A0A0F] border border-[#1E1E2E] text-white rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 block mb-1">Presupuesto (€)</label>
                  <input
                    type="number" value={formData.budget}
                    onChange={e => setFormData(f => ({ ...f, budget: e.target.value }))}
                    placeholder="300000"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#0A0A0F] border border-[#1E1E2E] text-white rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 block mb-1">Tipo de propiedad de interés</label>
                  <input
                    type="text" value={formData.property_interest}
                    onChange={e => setFormData(f => ({ ...f, property_interest: e.target.value }))}
                    placeholder="Apartamento, Casa..."
                    className="w-full px-3.5 py-2.5 text-sm bg-[#0A0A0F] border border-[#1E1E2E] text-white rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 block mb-1">Zona de interés</label>
                  <input
                    type="text" value={formData.zone}
                    onChange={e => setFormData(f => ({ ...f, zone: e.target.value }))}
                    placeholder="Centro, Sur..."
                    className="w-full px-3.5 py-2.5 text-sm bg-[#0A0A0F] border border-[#1E1E2E] text-white rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 block mb-1">Origen del lead</label>
                  <select
                    value={formData.source}
                    onChange={e => setFormData(f => ({ ...f, source: e.target.value }))}
                    className="w-full px-3.5 py-2.5 text-sm bg-[#0A0A0F] border border-[#1E1E2E] text-white rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                  >
                    <option value="manual">Manual (Añadido por comercial)</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="web">Sitio Web</option>
                    <option value="idealista">Idealista</option>
                    <option value="email">Email corporativo</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-6">
                <button
                  onClick={() => setShowAddModalForStage(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateLead}
                  disabled={saving || !formData.name.trim()}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-glow transition-all"
                >
                  {saving ? 'Creando...' : 'Crear Lead'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
