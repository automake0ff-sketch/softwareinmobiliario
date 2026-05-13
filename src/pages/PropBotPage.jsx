import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wand, Settings, Code, Users, ArrowLeft, ArrowRight, Sparkles, RefreshCw, Copy, Send, Bot, Loader2, BarChart3, MessageSquare, Database, Globe, Home, BookOpen, Zap, ChevronRight } from 'lucide-react'
import styles from './PropBotPage.module.css'

const OPENROUTER_URL = import.meta.env.VITE_OPENROUTER_URL || 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = import.meta.env.VITE_OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct'
const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || ''

function uid() { return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7) }

const KNOWLEDGE_MODULES = [
  { id: 'legales', label: 'Normativa legal inmobiliaria', desc: 'LAU, plusvalía, ITP, IVA, AJD' },
  { id: 'financiacion', label: 'Financiación hipotecaria', desc: 'Tipos de hipoteca, Euríbor, Tasación' },
  { id: 'marketing', label: 'Marketing inmobiliario', desc: 'Home staging, fotografía, copy, redes' },
  { id: 'tasacion', label: 'Tasación y valoración', desc: 'Métodos comparativos, coste reposición' },
  { id: 'negociacion', label: 'Negociación y cierre', desc: 'Técnicas de negociación, objeciones' },
  { id: 'fiscalidad', label: 'Fiscalidad inmobiliaria', desc: 'IRPF, plusvalía municipal, patrimonio' },
  { id: 'urbanismo', label: 'Urbanismo y licencias', desc: 'Planeamiento, licencias de obra' },
  { id: 'seguros', label: 'Seguros inmobiliarios', desc: 'Hogar, multirriesgo, responsabilidad civil' },
]

const SKILLS = [
  { id: 'calificar', label: 'Calificar leads (BANT)', desc: 'Evalúa presupuesto, autoridad, necesidad y tiempo' },
  { id: 'objeciones', label: 'Manejar objeciones', desc: 'Responde a "es muy caro", "lo voy a pensar"' },
  { id: 'visitas', label: 'Reservar visitas', desc: 'Gestiona agenda y confirma citas' },
  { id: 'seguimiento', label: 'Seguimiento post-visita', desc: 'Recordatorios y seguimiento' },
  { id: 'escalar', label: 'Escalar a humano', desc: 'Deriva al agente cuando es necesario' },
  { id: 'captura', label: 'Captura proactiva', desc: 'Solicita datos al detectar interés' },
]

async function callAI(systemPrompt, userMessage, maxTokens = 800) {
  if (!apiKey) throw new Error('API key no configurada en .env')
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'PropBot',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: maxTokens,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `Error ${res.status}`) }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

function LeadsChart({ leads }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width = canvas.parentElement?.offsetWidth || 400
    const h = canvas.height = 140
    ctx.clearRect(0, 0, w, h)
    const days = 7
    const dayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
    const data = []
    for (let i = 0; i < days; i++) {
      const d = new Date(); d.setDate(d.getDate() - (6 - i)); d.setHours(0, 0, 0, 0)
      const count = leads.filter(l => { const ld = new Date(l.fecha || l.date); ld.setHours(0, 0, 0, 0); return ld.getTime() === d.getTime() }).length
      data.push(count || Math.floor(Math.random() * 5) + 1)
    }
    const max = Math.max(...data, 1)
    const pad = { t: 8, b: 20, l: 10, r: 10 }
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b
    const barW = cw / days * 0.65, gap = cw / days * 0.35
    ctx.fillStyle = '#2E2A22'
    data.forEach((v, i) => {
      const x = pad.l + i * (barW + gap) + gap / 2
      const bh = (v / max) * ch, y = pad.t + ch - bh
      ctx.beginPath(); ctx.roundRect(x, y, barW, bh, [3, 3, 0, 0]); ctx.fill()
    })
    ctx.fillStyle = '#D4A853'
    data.forEach((v, i) => {
      const x = pad.l + i * (barW + gap) + gap / 2
      const bh = (v / max) * ch, y = pad.t + ch - bh
      ctx.beginPath(); ctx.roundRect(x, y, barW, bh, [3, 3, 0, 0]); ctx.fill()
    })
    ctx.fillStyle = '#6B6558'; ctx.font = '9px Outfit, sans-serif'; ctx.textAlign = 'center'
    data.forEach((v, i) => {
      const x = pad.l + i * (barW + gap) + gap / 2 + barW / 2
      ctx.fillText(dayLabels[i] || '', x, h - 4)
      ctx.fillText(v, x, pad.t + ch - (v / max) * ch - 4)
    })
  }, [leads])
  return <canvas ref={canvasRef} height="140" style={{ width: '100%' }} />
}

export default function PropBotPage() {
  const [activeTab, setActiveTab] = useState('crear')
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)

  const [botConfig, setBotConfig] = useState({
    nombre: '', ciudad: '', tel: '', web: '', tipos: [], tono: 'Cercano y profesional',
    objetivo: 'Captar leads', botname: '', lang: 'español', extra: '',
  })

  const [systemPrompt, setSystemPrompt] = useState('')
  const [faqs, setFaqs] = useState([])
  const [promptGenerated, setPromptGenerated] = useState(false)
  const [knowledgeProps, setKnowledgeProps] = useState('')
  const [activeKb, setActiveKb] = useState('props')

  const [bots, setBots] = useState(() => { try { const d = localStorage.getItem('propbot_bots'); return d ? JSON.parse(d) : [] } catch { return [] } })
  const [leads, setLeads] = useState(() => { try { const d = localStorage.getItem('propbot_leads'); return d ? JSON.parse(d) : [] } catch { return [] } })
  const [editingBot, setEditingBot] = useState(null)
  const [isNew, setIsNew] = useState(false)

  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [selectedChatBotId, setSelectedChatBotId] = useState('')
  const [leadCaptured, setLeadCaptured] = useState(false)
  const [leadData, setLeadData] = useState(null)
  const [convId] = useState('conv_' + Date.now())

  const [botForm, setBotForm] = useState({
    name: '', company: '', city: '', tone: 'Cercano y profesional', goal: 'Todo en uno',
    prompt: '', props: '', faqs: [], expert: [], skills: [],
    toggles: { leads: true, qualify: false, visits: true, obj: true, escalate: true, saveconv: true },
  })

  useEffect(() => { localStorage.setItem('propbot_bots', JSON.stringify(bots)) }, [bots])
  useEffect(() => { localStorage.setItem('propbot_leads', JSON.stringify(leads)) }, [leads])

  useEffect(() => {
    if (botConfig.botname) {
      setChatMessages([{ role: 'assistant', content: `¡Hola! Soy ${botConfig.botname} de ${botConfig.nombre}. ¿En qué puedo ayudarte hoy? 🏡` }])
    }
  }, [botConfig.botname, botConfig.nombre])

  const generateAll = useCallback(async () => {
    if (!botConfig.nombre || !botConfig.ciudad) return
    setLoading(true)
    setPromptGenerated(true)
    setSystemPrompt('')
    setFaqs([])
    try {
      const tiposStr = botConfig.tipos.length > 0 ? botConfig.tipos.join(', ') : 'todo tipo de propiedades'
      const prompt = await callAI(
        'Eres un experto en real estate y diseño de asistentes virtuales para inmobiliarias.',
        `Crea un prompt de sistema para el asistente virtual de:
Nombre: ${botConfig.nombre}
Ciudad: ${botConfig.ciudad}
Tono: ${botConfig.tono}
Objetivo: ${botConfig.objetivo}
Nombre asistente: ${botConfig.botname || 'Asistente Virtual'}
Tipos: ${tiposStr}
Idioma: ${botConfig.lang}
Responde SOLO el prompt. En ${botConfig.lang}.`, 900)
      setSystemPrompt(prompt)
      const rawFaqs = await callAI(
        'Eres un experto en atención al cliente inmobiliaria.',
        `Genera 5 preguntas frecuentes para ${botConfig.nombre} en ${botConfig.ciudad}.\nFormato: PREGUNTA | RESPUESTA`, 500)
      const parsed = rawFaqs.split('\n').filter(l => l.includes('|')).slice(0, 5).map(l => {
        const [q, a] = l.split('|').map(s => s.trim()); return { q, a }
      }).filter(f => f.q && f.a)
      setFaqs(parsed)
    } catch (err) {
      setSystemPrompt(`Error: ${err.message}\nVerifica tu API key en el archivo .env`)
    } finally { setLoading(false) }
  }, [botConfig])

  const generateProperties = async () => {
    if (!botConfig.ciudad) return
    setKnowledgeProps('Generando propiedades...')
    try {
      const text = await callAI('Eres un agente inmobiliario experto.', `Genera 6 propiedades realistas para ${botConfig.nombre} en ${botConfig.ciudad}.\nFormato por línea: TIPO · ZONA · DESCRIPCION BREVE · PRECIO · REF`, 600)
      setKnowledgeProps(text.trim())
    } catch (err) { setKnowledgeProps(`Error: ${err.message}`) }
  }

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }, { role: 'typing' }])
    try {
      let reply
      if (!apiKey) {
        await new Promise(r => setTimeout(r, 1000))
        const t = userMsg.toLowerCase()
        if (t.includes('hola') || t.includes('buenas')) reply = `¡Hola! Soy ${botConfig.botname || 'tu asistente'} de ${botConfig.nombre}. ¿Buscas comprar, alquilar o invertir? 🏡`
        else if (t.includes('precio') || t.includes('cuanto')) reply = `Contamos con opciones desde 180.000€. ¿Tienes un presupuesto? Te ayudo a encontrar lo mejor.`
        else if (t.includes('visita') || t.includes('ver') || t.includes('cita')) reply = `¡Perfecto! Indícame:\n1. Tu nombre\n2. Tu teléfono\n3. Qué propiedad te interesa\nTe confirmaré en menos de 24h. ✅`
        else reply = `Entendido. Un asesor de ${botConfig.nombre} se pondrá en contacto contigo pronto.`
      } else {
        const sp = selectedChatBotId ? bots.find(b => b.id === selectedChatBotId)?.prompt || '' : ''
        const messages = [
          { role: 'system', content: sp || systemPrompt || `Eres un asistente inmobiliario de ${botConfig.nombre} en ${botConfig.ciudad}.` },
          ...chatMessages.filter(m => m.role !== 'typing').slice(-6).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: userMsg },
        ]
        const res = await fetch(OPENROUTER_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': window.location.origin, 'X-Title': 'PropBot Chat' },
          body: JSON.stringify({ model: DEFAULT_MODEL, max_tokens: 350, temperature: 0.7, messages }),
        })
        const data = await res.json()
        reply = data.choices?.[0]?.message?.content || 'No pude procesar tu mensaje.'
      }
      setChatMessages(prev => prev.filter(m => m.role !== 'typing').concat({ role: 'assistant', content: reply }))
      if (!leadCaptured && /(quiero|me interesa|busco|precio)/i.test(userMsg) && /\d{9,}/.test(userMsg)) {
        setLeadCaptured(true)
        setLeadData({ name: 'Cliente', phone: userMsg.match(/\d{9,}/)?.[0] || '', interest: userMsg.slice(0, 100) })
        const newLead = { id: 'lead_' + uid(), nombre: 'Cliente', telefono: userMsg.match(/\d{9,}/)?.[0] || '', interes: userMsg.slice(0, 100), propiedad: '', presupuesto: '', score: 60, canal: 'chat', estado: 'Nuevo', fecha: Date.now(), convId }
        setLeads(prev => [...prev, newLead])
      }
    } catch { setChatMessages(prev => prev.filter(m => m.role !== 'typing').concat({ role: 'assistant', content: 'Error de conexión.' })) }
  }

  const validateStep1 = () => {
    if (!botConfig.nombre || !botConfig.ciudad) return
    setCurrentStep(2)
    if (!promptGenerated) generateAll()
  }

  const newBot = () => {
    setEditingBot(null); setIsNew(true)
    setBotForm({ name: '', company: '', city: '', tone: 'Cercano y profesional', goal: 'Todo en uno', prompt: '', props: '', faqs: [], expert: [], skills: [], toggles: { leads: true, qualify: false, visits: true, obj: true, escalate: true, saveconv: true } })
    setActiveTab('constructor')
  }

  const editBot = (bot) => {
    setEditingBot(bot); setIsNew(false)
    setBotForm({
      name: bot.name || '', company: bot.company || '', city: bot.city || '',
      tone: bot.tone || 'Cercano y profesional', goal: bot.goal || 'Todo en uno',
      prompt: bot.prompt || '', props: bot.props || '', faqs: bot.faqs || [],
      expert: bot.expert || [], skills: bot.skills || [],
      toggles: bot.toggles || { leads: true, qualify: false, visits: true, obj: true, escalate: true, saveconv: true },
    })
    setActiveTab('constructor')
  }

  const deleteBot = (id) => {
    if (!confirm('¿Eliminar este bot permanentemente?')) return
    setBots(prev => prev.filter(b => b.id !== id))
  }

  const saveBot = () => {
    const { name, company, city } = botForm
    if (!name || !company || !city) { toast?.error?.('Completa nombre, inmobiliaria y ciudad'); return }
    const bot = {
      id: editingBot ? editingBot.id : 'bot_' + uid(), ...botForm,
      createdAt: editingBot ? editingBot.createdAt : Date.now(), updatedAt: Date.now(),
    }
    if (editingBot) {
      setBots(prev => prev.map(b => b.id === editingBot.id ? bot : b))
    } else {
      setBots(prev => [...prev, bot])
    }
    setEditingBot(bot)
    setActiveTab('bots')
  }

  const generateBotAI = async () => {
    if (!botForm.name || !botForm.city) return
    setLoading(true)
    try {
      const p = await callAI('Eres un experto en real estate y diseño de asistentes virtuales para inmobiliarias.', `Crea un prompt de sistema para el asistente virtual de:\nNombre: ${botForm.name}\nCiudad: ${botForm.city}\nTono: ${botForm.tone}\nObjetivo: ${botForm.goal}\nIdioma: español\nResponde SOLO el prompt.`, 900)
      const rawFaqs = await callAI('Eres un experto en atención al cliente inmobiliaria.', `Genera 5 preguntas frecuentes para ${botForm.name} en ${botForm.city}.\nFormato: PREGUNTA | RESPUESTA`, 500)
      const parsed = rawFaqs.split('\n').filter(l => l.includes('|')).slice(0, 5).map(l => {
        const [q, a] = l.split('|').map(s => s.trim()); return { q, a }
      }).filter(f => f.q && f.a)
      setBotForm(prev => ({ ...prev, prompt: p, faqs: parsed }))
    } catch (err) { toast?.error?.('Error: ' + err.message) }
    finally { setLoading(false) }
  }

  const generateBotProperties = async () => {
    if (!botForm.city) return
    try {
      const text = await callAI('Eres un agente inmobiliario experto.', `Genera 6 propiedades realistas para ${botForm.name} en ${botForm.city}.\nFormato por línea: TIPO · ZONA · DESCRIPCION · PRECIO · REF`, 600)
      setBotForm(prev => ({ ...prev, props: text.trim() }))
    } catch (err) { toast?.error?.('Error: ' + err.message) }
  }

  const getSystemPrompt = useCallback(() => {
    const { name, company, city, tone, goal, prompt, props, faqs, expert, skills, toggles } = botForm
    const lines = []
    lines.push(`Eres ${name || 'Asistente'}, un asistente virtual experto en bienes raíces que trabaja para ${company || 'la inmobiliaria'} en ${city || 'tu ciudad'}.`)
    lines.push(''); lines.push('## PERSONALIDAD Y TONO'); lines.push(`Tu tono de comunicación es: ${(tone || 'cercano y profesional').toLowerCase()}.`)
    lines.push('Responde siempre en español, con amabilidad, claridad y profesionalismo.'); lines.push('')
    if (prompt) { lines.push('## INSTRUCCIONES PERSONALIZADAS'); lines.push(prompt.replace(/{empresa}/g, company).replace(/{ciudad}/g, city).replace(/{nombre_bot}/g, name)); lines.push('') }
    if (props) { lines.push('## PROPIEDADES DISPONIBLES'); lines.push(props); lines.push('') }
    if (faqs?.length > 0) { lines.push('## PREGUNTAS FRECUENTES'); faqs.forEach(f => { lines.push('Q: ' + f.q); lines.push('A: ' + f.a) }); lines.push('') }
    if (expert?.length > 0) { lines.push('## CONOCIMIENTO EXPERTO'); KNOWLEDGE_MODULES.filter(m => expert.includes(m.id)).forEach(m => lines.push('- ' + m.label + ': ' + m.desc)); lines.push('') }
    if (skills?.length > 0) { lines.push('## SKILLS ACTIVAS'); SKILLS.filter(s => skills.includes(s.id)).forEach(s => lines.push('- ' + s.label + ': ' + s.desc)); lines.push('') }
    lines.push('## COMPORTAMIENTO')
    lines.push('- ' + (toggles?.leads ? 'DEBES' : 'NO DEBES') + ' captar leads activamente.')
    lines.push('- ' + (toggles?.qualify ? 'DEBES' : 'NO DEBES') + ' calificar leads usando BANT.')
    lines.push('- ' + (toggles?.visits ? 'DEBES' : 'NO DEBES') + ' gestionar y confirmar visitas.')
    lines.push('- ' + (toggles?.obj ? 'DEBES' : 'NO DEBES') + ' manejar objeciones.')
    lines.push('- ' + (toggles?.escalate ? 'SI' : 'NO') + ' debes escalar a agente humano.')
    return lines.join('\n')
  }, [botForm])

  const kbCount = () => {
    let c = 0
    if (botForm.prompt.trim()) c++
    if (botForm.props.trim()) c += botForm.props.split('\n').filter(l => l.trim()).length
    c += botForm.faqs.length
    c += botForm.expert.length
    c += botForm.skills.length
    return c
  }

  const addFAQ = () => setBotForm(prev => ({ ...prev, faqs: [...prev.faqs, { q: '', a: '' }] }))
  const removeFAQ = (i) => setBotForm(prev => ({ ...prev, faqs: prev.faqs.filter((_, idx) => idx !== i) }))
  const updateFAQ = (i, field, value) => { setBotForm(prev => { const faqs = [...prev.faqs]; faqs[i] = { ...faqs[i], [field]: value }; return { ...prev, faqs } }) }
  const toggleExpert = (id) => { setBotForm(prev => ({ ...prev, expert: prev.expert.includes(id) ? prev.expert.filter(x => x !== id) : [...prev.expert, id] })) }
  const toggleSkill = (id) => { setBotForm(prev => ({ ...prev, skills: prev.skills.includes(id) ? prev.skills.filter(x => x !== id) : [...prev.skills, id] })) }

  const addDemoLeads = () => {
    const demos = [
      { nombre: 'Carlos Mendoza', telefono: '612345789', interes: 'Piso 3 hab en Salamanca', propiedad: 'SAL-001', presupuesto: '320.000€', score: 85 },
      { nombre: 'Ana García', telefono: '698765432', interes: 'Villa en La Moraleja', propiedad: 'MOR-042', presupuesto: '1.2M€', score: 72 },
      { nombre: 'Pedro Sánchez', telefono: '611223344', interes: 'Ático en Gracia', propiedad: 'GRA-018', presupuesto: '580.000€', score: 60 },
    ]
    setLeads(prev => [...prev, ...demos.map(d => ({ id: 'lead_' + uid(), ...d, canal: 'chat', estado: 'Nuevo', fecha: Date.now(), convId: '' }))])
  }

  const removeLead = (id) => { if (confirm('¿Eliminar este lead?')) setLeads(prev => prev.filter(l => l.id !== id)) }
  const clearAllLeads = () => { if (confirm('¿Eliminar TODOS los leads?')) setLeads([]) }

  const loadChatBot = (id) => {
    setSelectedChatBotId(id)
    if (id) {
      const bot = bots.find(b => b.id === id)
      setChatMessages([{ role: 'assistant', content: `¡Hola! Soy ${bot?.name || 'Asistente'} de ${bot?.company || 'la inmobiliaria'}. ¿En qué puedo ayudarte? 🏡` }])
      setLeadCaptured(false); setLeadData(null)
    } else { setChatMessages([{ role: 'assistant', content: 'Selecciona un bot para comenzar' }]) }
  }

  const exportCSV = () => {
    if (leads.length === 0) return
    const headers = 'Nombre,Teléfono,Email,Interés,Propiedad,Presupuesto,Score,Canal,Estado,Fecha,Notas'
    const csv = headers + '\n' + leads.map(l => `"${l.nombre}","${l.telefono}","${l.email || ''}","${l.interes}","${l.propiedad || ''}","${l.presupuesto || ''}",${l.score || 0},"${l.canal || 'chat'}","${l.estado || 'Nuevo'}","${new Date(l.fecha || l.date).toLocaleDateString()}","${(l.notas || '').replace(/"/g, '""')}"`).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'leads.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const kbTabs = [
    { id: 'kt-prompt', label: 'Prompt libre', icon: 'M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
    { id: 'kt-props', label: 'Propiedades', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { id: 'kt-faqs', label: 'FAQs', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-5 5v-5z' },
    { id: 'kt-realestate', label: 'Conocimiento experto', icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 0 0 1.946-.806 3.42 3.42 0 0 1 4.438 0 3.42 3.42 0 0 0 1.946.806 3.42 3.42 0 0 1 3.138 3.138 3.42 3.42 0 0 0 .806 1.946 3.42 3.42 0 0 1 0 4.438 3.42 3.42 0 0 0-.806 1.946 3.42 3.42 0 0 1-3.138 3.138 3.42 3.42 0 0 0-1.946.806 3.42 3.42 0 0 1-4.438 0 3.42 3.42 0 0 0-1.946-.806 3.42 3.42 0 0 1-3.138-3.138 3.42 3.42 0 0 0-.806-1.946 3.42 3.42 0 0 1 0-4.438 3.42 3.42 0 0 0 .806-1.946 3.42 3.42 0 0 1 3.138-3.138z' },
    { id: 'kt-skills', label: 'Skills del bot', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  ]

  const tabs = [
    { id: 'crear', label: 'Crear asistente', icon: Wand },
    { id: 'constructor', label: 'Constructor', icon: Settings },
    { id: 'chat', label: 'Chat Preview', icon: MessageSquare },
    { id: 'leads', label: `Leads (${leads.length})`, icon: Users },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'config', label: 'Configuración', icon: Settings },
    { id: 'embed', label: 'Integración', icon: Code },
  ]

  return (
    <div className={styles.app}>
      <div className={styles.main}>
        <div className={styles.topnav}>
          {tabs.map(t => (
            <button key={t.id} className={`${styles.tnav} ${activeTab === t.id ? styles.active : ''}`} onClick={() => setActiveTab(t.id)}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {/* TAB: CREAR ASISTENTE */}
        {activeTab === 'crear' && (
          <div>
            <div className={styles.wizard}>
              {[1, 2, 3, 4].map((step, i) => (
                <div key={step} className={styles.wstep}>
                  <div className={`${styles.wdot} ${currentStep > step ? styles.done : currentStep === step ? styles.active : ''}`}>
                    {currentStep > step ? '✓' : step}
                  </div>
                  <div className={styles.wlabel}>
                    <strong>{['Setup', 'Generar IA', 'Conocimiento', 'Preview'][i]}</strong>
                    <span>{['Datos básicos', 'Prompt + FAQs', 'Propiedades', 'Chatbot listo'][i]}</span>
                  </div>
                  {i < 3 && <div className={`${styles.wline} ${currentStep > step + 1 ? styles.done : ''}`} />}
                </div>
              ))}
            </div>

            {currentStep === 1 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className={styles.card}>
                  <div className={styles.cardHd}><Bot size={20} /><h3>Datos de la inmobiliaria</h3></div>
                  <div className={styles.formGrid}>
                    <div className={styles.fg}>
                      <label>Nombre de la inmobiliaria *</label>
                      <input type="text" value={botConfig.nombre} onChange={e => setBotConfig(prev => ({ ...prev, nombre: e.target.value }))} placeholder="ej. Grupo Inmobiliario Sevilla" />
                    </div>
                    <div className={styles.fg}>
                      <label>Ciudad o zona principal *</label>
                      <input type="text" value={botConfig.ciudad} onChange={e => setBotConfig(prev => ({ ...prev, ciudad: e.target.value }))} placeholder="ej. Sevilla, Madrid..." />
                    </div>
                  </div>
                  <div className={styles.formGrid}>
                    <div className={styles.fg}>
                      <label>Teléfono</label>
                      <input type="tel" value={botConfig.tel} onChange={e => setBotConfig(prev => ({ ...prev, tel: e.target.value }))} placeholder="+34 600 000 000" />
                    </div>
                    <div className={styles.fg}>
                      <label>Web / Email</label>
                      <input type="text" value={botConfig.web} onChange={e => setBotConfig(prev => ({ ...prev, web: e.target.value }))} placeholder="web.com o email@ejemplo.com" />
                    </div>
                  </div>
                  <div className={styles.fg}>
                    <label>Tipo de propiedades</label>
                    <div className={styles.chips}>
                      {['Pisos', 'Villas', 'Adosados', 'Locales', 'Oficinas', 'Obra nueva', 'Lujo', 'Alquiler', 'Inversión'].map(t => (
                        <div key={t} className={`${styles.chip} ${botConfig.tipos.includes(t) ? styles.chipOn : ''}`} onClick={() => setBotConfig(prev => ({ ...prev, tipos: prev.tipos.includes(t) ? prev.tipos.filter(x => x !== t) : [...prev.tipos, t] }))}>{t}</div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardHd}><Sparkles size={20} /><h3>Personalidad del asistente</h3></div>
                  <div className={styles.formGrid}>
                    <div className={styles.fg}>
                      <label>Tono</label>
                      <div className={styles.chips}>
                        {['Cercano y profesional', 'Premium', 'Lujo exclusivo', 'Joven y dinámico'].map(t => (
                          <div key={t} className={`${styles.chip} ${botConfig.tono === t ? styles.chipOn : ''}`} onClick={() => setBotConfig(prev => ({ ...prev, tono: t }))}>{t}</div>
                        ))}
                      </div>
                    </div>
                    <div className={styles.fg}>
                      <label>Objetivo</label>
                      <div className={styles.chips}>
                        {['Captar leads', 'Reservar visitas', 'Responder FAQs', 'Todo en uno'].map(t => (
                          <div key={t} className={`${styles.chip} ${botConfig.objetivo === t ? styles.chipOn : ''}`} onClick={() => setBotConfig(prev => ({ ...prev, objetivo: t }))}>{t}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className={styles.formGrid}>
                    <div className={styles.fg}>
                      <label>Nombre del asistente</label>
                      <input type="text" value={botConfig.botname} onChange={e => setBotConfig(prev => ({ ...prev, botname: e.target.value }))} placeholder="ej. Sofía, Carlos..." />
                    </div>
                    <div className={styles.fg}>
                      <label>Idioma</label>
                      <select value={botConfig.lang} onChange={e => setBotConfig(prev => ({ ...prev, lang: e.target.value }))}>
                        <option value="español">Español</option>
                        <option value="inglés">English</option>
                        <option value="francés">Français</option>
                        <option value="catalán">Català</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className={styles.btnRow}>
                  <span className={styles.textSm}>Paso 1 de 4</span>
                  <button className="btn btn-primary" onClick={validateStep1} disabled={!botConfig.nombre || !botConfig.ciudad}>
                    Generar asistente con IA <Sparkles size={14} />
                  </button>
                </div>
              </motion.div>
            )}

            {currentStep === 2 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className={styles.card}>
                  <div className={styles.cardHd}><Sparkles size={20} /><h3>Prompt generado por IA</h3></div>
                  {loading ? (
                    <div className={styles.aiLoading}><Loader2 size={20} className={styles.spin} /><div>
                      <div style={{ fontWeight: 500 }}>Generando prompt personalizado...</div>
                      <div className={styles.textSm}>La IA está analizando tu inmobiliaria</div>
                    </div></div>
                  ) : (
                    <>
                      <div className={styles.promptBox}>{systemPrompt || 'Genera el prompt primero...'}</div>
                      <div className={styles.promptToolbar}>
                        <button className="btn btn-outline btn-sm" onClick={generateAll}><RefreshCw size={14} /> Regenerar</button>
                        <button className="btn btn-outline btn-sm" onClick={() => navigator.clipboard.writeText(systemPrompt)}><Copy size={14} /> Copiar</button>
                      </div>
                    </>
                  )}
                </div>
                {faqs.length > 0 && (
                  <div className={styles.card}>
                    <div className={styles.cardHd}><Sparkles size={20} /><h3>FAQs generadas</h3></div>
                    {faqs.map((f, i) => (
                      <div key={i} className={styles.faqItem}>
                        <div className={styles.faqQ}>❓ {f.q}</div>
                        <div className={styles.faqA}>{f.a}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className={styles.btnRow}>
                  <button className="btn btn-outline" onClick={() => setCurrentStep(1)}><ArrowLeft size={14} /> Volver</button>
                  <button className="btn btn-primary" onClick={() => setCurrentStep(3)} disabled={!systemPrompt}>Siguiente <ArrowRight size={14} /></button>
                </div>
              </motion.div>
            )}

            {currentStep === 3 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className={styles.card}>
                  <div className={styles.cardHd}><Bot size={20} /><h3>Base de conocimiento</h3></div>
                  <div className={styles.optGrid}>
                    <div className={`${styles.optCard} ${activeKb === 'props' ? styles.optCardActive : ''}`} onClick={() => setActiveKb('props')}>
                      <Bot size={28} /><strong>Propiedades</strong><small>Lista de inmuebles</small>
                    </div>
                    <div className={`${styles.optCard} ${activeKb === 'faqs' ? styles.optCardActive : ''}`} onClick={() => setActiveKb('faqs')}>
                      <Sparkles size={28} /><strong>FAQs manuales</strong><small>Preguntas y respuestas</small>
                    </div>
                  </div>
                  {activeKb === 'props' && (
                    <div className={styles.fg}>
                      <label>Lista de propiedades</label>
                      <textarea value={knowledgeProps} onChange={e => setKnowledgeProps(e.target.value)} placeholder="Piso 3 hab en Triana · 85m2 · 280.000€ · Ref: TRI-001" style={{ minHeight: 160 }} />
                      <button className="btn btn-outline btn-sm" onClick={generateProperties}><Sparkles size={14} /> Generar con IA</button>
                    </div>
                  )}
                  {activeKb === 'faqs' && (
                    <div className={styles.fg}>
                      <label>FAQs adicionales</label>
                      <textarea placeholder="¿Cuál es el horario? | Lunes a viernes 9:00-20:00" style={{ minHeight: 160 }} />
                    </div>
                  )}
                </div>
                <div className={styles.btnRow}>
                  <button className="btn btn-outline" onClick={() => setCurrentStep(2)}><ArrowLeft size={14} /> Volver</button>
                  <button className="btn btn-primary" onClick={() => setCurrentStep(4)}>Vista previa <ArrowRight size={14} /></button>
                </div>
              </motion.div>
            )}

            {currentStep === 4 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem' }}>
                <div>
                  <div className={styles.card}>
                    <div className={styles.cardHd}><Sparkles size={20} /><h3>Asistente: {botConfig.botname || 'Asistente'}</h3></div>
                    <div className={styles.botInfo}><strong>{botConfig.botname || 'Asistente'}</strong> de {botConfig.nombre} · {botConfig.ciudad}<span className={styles.statusBadge}>Listo</span></div>
                    <div className={styles.btnRow}>
                      <button className="btn btn-outline" onClick={() => setCurrentStep(3)}><ArrowLeft size={14} /> Editar</button>
                      <button className="btn btn-acc" onClick={() => setActiveTab('embed')}><Code size={14} /> Obtener código</button>
                    </div>
                  </div>
                </div>
                <div>
                  <div className={styles.chatFrame}>
                    <div className={styles.chatHead}>
                      <div className={styles.chatAv}>{botConfig.botname?.substring(0, 2).toUpperCase() || 'B'}</div>
                      <div>
                        <div className={styles.chatName}>{botConfig.botname || 'Asistente'}</div>
                        <div className={styles.chatSub}><div className={styles.chatOnline} /> En línea</div>
                      </div>
                    </div>
                    <div className={styles.chatBody}>
                      <AnimatePresence>
                        {chatMessages.map((msg, i) => (
                          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            className={`${styles.msg} ${msg.role === 'user' ? styles.msgUser : msg.role === 'typing' ? styles.msgTyping : styles.msgBot}`}>
                            {msg.role === 'typing' ? (
                              <div className={styles.typingDots}><div /><div /><div /></div>
                            ) : msg.content.split('\n').map((line, j) => <div key={j}>{line}</div>)}
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                    <div className={styles.chatInputRow}>
                      <input type="text" className={styles.chatInp} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChatMessage()} placeholder="Escribe un mensaje..." />
                      <button className={styles.chatSendBtn} onClick={sendChatMessage}><Send size={14} /></button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* TAB: CONSTRUCTOR */}
        {activeTab === 'constructor' && (
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1rem', alignItems: 'start' }}>
            <div className={styles.sidebarPanel}>
              <div className={styles.sidebarSection}>Mis Bots</div>
              <div className={styles.botMiniList}>
                {bots.length === 0 ? (
                  <div className={styles.sidebarEmpty}>Crea tu primer bot</div>
                ) : bots.slice(0, 10).map(bot => (
                  <div key={bot.id} className={`${styles.botMini} ${editingBot?.id === bot.id ? styles.botMiniOn : ''}`} onClick={() => editBot(bot)}>
                    <div className={styles.botMiniName}>{bot.name}</div>
                    <div className={styles.botMiniSub}>{bot.company} · {bot.city}</div>
                  </div>
                ))}
              </div>
              <button className={styles.newBotBtn} onClick={newBot}>+ Nuevo bot</button>
              <div className={styles.sidebarSection} style={{ marginTop: 0 }}>Base de datos</div>
              <div className={styles.sbItem} onClick={() => setActiveTab('leads')}>Leads <span className={styles.sbBadge}>{leads.length}</span></div>
              <div className={styles.sbItem}>Conversaciones <span className={styles.sbBadge}>{leads.filter(l => l.convId).length}</span></div>
            </div>

            <div>
              <div className={styles.card}>
                <div className={styles.cardHd}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Settings size={18} />
                    <h3>Constructor de bot</h3>
                  </div>
                  <div className={styles.btnRow}>
                    <button className="btn btn-outline btn-sm" onClick={() => { navigator.clipboard.writeText(getSystemPrompt()); toast?.success?.('Prompt copiado') }}>Ver prompt final</button>
                    <button className="btn btn-primary" onClick={saveBot}>Guardar bot</button>
                  </div>
                </div>

                <div style={{ padding: 16 }}>
                  <div className={styles.formGrid}>
                    <div className={styles.fg}><label>Nombre del bot *</label><input type="text" value={botForm.name} onChange={e => setBotForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Ej: Sofía" /></div>
                    <div className={styles.fg}><label>Inmobiliaria *</label><input type="text" value={botForm.company} onChange={e => setBotForm(prev => ({ ...prev, company: e.target.value }))} placeholder="Grupo Inmobiliario" /></div>
                    <div className={styles.fg}><label>Ciudad principal *</label><input type="text" value={botForm.city} onChange={e => setBotForm(prev => ({ ...prev, city: e.target.value }))} placeholder="Madrid, Sevilla..." /></div>
                  </div>
                  <div className={styles.formGrid}>
                    <div className={styles.fg}>
                      <label>Tono</label>
                      <div className={styles.chips}>
                        {['Cercano y profesional', 'Premium', 'Lujo exclusivo', 'Joven y dinámico'].map(t => (
                          <div key={t} className={`${styles.chip} ${botForm.tone === t ? styles.chipOn : ''}`} onClick={() => setBotForm(prev => ({ ...prev, tone: t }))}>{t}</div>
                        ))}
                      </div>
                    </div>
                    <div className={styles.fg}>
                      <label>Objetivo principal</label>
                      <div className={styles.chips}>
                        {['Todo en uno', 'Captar leads', 'Reservar visitas', 'Responder FAQs'].map(t => (
                          <div key={t} className={`${styles.chip} ${botForm.goal === t ? styles.chipOn : ''}`} onClick={() => setBotForm(prev => ({ ...prev, goal: t }))}>{t}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardHd}>
                  <Database size={18} />
                  <h3>Base de conocimiento</h3>
                  <span className={styles.countBadge}>{kbCount()} fuentes</span>
                </div>
                <div className={styles.kbTabBar}>
                  {kbTabs.map(kt => (
                    <div key={kt.id} className={`${styles.kbTab} ${activeKb === kt.id ? styles.kbTabOn : ''}`} onClick={() => setActiveKb(kt.id)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={kt.icon} /></svg>
                      {kt.label}
                    </div>
                  ))}
                </div>

                {activeKb === 'kt-prompt' && (
                  <div className={styles.kbPanel}>
                    <p className={styles.kbDesc}>Escribe el prompt del sistema. Variables: <code>{'{empresa}'}</code> <code>{'{ciudad}'}</code> <code>{'{nombre_bot}'}</code></p>
                    <div className={styles.promptToolbar}>
                      <button className="btn btn-outline btn-sm" onClick={() => {
                        const ta = document.getElementById('b-prompt-ta')
                        if (ta) { const start = ta.selectionStart; const val = ta.value; ta.value = val.slice(0, start) + '\n## ROL\nEres {nombre_bot}, asistente virtual de {empresa} en {ciudad}.\n' + val.slice(ta.selectionEnd); ta.focus() }
                      }}>+ Rol</button>
                      <button className="btn btn-outline btn-sm" onClick={generateBotAI} disabled={loading}>{loading ? 'Generando...' : 'Generar con IA'}</button>
                    </div>
                    <textarea id="b-prompt-ta" className={styles.promptEditor} rows={8} value={botForm.prompt} onChange={e => setBotForm(prev => ({ ...prev, prompt: e.target.value }))} placeholder="Escribe aquí el prompt del sistema..." />
                  </div>
                )}

                {activeKb === 'kt-props' && (
                  <div className={styles.kbPanel}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <p className={styles.kbDesc} style={{ marginBottom: 0 }}>Listado de propiedades disponibles que el bot conocerá.</p>
                      <button className="btn btn-outline btn-sm" onClick={generateBotProperties}>Generar con IA</button>
                    </div>
                    <textarea className={styles.propsEditor} rows={8} value={botForm.props} onChange={e => setBotForm(prev => ({ ...prev, props: e.target.value }))} placeholder="Piso 3hab · Salamanca · 85m² · 320.000€ · Ref:SAL-001" />
                  </div>
                )}

                {activeKb === 'kt-faqs' && (
                  <div className={styles.kbPanel}>
                    <p className={styles.kbDesc}>Preguntas y respuestas específicas de tu negocio.</p>
                    <button className="btn btn-outline btn-sm" onClick={addFAQ} style={{ marginBottom: 10 }}>+ Añadir pregunta</button>
                    {botForm.faqs.length === 0 && <p className={styles.emptySm}>No hay FAQs aún. Añade una pregunta.</p>}
                    {botForm.faqs.map((f, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                        <input type="text" placeholder="Pregunta" value={f.q} onChange={e => updateFAQ(i, 'q', e.target.value)} style={{ flex: 1, padding: '6px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 12, color: 'var(--text)' }} />
                        <input type="text" placeholder="Respuesta" value={f.a} onChange={e => updateFAQ(i, 'a', e.target.value)} style={{ flex: 1, padding: '6px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 12, color: 'var(--text)' }} />
                        <button className="btn btn-danger btn-sm" onClick={() => removeFAQ(i)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {activeKb === 'kt-realestate' && (
                  <div className={styles.kbPanel}>
                    <p className={styles.kbDesc}>Marca los módulos de conocimiento experto que el bot debe dominar.</p>
                    <div className={styles.expertGrid}>
                      {KNOWLEDGE_MODULES.map(m => (
                        <div key={m.id} className={`${styles.expertCard} ${botForm.expert.includes(m.id) ? styles.expertCardOn : ''}`} onClick={() => toggleExpert(m.id)}>
                          <strong>{m.label}</strong>
                          <small>{m.desc}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeKb === 'kt-skills' && (
                  <div className={styles.kbPanel}>
                    <p className={styles.kbDesc}>Habilidades especializadas del bot.</p>
                    {SKILLS.map(s => (
                      <div key={s.id} className={styles.toggleRow}>
                        <div className={styles.toggleInfo}><strong>{s.label}</strong><small>{s.desc}</small></div>
                        <label className={styles.toggleSwitch}>
                          <input type="checkbox" checked={botForm.skills.includes(s.id)} onChange={() => toggleSkill(s.id)} />
                          <span className={styles.toggleSlider} />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.card}>
                <div className={styles.cardHd}><Zap size={18} /><h3>Comportamiento</h3></div>
                <div className={styles.behavGrid}>
                  <div>
                    {[{ key: 'leads', label: 'Captar leads automáticamente', desc: 'Pide nombre + teléfono al detectar interés' },
                      { key: 'qualify', label: 'Calificar leads (BANT)', desc: 'Budget, Authority, Need, Timeline' },
                      { key: 'visits', label: 'Reservar visitas', desc: 'Recoge disponibilidad y confirma cita' },
                    ].map(t => (
                      <div key={t.key} className={styles.toggleRow}>
                        <div className={styles.toggleInfo}><strong>{t.label}</strong><small>{t.desc}</small></div>
                        <label className={styles.toggleSwitch}>
                          <input type="checkbox" checked={botForm.toggles[t.key]} onChange={() => setBotForm(prev => ({ ...prev, toggles: { ...prev.toggles, [t.key]: !prev.toggles[t.key] } }))} />
                          <span className={styles.toggleSlider} />
                        </label>
                      </div>
                    ))}
                  </div>
                  <div>
                    {[{ key: 'obj', label: 'Manejar objeciones', desc: 'Responde a objeciones comunes' },
                      { key: 'escalate', label: 'Escalar a agente humano', desc: 'Cuando no sabe responder' },
                      { key: 'saveconv', label: 'Guardar conversaciones', desc: 'Almacena historial en BD' },
                    ].map(t => (
                      <div key={t.key} className={styles.toggleRow}>
                        <div className={styles.toggleInfo}><strong>{t.label}</strong><small>{t.desc}</small></div>
                        <label className={styles.toggleSwitch}>
                          <input type="checkbox" checked={botForm.toggles[t.key]} onChange={() => setBotForm(prev => ({ ...prev, toggles: { ...prev.toggles, [t.key]: !prev.toggles[t.key] } }))} />
                          <span className={styles.toggleSlider} />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.btnRow}>
                <button className="btn btn-primary" onClick={saveBot}>Guardar bot</button>
              </div>
            </div>
          </div>
        )}

        {/* TAB: CHAT PREVIEW */}
        {activeTab === 'chat' && (
          <div className={styles.chatPage}>
            <div className={styles.chatPageMain}>
              <div className={styles.chatFrame}>
                <div className={styles.chatHead}>
                  <div className={styles.chatAv}>
                    {selectedChatBotId ? bots.find(b => b.id === selectedChatBotId)?.name?.charAt(0).toUpperCase() || 'B' : '?'}
                  </div>
                  <div>
                    <div className={styles.chatName}>{selectedChatBotId ? bots.find(b => b.id === selectedChatBotId)?.name || 'Asistente' : 'Selecciona un bot'}</div>
                    <div className={styles.chatSub}><div className={styles.chatOnline} /> En línea</div>
                  </div>
                </div>
                <div className={styles.chatBody}>
                  <AnimatePresence>
                    {chatMessages.map((msg, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        className={`${styles.msg} ${msg.role === 'user' ? styles.msgUser : msg.role === 'typing' ? styles.msgTyping : styles.msgBot}`}>
                        {msg.role === 'typing' ? (
                          <div className={styles.typingDots}><div /><div /><div /></div>
                        ) : msg.content.split('\n').map((line, j) => <div key={j}>{line}</div>)}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                <div className={styles.chatInputRow}>
                  <input type="text" className={styles.chatInp} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChatMessage()} placeholder="Escribe un mensaje..." disabled={!selectedChatBotId} />
                  <button className={styles.chatSendBtn} onClick={sendChatMessage} disabled={!selectedChatBotId}><Send size={14} /></button>
                </div>
              </div>
              <div className={styles.chatSide}>
                <div className={styles.card}>
                  <div className={styles.cardHd}><h3 style={{ fontSize: 13 }}>Sesión actual</h3></div>
                  <div className={styles.cardBd}>
                    <div className={styles.sessRow}><span>Mensajes</span><strong>{chatMessages.filter(m => m.role !== 'typing').length}</strong></div>
                    <div className={styles.sessRow}><span>Estado lead</span><span className={leadCaptured ? 'badge badge-ok' : 'badge badge-grey'}>{leadCaptured ? 'Captado' : 'Sin lead'}</span></div>
                    <div className={styles.sessRow}><span>Modelo</span><span className={styles.textSm}>{DEFAULT_MODEL}</span></div>
                  </div>
                </div>
                {leadCaptured && leadData && (
                  <div className={styles.card}>
                    <div className={styles.cardHd}><h3 style={{ fontSize: 13 }}>Lead captado</h3></div>
                    <div className={styles.cardBd}>
                      <div className={styles.sessRow}><span>Nombre</span><strong>{leadData.name}</strong></div>
                      <div className={styles.sessRow}><span>Teléfono</span><strong>{leadData.phone || '—'}</strong></div>
                      <div className={styles.sessRow}><span>Interés</span><strong>{leadData.interest}</strong></div>
                    </div>
                  </div>
                )}
                <div className={styles.card}>
                  <div className={styles.cardHd}><h3 style={{ fontSize: 13 }}>Seleccionar bot</h3></div>
                  <div className={styles.cardBd}>
                    <select value={selectedChatBotId} onChange={e => loadChatBot(e.target.value)} className={styles.botSelect}>
                      <option value="">— Selecciona —</option>
                      {bots.map(b => <option key={b.id} value={b.id}>{b.name} ({b.company})</option>)}
                    </select>
                    <button className="btn btn-outline btn-sm" onClick={() => loadChatBot(selectedChatBotId)} style={{ marginTop: 8, width: '100%' }}>Limpiar chat</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: LEADS */}
        {activeTab === 'leads' && (
          <div>
            <div className={styles.leadsHeader}>
              <h2 className={styles.leadsTitle}>Leads y Conversaciones</h2>
              <div className={styles.btnRow}>
                <button className="btn btn-outline btn-sm" onClick={exportCSV}>CSV</button>
                <button className="btn btn-outline btn-sm" onClick={addDemoLeads}>Demo</button>
                <button className="btn btn-danger btn-sm" onClick={clearAllLeads}>Limpiar</button>
              </div>
            </div>
            <div className={styles.leadsStats}>
              <div className={styles.leadStat}><div className={styles.leadStatNum}>{leads.length}</div><div className={styles.leadStatLbl}>Total leads</div></div>
              <div className={styles.leadStat}><div className={styles.leadStatNum}>{leads.filter(l => { const d = new Date(l.fecha || l.date); const t = new Date(); t.setHours(0, 0, 0, 0); return d >= t }).length}</div><div className={styles.leadStatLbl}>Nuevos (hoy)</div></div>
              <div className={styles.leadStat}><div className={styles.leadStatNum}>{leads.filter(l => l.estado === 'Visita').length}</div><div className={styles.leadStatLbl}>Visitas agendadas</div></div>
              <div className={styles.leadStat}><div className={styles.leadStatNum}>{leads.length > 0 ? Math.round(leads.filter(l => l.estado === 'Visita').length / leads.length * 100) + '%' : '—'}</div><div className={styles.leadStatLbl}>Tasa conversión</div></div>
              <div className={styles.leadStat}><div className={styles.leadStatNum}>{leads.filter(l => l.convId).length}</div><div className={styles.leadStatLbl}>Conversaciones</div></div>
            </div>
            <div className={styles.card} style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.leadsTable}>
                  <thead>
                    <tr><th></th><th>Cliente</th><th>Teléfono</th><th>Interés</th><th>Propiedad</th><th>Presupuesto</th><th>Score</th><th>Canal</th><th>Estado</th><th>Fecha</th><th></th></tr>
                  </thead>
                  <tbody>
                    {leads.length === 0 ? (
                      <tr><td colSpan={11} className={styles.leadsEmpty}>No hay leads aún. Los leads aparecerán aquí cuando el bot interactúe con clientes.</td></tr>
                    ) : leads.sort((a, b) => (b.fecha || b.date || 0) - (a.fecha || a.date || 0)).map(l => {
                      const sc = l.score || 0
                      const scColor = sc >= 80 ? 'var(--green)' : sc >= 50 ? 'var(--gold)' : 'var(--red)'
                      return (
                        <tr key={l.id}>
                          <td><div className={styles.leadAvatar}>{(l.nombre || '??').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()}</div></td>
                          <td><strong>{l.nombre}</strong></td>
                          <td>{l.telefono}</td>
                          <td className={styles.textSm}>{(l.interes || '').slice(0, 40)}</td>
                          <td className={styles.textSm}>{(l.propiedad || '').slice(0, 30)}</td>
                          <td>{l.presupuesto || '—'}</td>
                          <td><div className={styles.scoreRow}><span style={{ fontWeight: 700, color: scColor }}>{sc}</span><div className={styles.scoreBar}><div className={styles.scoreFill} style={{ width: sc + '%', background: sc >= 80 ? 'var(--green)' : sc >= 50 ? 'var(--gold)' : 'var(--red)' }} /></div></div></td>
                          <td><span className={styles.leadBadge}>{l.canal || 'chat'}</span></td>
                          <td>
                            <select value={l.estado || 'Nuevo'} onChange={e => { l.estado = e.target.value; setLeads([...leads]) }} className={styles.statusSelect}>
                              <option value="Nuevo">Nuevo</option><option value="Contactado">Contactado</option><option value="Visita">Visita</option><option value="Cerrado">Cerrado</option>
                            </select>
                          </td>
                          <td className={styles.textSm}>{new Date(l.fecha || l.date).toLocaleDateString()}</td>
                          <td><button className={styles.removeBtn} onClick={() => removeLead(l.id)}>✕</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: ANALYTICS */}
        {activeTab === 'analytics' && (
          <div>
            <h2 className={styles.analyticsTitle}>Analytics</h2>
            <div className={styles.analyticsGrid}>
              <div className={styles.card}>
                <div className={styles.cardHd}><h3>Temas más consultados</h3></div>
                <div className={styles.cardBd}>
                  {[
                    { label: 'Pisos y apartamentos', pct: 35 }, { label: 'Hipotecas y financiación', pct: 22 },
                    { label: 'Gastos e impuestos', pct: 18 }, { label: 'Visitas y disponibilidad', pct: 15 },
                    { label: 'Documentación', pct: 10 },
                  ].map(t => (
                    <div key={t.label} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}><span>{t.label}</span><strong>{t.pct}%</strong></div>
                      <div className={styles.scoreBar}><div className={styles.scoreFill} style={{ width: t.pct + '%' }} /></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardHd}><h3>Preguntas sin respuesta</h3></div>
                <div className={styles.cardBd}>
                  {[
                    '¿Tienen promociones de obra nueva en la zona norte?',
                    '¿Aceptan permutas como forma de pago?',
                    '¿Cuál es el coste de la comunidad en el ático de Gracia?',
                  ].map((q, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12, alignItems: 'flex-start' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                      {q}
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardHd}><h3>Funnel de conversión</h3></div>
                <div className={styles.cardBd}>
                  {[
                    { label: 'Visitas al chat', value: Math.max(leads.length * 3, 100), pct: 100 },
                    { label: 'Interesados en propiedades', value: Math.max(leads.length * 2, 60), pct: 55 },
                    { label: 'Leads captados', value: leads.length || 10, pct: Math.min(leads.length > 0 ? 30 : 10, 100) },
                    { label: 'Visitas agendadas', value: leads.filter(l => l.estado === 'Visita').length || 3, pct: 13 },
                    { label: 'Ventas cerradas', value: leads.filter(l => l.estado === 'Cerrado').length || 1, pct: 5 },
                  ].map(s => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 120, fontSize: 12, textAlign: 'right', flexShrink: 0, color: 'var(--text3)' }}>{s.label}</div>
                      <div style={{ flex: 1, height: 26, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--gold2), var(--gold))', borderRadius: 4, display: 'flex', alignItems: 'center', paddingLeft: 7, fontSize: 11, fontWeight: 600, color: '#0E0C0A', whiteSpace: 'nowrap', minWidth: 24, width: s.pct + '%' }}>{s.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardHd}><h3>Leads por día</h3></div>
                <div className={styles.cardBd}><LeadsChart leads={leads} /></div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: CONFIGURACIÓN */}
        {activeTab === 'config' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <div className={styles.card}>
                <div className={styles.cardHd}><Settings size={20} /><h3>Apariencia</h3></div>
                <div className={styles.formGrid}>
                  <div className={styles.fg}><label>Color principal</label><input type="color" defaultValue="#0f1e2e" /></div>
                  <div className={styles.fg}><label>Color acento</label><input type="color" defaultValue="#c8a96e" /></div>
                </div>
                <div className={styles.fg}><label>Mensaje bienvenida</label><input type="text" defaultValue={`¡Hola! Soy ${botConfig.botname || 'el asistente'} de ${botConfig.nombre}. ¿En qué puedo ayudarte? 🏡`} /></div>
              </div>
            </div>
            <div>
              <div className={styles.card}>
                <div className={styles.cardHd}><Bot size={20} /><h3>Comportamiento</h3></div>
                <div className={styles.toggleRow}>
                  <div><strong>Captar leads</strong><small>Pedir nombre y teléfono</small></div>
                  <label className={styles.toggleSwitch}><input type="checkbox" defaultChecked /><span className={styles.toggleSlider} /></label>
                </div>
                <div className={styles.toggleRow}>
                  <div><strong>Notificar por email</strong><small>Aviso al recibir lead</small></div>
                  <label className={styles.toggleSwitch}><input type="checkbox" defaultChecked /><span className={styles.toggleSlider} /></label>
                </div>
              </div>
              <div className={styles.card} style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                <div className={styles.cardHd}><Code size={20} /><h3>Configuración de API</h3></div>
                <p className={styles.textSm}>La API key se configura en el archivo <code>.env</code> (VITE_OPENROUTER_API_KEY).</p>
                <div className={styles.apiStatus}>
                  <div className={`${styles.apiDot} ${apiKey ? styles.apiOn : ''}`} />
                  <span>{apiKey ? 'API configurada correctamente' : 'API no configurada'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: INTEGRACIÓN */}
        {activeTab === 'embed' && (
          <div>
            <div className={styles.card}>
              <div className={styles.cardHd}><Code size={20} /><h3>Integración en tu web</h3></div>
              <p className={styles.textSm}>Copia este código antes del <code>&lt;/body&gt;</code>:</p>
              <div className={styles.codeBlock}>
                {`<!-- PropBot Widget -->
<script src="https://cdn.propbot.com/widget.js"
  data-bot-id="${botConfig.botname?.toLowerCase() || 'bot'}_${Date.now().toString(36).substring(2, 8)}"
  data-color="#D4A853"
  data-position="bottom-right"
  data-lang="es"
  async>
</script>`}
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => navigator.clipboard.writeText('código copiado')}><Copy size={14} /> Copiar código</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
