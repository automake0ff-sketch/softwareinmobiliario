import { useState, useEffect, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'react-hot-toast'
import styles from './StudioPage.module.css'

const DEFAULT_MODEL = import.meta.env.VITE_OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct'
const apiKey = true;

function getAuthHeaders() {
  try {
    const store = JSON.parse(localStorage.getItem('crm-inmobiliario-store') || '{}');
    const token = store?.state?.user?.token;
    const userId = store?.state?.user?.id;
    
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-auth-token'] = token;
    }
    if (userId) {
      headers['x-auth-user'] = userId;
    }
    return headers;
  } catch (e) {
    return {};
  }
}

function uid() { return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7) }
function esc(str) { return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

const LS_BOTS = 'propbot_bots'
const LS_LEADS = 'propbot_leads'
const LS_CONVS = 'propbot_conversaciones'

function loadJSON(key, def) { try { const d = localStorage.getItem(key); return d ? JSON.parse(d) : def } catch { return def } }

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
  { id: 'objeciones', label: 'Manejar objeciones', desc: 'Responde a \"es muy caro\", \"lo voy a pensar\"' },
  { id: 'visitas', label: 'Reservar visitas', desc: 'Gestiona agenda y confirma citas' },
  { id: 'seguimiento', label: 'Seguimiento post-visita', desc: 'Recordatorios y seguimiento' },
  { id: 'escalar', label: 'Escalar a humano', desc: 'Deriva al agente cuando es necesario' },
  { id: 'captura', label: 'Captura proactiva', desc: 'Solicita datos al detectar interés' },
]

async function callAI(systemPrompt, userMessage, maxTokens = 800) {
  const res = await fetch('/api/tools/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      maxTokens,
      temperature: 0.7,
      systemPrompt,
      userMessage,
    }),
  })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || `Error ${res.status}`) }
  const data = await res.json()
  return data.response || ''
}

function BotCard({ bot, onEdit, onDelete }) {
  return (
    <div className={styles.botCard} onClick={() => onEdit(bot)}>
      <div className={styles.botCardHeader}>
        <h3>{bot.name}</h3>
        <span className={styles.badge}>{bot.tone || 'Profesional'}</span>
      </div>
      <div className={styles.botCardBody}>
        <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> {bot.company || '-'}</span>
        <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> {bot.city || '-'}</span>
        <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> {bot.goal || 'Todo en uno'}</span>
      </div>
      <div className={styles.botCardFooter}>
        <button className="btn btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); onEdit(bot) }}>Editar</button>
        <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); onDelete(bot.id) }}>Eliminar</button>
      </div>
    </div>
  )
}

function LeadsTab({ leads, setLeads, addLead, removeLead, addDemoLeads, clearAllLeads }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const today = new Date(); today.setHours(0,0,0,0)
  const newToday = leads.filter(l => l.fecha >= today.getTime()).length
  const visits = leads.filter(l => l.estado === 'Visita').length
  const convRate = leads.length > 0 ? Math.round(visits / leads.length * 100) + '%' : '—'

  const filtered = leads.filter(l => {
    if (filter && l.estado !== filter) return false
    if (search) {
      const s = (l.nombre + ' ' + l.telefono + ' ' + l.interes + ' ' + l.propiedad).toLowerCase()
      if (!s.includes(search.toLowerCase())) return false
    }
    return true
  }).sort((a, b) => (b.fecha || 0) - (a.fecha || 0))

  const exportCSV = () => {
    if (leads.length === 0) { toast('No hay leads para exportar'); return }
    const headers = 'Nombre,Teléfono,Email,Interés,Propiedad,Presupuesto,Score,Canal,Estado,Fecha,Notas'
    const csv = headers + '\n' + leads.map(l =>
      `"${l.nombre}","${l.telefono}","${l.email}","${l.interes}","${l.propiedad}","${l.presupuesto}",${l.score || 0},"${l.canal}","${l.estado}","${new Date(l.fecha).toLocaleDateString()}","${(l.notas||'').replace(/"/g,'""')}"`
    ).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'leads.csv'; a.click(); URL.revokeObjectURL(url)
    toast.success('CSV exportado')
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.sectionHeader}>
        <h2>Leads y Conversaciones</h2>
        <div className={styles.btnRow}>
          <select value={filter} onChange={e => setFilter(e.target.value)} className={styles.filterSelect}>
            <option value="">Todos los estados</option>
            <option value="Nuevo">Nuevo</option>
            <option value="Contactado">Contactado</option>
            <option value="Visita">Visita agendada</option>
            <option value="Cerrado">Cerrado</option>
          </select>
          <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className={styles.filterInput} />
          <button className="btn btn-outline btn-sm" onClick={exportCSV}>CSV</button>
          <button className="btn btn-outline btn-sm" onClick={addDemoLeads}>Demo</button>
          <button className="btn btn-danger btn-sm" onClick={clearAllLeads}>Limpiar</button>
        </div>
      </div>
      <div className={styles.statsGrid}>
        <div className={styles.statBox}><div className={styles.statNum}>{leads.length}</div><div className={styles.statLbl}>Total leads</div></div>
        <div className={styles.statBox}><div className={styles.statNum}>{newToday}</div><div className={styles.statLbl}>Nuevos (hoy)</div></div>
        <div className={styles.statBox}><div className={styles.statNum}>{visits}</div><div className={styles.statLbl}>Visitas agendadas</div></div>
        <div className={styles.statBox}><div className={styles.statNum}>{convRate}</div><div className={styles.statLbl}>Tasa conversión</div></div>
        <div className={styles.statBox}><div className={styles.statNum}>{leads.filter(l => l.convId).length}</div><div className={styles.statLbl}>Conversaciones</div></div>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th></th><th>Cliente</th><th>Teléfono</th><th>Interés</th><th>Propiedad</th><th>Presupuesto</th><th>Score</th><th>Canal</th><th>Estado</th><th>Fecha</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={11} className={styles.emptyTd}>No se encontraron leads</td></tr>
            ) : filtered.map(l => {
              const sc = l.score || 0
              const scColor = sc >= 80 ? 'var(--ok)' : sc >= 50 ? 'var(--gold)' : 'var(--err)'
              return (
                <tr key={l.id}>
                  <td><div className={styles.avatarSm}>{(l.nombre||'??').split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase()}</div></td>
                  <td><strong>{l.nombre}</strong></td>
                  <td>{l.telefono}</td>
                  <td className={styles.textSm}>{(l.interes||'').slice(0,40)}</td>
                  <td className={styles.textSm}>{(l.propiedad||'').slice(0,30)}</td>
                  <td>{l.presupuesto || '—'}</td>
                  <td><div className={styles.scoreRow}><span style={{fontWeight:700,color:scColor}}>{sc}</span><div className={styles.scoreBar}><div className={styles.scoreFill} style={{width:sc+'%',background:sc>=80?'var(--ok)':sc>=50?'var(--gold)':'var(--err)'}}/></div></div></td>
                  <td><span className={styles.badgeInfo}>{l.canal || 'chat'}</span></td>
                  <td>
                    <select value={l.estado} onChange={e => {
                      l.estado = e.target.value; localStorage.setItem(LS_LEADS, JSON.stringify(leads)); setLeads([...leads])
                    }} className={styles.statusSelect}>
                      <option value="Nuevo">Nuevo</option><option value="Contactado">Contactado</option><option value="Visita">Visita</option><option value="Cerrado">Cerrado</option>
                    </select>
                  </td>
                  <td className={styles.textSm}>{new Date(l.fecha).toLocaleDateString()}</td>
                  <td><button className="btn btn-ghost btn-sm" style={{color:'var(--err)'}} onClick={() => removeLead(l.id)}>✕</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AnalyticsTab({ leads }) {
  const topics = [
    { label: 'Pisos y apartamentos', pct: 35 }, { label: 'Hipotecas y financiación', pct: 22 },
    { label: 'Gastos e impuestos', pct: 18 }, { label: 'Visitas y disponibilidad', pct: 15 },
    { label: 'Documentación', pct: 10 },
  ]
  const unanswered = [
    '¿Tienen promociones de obra nueva en la zona norte?',
    '¿Aceptan permutas como forma de pago?',
    '¿Cuál es el coste de la comunidad en el ático de Gracia?',
  ]
  const stages = [
    { label: 'Visitas al chat', value: Math.max(leads.length * 3, 100), pct: 100 },
    { label: 'Interesados en propiedades', value: Math.max(leads.length * 2, 60), pct: 55 },
    { label: 'Leads captados', value: leads.length || 10, pct: Math.min(leads.length > 0 ? 30 : 10, 100) },
    { label: 'Visitas agendadas', value: leads.filter(l => l.estado === 'Visita').length || 3, pct: 13 },
    { label: 'Ventas cerradas', value: leads.filter(l => l.estado === 'Cerrado').length || 1, pct: 5 },
  ]

  return (
    <div className={styles.tabContent}>
      <h2 className={styles.pageTitle}>Analytics</h2>
      <div className={styles.analyticsGrid}>
        <div className={styles.card}>
          <div className={styles.cardHd}><h3>Temas más consultados</h3></div>
          <div className={styles.cardBd}>
            {topics.map(t => (
              <div key={t.label} className={styles.topicRow}>
                <div className={styles.topicLabel}><span>{t.label}</span><strong>{t.pct}%</strong></div>
                <div className={styles.scoreBar}><div className={styles.scoreFill} style={{width:t.pct+'%'}}/></div>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardHd}><h3>Preguntas sin respuesta</h3></div>
          <div className={styles.cardBd}>
            {unanswered.map((q, i) => (
              <div key={i} className={styles.unansweredItem}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--err)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>{q}</div>
            ))}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardHd}><h3>Funnel de conversión</h3></div>
          <div className={styles.cardBd}>
            {stages.map(s => (
              <div key={s.label} className={styles.funnelRow}>
                <div className={styles.funnelLabel}>{s.label}</div>
                <div className={styles.funnelBarWrap}><div className={styles.funnelBar} style={{width:s.pct+'%'}}>{s.value}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardHd}><h3>Leads por día</h3></div>
          <div className={styles.cardBd}>
            <LeadsChart leads={leads} />
          </div>
        </div>
      </div>
    </div>
  )
}

function LeadsChart({ leads }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width = canvas.parentElement.offsetWidth || 400
    const h = canvas.height = 140
    ctx.clearRect(0, 0, w, h)
    const days = 7
    const dayLabels = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
    const data = []
    for (let i = 0; i < days; i++) {
      const d = new Date(); d.setDate(d.getDate() - (6 - i)); d.setHours(0,0,0,0)
      const count = leads.filter(l => {
        const ld = new Date(l.fecha); ld.setHours(0,0,0,0)
        return ld.getTime() === d.getTime()
      }).length
      data.push(count || Math.floor(Math.random() * 5) + 1)
    }
    const max = Math.max(...data, 1)
    const pad = { t: 8, b: 20, l: 10, r: 10 }
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b
    const barW = cw / days * 0.65, gap = cw / days * 0.35
    ctx.fillStyle = '#e8e4db'
    data.forEach((v, i) => {
      const x = pad.l + i * (barW + gap) + gap / 2
      const bh = (v / max) * ch, y = pad.t + ch - bh
      ctx.beginPath(); ctx.roundRect(x, y, barW, bh, [3,3,0,0]); ctx.fill()
    })
    ctx.fillStyle = '#1849c6'
    data.forEach((v, i) => {
      const x = pad.l + i * (barW + gap) + gap / 2
      const bh = (v / max) * ch, y = pad.t + ch - bh
      ctx.beginPath(); ctx.roundRect(x, y, barW, bh, [3,3,0,0]); ctx.fill()
    })
    ctx.fillStyle = '#737680'; ctx.font = '9px DM Sans, sans-serif'; ctx.textAlign = 'center'
    data.forEach((v, i) => {
      const x = pad.l + i * (barW + gap) + gap / 2 + barW / 2
      ctx.fillText(dayLabels[i] || '', x, h - 4)
      ctx.fillText(v, x, pad.t + ch - (v / max) * ch - 4)
    })
  }, [leads])
  return <canvas ref={canvasRef} height="140" style={{width:'100%'}} />
}

export default function StudioPage() {
  const [activeTab, setActiveTab] = useState('bots')
  const [bots, setBots] = useState(() => loadJSON(LS_BOTS, []))
  const [leads, setLeads] = useState(() => loadJSON(LS_LEADS, []))
  const [convId] = useState(() => 'conv_' + Date.now())

  const [editingBot, setEditingBot] = useState(null)
  const [isNew, setIsNew] = useState(false)
  const [loading, setLoading] = useState(false)

  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [selectedChatBotId, setSelectedChatBotId] = useState('')
  const [leadCaptured, setLeadCaptured] = useState(false)
  const [leadData, setLeadData] = useState(null)

  const [botForm, setBotForm] = useState({
    name: '', company: '', city: '', tone: 'Cercano y profesional', goal: 'Todo en uno',
    prompt: '', props: '', faqs: [], expert: [], skills: [],
    toggles: { leads: true, qualify: false, visits: true, obj: true, escalate: true, saveconv: true },
  })
  const [activeKb, setActiveKb] = useState('kt-url')

  useEffect(() => { localStorage.setItem(LS_BOTS, JSON.stringify(bots)) }, [bots])
  useEffect(() => { localStorage.setItem(LS_LEADS, JSON.stringify(leads)) }, [leads])

  const saveBots = useCallback((newBots) => { setBots(newBots); localStorage.setItem(LS_BOTS, JSON.stringify(newBots)) }, [])

  const newBot = () => {
    setEditingBot(null); setIsNew(true)
    setBotForm({ name: '', company: '', city: '', tone: 'Cercano y profesional', goal: 'Todo en uno', prompt: '', props: '', faqs: [], expert: [], skills: [], toggles: { leads: true, qualify: false, visits: true, obj: true, escalate: true, saveconv: true } })
    setActiveTab('builder')
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
    setActiveTab('builder')
  }

  const deleteBot = (id) => {
    if (!confirm('¿Eliminar este bot permanentemente?')) return
    const newBots = bots.filter(b => b.id !== id)
    saveBots(newBots)
    toast.success('Bot eliminado')
  }

  const saveBot = () => {
    const { name, company, city } = botForm
    if (!name || !company || !city) { toast.error('Completa nombre, inmobiliaria y ciudad'); return }
    const bot = {
      id: editingBot ? editingBot.id : 'bot_' + uid(),
      ...botForm,
      createdAt: editingBot ? editingBot.createdAt : Date.now(),
      updatedAt: Date.now(),
    }
    let newBots
    if (editingBot) {
      newBots = bots.map(b => b.id === editingBot.id ? bot : b)
    } else {
      newBots = [...bots, bot]
    }
    saveBots(newBots)
    setEditingBot(bot)
    toast.success('Bot "' + bot.name + '" guardado')
    setActiveTab('bots')
  }

  const generateAI = async () => {
    if (!botForm.name || !botForm.city) return
    setLoading(true)
    try {
      const tiposStr = botForm.tipos?.length > 0 ? botForm.tipos.join(', ') : 'todo tipo de propiedades'
      const sysP = 'Eres un experto en real estate y diseño de asistentes virtuales para inmobiliarias.'
      const userP = `Crea un prompt de sistema para el asistente virtual de:\nNombre: ${botForm.name}\nCiudad: ${botForm.city}\nTono: ${botForm.tone}\nObjetivo: ${botForm.goal}\nNombre asistente: ${botForm.name}\nTipos: ${tiposStr}\nIdioma: español\n\nResponde SOLO el prompt.`
      const prompt = await callAI(sysP, userP, 900)
      const faqSys = 'Eres un experto en atención al cliente inmobiliaria.'
      const faqUser = `Genera 5 preguntas frecuentes para ${botForm.name} en ${botForm.city}.\nFormato: PREGUNTA | RESPUESTA`
      const rawFaqs = await callAI(faqSys, faqUser, 500)
      const parsed = rawFaqs.split('\n').filter(l => l.includes('|')).slice(0, 5).map(l => {
        const [q, a] = l.split('|').map(s => s.trim()); return { q, a }
      }).filter(f => f.q && f.a)
      setBotForm(prev => ({ ...prev, prompt, faqs: parsed }))
    } catch (err) {
      toast.error('Error: ' + err.message)
    } finally { setLoading(false) }
  }

  const generateProperties = async () => {
    if (!botForm.city) return
    try {
      const text = await callAI('Eres un agente inmobiliario experto.', `Genera 6 propiedades realistas para ${botForm.name} en ${botForm.city}. Formato por línea: TIPO · ZONA · DESCRIPCION · PRECIO · REF`, 600)
      setBotForm(prev => ({ ...prev, props: text.trim() }))
    } catch (err) { toast.error('Error: ' + err.message) }
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

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !selectedChatBotId) { toast.error('Selecciona un bot primero'); return }
    const userMsg = chatInput.trim(); setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }, { role: 'typing' }])
    try {
      const bot = bots.find(b => b.id === selectedChatBotId)
      const sp = bot ? getSystemPrompt() : ''
      const msgs = chatMessages.filter(m => m.role !== 'typing').slice(-10).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/tools/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          systemPrompt: sp || `Eres un asistente inmobiliario.`,
          messages: msgs,
          userMessage: userMsg,
          maxTokens: 350,
          temperature: 0.7
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error || `Error ${res.status}`);
      }
      const data = await res.json()
      const reply = data.response || 'No pude procesar tu mensaje.'
      setChatMessages(prev => prev.filter(m => m.role !== 'typing').concat({ role: 'assistant', content: reply }))
      if (!leadCaptured && /(quiero|me interesa|busco|precio)/i.test(userMsg) && /\d{9,}/.test(userMsg)) {
        setLeadCaptured(true); setLeadData({ name: 'Cliente', phone: userMsg.match(/\d{9,}/)?.[0] || '', interest: userMsg.slice(0, 100) })
        const newLead = { id: 'lead_' + uid(), nombre: 'Cliente', telefono: userMsg.match(/\d{9,}/)?.[0] || '', interes: userMsg.slice(0, 100), propiedad: '', presupuesto: '', score: 60, canal: 'chat', estado: 'Nuevo', fecha: Date.now(), convId }
        setLeads(prev => [...prev, newLead])
        toast.success('¡Lead captado!')
      }
    } catch {
      setChatMessages(prev => prev.filter(m => m.role !== 'typing').concat({ role: 'assistant', content: 'Error de conexión.' }))
    }
  }

  const loadChatBot = (id) => {
    setSelectedChatBotId(id)
    if (id) {
      const bot = bots.find(b => b.id === id)
      setChatMessages([{ role: 'assistant', content: `¡Hola! Soy ${bot?.name || 'Asistente'} de ${bot?.company || 'la inmobiliaria'}. ¿En qué puedo ayudarte? 🏡` }])
      setLeadCaptured(false); setLeadData(null)
    } else {
      setChatMessages([{ role: 'assistant', content: 'Selecciona un bot para comenzar' }])
    }
  }

  const addDemoLeads = () => {
    const demos = [
      { nombre: 'Carlos Mendoza', telefono: '612345789', interes: 'Piso 3 hab en Salamanca', propiedad: 'SAL-001', presupuesto: '320.000€', score: 85 },
      { nombre: 'Ana García', telefono: '698765432', interes: 'Villa en La Moraleja', propiedad: 'MOR-042', presupuesto: '1.2M€', score: 72 },
      { nombre: 'Pedro Sánchez', telefono: '611223344', interes: 'Ático en Gracia', propiedad: 'GRA-018', presupuesto: '580.000€', score: 60 },
    ]
    const newLeads = demos.map(d => ({ id: 'lead_' + uid(), ...d, canal: 'chat', estado: 'Nuevo', fecha: Date.now(), convId: '' }))
    setLeads(prev => [...prev, ...newLeads])
    toast.success(demos.length + ' leads de demo añadidos')
  }

  const removeLead = (id) => {
    if (!confirm('¿Eliminar este lead?')) return
    setLeads(prev => prev.filter(l => l.id !== id))
  }

  const clearAllLeads = () => {
    if (!confirm('¿Eliminar TODOS los leads?')) return
    setLeads([])
  }

  const addFAQ = () => setBotForm(prev => ({ ...prev, faqs: [...prev.faqs, { q: '', a: '' }] }))
  const removeFAQ = (i) => setBotForm(prev => ({ ...prev, faqs: prev.faqs.filter((_, idx) => idx !== i) }))
  const updateFAQ = (i, field, value) => {
    setBotForm(prev => {
      const faqs = [...prev.faqs]; faqs[i] = { ...faqs[i], [field]: value }; return { ...prev, faqs }
    })
  }

  const toggleExpert = (id) => {
    setBotForm(prev => ({
      ...prev,
      expert: prev.expert.includes(id) ? prev.expert.filter(x => x !== id) : [...prev.expert, id],
    }))
  }

  const toggleSkill = (id) => {
    setBotForm(prev => ({
      ...prev,
      skills: prev.skills.includes(id) ? prev.skills.filter(x => x !== id) : [...prev.skills, id],
    }))
  }

  const kbCount = () => {
    let c = 0
    if (botForm.prompt.trim()) c++
    if (botForm.props.trim()) c += botForm.props.split('\n').filter(l => l.trim()).length
    c += botForm.faqs.length
    c += botForm.expert.length
    c += botForm.skills.length
    return c
  }

  const tabs = [
    { id: 'bots', label: 'Mis Bots', icon: 'M9 3.5V2m0 1.5v1m0-1h.01M9 7.5h.01M9 11.5h.01M5 2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z' },
    { id: 'builder', label: 'Constructor', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065Z' },
    { id: 'chat', label: 'Chat Preview', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z' },
    { id: 'leads', label: `Leads (${leads.length})`, icon: 'M12 4.354a4 4 0 1 1 0 5.292M15 21H3v-1a6 6 0 0 1 12 0v1Zm0 0h6v-1a6 6 0 0 0-9-5.197M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z' },
    { id: 'analytics', label: 'Analytics', icon: 'M3 3v18h18M7 16l4-8 4 4 4-6' },
  ]

  return (
    <div className={styles.studio}>
      <div className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
          PropBot Studio <sup>v2</sup>
        </div>
        <div className={styles.topnav}>
          {tabs.map(t => (
            <button key={t.id} className={`${styles.tn} ${activeTab === t.id ? styles.tnOn : ''}`} onClick={() => {
              setActiveTab(t.id)
              if (t.id === 'leads') setLeads(prev => [...prev])
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={t.icon}/></svg>
              {t.label}
              {t.id === 'leads' && leads.length > 0 && <span className={styles.badgeCount}>{leads.length}</span>}
            </button>
          ))}
        </div>
        <div className={styles.topRight}>
          <div className={styles.apiPill} title={apiKey ? 'API configurada' : 'Sin API key'}>
            <div className={`${styles.apiDot} ${apiKey ? styles.apiOn : ''}`} />
            <span>{apiKey ? 'API OK' : 'Sin API'}</span>
          </div>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.sidebar}>
          <div className={styles.sidebarSection}>Bots activos</div>
          <div className={styles.sidebarBotList}>
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

        <div className={styles.mainPanel}>
          {/* TAB: MIS BOTS */}
          {activeTab === 'bots' && (
            <div className={styles.tabContent}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.pageTitle}>Mis chatbots</h2>
                  <p className={styles.pageSub}>Gestiona y crea asistentes virtuales para inmobiliarias</p>
                </div>
                <button className="btn btn-primary" onClick={newBot}>+ Crear nuevo bot</button>
              </div>
              {bots.length === 0 ? (
                <div className={styles.emptyState}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <p>Aún no tienes bots creados.</p>
                  <button className="btn btn-primary" onClick={newBot}>Crear mi primer bot</button>
                </div>
              ) : (
                <div className={styles.botsGrid}>
                  {bots.sort((a, b) => (b.updatedAt||0) - (a.updatedAt||0)).map(bot => (
                    <BotCard key={bot.id} bot={bot} onEdit={editBot} onDelete={deleteBot} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: CONSTRUCTOR */}
          {activeTab === 'builder' && (
            <div className={styles.tabContent}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.pageTitle}>Constructor de bot</h2>
                  <p className={styles.pageSub}>Define la personalidad, conocimiento y comportamiento de tu asistente</p>
                </div>
                <div className={styles.btnRow}>
                  <button className="btn btn-outline btn-sm" onClick={() => {
                    const prompt = getSystemPrompt()
                    navigator.clipboard.writeText(prompt)
                    toast.success('Prompt copiado')
                  }}>Ver prompt final</button>
                  <button className="btn btn-primary" onClick={saveBot}>Guardar bot</button>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardHd}><h3>Identidad del asistente</h3></div>
                <div className={styles.cardBd}>
                  <div className={styles.grid3}>
                    <div className={styles.fg}><label>Nombre del bot *</label><input type="text" value={botForm.name} onChange={e => setBotForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Ej: Sofía" /></div>
                    <div className={styles.fg}><label>Inmobiliaria *</label><input type="text" value={botForm.company} onChange={e => setBotForm(prev => ({ ...prev, company: e.target.value }))} placeholder="Grupo Inmobiliario" /></div>
                    <div className={styles.fg}><label>Ciudad principal *</label><input type="text" value={botForm.city} onChange={e => setBotForm(prev => ({ ...prev, city: e.target.value }))} placeholder="Madrid, Sevilla..." /></div>
                  </div>
                  <div className={styles.grid2}>
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
                  <h3>Base de conocimiento</h3>
                  <span className={styles.badgeInfo}>{kbCount()} fuentes añadidas</span>
                </div>
                <div className={styles.ktabBar}>
                  {[
                    { id: 'kt-url', label: 'Scraper URL', icon: 'M3.055 11H5a2 2 0 0 1 2 2v1a2 2 0 0 0 2 2 2 2 0 0 1 2 2v2.945M8 3.935V5.5A2.5 2.5 0 0 0 10.5 8h.5a2 2 0 0 1 2 2 2 2 0 0 0 4 0 2 2 0 0 1 2-2h1.064M15 20.488V18a2 2 0 0 1 2-2h3.064M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
                    { id: 'kt-prompt', label: 'Prompt libre', icon: 'M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
                    { id: 'kt-props', label: 'Propiedades', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
                    { id: 'kt-faqs', label: 'FAQs', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-5 5v-5z' },
                    { id: 'kt-realestate', label: 'Conocimiento experto', icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 0 0 1.946-.806 3.42 3.42 0 0 1 4.438 0 3.42 3.42 0 0 0 1.946.806 3.42 3.42 0 0 1 3.138 3.138 3.42 3.42 0 0 0 .806 1.946 3.42 3.42 0 0 1 0 4.438 3.42 3.42 0 0 0-.806 1.946 3.42 3.42 0 0 1-3.138 3.138 3.42 3.42 0 0 0-1.946.806 3.42 3.42 0 0 1-4.438 0 3.42 3.42 0 0 0-1.946-.806 3.42 3.42 0 0 1-3.138-3.138 3.42 3.42 0 0 0-.806-1.946 3.42 3.42 0 0 1 0-4.438 3.42 3.42 0 0 0 .806-1.946 3.42 3.42 0 0 1 3.138-3.138z' },
                    { id: 'kt-skills', label: 'Skills del bot', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
                  ].map(kt => (
                    <div key={kt.id} className={`${styles.ktab} ${activeKb === kt.id ? styles.ktabOn : ''}`} onClick={() => setActiveKb(kt.id)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={kt.icon}/></svg>
                      {kt.label}
                    </div>
                  ))}
                </div>

                {activeKb === 'kt-url' && (
                  <div className={styles.kpanel}>
                    <p className={styles.kbDesc}>Introduce la URL de tu web inmobiliaria para extraer propiedades, precios y FAQs automáticamente.</p>
                    <div className={styles.urlInputRow}>
                      <input type="url" placeholder="https://tu-inmobiliaria.com" className={styles.urlInput} />
                      <button className="btn btn-outline btn-sm">Demo</button>
                    </div>
                    <div className={styles.scrapeDemo}>
                      <p style={{ fontWeight: 500, marginBottom: 8 }}>Datos de ejemplo disponibles:</p>
                      {['Piso 3 hab · Barrio Salamanca · 320.000€', 'Villa 5 hab · La Moraleja · 1.200.000€', 'Ático duplex · Barrio de Gracia · 580.000€'].map((item, i) => (
                        <div key={i} className={styles.scrapeItem} onClick={() => setBotForm(prev => ({ ...prev, props: prev.props ? prev.props + '\n' + item : item }))}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeKb === 'kt-prompt' && (
                  <div className={styles.kpanel}>
                    <p className={styles.kbDesc}>Escribe el prompt del sistema. Variables: <code>{'{empresa}'}</code> <code>{'{ciudad}'}</code> <code>{'{nombre_bot}'}</code></p>
                    <div className={styles.promptToolbar}>
                      <button className="btn btn-sm btn-outline" onClick={() => {
                        const ta = document.getElementById('prompt-ta')
                        if (ta) { const start = ta.selectionStart; const val = ta.value; ta.value = val.slice(0, start) + '\n## ROL\nEres {nombre_bot}, asistente virtual de {empresa} en {ciudad}.\n' + val.slice(ta.selectionEnd); ta.focus() }
                      }}>+ Rol</button>
                      <button className="btn btn-sm btn-outline" onClick={generateAI} disabled={loading}>
                        {loading ? 'Generando...' : 'Generar con IA'}
                      </button>
                    </div>
                    <textarea id="prompt-ta" className={styles.promptEditor} rows={10} value={botForm.prompt} onChange={e => setBotForm(prev => ({ ...prev, prompt: e.target.value }))} placeholder="Escribe aquí el prompt del sistema..." />
                  </div>
                )}

                {activeKb === 'kt-props' && (
                  <div className={styles.kpanel}>
                    <div className={styles.kbHeader}>
                      <p className={styles.kbDesc}>Listado de propiedades disponibles que el bot conocerá.</p>
                      <button className="btn btn-outline btn-sm" onClick={generateProperties}>Generar con IA</button>
                    </div>
                    <textarea className={styles.propsEditor} rows={8} value={botForm.props} onChange={e => setBotForm(prev => ({ ...prev, props: e.target.value }))} placeholder="Piso 3hab · Salamanca · 85m² · 320.000€ · Ref:SAL-001&#10;Villa 5hab · La Moraleja · 450m² · 1.200.000€ · Ref:MOR-042" />
                  </div>
                )}

                {activeKb === 'kt-faqs' && (
                  <div className={styles.kpanel}>
                    <div className={styles.kbHeader}>
                      <p className={styles.kbDesc}>Preguntas y respuestas específicas de tu negocio.</p>
                      <button className="btn btn-outline btn-sm" onClick={addFAQ}>+ Añadir pregunta</button>
                    </div>
                    {botForm.faqs.length === 0 && <p className={styles.emptySm}>No hay FAQs aún. Añade una pregunta.</p>}
                    {botForm.faqs.map((f, i) => (
                      <div key={i} className={styles.faqItem}>
                        <input type="text" placeholder="Pregunta" value={f.q} onChange={e => updateFAQ(i, 'q', e.target.value)} className={styles.faqInput} />
                        <input type="text" placeholder="Respuesta" value={f.a} onChange={e => updateFAQ(i, 'a', e.target.value)} className={styles.faqInput} />
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--err)', flexShrink: 0 }} onClick={() => removeFAQ(i)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {activeKb === 'kt-realestate' && (
                  <div className={styles.kpanel}>
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
                  <div className={styles.kpanel}>
                    <p className={styles.kbDesc}>Habilidades especializadas del bot.</p>
                    {SKILLS.map(s => (
                      <div key={s.id} className={styles.toggleRow}>
                        <div className={styles.toggleInfo}><strong>{s.label}</strong><small>{s.desc}</small></div>
                        <label className={styles.toggle}>
                          <input type="checkbox" checked={botForm.skills.includes(s.id)} onChange={() => toggleSkill(s.id)} />
                          <span className={styles.toggleSlider} />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.card}>
                <div className={styles.cardHd}><h3>Comportamiento</h3></div>
                <div className={styles.cardBd}>
                  <div className={styles.behavGrid}>
                    <div>
                      {[{ key: 'leads', label: 'Captar leads automáticamente', desc: 'Pide nombre + teléfono al detectar interés' },
                        { key: 'qualify', label: 'Calificar leads (BANT)', desc: 'Budget, Authority, Need, Timeline' },
                        { key: 'visits', label: 'Reservar visitas', desc: 'Recoge disponibilidad y confirma cita' },
                      ].map(t => (
                        <div key={t.key} className={styles.toggleRow}>
                          <div className={styles.toggleInfo}><strong>{t.label}</strong><small>{t.desc}</small></div>
                          <label className={styles.toggle}>
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
                          <label className={styles.toggle}>
                            <input type="checkbox" checked={botForm.toggles[t.key]} onChange={() => setBotForm(prev => ({ ...prev, toggles: { ...prev.toggles, [t.key]: !prev.toggles[t.key] } }))} />
                            <span className={styles.toggleSlider} />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.btnRow} style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={saveBot}>Guardar y activar bot</button>
              </div>
            </div>
          )}

          {/* TAB: CHAT PREVIEW */}
          {activeTab === 'chat' && (
            <div className={styles.tabContent}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.pageTitle}>Chat en vivo</h2>
                  <p className={styles.pageSub}>Prueba tu bot en tiempo real</p>
                </div>
                <div className={styles.btnRow}>
                  <select value={selectedChatBotId} onChange={e => loadChatBot(e.target.value)} className={styles.botSelect}>
                    <option value="">— Selecciona un bot —</option>
                    {bots.map(b => <option key={b.id} value={b.id}>{b.name} ({b.company})</option>)}
                  </select>
                  <button className="btn btn-outline btn-sm" onClick={() => loadChatBot(selectedChatBotId)}>Limpiar</button>
                </div>
              </div>
              <div className={styles.chatOuter}>
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
                  <div className={styles.chatBody} id="chat-body-el">
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
                  <div className={styles.chatFoot}>
                    <input type="text" className={styles.chatInp} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChatMessage()} placeholder="Escribe un mensaje..." disabled={!selectedChatBotId} />
                    <button className={styles.chatSend} onClick={sendChatMessage} disabled={!selectedChatBotId}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
                  </div>
                </div>
                <div className={styles.chatSide}>
                  <div className={styles.card}>
                    <div className={styles.cardHd}><h3>Sesión actual</h3></div>
                    <div className={styles.cardBd}>
                      <div className={styles.sessRow}><span>Mensajes</span><strong>{chatMessages.filter(m => m.role !== 'typing').length}</strong></div>
                      <div className={styles.sessRow}><span>Estado lead</span><span className={leadCaptured ? 'badge badge-ok' : 'badge badge-grey'}>{leadCaptured ? 'Captado' : 'Sin lead'}</span></div>
                      <div className={styles.sessRow}><span>Modelo</span><span className={styles.textSm}>{DEFAULT_MODEL}</span></div>
                    </div>
                  </div>
                  {leadCaptured && leadData && (
                    <div className={styles.card}>
                      <div className={styles.cardHd}><h3>Lead captado</h3></div>
                      <div className={styles.cardBd}>
                        <div className={styles.sessRow}><span>Nombre</span><strong>{leadData.name}</strong></div>
                        <div className={styles.sessRow}><span>Teléfono</span><strong>{leadData.phone || '—'}</strong></div>
                        <div className={styles.sessRow}><span>Interés</span><strong>{leadData.interest}</strong></div>
                        <span className="badge badge-ok">Lead captado en vivo</span>
                      </div>
                    </div>
                  )}
                  <div className={styles.card}>
                    <div className={styles.cardHd}><h3>Contexto activo</h3></div>
                    <div className={styles.cardBd}>
                      <pre className={styles.ctxPreview}>{selectedChatBotId ? getSystemPrompt().slice(0, 300) + '...' : '—'}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: LEADS */}
          {activeTab === 'leads' && (
            <LeadsTab leads={leads} setLeads={setLeads} addLead={() => {}} removeLead={removeLead} addDemoLeads={addDemoLeads} clearAllLeads={clearAllLeads} />
          )}

          {/* TAB: ANALYTICS */}
          {activeTab === 'analytics' && (
            <AnalyticsTab leads={leads} />
          )}
        </div>
      </div>
    </div>
  )
}
