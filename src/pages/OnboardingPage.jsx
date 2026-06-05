import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle, Mail, Home, Users2, Rocket,
  Check, Upload, ArrowLeft, ArrowRight,
  Phone, Bot, Star, Sparkles, Shield, Zap, MailCheck,
  SkipForward
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useStore } from '../lib/store'

const steps = [
  { id: 1, label: 'WhatsApp', icon: MessageCircle },
  { id: 2, label: 'Email', icon: Mail },
  { id: 3, label: 'Propiedades', icon: Home },
  { id: 4, label: 'Agentes IA', icon: Users2 },
]

const AGENTS = [
  { type: 'captador', name: 'Captador IA', desc: 'Capta y cualifica nuevos leads automáticamente', recommended: true },
  { type: 'vendedor', name: 'Vendedor IA', desc: 'Convierte leads en ventas con seguimiento inteligente', recommended: true },
  { type: 'coordinador', name: 'Coordinador IA', desc: 'Coordina visitas y gestiona el pipeline', recommended: true },
  { type: 'nurturing', name: 'Nurturing IA', desc: 'Mantiene calientes los leads fríos', recommended: false },
  { type: 'copywriter', name: 'Copywriter IA', desc: 'Genera descripciones y contenido SEO', recommended: false },
  { type: 'analista', name: 'Analista IA', desc: 'Analiza datos y genera informes', recommended: false },
]

const stepVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
}

const propertyTemplate = { title: '', type: 'piso', zone: '', price: '' }

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1)

  const [whatsapp, setWhatsapp] = useState({ phone: '', wa_token: '', wa_phone_id: '', connected: false })
  const [email, setEmail] = useState({ provider: 'sendgrid', api_key: '', from_email: '', from_name: '', connected: false })
  const [properties, setProperties] = useState([{ ...propertyTemplate }])
  const [agents, setAgents] = useState(
    AGENTS.map(a => ({ ...a, active: a.recommended }))
  )
  const [launched, setLaunched] = useState(false)
  const [saving, setSaving] = useState(false)

  const totalSteps = steps.length
  const progress = (currentStep / totalSteps) * 100

  const canSkip = currentStep !== 3
  const canProceed = () => {
    switch (currentStep) {
      case 1: return whatsapp.connected || whatsapp.phone.length >= 9
      case 2: return email.connected || email.api_key.length > 0 || true
      case 3: return properties.some(p => p.title.trim())
      case 4: return agents.some(a => a.active)
      default: return false
    }
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      await api.patch('/agency/config', {
        whatsapp_number: whatsapp.phone,
        whatsapp_token: whatsapp.wa_token,
        whatsapp_phone_id: whatsapp.wa_phone_id,
        sendgrid_api_key: email.api_key,
        sendgrid_from_email: email.from_email,
        sendgrid_from_name: email.from_name || undefined,
        onboarding_step: 4,
        onboarding_completed: 1,
      })
      toast.success('Configuración guardada')
    } catch (err) {
      console.error('Error saving config:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleLaunch = async () => {
    await saveConfig()
    setLaunched(true)
  }

  const nextStep = () => {
    if (currentStep < totalSteps) setCurrentStep(prev => prev + 1)
    else handleLaunch()
  }

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1)
  }

  const addProperty = () => setProperties(prev => [...prev, { ...propertyTemplate }])

  const updateProperty = (index, field, value) =>
    setProperties(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))

  const removeProperty = (index) => {
    if (properties.length > 1) setProperties(prev => prev.filter((_, i) => i !== index))
  }

  const toggleAgent = (type) =>
    setAgents(prev => prev.map(a => a.type === type ? { ...a, active: !a.active } : a))

  const testWhatsApp = async () => {
    try {
      const res = await api.post('/agency/test-integration', {
        integration: 'whatsapp',
        config: { whatsapp_token: whatsapp.wa_token, whatsapp_phone_id: whatsapp.wa_phone_id },
      })
      if (res.ok) {
        setWhatsapp(prev => ({ ...prev, connected: true }))
        toast.success(res.msg)
      } else {
        toast.error(res.msg)
      }
    } catch (err) {
      toast.error('Error al probar conexión')
    }
  }

  const testEmail = async () => {
    try {
      const res = await api.post('/agency/test-integration', {
        integration: 'email',
        config: { sendgrid_api_key: email.api_key },
      })
      if (res.ok) {
        setEmail(prev => ({ ...prev, connected: true }))
        toast.success(res.msg)
      } else {
        toast.error(res.msg)
      }
    } catch (err) {
      toast.error('Error al probar conexión')
    }
  }

  const StepIndicator = ({ step, current }) => {
    const StepIcon = step.icon
    const isCompleted = step.id < current
    const isCurrent = step.id === current

    return (
      <div className="flex items-center">
        <div className="flex flex-col items-center">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
            isCompleted
              ? 'bg-indigo-500 text-white'
              : isCurrent
                ? 'bg-indigo-500/20 text-indigo-400 border-2 border-indigo-500'
                : 'bg-[#1E1E2E] text-[#4A4A5E]'
          }`}>
            {isCompleted ? <Check size={16} /> : <StepIcon size={16} />}
          </div>
          <span className={`text-[10px] mt-1.5 whitespace-nowrap ${
            isCurrent ? 'text-indigo-400 font-medium' : 'text-[#4A4A5E]'
          }`}>
            {step.label}
          </span>
        </div>
        {step.id < totalSteps && (
          <div className={`h-px w-12 mx-2 mb-5 transition-all ${
            isCompleted ? 'bg-indigo-500' : 'bg-[#1E1E2E]'
          }`} />
        )}
      </div>
    )
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-5">
            <div className="text-center mb-4">
              <div className="w-16 h-16 rounded-2xl bg-green-500/10 text-green-400 flex items-center justify-center mx-auto mb-3">
                <MessageCircle size={28} />
              </div>
              <h2 className="text-xl font-bold text-[#F1F5F9]">Conectar WhatsApp</h2>
              <p className="text-sm text-[#94A3B8] mt-1">Introduce tu token de WhatsApp Business API</p>
            </div>

            <div>
              <label className="block text-sm text-[#94A3B8] mb-1.5">Número de teléfono</label>
              <input value={whatsapp.phone} onChange={e => setWhatsapp(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+34 612 345 678"
                className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-green-500/50" />
            </div>
            <div>
              <label className="block text-sm text-[#94A3B8] mb-1.5">WhatsApp Token (Meta)</label>
              <input value={whatsapp.wa_token} onChange={e => setWhatsapp(prev => ({ ...prev, wa_token: e.target.value }))}
                placeholder="EAAx..."
                className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-green-500/50" />
            </div>
            <div>
              <label className="block text-sm text-[#94A3B8] mb-1.5">Phone Number ID</label>
              <input value={whatsapp.wa_phone_id} onChange={e => setWhatsapp(prev => ({ ...prev, wa_phone_id: e.target.value }))}
                placeholder="123456789"
                className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-green-500/50" />
            </div>

            {(whatsapp.wa_token || whatsapp.phone) && (
              <button onClick={testWhatsApp}
                className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl transition-all text-sm font-medium">
                <Phone size={16} /> Probar conexión
              </button>
            )}

            {whatsapp.connected && (
              <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/5 border border-green-500/20 rounded-xl px-4 py-3">
                <Check size={16} /> WhatsApp conectado correctamente
              </div>
            )}

            <p className="text-xs text-[#4A4A5E] text-center">
              ¿No tienes WhatsApp Business API?{' '}
              <a href="https://developers.facebook.com/docs/whatsapp/overview" target="_blank" rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300">Guía de Meta</a>
            </p>
          </div>
        )

      case 2:
        return (
          <div className="space-y-5">
            <div className="text-center mb-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto mb-3">
                <Mail size={28} />
              </div>
              <h2 className="text-xl font-bold text-[#F1F5F9]">Conectar Email</h2>
              <p className="text-sm text-[#94A3B8] mt-1">Configura el envío de emails desde tu agencia</p>
            </div>

            <div>
              <label className="block text-sm text-[#94A3B8] mb-1.5">Proveedor</label>
              <select value={email.provider} onChange={e => setEmail(prev => ({ ...prev, provider: e.target.value }))}
                className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] focus:outline-none focus:border-blue-500/50">
                <option value="sendgrid">SendGrid (recomendado)</option>
                <option value="smtp">SMTP propio</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-[#94A3B8] mb-1.5">API Key</label>
              <input value={email.api_key} onChange={e => setEmail(prev => ({ ...prev, api_key: e.target.value }))}
                placeholder="SG.xxxxx..."
                className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-blue-500/50" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#94A3B8] mb-1.5">Email remitente</label>
                <input value={email.from_email} onChange={e => setEmail(prev => ({ ...prev, from_email: e.target.value }))}
                  placeholder="info@tuagencia.com"
                  className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-blue-500/50" />
              </div>
              <div>
                <label className="block text-sm text-[#94A3B8] mb-1.5">Nombre remitente</label>
                <input value={email.from_name} onChange={e => setEmail(prev => ({ ...prev, from_name: e.target.value }))}
                  placeholder="Tu Agencia"
                  className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-blue-500/50" />
              </div>
            </div>

            {email.api_key && (
              <button onClick={testEmail}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all text-sm font-medium">
                <MailCheck size={16} /> Enviar email de prueba
              </button>
            )}

            {email.connected && (
              <div className="flex items-center gap-2 text-sm text-blue-400 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
                <Check size={16} /> Email configurado correctamente
              </div>
            )}
          </div>
        )

      case 3:
        return (
          <div className="space-y-5">
            <div className="text-center mb-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-3">
                <Home size={28} />
              </div>
              <h2 className="text-xl font-bold text-[#F1F5F9]">Añadir primera propiedad</h2>
              <p className="text-sm text-[#94A3B8] mt-1">Añade al menos 1 propiedad para que los agentes tengan con qué trabajar</p>
            </div>

            <div className="space-y-3">
              {properties.map((prop, i) => (
                <div key={i} className="bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-[#4A4A5E] font-medium">Propiedad #{i + 1}</span>
                    {properties.length > 1 && (
                      <button onClick={() => removeProperty(i)}
                        className="text-xs text-red-400 hover:text-red-300">Eliminar</button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <input value={prop.title} onChange={e => updateProperty(i, 'title', e.target.value)}
                        placeholder="Título de la propiedad"
                        className="w-full px-4 py-2.5 bg-[#13131A] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50 text-sm" />
                    </div>
                    <select value={prop.type} onChange={e => updateProperty(i, 'type', e.target.value)}
                      className="px-4 py-2.5 bg-[#13131A] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] focus:outline-none focus:border-indigo-500/50 text-sm">
                      <option value="piso">Piso</option>
                      <option value="chalet">Chalet</option>
                      <option value="local">Local</option>
                      <option value="oficina">Oficina</option>
                      <option value="terreno">Terreno</option>
                    </select>
                    <input value={prop.zone} onChange={e => updateProperty(i, 'zone', e.target.value)}
                      placeholder="Zona / Ubicación"
                      className="px-4 py-2.5 bg-[#13131A] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50 text-sm" />
                    <input value={prop.price} onChange={e => updateProperty(i, 'price', e.target.value)}
                      placeholder="Precio (ej: 250.000€)"
                      className="px-4 py-2.5 bg-[#13131A] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50 text-sm" />
                  </div>
                </div>
              ))}
            </div>

            <button onClick={addProperty}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#0A0A0F] border border-dashed border-[#1E1E2E] rounded-xl text-[#94A3B8] hover:border-indigo-500/50 hover:text-indigo-400 transition-all text-sm">
              <Upload size={16} /> Añadir otra propiedad
            </button>
          </div>
        )

      case 4:
        return (
          <div className="space-y-5">
            <div className="text-center mb-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-3">
                <Users2 size={28} />
              </div>
              <h2 className="text-xl font-bold text-[#F1F5F9]">Activar agentes IA</h2>
              <p className="text-sm text-[#94A3B8] mt-1">Activa los agentes que quieras en tu equipo</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {agents.map((agent) => (
                <div key={agent.type}
                  onClick={() => toggleAgent(agent.type)}
                  className={`bg-[#0A0A0F] border rounded-xl p-4 cursor-pointer transition-all ${
                    agent.active ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-[#1E1E2E] hover:border-[#2A2A3E]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        agent.active ? 'bg-indigo-500/10 text-indigo-400' : 'bg-[#1E1E2E] text-[#4A4A5E]'
                      }`}>
                        <Bot size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-[#F1F5F9]">{agent.name}</h3>
                          {agent.recommended && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-400">Recomendado</span>
                          )}
                        </div>
                        <p className="text-xs text-[#94A3B8] mt-0.5">{agent.desc}</p>
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); toggleAgent(agent.type) }}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 mt-1 ${
                        agent.active ? 'bg-indigo-500' : 'bg-[#2A2A3E]'
                      }`}>
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        agent.active ? 'translate-x-[18px]' : 'translate-x-[3px]'
                      }`} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )

      default:
        return null
    }
  }

  if (launched) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="text-center space-y-6 max-w-md"
        >
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/20">
            <Rocket size={48} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[#F1F5F9]">¡Todo listo!</h2>
            <p className="text-[#94A3B8] mt-2">
              Tu agencia está configurada y lista para operar.
              Hemos activado {agents.filter(a => a.active).length} agentes de IA para tu equipo.
            </p>
          </div>
          <div className="flex items-center justify-center gap-6 py-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">{whatsapp.connected ? '✓' : '-'}</div>
              <div className="text-xs text-[#94A3B8]">WhatsApp</div>
            </div>
            <div className="w-px h-10 bg-[#1E1E2E]" />
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{email.connected ? '✓' : '-'}</div>
              <div className="text-xs text-[#94A3B8]">Email</div>
            </div>
            <div className="w-px h-10 bg-[#1E1E2E]" />
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-400">{properties.filter(p => p.title.trim()).length}</div>
              <div className="text-xs text-[#94A3B8]">Propiedades</div>
            </div>
            <div className="w-px h-10 bg-[#1E1E2E]" />
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-400">{agents.filter(a => a.active).length}</div>
              <div className="text-xs text-[#94A3B8]">Agentes IA</div>
            </div>
          </div>
          <Link to="/dashboard"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all text-sm font-medium shadow-lg shadow-indigo-500/20">
            <Zap size={16} /> Ir al Dashboard
          </Link>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="bg-[#13131A] border border-[#1E1E2E] rounded-3xl p-8">
          <div className="flex items-center justify-center mb-8 overflow-x-auto pb-1">
            <div className="flex items-center gap-1">
              {steps.map(step => (
                <div key={step.id} className="flex items-center">
                  <StepIndicator step={step} current={currentStep} />
                </div>
              ))}
            </div>
          </div>

          <div className="relative mb-2">
            <div className="w-full h-1.5 bg-[#1E1E2E] rounded-full overflow-hidden">
              <motion.div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: 'easeInOut' }} />
            </div>
            <span className="absolute right-0 top-2 text-xs text-[#4A4A5E]">Paso {currentStep} de {totalSteps}</span>
          </div>

          <div className="mt-10 mb-8">
            <AnimatePresence mode="wait">
              <motion.div key={currentStep} variants={stepVariants}
                initial="enter" animate="center" exit="exit"
                transition={{ duration: 0.2, ease: 'easeInOut' }}>
                {renderStep()}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[#1E1E2E]">
            <button onClick={prevStep} disabled={currentStep === 1}
              className="flex items-center gap-2 px-5 py-2.5 text-sm text-[#94A3B8] hover:text-[#F1F5F9] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ArrowLeft size={16} /> Anterior
            </button>

            <div className="flex gap-2">
              {canSkip && currentStep <= 2 && (
                <button onClick={nextStep}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm text-[#64748B] hover:text-[#94A3B8] transition-colors">
                  Saltar <SkipForward size={14} />
                </button>
              )}
              {currentStep < totalSteps ? (
                <button onClick={nextStep} disabled={!canProceed()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm font-medium">
                  Siguiente <ArrowRight size={16} />
                </button>
              ) : (
                <button onClick={handleLaunch} disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 disabled:opacity-40 transition-all text-sm font-medium">
                  {saving ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><Rocket size={16} /> Lanzar PropIA</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
