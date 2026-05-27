import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Phone, Mail, MessageCircle, MapPin, DollarSign,
  Home, User, Building2, Star, TrendingUp, Calendar, CheckCircle,
  Zap, Send, Sparkles, MessageSquare, Activity, Eye, Edit3, X,
  Clock, Plus, Circle, CheckSquare, Settings, Play, ShieldAlert,
  Bot, Handshake, RefreshCw, Loader2, Target
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import {
  formatCurrency, formatDate, formatFullDate, getScoreColor,
  getScoreLabel, getScoreBg, getStatusLabel, getStatusColor,
  getInitials, getStatusDot
} from '../utils/formatters'

const activityIcons = {
  whatsapp: MessageCircle, call: Phone, email: Mail,
  viewing: Eye, note: FileText, system: Bot,
  lead_created: User, lead_assigned: User, status_change: TrendingUp,
  stage_changed: TrendingUp, status_changed: TrendingUp,
  lead_updated: Edit3, lead_deleted: X, ia_action: Bot,
  ia_response: Bot, ia_welcome: Bot, ia_insight: Sparkles,
  conversation: MessageSquare, visit: Calendar, task: CheckCircle,
  automation: Zap, automation_triggered: Zap,
  email_sent: Mail, whatsapp_sent: MessageCircle,
  appointment_scheduled: Calendar, appointment_confirmed: CheckCircle,
  appointment_cancelled: X, appointment_rescheduled: Clock,
  appointment_updated: Edit3,
}

const activityColors = {
  whatsapp: 'text-green-400 bg-green-500/10',
  call: 'text-blue-400 bg-blue-500/10',
  email: 'text-purple-400 bg-purple-500/10',
  viewing: 'text-amber-400 bg-amber-500/10',
  note: 'text-slate-400 bg-slate-500/10',
  system: 'text-cyan-400 bg-cyan-500/10',
  lead_created: 'text-emerald-400 bg-emerald-500/10',
  lead_assigned: 'text-indigo-400 bg-indigo-500/10',
  status_change: 'text-orange-400 bg-orange-500/10',
  stage_changed: 'text-orange-400 bg-orange-500/10',
  lead_updated: 'text-slate-400 bg-slate-500/10',
  ia_action: 'text-purple-400 bg-purple-500/10',
  ia_insight: 'text-amber-400 bg-amber-500/10',
  conversation: 'text-blue-400 bg-blue-500/10',
  visit: 'text-teal-400 bg-teal-500/10',
  task: 'text-cyan-400 bg-cyan-500/10',
  automation: 'text-rose-400 bg-rose-500/10',
  automation_triggered: 'text-rose-400 bg-rose-500/10',
  email_sent: 'text-purple-400 bg-purple-500/10',
  whatsapp_sent: 'text-green-400 bg-green-500/10',
  appointment_scheduled: 'text-pink-400 bg-pink-500/10',
  appointment_confirmed: 'text-emerald-400 bg-emerald-500/10',
  appointment_cancelled: 'text-rose-400 bg-rose-500/10',
  appointment_rescheduled: 'text-amber-400 bg-amber-500/10',
  appointment_updated: 'text-blue-400 bg-blue-500/10',
}

function parseImagesProperty(val) {
  if (!val) return []
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch {}
    return val.split(',').map(s => s.trim()).filter(Boolean)
  }
  return Array.isArray(val) ? val : []
}

function parseFeaturesList(val) {
  if (!val) return []
  try {
    if (typeof val === 'string') return JSON.parse(val)
    return Array.isArray(val) ? val : []
  } catch {
    return []
  }
}

function FileText(props) {
  return <Eye {...props} />
}

function ActivityIcon({ type }) {
  const Icon = activityIcons[type] || Activity
  const color = activityColors[type] || 'text-white/40 bg-white/5'
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border border-white/5 ${color}`}>
      <Icon size={15} />
    </div>
  )
}

export default function LeadDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  // Base lead states
  const [lead, setLead] = useState(null)
  const [activities, setActivities] = useState([])
  const [conversations, setConversations] = useState([])
  const [insights, setInsights] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('conversacion')

  // Email modal states
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailRecipient, setEmailRecipient] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)

  // Appointment modal states
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)
  const [apptType, setApptType] = useState('online')
  const [apptStartsAt, setApptStartsAt] = useState('')
  const [apptDuration, setApptDuration] = useState(30)
  const [apptLocation, setApptLocation] = useState('')
  const [apptOnlineUrl, setApptOnlineUrl] = useState('')
  const [apptAttendant, setApptAttendant] = useState('')
  const [apptNotes, setApptNotes] = useState('')
  const [savingAppt, setSavingAppt] = useState(false)
  const [appointments, setAppointments] = useState([])

  // Properties matching tab states
  const [matchedProperties, setMatchedProperties] = useState([])
  const [matchInsight, setMatchInsight] = useState('')
  const [matchingLoading, setMatchingLoading] = useState(false)

  // Chat tab states
  const [activeConv, setActiveConv] = useState(null)
  const [chatMessage, setChatMessage] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [convMessages, setConvMessages] = useState([])
  const [togglingIA, setTogglingIA] = useState(false)
  const messagesEndRef = useRef(null)

  // New task form states
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [savingTask, setSavingTask] = useState(false)

  // Agent execution floating states
  const [runningAgent, setRunningAgent] = useState(null)
  const [agentOutput, setAgentOutput] = useState('')
  const [agentsList, setAgentsList] = useState([])

  // Auto email states
  const [autoEmailLoading, setAutoEmailLoading] = useState(false)
  const [autoEmailData, setAutoEmailData] = useState(null)
  const [autoEmailSending, setAutoEmailSending] = useState(false)
  const [autoSendFuture, setAutoSendFuture] = useState(false)
  const [showScheduleOptions, setShowScheduleOptions] = useState(false)
  const [scheduledDate, setScheduledDate] = useState('')

  // Auto appointment states
  const [autoApptLoading, setAutoApptLoading] = useState(false)
  const [autoApptSuggestion, setAutoApptSuggestion] = useState(null)
  const [autoWaOnAppointment, setAutoWaOnAppointment] = useState(true)
  const [showClientPreview, setShowClientPreview] = useState(false)

  // Qualifier result
  const [qualifierResult, setQualifierResult] = useState(null)
  const [qualifierLoading, setQualifierLoading] = useState(false)

  // Sales agent result
  const [salesAgentResult, setSalesAgentResult] = useState(null)
  const [salesAgentLoading, setSalesAgentLoading] = useState(false)
  const [salesAgentSuggestion, setSalesAgentSuggestion] = useState(null)

  // WhatsApp panel states
  const [showWaModal, setShowWaModal] = useState(false)
  const [waMessage, setWaMessage] = useState('')
  const [agencyConfig, setAgencyConfig] = useState(null)
  const [waPanelMessage, setWaPanelMessage] = useState('')
  const [sendingWaFromPanel, setSendingWaFromPanel] = useState(false)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Set recipient when modal is opened
  useEffect(() => {
    if (lead) {
      setEmailRecipient(lead.email || '')
    }
  }, [showEmailModal, lead])

  // Get agency defaults when appointment modal is opened
  useEffect(() => {
    if (showAppointmentModal) {
      api.get('/agency/config').then(cfg => {
        setApptAttendant(cfg.appointment_attendant_name || '')
        setApptOnlineUrl(cfg.online_meeting_url || '')
        setApptLocation(cfg.address || '')
      }).catch(console.error)
    }
  }, [showAppointmentModal])

  const handleSelectTemplate = (templateName) => {
    if (!lead) return;
    const name = lead.name || 'cliente';
    
    const templates = {
      first_contact: {
        subject: `Hola ${name}, un placer contactar contigo`,
        body: `Hola ${name},\n\nGracias por ponerte en contacto con nosotros. He revisado tu solicitud y me gustaría programar una breve llamada para entender mejor tus necesidades de vivienda y recomendarte las mejores propiedades compatibles.\n\n¿Qué día te vendría bien?\n\nUn cordial saludo.`
      },
      send_properties: {
        subject: `Propiedades seleccionadas para ti - Stock Exclusivo`,
        body: `Hola ${name},\n\nHemos seleccionado una serie de inmuebles que encajan perfectamente con tus criterios de búsqueda, zona y presupuesto.\n\nQuedo a tu entera disposición si deseas que agendemos una visita para conocerlas en detalle.\n\nUn saludo.`
      },
      follow_up: {
        subject: `Seguimiento de tu búsqueda de vivienda`,
        body: `Hola ${name},\n\nQuería contactar contigo para ver si has tenido oportunidad de revisar las últimas opciones enviadas, o si has modificado tus preferencias de compra/alquiler.\n\nSeguimos a tu entera disposición.\n\nSaludos cordiales.`
      },
      confirm_appt: {
        subject: `Confirmación de cita programada`,
        body: `Hola ${name},\n\nTe escribo para confirmarte que hemos programado la cita acordada de forma correcta. En breves instantes recibirás todos los detalles específicos de acceso o ubicación.\n\n¡Gracias por tu confianza!`
      }
    };

    if (templateName && templates[templateName]) {
      setEmailSubject(templates[templateName].subject);
      setEmailBody(templates[templateName].body);
    } else {
      setEmailSubject('');
      setEmailBody('');
    }
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim() || !lead) return
    setSendingEmail(true)
    try {
      await api.post(`/leads/${lead.id}/email`, {
        recipient: emailRecipient.trim(),
        subject: emailSubject.trim(),
        body: emailBody.trim()
      })
      toast.success('Email enviado con éxito')
      setShowEmailModal(false)
      setEmailSubject('')
      setEmailBody('')
      loadLeadDetails() // reload timeline activities
    } catch (e) {
      toast.error(e.message || 'Error al enviar el email')
    } finally {
      setSendingEmail(false)
    }
  }

  const handleCreateAppointment = async (e) => {
    e.preventDefault()
    if (!apptStartsAt || !lead) return
    
    if (new Date(apptStartsAt) <= new Date()) {
      toast.error('La fecha y hora de la cita deben ser futuras')
      return
    }

    setSavingAppt(true)
    
    const starts = new Date(apptStartsAt).toISOString();
    const ends = new Date(new Date(apptStartsAt).getTime() + apptDuration * 60000).toISOString();

    try {
      await api.post(`/leads/${lead.id}/appointments`, {
        type: apptType,
        starts_at: starts,
        ends_at: ends,
        location: apptType === 'physical' ? apptLocation : null,
        online_url: apptType === 'online' ? apptOnlineUrl : null,
        notes: apptNotes.trim(),
        attendant_name: apptAttendant.trim()
      })
      toast.success('Cita programada con éxito. Mensajes de confirmación enviados.')
      setShowAppointmentModal(false)
      setApptStartsAt('')
      setApptNotes('')
      loadLeadDetails() // refresh activities & appointments
    } catch (e) {
      toast.error(e.message || 'Error al programar la cita')
    } finally {
      setSavingAppt(false)
    }
  }

  // Load Lead details on mount and tab changes
  const loadLeadDetails = () => {
    if (!id) return
    api.get(`/leads/${id}`).then(data => {
      setLead(data.lead || data)
      setActivities(data.activities || [])
      setConversations(data.conversations || [])
      setInsights(data.insights || [])
      setTasks(data.tasks || [])

      // Fetch appointments!
      api.get(`/leads/${id}/appointments`).then(appts => {
        setAppointments(appts || [])
      }).catch(console.error)

      // Set active conversation
      const convList = data.conversations || [];
      if (convList.length > 0) {
        setActiveConv(convList[0]);
        setConvMessages(convList[0].messages || []);
      }
    }).catch(e => {
      console.error('Error loading lead detail:', e)
      toast.error('Error al cargar la información del lead')
    }).finally(() => {
      setLoading(false)
    })
  }

  // Build pre-configured WhatsApp message when lead loads
  useEffect(() => {
    if (lead) {
      const name = lead.name || 'cliente'
      const interest = lead.property_interest ? ` para ${lead.property_interest}` : ''
      const zone = lead.zone ? ` en ${lead.zone}` : ''
      const budget = lead.budget ? ` con un presupuesto de ${formatCurrency(lead.budget)}` : ''
      const agName = agencyConfig?.name || 'nuestra inmobiliaria'
      const msg = `Hola ${name} 👋, soy del equipo de ${agName}. Me pongo en contacto contigo porque vimos tu interés${interest}${zone}${budget}. ¿Tienes unos minutos para comentarnos qué estás buscando exactamente? Estaremos encantados de ayudarte 🏠`
      setWaPanelMessage(msg)
    }
  }, [lead, agencyConfig])

  useEffect(() => {
    setLoading(true)
    loadLeadDetails()

    // Fetch agents list for quick execution
    api.get('/agents').then(data => {
      if (Array.isArray(data)) setAgentsList(data)
    }).catch(console.error)

    // Fetch agency config for WhatsApp message
    api.get('/agency/config').then(cfg => {
      setAgencyConfig(cfg)
    }).catch(console.error)
  }, [id])

  // Scroll to bottom when new messages come
  useEffect(() => {
    if (activeTab === 'conversacion') {
      scrollToBottom()
    }
  }, [convMessages, activeTab])

  // Load matched properties when properties tab is selected
  useEffect(() => {
    if (activeTab === 'propiedades' && id) {
      setMatchingLoading(true)
      api.post('/properties/match-lead', { lead_id: id }).then(data => {
        setMatchedProperties(data.properties || [])
        setMatchInsight(data.match || '')
      }).catch(e => {
        console.error('Error matching properties:', e)
      }).finally(() => {
        setMatchingLoading(false)
      })
    }
  }, [activeTab, id])

  // Change lead stage
  const handleStageChange = async (newStage) => {
    if (!lead) return
    const prevStage = lead.pipeline_stage || lead.status;
    // Optimistic update
    setLead(prev => ({ ...prev, pipeline_stage: newStage, status: newStage }))

    try {
      await api.patch(`/leads/${lead.id}`, { pipeline_stage: newStage })
      toast.success(`Etapa cambiada a ${getStatusLabel(newStage)}`)
      loadLeadDetails() // reload activities
    } catch (e) {
      setLead(prev => ({ ...prev, pipeline_stage: prevStage, status: prevStage }))
      toast.error('Error al actualizar la etapa')
    }
  }

  // Active chat: Send message
  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!chatMessage.trim() || !activeConv) return
    setSendingMsg(true)
    const msgContent = chatMessage.trim()
    setChatMessage('')

    try {
      const sent = await api.post(`/conversations/${activeConv.id}/messages`, { content: msgContent })
      // Append optimistically
      setConvMessages(prev => [...prev, sent])
      loadLeadDetails() // refresh last contact
    } catch (err) {
      toast.error('Error al enviar el mensaje')
    } finally {
      setSendingMsg(false)
    }
  }

  // Open WhatsApp with custom message from panel
  const handleOpenWhatsApp = async (customMsg) => {
    if (!lead) return
    const phone = String(lead.phone || '').replace(/[\s\-\(\)\+]/g, '')
    if (!phone) { toast.error('Este lead no tiene número de teléfono registrado'); return }
    const fullPhone = phone.startsWith('34') ? phone : `34${phone}`
    const msg = customMsg || waPanelMessage
    if (!msg.trim()) { toast.error('El mensaje no puede estar vacío'); return }

    setSendingWaFromPanel(true)
    // Open WhatsApp directly
    window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`, '_blank')

    // Register conversation in CRM
    try {
      const conv = await api.post('/conversations', { lead_id: lead.id, channel: 'whatsapp', content: msg })
      setActiveConv(conv)
      setConvMessages(conv.messages || [])
      setConversations([conv])
      toast.success('✅ WhatsApp abierto y conversación registrada en el CRM')
      loadLeadDetails()
    } catch (e) { /* already exists or error, just continue */ }
    finally { setSendingWaFromPanel(false) }
  }

  // Legacy alias for backward compatibility
  const handleOpenWaModal = handleOpenWhatsApp

  // Quick WA templates
  const waTemplates = [
    {
      id: 'primer_contacto',
      label: '👋 Primer contacto',
      build: (lead, agency) => `Hola ${lead.name || ''} 👋, soy del equipo de ${agency}. Me pongo en contacto contigo porque vimos tu interés en nuestra oferta inmobiliaria. ¿Tienes unos minutos para contarnos qué estás buscando? 🏠`
    },
    {
      id: 'seguimiento',
      label: '🔄 Seguimiento',
      build: (lead, agency) => `Hola ${lead.name || ''}, te contacto desde ${agency} para hacerte un seguimiento de tu búsqueda de vivienda. ¿Has encontrado algo que te interese o quieres que te enviemos nuevas opciones?`
    },
    {
      id: 'propiedades',
      label: '🏡 Enviar propiedades',
      build: (lead, agency) => `Hola ${lead.name || ''} 😊, desde ${agency} hemos seleccionado varias propiedades que encajan perfectamente con tus criterios${lead.zone ? ` en ${lead.zone}` : ''}${lead.budget ? ` y tu presupuesto de ${formatCurrency(lead.budget)}` : ''}. ¿Te gustaría que te las enviásemos?`
    },
    {
      id: 'agendar_visita',
      label: '📅 Agendar visita',
      build: (lead, agency) => `Hola ${lead.name || ''}, te escribo desde ${agency}. Tenemos una propiedad que creemos que te va a encantar. ¿Te vendría bien esta semana para hacer una visita? ¡Sólo nos llevaría 30 minutos! 🔑`
    },
    {
      id: 'confirmacion_cita',
      label: '✅ Confirmar cita',
      build: (lead, agency) => `Hola ${lead.name || ''} 👋 Te confirmo la cita que tenemos programada. Ante cualquier cambio o duda, estoy a tu disposición. ¡Hasta pronto! — Equipo ${agency}`
    }
  ]

  const applyWaTemplate = (templateId) => {
    const tpl = waTemplates.find(t => t.id === templateId)
    if (!tpl || !lead) return
    const agency = agencyConfig?.name || 'nuestra inmobiliaria'
    setWaPanelMessage(tpl.build(lead, agency))
  }

  // Toggle conversation IA handling
  const handleToggleIA = async () => {
    if (!activeConv) return
    setTogglingIA(true)
    const nextState = !activeConv.ia_handling;

    try {
      await api.patch(`/conversations/${activeConv.id}`, { ia_handling: nextState })
      setActiveConv(prev => ({ ...prev, ia_handling: nextState }))
      toast.success(`IA ${nextState ? 'activada' : 'desactivada'} para esta conversación`)
    } catch (e) {
      toast.error('Error al actualizar el estado de la IA')
    } finally {
      setTogglingIA(false)
    }
  }

  // Create task for lead
  const handleCreateTask = async (e) => {
    e.preventDefault()
    if (!taskTitle.trim() || !lead) return
    setSavingTask(true)

    try {
      const newTask = await api.post(`/leads/${lead.id}/tasks`, {
        title: taskTitle.trim(),
        description: taskDesc.trim(),
        due_date: taskDueDate || null
      })
      setTasks(prev => [...prev, newTask])
      setShowTaskModal(false)
      setTaskTitle('')
      setTaskDesc('')
      setTaskDueDate('')
      toast.success('Tarea creada correctamente')
      loadLeadDetails() // refresh activities
    } catch (e) {
      toast.error('Error al crear la tarea')
    } finally {
      setSavingTask(false)
    }
  }

  // Complete task
  const handleToggleTaskCompleted = async (taskId, currentCompleted) => {
    if (!lead) return
    const nextCompleted = !currentCompleted;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: nextCompleted ? 1 : 0 } : t))

    try {
      await api.patch(`/leads/${lead.id}/tasks/${taskId}`, { completed: nextCompleted })
      toast.success(nextCompleted ? 'Tarea completada' : 'Tarea reabierta')
      loadLeadDetails() // refresh activities
    } catch (e) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: currentCompleted ? 1 : 0 } : t))
      toast.error('Error al actualizar la tarea')
    }
  }

  // ─── AUTO GENERATE EMAIL ──────────────────────────────────────────────────
  const handleAutoEmail = async (regenerate = false) => {
    if (!lead) return
    if (!lead.email) {
      toast.error('El lead no tiene email. Añade un email al lead primero.')
      return
    }
    if (!regenerate && autoEmailData) { setShowEmailModal(true); return }
    setAutoEmailLoading(true)
    try {
      const data = await api.post(`/leads/${lead.id}/auto-email`, { regenerate: false })
      setAutoEmailData(data)
      setShowEmailModal(true)
      // Load agency auto-send preference
      api.get('/agency/config').then(cfg => {
        setAutoSendFuture(cfg.auto_send_email === '1' || cfg.auto_send_email === 1)
      }).catch(() => {})
    } catch (e) {
      toast.error(e.message || 'Error al generar email')
    } finally {
      setAutoEmailLoading(false)
    }
  }

  const handleSendAutoEmail = async () => {
    if (!lead || !autoEmailData) return
    setAutoEmailSending(true)
    try {
      const result = await api.post(`/leads/${lead.id}/auto-email`, {
        regenerate: true,
        subject: autoEmailData.subject,
        body: autoEmailData.body,
        template: autoEmailData.template,
      })
      toast.success('Email enviado con éxito')
      setShowEmailModal(false)
      setAutoEmailData(null)
      // Save auto-send preference if toggled
      if (autoSendFuture) {
        api.patch('/agency/config', { auto_send_email: 1 }).catch(() => {})
      }
      loadLeadDetails()
    } catch (e) {
      toast.error(e.message || 'Error al enviar email')
    } finally {
      setAutoEmailSending(false)
    }
  }

  // ─── AUTO APPOINTMENT ─────────────────────────────────────────────────────
  const handleAutoAppointment = async () => {
    if (!lead) return
    setAutoApptLoading(true)
    try {
      const suggestion = await api.post(`/leads/${lead.id}/auto-appointment`, { confirm: false })
      setAutoApptSuggestion(suggestion)
      setApptType(suggestion.type || 'online')
      setApptStartsAt(suggestion.starts_at ? new Date(suggestion.starts_at).toISOString().slice(0, 16) : '')
      setApptDuration(suggestion.duration || 30)
      setApptLocation(suggestion.location || '')
      setApptOnlineUrl(suggestion.online_url || '')
      setApptAttendant(suggestion.attendant_name || '')
      setShowAppointmentModal(true)
    } catch (e) {
      toast.error(e.message || 'Error al generar sugerencia de cita')
    } finally {
      setAutoApptLoading(false)
    }
  }

  const handleCreateAutoAppointment = async (e) => {
    e.preventDefault()
    if (!apptStartsAt || !lead) return
    if (new Date(apptStartsAt) <= new Date()) { toast.error('La fecha debe ser futura'); return }
    setSavingAppt(true)
    try {
      const starts = new Date(apptStartsAt).toISOString()
      const ends = new Date(new Date(apptStartsAt).getTime() + apptDuration * 60000).toISOString()
      const result = await api.post(`/leads/${lead.id}/auto-appointment`, {
        confirm: true, type: apptType, starts_at: starts, ends_at: ends,
        timezone: autoApptSuggestion?.timezone || 'Europe/Madrid',
        location: apptType === 'physical' ? apptLocation : null,
        online_url: apptType === 'online' ? apptOnlineUrl : null,
        notes: apptNotes.trim(), attendant_name: apptAttendant.trim(),
        send_whatsapp: autoWaOnAppointment,
      })
      toast.success('Cita programada con éxito. Mensajes enviados.')
      setShowAppointmentModal(false)
      setAutoApptSuggestion(null)
      loadLeadDetails()
    } catch (e) {
      toast.error(e.message || 'Error al programar cita')
    } finally {
      setSavingAppt(false)
    }
  }

  // ─── QUALIFY LEAD ─────────────────────────────────────────────────────────
  const handleQualifyLead = async () => {
    if (!lead) return
    setQualifierLoading(true)
    setQualifierResult(null)
    try {
      const result = await api.post(`/leads/${lead.id}/qualify`)
      setQualifierResult(result)
      toast.success(`Lead cualificado: ${result.score}/100 (${result.level})`)
      loadLeadDetails()
    } catch (e) {
      toast.error(e.message || 'Error al cualificar')
    } finally {
      setQualifierLoading(false)
    }
  }

  // ─── SALES AGENT ──────────────────────────────────────────────────────────
  const handleSalesAgent = async (action, channel, message, propertyId) => {
    if (!lead) return
    if (!action) {
      setSalesAgentLoading(true)
      try {
        const suggestion = await api.post(`/leads/${lead.id}/sales-agent`, { execute: false })
        setSalesAgentSuggestion(suggestion)
        toast.success(`Acción sugerida: ${suggestion.action_info?.label || suggestion.action}`)
      } catch (e) {
        toast.error(e.message || 'Error al obtener sugerencia')
      } finally {
        setSalesAgentLoading(false)
      }
      return
    }
    setSalesAgentLoading(true)
    try {
      const result = await api.post(`/leads/${lead.id}/sales-agent`, {
        execute: true, action, channel, message, property_id: propertyId,
      })
      setSalesAgentResult(result)
      toast.success(`Acción "${action}" ejecutada`)
      loadLeadDetails()
    } catch (e) {
      toast.error(e.message || 'Error al ejecutar acción')
    } finally {
      setSalesAgentLoading(false)
    }
  }

  // Run AI Agent (Captador / Vendedor)
  const handleTriggerAgent = async (agentType) => {
    if (!lead) return
    setRunningAgent(agentType)
    setAgentOutput('')

    // Find agent configured in DB
    const agent = agentsList.find(a => a.type === agentType)
    if (!agent) {
      toast.error(`El agente ${agentType} no está activo o configurado. Actívalo en la pestaña Agentes.`);
      setRunningAgent(null)
      return
    }

    try {
      // Use the chat stream route with a standard message
      const res = await fetch(`/api/agents/${agent.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...api.authHeaders },
        body: JSON.stringify({
          message: agentType === 'captador'
            ? `Cualifica al lead ${lead.name} de origen ${lead.source || 'manual'} interesado en ${lead.property_interest || 'no especificado'}. Asigna score inicial.`
            : `El lead ${lead.name} está interesado. Intenta agendar una visita.`,
          lead_context: {
            lead_id: lead.id,
            name: lead.name,
            phone: lead.phone,
            score: lead.ia_score,
            stage: lead.pipeline_stage || lead.status,
            summary: lead.ia_summary,
            budget: lead.budget,
            zone: lead.zone,
            agency_name: 'PropIA Premium'
          },
          stream: true
        })
      })

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        const lines = text.split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          const json = line.slice(6)
          if (json === '[DONE]') break
          try {
            const { chunk, error } = JSON.parse(json)
            if (error) { fullText += `\nError: ${error}`; break }
            if (chunk) {
              fullText += chunk
              setAgentOutput(fullText)
            }
          } catch { /* skip parse */ }
        }
      }

      toast.success(`Ejecución de ${agentType} completada`)
      loadLeadDetails() // reload all details after execution updates DB
    } catch (e) {
      console.error(e)
      toast.error('Error al ejecutar el agente de IA')
    } finally {
      setRunningAgent(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-sm text-white/50">Cargando perfil de cliente...</p>
        </div>
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldAlert size={48} className="text-white/20" />
        <p className="text-white/60">Lead no encontrado o no pertenece a tu agencia.</p>
        <button onClick={() => navigate('/leads')} className="text-sm text-indigo-400 hover:text-indigo-300 font-medium">
          Volver a leads
        </button>
      </div>
    )
  }

  const score = lead.ia_score || 0;
  const scoreLabel = getScoreLabel(score);
  const scoreBadgeColor = score >= 75
    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
    : score >= 40
    ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
    : 'text-slate-400 border-white/10 bg-white/5';

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Return button */}
      <button
        onClick={() => navigate('/leads')}
        className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
        Volver a la lista
      </button>

      {/* Profile Header Card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl relative overflow-hidden backdrop-blur-md">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-blue-500/20 border border-white/10 text-indigo-400 flex items-center justify-center text-xl font-bold shrink-0 shadow-inner">
              {getInitials(lead.name)}
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-white font-syne">{lead.name}</h1>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${scoreBadgeColor}`}>
                  {score >= 75 ? '🔥' : score >= 40 ? '🟡' : '❄️'} {score}% · {scoreLabel}
                </span>
              </div>
              <p className="text-xs text-white/40 mt-1">ID del cliente: #{lead.id?.slice(0, 8)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Stage dropdown selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Etapa actual</label>
              <select
                value={lead.pipeline_stage || lead.status || 'nuevo'}
                onChange={e => handleStageChange(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="nuevo" className="bg-neutral-900">Nuevo</option>
                <option value="contactado" className="bg-neutral-900">Contactado</option>
                <option value="interesado" className="bg-neutral-900">Interesado</option>
                <option value="visita_agendada" className="bg-neutral-900">Visita agendada</option>
                <option value="negociacion" className="bg-neutral-900">Negociación</option>
                <option value="reserva" className="bg-neutral-900">Reserva</option>
                <option value="cerrado" className="bg-neutral-900">Cerrado</option>
                <option value="perdido" className="bg-neutral-900">Perdido</option>
                <option value="archivo" className="bg-neutral-900">Archivado</option>
              </select>
            </div>
          </div>
        </div>

        {/* Dynamic streaming float alert */}
        <AnimatePresence>
          {runningAgent && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-4 p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/10 backdrop-blur-sm space-y-2 overflow-hidden"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
                <Bot size={14} className="animate-pulse" />
                <span>Agente {runningAgent === 'captador' ? 'Captador' : 'Vendedor'} IA ejecutándose en streaming...</span>
              </div>
              <pre className="text-xs text-white/90 whitespace-pre-wrap font-sans leading-relaxed">
                {agentOutput || 'Llamando a Claude OpenRouter...'}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 pt-6 border-t border-white/5">
          <div className="lg:col-span-1 space-y-4">
            {/* Próximas Citas Card */}
            {appointments.filter(a => a.status !== 'cancelled').length > 0 && (
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 space-y-3.5">
                <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={14} className="text-pink-400" />
                  Próximas Citas
                </h3>
                <div className="space-y-3">
                  {appointments.filter(a => a.status !== 'cancelled').map(appt => {
                    const isOnline = appt.type === 'online';
                    const formattedDate = new Date(appt.starts_at).toLocaleString('es-ES', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                    
                    let statusColor = 'text-blue-400 border-blue-500/20 bg-blue-500/10';
                    let statusLabel = 'Programada';
                    if (appt.status === 'confirmed') {
                      statusColor = 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10';
                      statusLabel = 'Confirmada';
                    } else if (appt.status === 'reschedule_requested') {
                      statusColor = 'text-amber-400 border-amber-500/20 bg-amber-500/10';
                      statusLabel = 'Cambio solicitado';
                    }

                    return (
                      <div key={appt.id} className="p-3 bg-white/5 border border-white/5 rounded-xl space-y-2.5 relative group">
                        <div className="flex justify-between items-start">
                          <div className="text-xs font-bold text-white">{formattedDate}</div>
                          <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded-full uppercase tracking-wider ${statusColor}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="text-[10px] text-white/60 space-y-1">
                          <p className="flex items-center gap-1">
                            <span className="font-semibold text-white/70">Tipo:</span> {isOnline ? 'Online 💻' : 'Presencial 🏠'}
                          </p>
                          <p className="flex items-center gap-1 text-white/80">
                            <span className="font-semibold text-white/70">Atiende:</span> {appt.attendant_name || 'Comercial asignado'}
                          </p>
                          {isOnline ? (
                            appt.online_url && (
                              <p className="truncate text-white/80">
                                <span className="font-semibold text-white/70">Videollamada:</span>{' '}
                                <a href={appt.online_url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                                  Enlace
                                </a>
                              </p>
                            )
                          ) : (
                            appt.location && (
                              <p className="truncate text-white/80">
                                <span className="font-semibold text-white/70">Lugar:</span> {appt.location}
                              </p>
                            )
                          )}
                        </div>
                        
                        <div className="pt-2 border-t border-white/5 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={async () => {
                              if (window.confirm('¿Seguro que deseas cancelar esta cita?')) {
                                try {
                                  await api.post(`/appointments/${appt.id}/cancel`);
                                  toast.success('Cita cancelada con éxito');
                                  loadLeadDetails();
                                } catch (e) {
                                  toast.error('Error al cancelar la cita');
                                }
                              }
                            }}
                            className="text-[9px] font-bold text-rose-400 hover:text-rose-300"
                          >
                            Cancelar Cita
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Contact & Details grid */}
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 space-y-3.5">
              <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider">Detalles clave</h3>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-white/5 text-white/50 flex items-center justify-center shrink-0 border border-white/5">
                  <Phone size={14} />
                </div>
                <a href={`tel:${lead.phone}`} className="text-white hover:text-indigo-400 transition-colors font-medium">{lead.phone || '—'}</a>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-white/5 text-white/50 flex items-center justify-center shrink-0 border border-white/5">
                  <Mail size={14} />
                </div>
                <a href={`mailto:${lead.email}`} className="text-white hover:text-indigo-400 transition-colors break-all font-medium">{lead.email || '—'}</a>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-white/5 text-white/50 flex items-center justify-center shrink-0 border border-white/5">
                  <DollarSign size={14} />
                </div>
                <span className="text-white font-semibold">{lead.budget ? formatCurrency(lead.budget) : '—'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-white/5 text-white/50 flex items-center justify-center shrink-0 border border-white/5">
                  <MapPin size={14} />
                </div>
                <span className="text-white/80">{lead.zone || '—'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-white/5 text-white/50 flex items-center justify-center shrink-0 border border-white/5">
                  <Building2 size={14} />
                </div>
                <span className="text-white/80">{lead.property_interest || '—'}</span>
              </div>
            </div>

            {/* AI Summary Resumen panel */}
            {lead.ia_summary && (
              <div className="bg-gradient-to-br from-indigo-500/10 to-blue-500/10 border border-indigo-500/20 rounded-xl p-5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-indigo-400" />
                  <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Perfil Inteligente</h3>
                </div>
                <p className="text-xs text-white/80 leading-relaxed font-medium">{lead.ia_summary}</p>
              </div>
            )}

            {/* Quick Action buttons */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={handleAutoEmail}
                  disabled={autoEmailLoading}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl transition-all text-xs font-semibold shadow-md shadow-purple-600/10 animate-fade-in"
                >
                  {autoEmailLoading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                  {autoEmailLoading ? 'Generando...' : 'Enviar Email'}
                </button>
                <button
                  onClick={handleAutoAppointment}
                  disabled={autoApptLoading}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white rounded-xl transition-all text-xs font-semibold shadow-md shadow-pink-600/10 animate-fade-in"
                >
                  {autoApptLoading ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
                  {autoApptLoading ? 'Analizando...' : 'Agendar Cita'}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleQualifyLead}
                  disabled={qualifierLoading}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-all text-xs font-semibold shadow-md shadow-indigo-600/10"
                >
                  {qualifierLoading ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                  {qualifierLoading ? 'Cualificando...' : 'Cualificador IA'}
                </button>
                <button
                  onClick={() => handleSalesAgent()}
                  disabled={salesAgentLoading}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl transition-all text-xs font-semibold shadow-md shadow-blue-600/10"
                >
                  {salesAgentLoading ? <Loader2 size={14} className="animate-spin" /> : <Handshake size={14} />}
                  {salesAgentLoading ? 'Analizando...' : 'Vendedor IA'}
                </button>
              </div>
              <button
                onClick={() => setShowTaskModal(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 border border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all text-xs font-semibold"
              >
                <Plus size={14} />
                Crear nueva tarea
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {/* Dynamic tabs navigation */}
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex border-b border-white/5 bg-white/[0.02]">
                <button
                  onClick={() => setActiveTab('conversacion')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold transition-all border-b-2 uppercase tracking-wide ${
                    activeTab === 'conversacion'
                      ? 'text-indigo-400 border-indigo-500 bg-white/[0.02]'
                      : 'text-white/40 border-transparent hover:text-white/80'
                  }`}
                >
                  <MessageCircle size={14} />
                  Conversación
                </button>
                <button
                  onClick={() => setActiveTab('timeline')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold transition-all border-b-2 uppercase tracking-wide ${
                    activeTab === 'timeline'
                      ? 'text-indigo-400 border-indigo-500 bg-white/[0.02]'
                      : 'text-white/40 border-transparent hover:text-white/80'
                  }`}
                >
                  <Activity size={14} />
                  Timeline
                </button>
                <button
                  onClick={() => setActiveTab('propiedades')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold transition-all border-b-2 uppercase tracking-wide ${
                    activeTab === 'propiedades'
                      ? 'text-indigo-400 border-indigo-500 bg-white/[0.02]'
                      : 'text-white/40 border-transparent hover:text-white/80'
                  }`}
                >
                  <Home size={14} />
                  Propiedades
                </button>
                <button
                  onClick={() => setActiveTab('tareas')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold transition-all border-b-2 uppercase tracking-wide ${
                    activeTab === 'tareas'
                      ? 'text-indigo-400 border-indigo-500 bg-white/[0.02]'
                      : 'text-white/40 border-transparent hover:text-white/80'
                  }`}
                >
                  <CheckSquare size={14} />
                  Tareas
                </button>
              </div>

              <div className="p-5">
                <AnimatePresence mode="wait">
                  {/* Tab 1: Conversación — WhatsApp Panel */}
                  {activeTab === 'conversacion' && (
                    <motion.div
                      key="conversacion"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4"
                    >
                      {/* WhatsApp Header Banner */}
                      <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-green-500/10 to-emerald-500/5 border border-green-500/20">
                        <div className="w-9 h-9 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center shrink-0">
                          <MessageCircle size={18} className="text-green-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-green-300">Canal WhatsApp</p>
                          <p className="text-[10px] text-white/40 truncate">
                            {lead.phone
                              ? `+${String(lead.phone).replace(/[\s\-\(\)\+]/g, '').startsWith('34') ? '' : '34'}${String(lead.phone).replace(/[\s\-\(\)\+]/g, '')}`
                              : 'Sin teléfono registrado'}
                          </p>
                        </div>
                        {activeConv && (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-white/40 font-medium">IA</span>
                            <button
                              onClick={handleToggleIA}
                              disabled={togglingIA}
                              className={`relative w-9 h-4.5 rounded-full transition-colors duration-300 ${
                                activeConv.ia_handling ? 'bg-indigo-500' : 'bg-white/10'
                              }`}
                              style={{ width: 36, height: 18 }}
                            >
                              <motion.div
                                className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm"
                                animate={{ left: activeConv.ia_handling ? 18 : 2 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                              />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Chat history scroll area (if there's an active conversation) */}
                      {activeConv && (
                        <div className="h-[200px] overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
                          {convMessages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 opacity-50">
                              <MessageCircle size={24} className="text-green-400/40" />
                              <p className="text-[10px] text-white/30 italic">Sin mensajes registrados aún</p>
                            </div>
                          ) : (
                            convMessages.map((msg, index) => {
                              const isLead = msg.role === 'lead' || msg.sender_type === 'lead';
                              const isIA = msg.role === 'ia_agent' || msg.sender_type === 'ia' || msg.author === 'ia_agent' || (msg.role === 'agent' && msg.sender_type === 'ia');
                              return (
                                <div key={msg.id || index} className={`flex ${isLead ? 'justify-start' : 'justify-end'}`}>
                                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 border relative ${
                                    isLead
                                      ? 'bg-neutral-800/80 text-white/90 border-white/5 rounded-bl-sm'
                                      : isIA
                                      ? 'bg-indigo-500/20 text-indigo-200 border-indigo-500/20 rounded-br-sm'
                                      : 'bg-green-600/20 text-white/90 border-green-500/20 rounded-br-sm'
                                  }`}>
                                    {isIA && (
                                      <span className="absolute -top-2 right-2 bg-indigo-500 text-white text-[8px] px-1 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-0.5">
                                        <Bot size={8} /> IA
                                      </span>
                                    )}
                                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content || msg.text}</p>
                                    <p className="text-[9px] text-white/30 mt-1 text-right">{formatDate(msg.timestamp || msg.created_at)}</p>
                                  </div>
                                </div>
                              )
                            })
                          )}
                          <div ref={messagesEndRef} />
                        </div>
                      )}

                      {/* Divider */}
                      <div className="border-t border-white/5" />

                      {/* Pre-configured Message Panel */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Mensaje preconfigurado</p>
                          <span className="text-[9px] text-white/30">{waPanelMessage.length} caracteres</span>
                        </div>

                        {/* Quick templates row */}
                        <div className="flex gap-1.5 flex-wrap">
                          {waTemplates.map(tpl => (
                            <button
                              key={tpl.id}
                              onClick={() => applyWaTemplate(tpl.id)}
                              className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/60 hover:text-white transition-all"
                            >
                              {tpl.label}
                            </button>
                          ))}
                        </div>

                        {/* Message textarea */}
                        <div className="relative">
                          <textarea
                            value={waPanelMessage}
                            onChange={e => setWaPanelMessage(e.target.value)}
                            rows={4}
                            className="w-full bg-black/40 border border-green-500/20 focus:border-green-500/50 rounded-xl px-4 py-3 text-xs text-white placeholder-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/10 transition-all outline-none leading-relaxed"
                            placeholder="Escribe o edita el mensaje para enviar por WhatsApp..."
                          />
                        </div>

                        {/* Send WhatsApp button */}
                        <button
                          onClick={() => handleOpenWhatsApp(waPanelMessage)}
                          disabled={!lead.phone || !waPanelMessage.trim() || sendingWaFromPanel}
                          className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-3 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-green-600/20 active:scale-[0.98]"
                        >
                          <MessageCircle size={16} />
                          {sendingWaFromPanel ? 'Abriendo WhatsApp...' : `Abrir WhatsApp con ${lead.name?.split(' ')[0] || 'el lead'}`}
                          <span className="ml-auto text-[10px] font-normal opacity-60">↗ Se abre en WhatsApp</span>
                        </button>

                        {!lead.phone && (
                          <p className="text-[10px] text-amber-400/80 text-center">
                            ⚠️ Este lead no tiene número de teléfono. Añádelo en sus datos para poder contactar por WhatsApp.
                          </p>
                        )}
                      </div>

                      {/* Internal CRM message input (if active conversation) */}
                      {activeConv && (
                        <div className="pt-2 border-t border-white/5">
                          <p className="text-[10px] text-white/30 mb-2 uppercase tracking-wider font-bold">Registrar mensaje interno en CRM</p>
                          <form onSubmit={handleSendMessage} className="flex gap-2">
                            <input
                              type="text"
                              value={chatMessage}
                              onChange={e => setChatMessage(e.target.value)}
                              placeholder={`Nota manual para ${lead.name}...`}
                              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                            />
                            <button
                              type="submit"
                              disabled={sendingMsg || !chatMessage.trim()}
                              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-all shadow-md shadow-indigo-600/10 shrink-0"
                            >
                              <Send size={15} />
                            </button>
                          </form>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Tab 2: Timeline */}
                  {activeTab === 'timeline' && (
                    <motion.div
                      key="timeline"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin"
                    >
                      {activities.length === 0 ? (
                        <div className="text-center py-12 text-white/30 text-xs italic">Sin actividad registrada en la línea de tiempo</div>
                      ) : (
                        activities.map((act, i) => (
                          <motion.div
                            key={act.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.02 }}
                            className="flex items-start gap-3.5 p-3 rounded-xl hover:bg-white/[0.02] border border-transparent hover:border-white/5 transition-colors"
                          >
                            <ActivityIcon type={act.type} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-white leading-normal">{act.description || act.title || 'Actividad'}</p>
                              <div className="flex items-center gap-2 mt-1 text-[10px] text-white/40">
                                <span>{act.user_name || 'Agente de IA'}</span>
                                <span className="w-1 h-1 rounded-full bg-white/20" />
                                <span>{formatFullDate(act.created_at)}</span>
                              </div>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </motion.div>
                  )}

                  {/* Tab 3: Propiedades compatibles */}
                  {activeTab === 'propiedades' && (
                    <motion.div
                      key="propiedades"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4"
                    >
                      {matchingLoading ? (
                        <div className="flex flex-col items-center gap-2 py-12">
                          <RefreshCw size={24} className="animate-spin text-indigo-400" />
                          <p className="text-xs text-white/50">Buscando y tasando propiedades compatibles con IA...</p>
                        </div>
                      ) : matchedProperties.length === 0 ? (
                        <div className="text-center py-12 space-y-2">
                          <Home size={32} className="text-white/20 mx-auto" />
                          <p className="text-sm font-semibold text-white">Sin propiedades compatibles</p>
                          <p className="text-xs text-white/40">No hay inmuebles en stock que encajen con el presupuesto ({formatCurrency(lead.budget || 0)}) o zona.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {matchInsight && (
                            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 text-xs text-indigo-200 leading-relaxed leading-normal font-medium">
                              🤖 <strong>PropIA Inteligencia de Match:</strong> {matchInsight}
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin">
                            {matchedProperties.map(prop => {
                              const images = parseImagesProperty(prop.images)
                              const features = parseFeaturesList(prop.features)
                              return (
                                <div key={prop.id} className="rounded-xl border border-white/10 bg-black/20 overflow-hidden group hover:border-white/20 transition-all">
                                  {images.length > 0 && (
                                    <div className="relative h-36 bg-slate-900 overflow-hidden">
                                      <img
                                        src={images[0]}
                                        alt={prop.title}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                                      />
                                      {images.length > 1 && (
                                        <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm text-[10px] text-white/80 rounded-lg">
                                          +{images.length - 1} fotos
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  <div className="p-4 space-y-2.5">
                                    <div className="flex justify-between items-start gap-2">
                                      <span className="text-xs font-bold text-white line-clamp-1">{prop.title}</span>
                                      <span className="text-xs font-extrabold text-emerald-400 shrink-0">{formatCurrency(prop.price)}</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1 text-[10px] text-white/50">
                                      <span>📍 {prop.zone || prop.city}</span>
                                      <span>🛏️ {prop.bedrooms} hab</span>
                                      <span>📐 {prop.surface} m²</span>
                                    </div>
                                    {features.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5">
                                        {features.slice(0, 4).map((f, i) => (
                                          <span key={i} className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-md text-[9px] text-white/60">
                                            {f}
                                          </span>
                                        ))}
                                        {features.length > 4 && (
                                          <span className="px-2 py-0.5 text-[9px] text-white/40">
                                            +{features.length - 4}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-white/40">
                                      <span className="capitalize">{prop.type}</span>
                                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">{prop.status}</span>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Tab 4: Tareas */}
                  {activeTab === 'tareas' && (
                    <motion.div
                      key="tareas"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white/50">{tasks.length} tareas pendientes</span>
                        <button
                          onClick={() => setShowTaskModal(true)}
                          className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-bold"
                        >
                          <Plus size={12} />
                          Nueva tarea
                        </button>
                      </div>

                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin">
                        {tasks.length === 0 ? (
                          <div className="text-center py-12 text-white/30 text-xs italic">No hay tareas pendientes asignadas</div>
                        ) : (
                          tasks.map(task => {
                            const isCompleted = task.completed !== 0;
                            return (
                              <div
                                key={task.id}
                                className={`flex items-start justify-between gap-3 p-3.5 rounded-xl border border-white/5 bg-black/20 group hover:border-white/10 transition-all ${
                                  isCompleted ? 'opacity-50' : ''
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <button
                                    onClick={() => handleToggleTaskCompleted(task.id, isCompleted)}
                                    className="pt-0.5 text-white/40 hover:text-indigo-400 transition-colors shrink-0"
                                  >
                                    {isCompleted ? (
                                      <CheckCircle size={16} className="text-indigo-400" />
                                    ) : (
                                      <Circle size={16} />
                                    )}
                                  </button>
                                  <div>
                                    <p className={`text-xs font-bold text-white ${isCompleted ? 'line-through text-white/40' : ''}`}>
                                      {task.title}
                                    </p>
                                    {task.description && (
                                      <p className="text-[10px] text-white/50 mt-0.5 line-clamp-2">{task.description}</p>
                                    )}
                                  </div>
                                </div>

                                {task.due_date && (
                                  <div className="flex items-center gap-1 text-[10px] text-white/30 shrink-0">
                                    <Clock size={10} />
                                    <span>{formatDate(task.due_date)}</span>
                                  </div>
                                )}
                              </div>
                            )
                          })
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Task Creation Modal */}
      <AnimatePresence>
        {showTaskModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative"
            >
              <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                <h3 className="text-sm font-bold font-syne text-white flex items-center gap-2">
                  <CheckSquare size={16} className="text-indigo-400" />
                  Nueva tarea
                </h3>
                <button
                  onClick={() => setShowTaskModal(false)}
                  className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateTask} className="space-y-4">
                <div>
                  <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block mb-1">Título de la tarea *</label>
                  <input
                    type="text"
                    required
                    value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    placeholder="Ej: Llamar para firmar arras"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block mb-1">Descripción</label>
                  <textarea
                    value={taskDesc}
                    onChange={e => setTaskDesc(e.target.value)}
                    placeholder="Detalles sobre la gestión..."
                    className="w-full h-20 bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/30 resize-none focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block mb-1">Fecha de vencimiento</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={e => setTaskDueDate(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowTaskModal(false)}
                    className="flex-1 px-4 py-2.5 text-xs font-semibold text-white/60 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingTask || !taskTitle.trim()}
                    className="flex-1 px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl transition-all shadow-md shadow-indigo-600/10"
                  >
                    {savingTask ? 'Guardando...' : 'Crear tarea'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Auto Email Modal - Enhanced */}
      <AnimatePresence>
        {showEmailModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                <h3 className="text-sm font-bold font-syne text-white flex items-center gap-2">
                  <Sparkles size={16} className="text-purple-400" />
                  Email Inteligente
                </h3>
                <button onClick={() => { setShowEmailModal(false); setAutoEmailData(null) }}
                  className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
                  <X size={16} />
                </button>
              </div>

              {autoEmailData ? (
                <div className="space-y-4">
                  {/* Template Detection Badge */}
                  {autoEmailData.template && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                      <Sparkles size={12} className="text-purple-400" />
                      <span className="text-xs text-purple-300 font-medium">
                        Plantilla IA: <strong>{{
                          first_contact: 'Primer contacto',
                          follow_up: 'Seguimiento',
                          property_send: 'Envío de propiedad',
                          appointment_confirmation: 'Confirmación de cita',
                          reminder: 'Recordatorio',
                          reactivation: 'Reactivación',
                          hot_lead: 'Lead caliente',
                          no_response: 'Sin respuesta',
                        }[autoEmailData.template] || autoEmailData.template}</strong>
                      </span>
                    </div>
                  )}

                  {/* Recipient Info */}
                  <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5">
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-white/40" />
                      <span className="text-xs text-white/80">{lead?.email || 'Sin email'}</span>
                    </div>
                    <span className="text-[10px] text-white/30">{lead?.name}</span>
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block mb-1">Asunto generado por IA</label>
                    <input type="text" value={autoEmailData.subject || ''}
                      onChange={e => setAutoEmailData({ ...autoEmailData, subject: e.target.value })}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
                  </div>

                  {/* Message Body */}
                  <div>
                    <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block mb-1">Mensaje generado por IA</label>
                    <textarea value={autoEmailData.body || ''}
                      onChange={e => setAutoEmailData({ ...autoEmailData, body: e.target.value })}
                      className="w-full h-44 bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white resize-none focus:outline-none focus:border-indigo-500 leading-relaxed" />
                  </div>

                  {/* CTA Suggestion */}
                  {autoEmailData.cta && (
                    <div className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                      <Target size={12} className="text-indigo-400" />
                      <span className="text-xs text-indigo-300">CTA sugerido: <strong>{autoEmailData.cta}</strong></span>
                    </div>
                  )}

                  {/* Property Context */}
                  {lead?.property_interest && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                      <Home size={12} className="text-amber-400" />
                      <span className="text-xs text-amber-300">Propiedad: <strong>{lead.property_interest}</strong> {lead.zone ? `en ${lead.zone}` : ''}</span>
                    </div>
                  )}

                  {/* Schedule Options Toggle */}
                  <div className="border border-white/5 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowScheduleOptions(!showScheduleOptions)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-white/60 hover:text-white bg-black/20 hover:bg-black/40 transition-colors"
                    >
                      <span className="flex items-center gap-1.5"><Clock size={12} /> Programar envío</span>
                      <span className={`transition-transform ${showScheduleOptions ? 'rotate-180' : ''}`}>▼</span>
                    </button>
                    {showScheduleOptions && (
                      <div className="p-3 border-t border-white/5 bg-black/20">
                        <input
                          type="datetime-local"
                          value={scheduledDate}
                          onChange={e => setScheduledDate(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 outline-none"
                        />
                        <p className="text-[10px] text-white/30 mt-1">Programa el envío para una fecha y hora específica</p>
                      </div>
                    )}
                  </div>

                  {/* Auto-send Toggle */}
                  <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5">
                    <div className="flex items-center gap-2">
                      <Zap size={14} className="text-amber-400" />
                      <div>
                        <p className="text-xs text-white font-medium">Envío automático futuro</p>
                        <p className="text-[10px] text-white/40">No pedir confirmación en próximos emails</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setAutoSendFuture(!autoSendFuture)}
                      className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${autoSendFuture ? 'bg-indigo-500' : 'bg-white/10'}`}
                    >
                      <motion.div
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
                        animate={{ left: autoSendFuture ? 20 : 2 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    </button>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => handleAutoEmail(true)}
                      disabled={autoEmailLoading}
                      className="flex-1 px-4 py-2.5 text-xs font-semibold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-xl transition-all flex items-center justify-center gap-1.5 border border-indigo-500/20">
                      {autoEmailLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      Regenerar con IA
                    </button>
                    <button onClick={handleSendAutoEmail}
                      disabled={autoEmailSending || !autoEmailData.subject || !autoEmailData.body}
                      className="flex-1 px-4 py-2.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-40 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5">
                      {autoEmailSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      {autoEmailSending ? 'Enviando...' : 'Enviar ahora'}
                    </button>
                  </div>
                  <p className="text-[10px] text-white/30 text-center">
                    El sistema registrará actividad, actualizará última interacción y creará tarea de seguimiento
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Loader2 size={32} className="text-purple-400 animate-spin" />
                  <p className="text-xs text-white/60">Generando contenido inteligente con IA...</p>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Qualifier Result Panel */}
      <AnimatePresence>
        {qualifierResult && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
              <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                <h3 className="text-sm font-bold font-syne text-white flex items-center gap-2">
                  <Bot size={16} className="text-indigo-400" />
                  Resultado Cualificador IA
                </h3>
                <button onClick={() => setQualifierResult(null)} className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-black/40 rounded-xl">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold border-2 ${
                    qualifierResult.score >= 80 ? 'bg-ok/10 text-ok border-ok/30' :
                    qualifierResult.score >= 50 ? 'bg-warn/10 text-warn border-warn/30' :
                    'bg-err/10 text-err border-err/30'}`}>
                    {qualifierResult.score}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white capitalize">{qualifierResult.level}</p>
                    <p className="text-xs text-white/50">Urgencia: {qualifierResult.urgency}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-black/40 rounded-xl"><span className="text-white/50">Presupuesto</span><p className="text-white font-medium">{qualifierResult.budget_detected ? `${qualifierResult.budget_detected}€` : 'No detectado'}</p></div>
                  <div className="p-2 bg-black/40 rounded-xl"><span className="text-white/50">Zona</span><p className="text-white font-medium">{qualifierResult.zone_preferred || 'No especificada'}</p></div>
                  <div className="p-2 bg-black/40 rounded-xl"><span className="text-white/50">Operación</span><p className="text-white font-medium capitalize">{qualifierResult.operation_type || 'N/A'}</p></div>
                  <div className="p-2 bg-black/40 rounded-xl"><span className="text-white/50">Siguiente acción</span><p className="text-white font-medium text-[11px]">{qualifierResult.next_best_action}</p></div>
                </div>
                <p className="text-xs text-white/70 p-2 bg-indigo-500/10 rounded-xl">{qualifierResult.summary}</p>
                {qualifierResult.possible_objections?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-white/40 uppercase mb-1">Posibles objeciones</p>
                    <div className="flex flex-wrap gap-1">
                      {qualifierResult.possible_objections.map((o, i) => (
                        <span key={i} className="px-2 py-1 text-[11px] bg-err/10 text-err border border-err/20 rounded-lg">{o}</span>
                      ))}
                    </div>
                  </div>
                )}
                {qualifierResult.missing_questions?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-white/40 uppercase mb-1">Preguntas pendientes</p>
                    <ul className="space-y-1">
                      {qualifierResult.missing_questions.map((q, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-white/60"><span className="text-indigo-400">•</span>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Apply Recommendations */}
                {qualifierResult.level === 'caliente' && (
                  <div className="flex gap-2">
                    <button onClick={() => { setQualifierResult(null); handleAutoAppointment() }}
                      className="flex-1 px-3 py-2 text-[11px] font-semibold text-white bg-pink-600 hover:bg-pink-500 rounded-xl transition-all flex items-center justify-center gap-1">
                      <Calendar size={12} /> Agendar cita
                    </button>
                    <button onClick={() => { setQualifierResult(null); handleSalesAgent() }}
                      className="flex-1 px-3 py-2 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all flex items-center justify-center gap-1">
                      <Bot size={12} /> Activar Vendedor IA
                    </button>
                  </div>
                )}
                <button onClick={() => setQualifierResult(null)}
                  className="w-full py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all">
                  Aceptar y cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sales Agent Suggestion Panel */}
      <AnimatePresence>
        {salesAgentSuggestion && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
              <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                <h3 className="text-sm font-bold font-syne text-white flex items-center gap-2">
                  <Handshake size={16} className="text-blue-400" />
                  Vendedor IA - Acción sugerida
                </h3>
                <button onClick={() => setSalesAgentSuggestion(null)} className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <Sparkles size={16} className="text-blue-400" />
                  <div>
                    <p className="text-sm font-semibold text-white">{salesAgentSuggestion.action_info?.label || salesAgentSuggestion.action}</p>
                    <p className="text-xs text-blue-300">{salesAgentSuggestion.reason}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-black/40 rounded-xl"><span className="text-white/50">Canal</span><p className="text-white font-medium capitalize">{salesAgentSuggestion.channel_recommended}</p></div>
                  <div className="p-2 bg-black/40 rounded-xl"><span className="text-white/50">Seguimiento</span><p className="text-white font-medium">{salesAgentSuggestion.follow_up_days} días</p></div>
                </div>
                <div className="p-3 bg-black/40 rounded-xl">
                  <p className="text-[10px] font-semibold text-white/40 uppercase mb-1">Mensaje sugerido</p>
                  <p className="text-xs text-white/80 whitespace-pre-wrap">{salesAgentSuggestion.message}</p>
                </div>
                <p className="text-xs text-white/50">Próxima acción: {salesAgentSuggestion.next_action}</p>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => {
                    handleSalesAgent(salesAgentSuggestion.action, salesAgentSuggestion.channel_recommended, salesAgentSuggestion.message, salesAgentSuggestion.property_id)
                    setSalesAgentSuggestion(null)
                  }} disabled={salesAgentLoading}
                    className="flex-1 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-xl transition-all flex items-center justify-center gap-1.5">
                    {salesAgentLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                    Ejecutar acción
                  </button>
                  <button onClick={() => setSalesAgentSuggestion(null)}
                    className="flex-1 px-4 py-2.5 text-xs font-semibold text-white/60 bg-white/5 hover:bg-white/10 rounded-xl transition-all">
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sales Agent Result Panel */}
      <AnimatePresence>
        {salesAgentResult && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
              <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                <h3 className="text-sm font-bold font-syne text-white flex items-center gap-2">
                  <CheckCircle size={16} className="text-ok" />
                  Resultado Vendedor IA
                </h3>
                <button onClick={() => setSalesAgentResult(null)} className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-black/40 rounded-xl">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${salesAgentResult.sent ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
                    {salesAgentResult.sent ? <CheckCircle size={20} /> : <X size={20} />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white capitalize">Acción: {salesAgentResult.action}</p>
                    <p className="text-xs text-white/50">Canal: {salesAgentResult.channel} · {salesAgentResult.sent ? 'Enviado' : 'No enviado'}</p>
                  </div>
                </div>
                {salesAgentResult.appointment_suggestion && (
                  <div className="p-3 bg-pink-500/10 border border-pink-500/20 rounded-xl">
                    <p className="text-xs text-pink-300 font-medium">Cita sugerida: {new Date(salesAgentResult.appointment_suggestion.starts_at).toLocaleString('es-ES')}</p>
                  </div>
                )}
                {salesAgentResult.qualifier_result && (
                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                    <p className="text-xs text-indigo-300">Lead cualificado: {salesAgentResult.qualifier_result.score}/100 ({salesAgentResult.qualifier_result.level})</p>
                  </div>
                )}
                <button onClick={() => setSalesAgentResult(null)}
                  className="w-full py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all">
                  Aceptar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Appointment Scheduling Modal - Enhanced */}
      <AnimatePresence>
        {showAppointmentModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                <h3 className="text-sm font-bold font-syne text-white flex items-center gap-2">
                  <Sparkles size={16} className="text-pink-400" />
                  {autoApptSuggestion ? 'Cita sugerida por IA' : 'Agendar Cita'}
                </h3>
                <button onClick={() => { setShowAppointmentModal(false); setAutoApptSuggestion(null) }}
                  className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
                  <X size={16} />
                </button>
              </div>

              {autoApptSuggestion && (
                <div className="flex items-center gap-2 px-3 py-2 mb-4 bg-pink-500/10 border border-pink-500/20 rounded-xl">
                  <Sparkles size={12} className="text-pink-400" />
                  <span className="text-xs text-pink-300">Recomendación IA: <strong>{autoApptSuggestion.reason || 'Cita sugerida automáticamente'}</strong></span>
                </div>
              )}

              <form onSubmit={handleCreateAutoAppointment} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block mb-1">Tipo de Cita *</label>
                    <select value={apptType} onChange={e => setApptType(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white cursor-pointer focus:outline-none focus:border-indigo-500">
                      <option value="online">Videollamada (Online)</option>
                      <option value="physical">Visita Física (Presencial)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block mb-1">Comercial asignado</label>
                    {autoApptSuggestion?.available_users?.length > 0 ? (
                      <select value={apptAttendant} onChange={e => setApptAttendant(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white cursor-pointer focus:outline-none focus:border-indigo-500">
                        {autoApptSuggestion.available_users.map(u => (
                          <option key={u.id} value={u.name}>{u.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input type="text" value={apptAttendant} onChange={e => setApptAttendant(e.target.value)}
                        placeholder="Comercial asignado"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 outline-none" />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block mb-1">Fecha y Hora *</label>
                    <input type="datetime-local" required value={apptStartsAt}
                      onChange={e => setApptStartsAt(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block mb-1">Duración *</label>
                    <select value={apptDuration} onChange={e => setApptDuration(Number(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white cursor-pointer focus:outline-none focus:border-indigo-500">
                      <option value={30}>30 minutos</option>
                      <option value={45}>45 minutos</option>
                      <option value={60}>1 hora</option>
                      <option value={90}>1.5 horas</option>
                      <option value={120}>2 horas</option>
                    </select>
                  </div>
                </div>

                {apptType === 'online' ? (
                  <div>
                    <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block mb-1">Link de Videollamada</label>
                    <input type="url" value={apptOnlineUrl} onChange={e => setApptOnlineUrl(e.target.value)}
                      placeholder="https://meet.google.com/..."
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 outline-none" />
                  </div>
                ) : (
                  <div>
                    <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block mb-1">Lugar de encuentro</label>
                    <input type="text" value={apptLocation} onChange={e => setApptLocation(e.target.value)}
                      placeholder="Dirección u oficina..."
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 outline-none" />
                  </div>
                )}

                {/* Auto WhatsApp toggle */}
                <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5">
                  <div className="flex items-center gap-2">
                    <MessageCircle size={14} className="text-green-400" />
                    <div>
                      <p className="text-xs text-white font-medium">Enviar WhatsApp al cliente</p>
                      <p className="text-[10px] text-white/40">Notificar también por WhatsApp si tiene teléfono</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoWaOnAppointment(!autoWaOnAppointment)}
                    className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${autoWaOnAppointment ? 'bg-indigo-500' : 'bg-white/10'}`}
                  >
                    <motion.div
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
                      animate={{ left: autoWaOnAppointment ? 20 : 2 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  </button>
                </div>

                {/* Client Message Preview */}
                <div className="border border-white/5 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowClientPreview(!showClientPreview)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-white/60 hover:text-white bg-black/20 hover:bg-black/40 transition-colors"
                  >
                    <span className="flex items-center gap-1.5"><MessageCircle size={12} /> Vista previa: mensaje al cliente</span>
                    <span className={`transition-transform ${showClientPreview ? 'rotate-180' : ''}`}>▼</span>
                  </button>
                  {showClientPreview && (
                    <div className="p-3 border-t border-white/5 bg-black/20 space-y-2">
                      <div className="p-3 bg-green-500/5 border border-green-500/10 rounded-xl">
                        <p className="text-[10px] text-green-400 font-semibold mb-1">📱 WhatsApp que recibirá:</p>
                        <p className="text-xs text-white/80 whitespace-pre-wrap leading-relaxed">
                          {`¡Hola ${lead?.name || 'cliente'}! 🌟\n\nTu cita ha sido programada con éxito.\n\n📅 Fecha: ${apptStartsAt ? new Date(apptStartsAt).toLocaleString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Pendiente'}\n📌 Tipo: ${apptType === 'online' ? 'Videollamada' : 'Visita presencial'}\n📍 ${apptType === 'online' ? (apptOnlineUrl || 'Enlace por confirmar') : (apptLocation || 'Oficina')}\n👤 Te atenderá: ${apptAttendant || 'Comercial asignado'}\n\n¡Gracias por confiar en nosotros! 🏠`}
                        </p>
                      </div>
                      <div className="p-3 bg-purple-500/5 border border-purple-500/10 rounded-xl">
                        <p className="text-[10px] text-purple-400 font-semibold mb-1">📧 Email que recibirá:</p>
                        <p className="text-xs text-white/60 leading-relaxed">
                          Confirmación de cita con detalles de fecha, hora, lugar y persona de contacto. Incluye enlace para confirmar, modificar o cancelar.
                        </p>
                      </div>
                      <p className="text-[10px] text-white/30">Recordatorio automático: 48h antes y 2h antes (si activado)</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block mb-1">Notas internas (opcional)</label>
                  <textarea value={apptNotes} onChange={e => setApptNotes(e.target.value)}
                    placeholder="Notas para el equipo..."
                    className="w-full h-16 bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/30 resize-none focus:outline-none focus:border-indigo-500 outline-none" />
                </div>

                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => { setShowAppointmentModal(false); setAutoApptSuggestion(null) }}
                    className="flex-1 px-4 py-2.5 text-xs font-semibold text-white/60 bg-white/5 hover:bg-white/10 rounded-xl transition-all">
                    Cancelar
                  </button>
                  <button type="submit" disabled={savingAppt || !apptStartsAt}
                    className="flex-1 px-4 py-2.5 text-xs font-semibold text-white bg-pink-600 hover:bg-pink-500 disabled:opacity-40 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5">
                    {savingAppt ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
                    {savingAppt ? 'Guardando...' : 'Confirmar y enviar'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
