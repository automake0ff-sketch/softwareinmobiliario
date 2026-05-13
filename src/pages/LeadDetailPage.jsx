import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Phone, Mail, MessageCircle, MapPin, Target,
  User, Building2, Star, TrendingUp, Calendar, Clock,
  FileText, Bot, AlertCircle, CheckCircle, Zap, Send,
  DollarSign, Home, ThumbsUp, Bell, Sparkles,
  MessageSquare, Activity, Eye, Edit3, Share2
} from 'lucide-react'
import { useStore } from '../lib/store'
import {
  formatCurrency, formatDate, formatFullDate, getScoreColor,
  getScoreLabel, getScoreBg, getStatusLabel, getStatusColor,
  getInitials
} from '../utils/formatters'

const initialLead = {
  id: '1', name: 'María García López', phone: '+34 612 345 678',
  email: 'maria.garcia@email.com', budget: 350000, property_interest: 'Ático',
  zone: 'Centro', source: 'whatsapp', ia_score: 92, status: 'qualified',
  assigned_to: 'Carlos Ruiz', assigned_to_email: 'carlos@inmobiliaria.com',
  created_at: '2026-05-10T09:30:00Z', updated_at: '2026-05-11T14:20:00Z',
  notes: 'Cliente interesada en áticos de lujo en la zona centro. Busca 3 habitaciones, terraza y garaje. Presupuesto flexible hasta 400.000€.',
  ia_summary: 'María es una lead de alta calidad con un score del 92%. Su perfil indica una alta intención de compra, con un presupuesto sólido y preferencias muy claras. Ha interactuado a través de WhatsApp mostrando gran responsiveness. Se recomienda priorizar su atención y agendar una visita al ático ref. AT-234 lo antes posible. Historial de búsqueda sugiere que valora especialmente las terrazas amplias y la luz natural.',
}

const initialActivities = [
  { id: 'a1', type: 'whatsapp', description: 'Contacto inicial vía WhatsApp', timestamp: '2026-05-10T09:30:00Z', user: 'Sistema' },
  { id: 'a2', type: 'call', description: 'Llamada de cualificación - 12 min', timestamp: '2026-05-10T11:00:00Z', user: 'Carlos Ruiz' },
  { id: 'a3', type: 'email', description: 'Envío de catálogo de áticos', timestamp: '2026-05-10T12:15:00Z', user: 'Carlos Ruiz' },
  { id: 'a4', type: 'viewing', description: 'Visita virtual al ático ref. AT-234', timestamp: '2026-05-11T10:00:00Z', user: 'Carlos Ruiz' },
  { id: 'a5', type: 'note', description: 'Actualización de presupuesto a 400.000€', timestamp: '2026-05-11T14:20:00Z', user: 'Carlos Ruiz' },
  { id: 'a6', type: 'system', description: 'IA Score actualizado: 92 (Excelente)', timestamp: '2026-05-11T14:20:00Z', user: 'IA Agent' },
]

const initialRecommendations = [
  { id: 'r1', title: 'Enviar propuesta personalizada', description: 'Basado en su interés por terrazas, enviar ático con terraza de 40m²', impact: 'high', action: 'Enviar ahora' },
  { id: 'r2', title: 'Seguimiento telefónico', description: 'Hace 3 días que no hay contacto. Recomendable llamar hoy.', impact: 'medium', action: 'Llamar' },
  { id: 'r3', title: 'Agendar visita presencial', description: 'Tras la visita virtual, el siguiente paso es una visita física.', impact: 'high', action: 'Agendar' },
]

const initialMatches = [
  { id: 'p1', title: 'Ático con terraza - Centro', price: 385000, type: 'penthouse', zone: 'Centro', beds: 3, baths: 2, surface: 120, match: 95 },
  { id: 'p2', title: 'Ático dúplex - Centro', price: 420000, type: 'penthouse', zone: 'Centro', beds: 3, baths: 2, surface: 140, match: 88 },
  { id: 'p3', title: 'Apartamento lujo - Centro', price: 350000, type: 'apartment', zone: 'Centro', beds: 3, baths: 1, surface: 95, match: 82 },
]

const initialMessages = [
  { id: 'm1', from: 'lead', text: 'Hola, me interesa el ático que vi en su web. ¿Podría darme más información?', timestamp: '2026-05-10T09:30:00Z' },
  { id: 'm2', from: 'agent', text: '¡Hola María! Por supuesto. Tenemos un ático espectacular en el Centro con 3 habitaciones y terraza de 40m². ¿Te gustaría recibir más detalles?', timestamp: '2026-05-10T09:32:00Z' },
  { id: 'm3', from: 'lead', text: 'Sí, me encantaría. ¿Tiene garaje incluido?', timestamp: '2026-05-10T09:35:00Z' },
  { id: 'm4', from: 'agent', text: 'Sí, incluye plaza de garaje y trastero. El precio es de 385.000€. ¿Te gustaría agendar una visita virtual?', timestamp: '2026-05-10T09:38:00Z' },
  { id: 'm5', from: 'lead', text: 'Perfecto, sí. ¿Podemos hacerla mañana a las 10?', timestamp: '2026-05-10T09:40:00Z' },
  { id: 'm6', from: 'agent', text: 'Agendado. Te enviaré el enlace para la videollamada. ¡Gracias María!', timestamp: '2026-05-10T09:45:00Z' },
]

const activityIcons = {
  whatsapp: MessageCircle, call: Phone, email: Mail,
  viewing: Eye, note: FileText, system: Bot
}

const activityColors = {
  whatsapp: 'text-green-500 bg-green-50',
  call: 'text-blue-500 bg-blue-50',
  email: 'text-purple-500 bg-purple-50',
  viewing: 'text-amber-500 bg-amber-50',
  note: 'text-slate-500 bg-slate-50',
  system: 'text-cyan-500 bg-cyan-50',
}

export default function LeadDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { leads } = useStore()
  const [activeTab, setActiveTab] = useState('activity')
  const [newMessage, setNewMessage] = useState('')
  const [messages, setMessages] = useState(initialMessages)
  const [showActions, setShowActions] = useState(false)

  const lead = useMemo(() => {
    const found = leads.find(l => l.id === id)
    return found || initialLead
  }, [leads, id])

  const tabs = [
    { id: 'activity', label: 'Actividad', icon: Activity },
    { id: 'conversations', label: 'Conversaciones', icon: MessageSquare },
    { id: 'recommendations', label: 'Recomendaciones', icon: Sparkles },
  ]

  const container = {
    hidden: { opacity: 0 },
    show: { transition: { staggerChildren: 0.05 } }
  }
  const itemAnim = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 }
  }

  const handleSendMessage = () => {
    if (!newMessage.trim()) return
    setMessages(prev => [...prev, {
      id: String(Date.now()),
      from: 'agent',
      text: newMessage.trim(),
      timestamp: new Date().toISOString()
    }])
    setNewMessage('')
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6 max-w-7xl"
    >
      <button
        onClick={() => navigate('/leads')}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
        Volver a leads
      </button>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-border p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-blue-500 flex items-center justify-center text-lg font-bold shrink-0 shadow-sm">
              {getInitials(lead.name)}
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-ink font-syne">{lead.name}</h1>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${getStatusColor(lead.status)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    lead.status === 'new' ? 'bg-blue-300' :
                    lead.status === 'contacted' ? 'bg-gold-300' :
                    lead.status === 'qualified' ? 'bg-ok' :
                    lead.status === 'proposal' ? 'bg-warn' :
                    lead.status === 'negotiation' ? 'bg-err' :
                    lead.status === 'closed_won' ? 'bg-ok' :
                    lead.status === 'closed_lost' ? 'bg-err' :
                    'bg-muted'
                  }`} />
                  {getStatusLabel(lead.status)}
                </span>
              </div>
              <p className="text-sm text-muted mt-0.5">Lead ID: #{lead.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border ${getScoreBg(lead.ia_score)}`}>
              <div className={`text-lg font-bold ${getScoreColor(lead.ia_score)}`}>{lead.ia_score}</div>
              <div className="text-left">
                <p className="text-[10px] font-semibold text-muted uppercase leading-tight">IA Score</p>
                <p className={`text-xs font-medium ${getScoreColor(lead.ia_score)}`}>{getScoreLabel(lead.ia_score)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-surface/50 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Información de contacto</h3>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                  <Phone size={14} />
                </div>
                <a href={`tel:${lead.phone}`} className="text-ink hover:text-blue-500 transition-colors">{lead.phone}</a>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-500 flex items-center justify-center shrink-0">
                  <Mail size={14} />
                </div>
                <a href={`mailto:${lead.email}`} className="text-ink hover:text-blue-500 transition-colors break-all">{lead.email}</a>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
                  <DollarSign size={14} />
                </div>
                <span className="text-ink font-medium">{formatCurrency(lead.budget)}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-green-50 text-green-500 flex items-center justify-center shrink-0">
                  <MapPin size={14} />
                </div>
                <span className="text-ink">{lead.zone}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-500 flex items-center justify-center shrink-0">
                  <Home size={14} />
                </div>
                <span className="text-ink">{lead.property_interest}</span>
              </div>
            </div>

            <div className="bg-surface/50 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Origen</h3>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                  <MessageCircle size={14} />
                </div>
                <span className="capitalize text-ink font-medium">{lead.source}</span>
              </div>
            </div>

            <div className="bg-surface/50 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Asignado a</h3>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-500 flex items-center justify-center text-sm font-bold">
                  {getInitials(lead.assigned_to)}
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">{lead.assigned_to}</p>
                  <p className="text-xs text-muted">{lead.assigned_to_email}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all text-sm font-medium shadow-sm">
                <MessageCircle size={16} />
                WhatsApp
              </button>
              <button className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all text-sm font-medium shadow-sm">
                <Phone size={16} />
                Llamar
              </button>
              <button className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-all text-sm font-medium shadow-sm">
                <Mail size={16} />
                Email
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-xl p-4 border border-blue-100">
              <div className="flex items-center gap-2 mb-2">
                <Bot size={16} className="text-blue-500" />
                <h3 className="text-xs font-semibold text-blue-500 uppercase tracking-wider">Resumen IA</h3>
              </div>
              <p className="text-sm text-ink leading-relaxed">{lead.ia_summary}</p>
            </div>

            <div className="bg-surface/50 rounded-xl">
              <div className="flex border-b border-border">
                {tabs.map(tab => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
                        activeTab === tab.id
                          ? 'text-blue-500 border-blue-500'
                          : 'text-muted border-transparent hover:text-ink'
                      }`}
                    >
                      <Icon size={16} />
                      {tab.label}
                    </button>
                  )
                })}
              </div>

              <AnimatePresence mode="wait">
                {activeTab === 'activity' && (
                  <motion.div
                    key="activity"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-4 space-y-3 max-h-[400px] overflow-y-auto"
                  >
                    {initialActivities.length === 0 ? (
                      <div className="text-center py-8 text-muted text-sm">Sin actividad registrada</div>
                    ) : (
                      initialActivities.map((act, i) => {
                        const Icon = activityIcons[act.type] || Activity
                        const colorClass = activityColors[act.type] || 'text-muted bg-surface2'
                        return (
                          <motion.div
                            key={act.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="flex items-start gap-3 p-3 rounded-xl hover:bg-white transition-colors"
                          >
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
                              <Icon size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-ink">{act.description}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-muted">{act.user}</span>
                                <span className="w-1 h-1 rounded-full bg-muted2" />
                                <span className="text-xs text-muted">{formatFullDate(act.timestamp)}</span>
                              </div>
                            </div>
                          </motion.div>
                        )
                      })
                    )}
                  </motion.div>
                )}

                {activeTab === 'conversations' && (
                  <motion.div
                    key="conversations"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex flex-col h-[400px]"
                  >
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {messages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.from === 'agent' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                            msg.from === 'agent'
                              ? 'bg-blue-500 text-white rounded-br-md'
                              : 'bg-surface2 text-ink rounded-bl-md'
                          }`}>
                            <p className="text-sm leading-relaxed">{msg.text}</p>
                            <p className={`text-[10px] mt-1 ${msg.from === 'agent' ? 'text-blue-200' : 'text-muted'}`}>
                              {formatDate(msg.timestamp)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-border p-3 flex items-center gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Escribe un mensaje..."
                        className="flex-1 px-4 py-2.5 text-sm bg-surface border border-border rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                      />
                      <button
                        onClick={handleSendMessage}
                        className="p-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all"
                      >
                        <Send size={16} />
                      </button>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'recommendations' && (
                  <motion.div
                    key="recommendations"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-4 space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {initialRecommendations.map(rec => (
                        <div key={rec.id} className="bg-white rounded-xl border border-border p-4 hover:shadow-sm transition-all">
                          <div className="flex items-start gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              rec.impact === 'high' ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-500'
                            }`}>
                              {rec.impact === 'high' ? <AlertCircle size={16} /> : <Bell size={16} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-semibold text-ink">{rec.title}</h4>
                              <p className="text-xs text-muted mt-1">{rec.description}</p>
                              <button className="mt-2 text-xs font-medium text-blue-500 hover:text-blue-600 transition-colors">
                                {rec.action} →
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                        <TrendingUp size={16} className="text-blue-500" />
                        Propiedades recomendadas para {lead.name}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {initialMatches.map((property, i) => (
                          <motion.div
                            key={property.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.08 }}
                            className="bg-white rounded-xl border border-border overflow-hidden hover:shadow-sm transition-all group cursor-pointer"
                          >
                            <div className="h-28 bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center relative">
                              <Home size={32} className="text-blue-300/60" />
                              <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                property.match >= 90 ? 'bg-ok/10 text-ok' : 'bg-blue-50 text-blue-500'
                              }`}>
                                {property.match}% match
                              </div>
                            </div>
                            <div className="p-3">
                              <p className="text-sm font-semibold text-ink group-hover:text-blue-500 transition-colors truncate">{property.title}</p>
                              <p className="text-sm font-bold text-ink mt-1">{formatCurrency(property.price)}</p>
                              <div className="flex items-center gap-2 mt-1.5 text-xs text-muted">
                                <span>{property.beds} hab</span>
                                <span className="w-1 h-1 rounded-full bg-muted2" />
                                <span>{property.baths} baños</span>
                                <span className="w-1 h-1 rounded-full bg-muted2" />
                                <span>{property.surface}m²</span>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
