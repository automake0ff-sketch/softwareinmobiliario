import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle, Search, Send, Phone, Mail, User,
  Check, CheckCheck, Clock, MoreVertical, ArrowLeft,
  Star, Bell, Paperclip, Smile
} from 'lucide-react'
import { useStore } from '../lib/store'
import { formatDate, getInitials, formatFullDate } from '../utils/formatters'

const initialConversations = [
  {
    id: 'conv1', leadId: '1', leadName: 'María García López', leadPhone: '+34 612 345 678',
    leadEmail: 'maria.garcia@email.com', lastMessage: 'Perfecto, agendado. Gracias.',
    lastTime: '2026-05-11T10:45:00Z', unread: 2, source: 'whatsapp',
    messages: [
      { id: 'm1', from: 'lead', text: 'Hola, me interesa el ático que vi en su web. ¿Podría darme más información?', timestamp: '2026-05-10T09:30:00Z', status: 'read' },
      { id: 'm2', from: 'agent', text: '¡Hola María! Por supuesto. Tenemos un ático espectacular en el Centro con 3 habitaciones y terraza de 40m². ¿Te gustaría recibir más detalles?', timestamp: '2026-05-10T09:32:00Z', status: 'read' },
      { id: 'm3', from: 'lead', text: 'Sí, me encantaría. ¿Tiene garaje incluido?', timestamp: '2026-05-10T09:35:00Z', status: 'read' },
      { id: 'm4', from: 'agent', text: 'Sí, incluye plaza de garaje y trastero. El precio es de 385.000€. ¿Te gustaría agendar una visita virtual?', timestamp: '2026-05-10T09:38:00Z', status: 'read' },
      { id: 'm5', from: 'lead', text: 'Perfecto, sí. ¿Podemos hacerla mañana a las 10?', timestamp: '2026-05-10T09:40:00Z', status: 'read' },
      { id: 'm6', from: 'agent', text: 'Agendado. Te enviaré el enlace para la videollamada. ¡Gracias María!', timestamp: '2026-05-10T09:45:00Z', status: 'read' },
      { id: 'm7', from: 'lead', text: 'Perfecto, agendado. Gracias.', timestamp: '2026-05-11T10:45:00Z', status: 'delivered' },
    ]
  },
  {
    id: 'conv2', leadId: '2', leadName: 'Antonio Martínez Ruiz', leadPhone: '+34 623 456 789',
    leadEmail: 'antonio.martinez@email.com', lastMessage: 'Vale, me pasas los planos?',
    lastTime: '2026-05-09T16:30:00Z', unread: 0, source: 'web',
    messages: [
      { id: 'm8', from: 'lead', text: 'Buenas tardes, quería información sobre el apartamento del Sur.', timestamp: '2026-05-09T14:15:00Z', status: 'read' },
      { id: 'm9', from: 'agent', text: '¡Hola Antonio! El apartamento tiene 2 habitaciones, 1 baño y 75m². El precio es 220.000€. ¿Te interesa visitarlo?', timestamp: '2026-05-09T14:20:00Z', status: 'read' },
      { id: 'm10', from: 'lead', text: 'Vale, me pasas los planos?', timestamp: '2026-05-09T16:30:00Z', status: 'read' },
    ]
  },
  {
    id: 'conv3', leadId: '3', leadName: 'Carmen Fernández Díaz', leadPhone: '+34 634 567 890',
    leadEmail: 'carmen.fernandez@email.com', lastMessage: 'Genial, muchas gracias!',
    lastTime: '2026-05-08T12:00:00Z', unread: 1, source: 'referral',
    messages: [
      { id: 'm11', from: 'lead', text: 'Hola, me recomendó un amigo. Busco casa en el Sur.', timestamp: '2026-05-08T11:00:00Z', status: 'read' },
      { id: 'm12', from: 'agent', text: '¡Qué bien! Tenemos una casa adosada de 4 habitaciones por 520.000€ en zona Sur. ¿Te gustaría más información?', timestamp: '2026-05-08T11:05:00Z', status: 'read' },
      { id: 'm13', from: 'lead', text: 'Genial, muchas gracias!', timestamp: '2026-05-08T12:00:00Z', status: 'sent' },
    ]
  },
  {
    id: 'conv4', leadId: '4', leadName: 'David López Sánchez', leadPhone: '+34 645 678 901',
    leadEmail: 'david.lopez@email.com', lastMessage: 'Ok, lo hablamos luego.',
    lastTime: '2026-05-07T18:20:00Z', unread: 0, source: 'instagram',
    messages: [
      { id: 'm14', from: 'lead', text: 'Hola! Vi el estudio en Instagram, está disponible?', timestamp: '2026-05-07T16:45:00Z', status: 'read' },
      { id: 'm15', from: 'agent', text: 'Hola David! Sí, el estudio en el Centro está disponible. 950€/ mes todo incluido. ¿Quieres visitarlo?', timestamp: '2026-05-07T17:00:00Z', status: 'read' },
      { id: 'm16', from: 'lead', text: 'Ok, lo hablamos luego.', timestamp: '2026-05-07T18:20:00Z', status: 'read' },
    ]
  },
  {
    id: 'conv5', leadId: '7', leadName: 'Gloria Ramírez Castro', leadPhone: '+34 678 901 234',
    leadEmail: 'gloria.ramirez@email.com', lastMessage: 'Perfecto, te confirmo mañana.',
    lastTime: '2026-05-04T15:00:00Z', unread: 0, source: 'facebook',
    messages: [
      { id: 'm17', from: 'lead', text: 'Hola, quería info del dúplex en el Este.', timestamp: '2026-05-04T13:20:00Z', status: 'read' },
      { id: 'm18', from: 'agent', text: 'Hola Gloria! El dúplex tiene 3 habitaciones, 2 baños y 110m². Precio 410.000€. ¿Te gustaría visitarlo?', timestamp: '2026-05-04T13:25:00Z', status: 'read' },
      { id: 'm19', from: 'lead', text: 'Perfecto, te confirmo mañana.', timestamp: '2026-05-04T15:00:00Z', status: 'read' },
    ]
  },
]

const sourceColors = {
  whatsapp: 'text-green-400 bg-green-500/10',
  web: 'text-blue-400 bg-blue-500/10',
  referral: 'text-purple-400 bg-purple-500/10',
  instagram: 'text-pink-400 bg-pink-500/10',
  facebook: 'text-indigo-400 bg-indigo-500/10',
  email: 'text-amber bg-amber/10',
}

function StatusIcon({ status }) {
  if (status === 'sent') return <Check size={12} className="text-muted2" />
  if (status === 'delivered') return <CheckCheck size={12} className="text-muted2" />
  if (status === 'read') return <CheckCheck size={12} className="text-blue-500" />
  return <Clock size={12} className="text-muted2" />
}

export default function ConversationsPage() {
  const { conversations } = useStore()
  const [search, setSearch] = useState('')
  const [selectedConvId, setSelectedConvId] = useState(null)
  const [newMessage, setNewMessage] = useState('')
  const [localConvs, setLocalConvs] = useState([])
  const messagesEndRef = useRef(null)

  useEffect(() => {
    if (localConvs.length === 0) {
      setLocalConvs(initialConversations)
    }
  }, [])

  const filteredConvs = useMemo(() => {
    let result = localConvs.length > 0 ? localConvs : initialConversations
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.leadName?.toLowerCase().includes(q) ||
        c.lastMessage?.toLowerCase().includes(q) ||
        c.leadPhone?.includes(q)
      )
    }
    return result.sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime))
  }, [localConvs, search])

  const selectedConv = useMemo(() => {
    return filteredConvs.find(c => c.id === selectedConvId) || null
  }, [filteredConvs, selectedConvId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selectedConv?.messages])

  const handleSend = () => {
    if (!newMessage.trim() || !selectedConv) return
    setLocalConvs(prev => prev.map(c => {
      if (c.id !== selectedConv.id) return c
      const newMsg = {
        id: `m${Date.now()}`,
        from: 'agent',
        text: newMessage.trim(),
        timestamp: new Date().toISOString(),
        status: 'sent'
      }
      return {
        ...c,
        messages: [...c.messages, newMsg],
        lastMessage: newMessage.trim(),
        lastTime: new Date().toISOString()
      }
    }))
    setNewMessage('')
  }

  const handleMarkRead = (convId) => {
    setLocalConvs(prev => prev.map(c =>
      c.id === convId ? { ...c, unread: 0 } : c
    ))
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-[calc(100vh-8rem)] flex gap-0"
    >
      <div className={`w-full lg:w-80 xl:w-96 bg-surface rounded-2xl border border-border-secondary flex flex-col shrink-0 ${
        selectedConv ? 'hidden lg:flex' : 'flex'
      }`}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500/10 to-green-600/10 text-green-400 flex items-center justify-center shadow-sm border border-green-500/20">
              <MessageCircle size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink font-syne">Conversaciones</h2>
              <p className="text-xs text-muted">{filteredConvs.length} chats activos</p>
            </div>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar conversaciones..."
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageCircle size={32} className="text-muted2 mb-3" />
              <p className="text-sm text-muted">No se encontraron conversaciones</p>
            </div>
          ) : (
            filteredConvs.map((conv, i) => (
              <motion.button
                key={conv.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => { setSelectedConvId(conv.id); handleMarkRead(conv.id) }}
                className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors hover:bg-indigo-500/10 border-b border-border-secondary/50 last:border-0 ${
                  selectedConvId === conv.id ? 'bg-indigo-500/15' : ''
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-sm font-bold shadow-sm">
                    {getInitials(conv.leadName)}
                  </div>
                  {conv.unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-green-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full shadow-sm">
                      {conv.unread}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink truncate">{conv.leadName}</h3>
                    <span className="text-[10px] text-muted whitespace-nowrap">{formatDate(conv.lastTime)}</span>
                  </div>
                  <p className={`text-xs mt-0.5 truncate ${conv.unread > 0 ? 'font-medium text-ink' : 'text-muted'}`}>
                    {conv.lastMessage}
                  </p>
                </div>
              </motion.button>
            ))
          )}
        </div>
      </div>

      <div className={`flex-1 flex flex-col bg-surface rounded-2xl border border-border-secondary lg:ml-4 overflow-hidden ${
        !selectedConv ? 'hidden lg:flex' : 'flex'
      }`}>
        {selectedConv ? (
          <>
            <div className="px-4 py-3 border-b border-border-secondary flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setSelectedConvId(null)}
                  className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors lg:hidden"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-sm font-bold shrink-0 shadow-sm">
                  {getInitials(selectedConv.leadName)}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-ink truncate">{selectedConv.leadName}</h3>
                  <p className="text-xs text-muted">{selectedConv.leadPhone}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-2 rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors" title="Llamar">
                  <Phone size={16} />
                </button>
                <button className="p-2 rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors" title="Email">
                  <Mail size={16} />
                </button>
                <button className="p-2 rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors" title="Más opciones">
                  <MoreVertical size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface2/30">
              {selectedConv.messages.map((msg, i) => {
                const isLead = msg.from === 'lead'
                const showDate = i === 0 || new Date(msg.timestamp).toDateString() !== new Date(selectedConv.messages[i - 1].timestamp).toDateString()
                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="flex justify-center mb-3">
                        <span className="px-3 py-1 bg-surface border border-border-secondary rounded-full text-[10px] text-muted font-medium">
                          {formatFullDate(msg.timestamp)}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${isLead ? 'justify-start' : 'justify-end'} items-end gap-2`}>
                      {isLead && (
                        <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0 mb-1 border border-indigo-500/10">
                          {getInitials(selectedConv.leadName)}
                        </div>
                      )}
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                        isLead
                          ? 'bg-surface2 text-ink border border-border-secondary rounded-bl-md'
                          : 'bg-indigo-600 text-white rounded-br-md shadow-glow'
                      }`}>
                        <p className="text-sm leading-relaxed">{msg.text}</p>
                        <div className={`flex items-center gap-1.5 mt-1 ${isLead ? 'justify-start' : 'justify-end'}`}>
                          <span className={`text-[10px] ${isLead ? 'text-muted' : 'text-blue-200'}`}>
                            {formatDate(msg.timestamp)}
                          </span>
                          {!isLead && <StatusIcon status={msg.status} />}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-border-secondary p-3 shrink-0 bg-surface">
              <div className="flex items-center gap-2">
                <button className="p-2 rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors">
                  <Paperclip size={18} />
                </button>
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 px-4 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                />
                <button className="p-2 rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors">
                  <Smile size={18} />
                </button>
                <button
                  onClick={handleSend}
                  disabled={!newMessage.trim()}
                  className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-glow"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-2xl bg-surface2 flex items-center justify-center mb-4">
              <MessageCircle size={40} className="text-muted2" />
            </div>
            <h3 className="text-lg font-semibold text-ink mb-1">Selecciona una conversación</h3>
            <p className="text-sm text-muted max-w-sm">
              Elige un chat de la izquierda para ver los mensajes
            </p>
          </div>
        )}
      </div>
    </motion.div>
  )
}
