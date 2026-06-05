import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle, Search, Send, Phone, Mail, User,
  Check, CheckCheck, Clock, MoreVertical, ArrowLeft,
  Star, Bell, Paperclip, Smile, Bot
} from 'lucide-react'
import { useStore } from '../lib/store'
import api from '../lib/api'
import toast from 'react-hot-toast'
import { formatDate, getInitials, formatFullDate } from '../utils/formatters'

const sourceColors = {
  whatsapp: 'text-green-400 bg-green-500/10',
  web: 'text-blue-400 bg-blue-500/10',
  referral: 'text-purple-400 bg-purple-500/10',
  instagram: 'text-pink-400 bg-pink-500/10',
  facebook: 'text-indigo-400 bg-indigo-500/10',
  email: 'text-amber bg-amber/10',
  manual: 'text-gray-400 bg-gray-500/10',
}

function StatusIcon({ status }) {
  if (status === 'sent') return <Check size={12} className="text-muted2" />
  if (status === 'delivered') return <CheckCheck size={12} className="text-muted2" />
  if (status === 'read') return <CheckCheck size={12} className="text-blue-500" />
  return <Clock size={12} className="text-muted2" />
}

export default function ConversationsPage() {
  const { conversations, fetchConversations } = useStore()
  const [search, setSearch] = useState('')
  const [selectedConvId, setSelectedConvId] = useState(null)
  const [newMessage, setNewMessage] = useState('')
  const [activeMessages, setActiveMessages] = useState([])
  const [iaHandling, setIaHandling] = useState(true)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    fetchConversations()
  }, [])

  const filteredConvs = useMemo(() => {
    let result = conversations || []
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.lead_name?.toLowerCase().includes(q) ||
        c.agent_name?.toLowerCase().includes(q) ||
        c.last_message?.toLowerCase().includes(q) ||
        c.lead_phone?.includes(q)
      )
    }
    return [...result].sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
  }, [conversations, search])

  const selectedConv = useMemo(() => {
    return filteredConvs.find(c => c.id === selectedConvId) || null
  }, [filteredConvs, selectedConvId])

  useEffect(() => {
    if (!selectedConvId) {
      setActiveMessages([])
      return
    }
    const fetchMessages = async () => {
      try {
        const msgs = await api.get(`/conversations/${selectedConvId}/messages`)
        setActiveMessages(msgs || [])
        
        // Find conv in local list to sync ia_handling
        const conv = conversations.find(c => c.id === selectedConvId)
        if (conv) {
          setIaHandling(conv.ia_handling !== false)
        }
      } catch (e) {
        console.error(e)
      }
    }
    fetchMessages()
  }, [selectedConvId, conversations])

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    let socket;
    let reconnectTimeout;

    function connect() {
      try {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          console.log('[WebSocket] Conectado en ConversationsPage');
        };

        socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'message' && msg.data) {
              const { conversation_id, message } = msg.data;
              if (conversation_id === selectedConvId) {
                setActiveMessages(prev => {
                  if (prev.some(m => m.id === message.id)) return prev;
                  return [...prev, message];
                });
              }
              fetchConversations();
            }
          } catch (e) {
            console.error(e);
          }
        };

        socket.onclose = () => {
          reconnectTimeout = setTimeout(connect, 3000);
        };

        socket.onerror = () => {
          socket.close();
        };
      } catch (e) {
        console.error(e);
      }
    }

    connect();

    return () => {
      if (socket) socket.close();
      clearTimeout(reconnectTimeout);
    };
  }, [selectedConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeMessages])

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedConvId) return
    try {
      const text = newMessage
      setNewMessage('')
      
      // Optimistic append
      const tempId = Math.random().toString()
      const tempMsg = {
        id: tempId,
        role: 'agent',
        sender_type: 'user',
        content: text,
        timestamp: new Date().toISOString(),
        status: 'sending'
      }
      setActiveMessages(prev => [...prev, tempMsg])

      const sentMsg = await api.post(`/conversations/${selectedConvId}/messages`, { content: text })
      
      // Update with server message
      setActiveMessages(prev => prev.map(m => m.id === tempId ? sentMsg : m))
      fetchConversations()
    } catch (e) {
      toast.error('Error al enviar mensaje')
    }
  }

  const handleToggleIA = async () => {
    if (!selectedConvId) return
    try {
      const nextVal = !iaHandling
      setIaHandling(nextVal)
      await api.patch(`/conversations/${selectedConvId}`, { ia_handling: nextVal })
      toast.success(nextVal ? 'IA activa para responder' : 'IA pausada para responder manualmente')
      fetchConversations()
    } catch (e) {
      toast.error('Error al actualizar estado de IA')
      setIaHandling(!iaHandling)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-[calc(100vh-8rem)] flex gap-0"
    >
      <div className={`w-full lg:w-80 xl:w-96 bg-[#13131A] rounded-2xl border border-[#1E1E2E] flex flex-col shrink-0 ${
        selectedConv ? 'hidden lg:flex' : 'flex'
      }`}>
        <div className="p-4 border-b border-[#1E1E2E]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500/10 to-green-600/10 text-green-400 flex items-center justify-center shadow-sm border border-green-500/20">
              <MessageCircle size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#F1F5F9] font-syne">Conversaciones</h2>
              <p className="text-xs text-gray-400">{filteredConvs.length} chats</p>
            </div>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar conversaciones..."
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#0A0A0F] border border-[#1E1E2E] text-white rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageCircle size={32} className="text-gray-500 mb-3" />
              <p className="text-sm text-gray-400">No se encontraron conversaciones</p>
            </div>
          ) : (
            filteredConvs.map((conv, i) => {
              const msgs = conv.messages || []
              const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null
              const lastText = lastMsg?.content || lastMsg?.text || conv.last_message?.content || conv.last_message || ''
              const lastTime = lastMsg?.timestamp || conv.last_time || conv.updated_at || conv.created_at
              const leadName = conv.lead?.name || conv.lead_name || 'Lead'
              return (
                <motion.button
                  key={conv.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => setSelectedConvId(conv.id)}
                  className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors hover:bg-indigo-500/10 border-b border-[#1E1E2E]/50 last:border-0 ${
                    selectedConvId === conv.id ? 'bg-indigo-500/15' : ''
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-sm font-bold shadow-sm">
                      {getInitials(leadName)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className="text-sm font-semibold text-[#F1F5F9] truncate">{leadName}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase shrink-0 ${
                          conv.channel === 'whatsapp'
                            ? 'text-green-400 bg-green-500/10 border-green-500/20'
                            : conv.channel === 'email'
                              ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                              : conv.channel === 'web'
                                ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                                : 'text-gray-400 bg-white/5 border-white/10'
                        }`}>
                          {conv.channel || 'web'}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatDate(lastTime)}</span>
                    </div>
                    <p className="text-xs mt-0.5 truncate text-gray-400">{lastText}</p>
                  </div>
                </motion.button>
              )
            })
          )}
        </div>
      </div>

      <div className={`flex-1 flex flex-col bg-[#13131A] rounded-2xl border border-[#1E1E2E] lg:ml-4 overflow-hidden ${
        !selectedConv ? 'hidden lg:flex' : 'flex'
      }`}>
        {selectedConv ? (
          <>
            <div className="px-4 py-3 border-b border-[#1E1E2E] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setSelectedConvId(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors lg:hidden"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-sm font-bold shrink-0 shadow-sm">
                  {getInitials(selectedConv.lead?.name || selectedConv.lead_name || '')}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[#F1F5F9] truncate">
                    {selectedConv.lead?.name || selectedConv.lead_name || 'Lead'}
                  </h3>
                  <p className="text-xs text-gray-400">{selectedConv.lead?.phone || selectedConv.lead_phone || ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-[#1E1E2E] px-3 py-1.5 rounded-xl border border-[#2E2E3E]">
                  <Bot size={14} className="text-indigo-400" />
                  <span className="text-xs text-gray-400 font-medium hidden sm:inline">IA Activa</span>
                  <button
                    onClick={handleToggleIA}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                      iaHandling ? 'bg-indigo-600' : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        iaHandling ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-2 rounded-lg text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors" title="Más opciones">
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0A0A0F]/50">
              {activeMessages.map((msg, i) => {
                const isLead = msg.role === 'lead' || msg.from === 'lead' || msg.sender_type === 'lead' || msg.author === 'lead'
                const isIA = msg.sender_type === 'ia_agent' || msg.role === 'assistant' || msg.author === 'ia_agent'
                const showDate = i === 0 || new Date(msg.timestamp || msg.created_at).toDateString() !== new Date(activeMessages[i - 1]?.timestamp || activeMessages[i - 1]?.created_at).toDateString()
                return (
                  <div key={msg.id || i}>
                    {showDate && (
                      <div className="flex justify-center mb-3">
                        <span className="px-3 py-1 bg-[#13131A] border border-[#1E1E2E] rounded-full text-[10px] text-gray-400 font-medium">
                          {formatFullDate(msg.timestamp || msg.created_at)}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${isLead ? 'justify-start' : 'justify-end'} items-end gap-2`}>
                      {isLead && (
                        <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0 mb-1 border border-indigo-500/10">
                          {getInitials(selectedConv.lead?.name || selectedConv.lead_name || '')}
                        </div>
                      )}
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                        isLead
                          ? 'bg-[#1E1E2E] text-white border border-[#2E2E3E] rounded-bl-md'
                          : isIA
                            ? 'bg-violet-600/90 text-white rounded-br-md border border-violet-500/30 shadow-lg shadow-violet-500/20'
                            : 'bg-indigo-600 text-white rounded-br-md shadow-glow'
                      }`}>
                        <p className="text-sm leading-relaxed">{msg.content || msg.text}</p>
                        <div className={`flex items-center gap-1.5 mt-1 ${isLead ? 'justify-start' : 'justify-end'}`}>
                          <span className={`text-[10px] ${isLead ? 'text-gray-400' : 'text-blue-200'}`}>
                            {formatDate(msg.timestamp || msg.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-[#1E1E2E] p-3 shrink-0 bg-[#13131A]">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 px-4 py-2.5 text-sm bg-[#0A0A0F] border border-[#1E1E2E] text-white rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                />
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
            <div className="w-20 h-20 rounded-2xl bg-[#1E1E2E] flex items-center justify-center mb-4">
              <MessageCircle size={40} className="text-indigo-400" />
            </div>
            <h3 className="text-lg font-semibold text-[#F1F5F9] mb-1">Selecciona una conversación</h3>
            <p className="text-sm text-gray-400 max-w-sm">
              Elige un chat de la izquierda para ver los mensajes
            </p>
          </div>
        )}
      </div>
    </motion.div>
  )
}
