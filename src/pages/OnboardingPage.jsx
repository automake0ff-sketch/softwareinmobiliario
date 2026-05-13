import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, MessageCircle, Home, Users2, Rocket,
  Check, Upload, ArrowLeft, ArrowRight, Camera,
  Phone, Bot, Star, Sparkles, Shield, Zap
} from 'lucide-react'

const steps = [
  { id: 1, label: 'Perfil', icon: Building2 },
  { id: 2, label: 'WhatsApp', icon: MessageCircle },
  { id: 3, label: 'Propiedades', icon: Home },
  { id: 4, label: 'Agentes', icon: Users2 },
  { id: 5, label: 'Lanzar', icon: Rocket },
]

const agentRoles = [
  { id: 'captador', name: 'Captador', desc: 'Busca y capta nuevas propiedades', recommended: true },
  { id: 'coordinador', name: 'Coordinador', desc: 'Coordina visitas y agenda', recommended: true },
  { id: 'vendedor', name: 'Vendedor', desc: 'Cierra ventas y negociaciones', recommended: true },
  { id: 'marketing', name: 'Marketing', desc: 'Gestiona campa\u00f1as y redes sociales', recommended: false },
  { id: 'analista', name: 'Analista', desc: 'Analiza datos y rendimiento', recommended: false },
  { id: 'soporte', name: 'Soporte', desc: 'Atenci\u00f3n al cliente y postventa', recommended: false },
]

const stepVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
}

const propertyTemplate = { title: '', type: 'piso', location: '', price: '' }

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1)

  const [perfil, setPerfil] = useState({ name: '', city: '', zone: '', logo: null })
  const [whatsapp, setWhatsapp] = useState({ phone: '', connected: false })
  const [properties, setProperties] = useState([{ ...propertyTemplate }])
  const [agents, setAgents] = useState(
    agentRoles.map(a => ({ ...a, active: a.recommended }))
  )
  const [launched, setLaunched] = useState(false)

  const totalSteps = steps.length
  const progress = (currentStep / totalSteps) * 100

  const canProceed = () => {
    switch (currentStep) {
      case 1: return perfil.name.trim().length > 0
      case 2: return whatsapp.phone.trim().length >= 9
      case 3: return properties.filter(p => p.title.trim()).length >= 3
      case 4: return agents.some(a => a.active)
      case 5: return true
      default: return false
    }
  }

  const nextStep = () => {
    if (currentStep < totalSteps) setCurrentStep(prev => prev + 1)
    else handleLaunch()
  }

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1)
  }

  const handleLaunch = () => {
    setLaunched(true)
  }

  const addProperty = () => {
    setProperties(prev => [...prev, { ...propertyTemplate }])
  }

  const updateProperty = (index, field, value) => {
    setProperties(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))
  }

  const removeProperty = (index) => {
    if (properties.length > 1) {
      setProperties(prev => prev.filter((_, i) => i !== index))
    }
  }

  const toggleAgent = (id) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a))
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
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-3">
                <Building2 size={28} />
              </div>
              <h2 className="text-xl font-bold text-[#F1F5F9] font-syne">Perfil de agencia</h2>
              <p className="text-sm text-[#94A3B8] mt-1">Cu\u00e9ntanos sobre tu agencia inmobiliaria</p>
            </div>

            <div className="flex flex-col items-center gap-4 mb-6">
              <div className="w-24 h-24 rounded-2xl bg-[#1E1E2E] border-2 border-dashed border-[#2A2A3E] flex items-center justify-center cursor-pointer hover:border-indigo-500/50 transition-colors group">
                <div className="text-center">
                  <Camera size={24} className="text-[#4A4A5E] group-hover:text-indigo-400 transition-colors mx-auto" />
                  <span className="text-[10px] text-[#4A4A5E] mt-1 block">Logo</span>
                </div>
              </div>
              <span className="text-xs text-[#4A4A5E]">A\u00f1ade el logo de tu agencia (opcional)</span>
            </div>

            <div>
              <label className="block text-sm text-[#94A3B8] mb-1.5">Nombre de la agencia</label>
              <input
                type="text"
                value={perfil.name}
                onChange={e => setPerfil(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ej: Inmobiliaria Centro"
                className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#94A3B8] mb-1.5">Ciudad</label>
                <input
                  type="text"
                  value={perfil.city}
                  onChange={e => setPerfil(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="Ej: Madrid"
                  className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-[#94A3B8] mb-1.5">Zona de operaci\u00f3n</label>
                <input
                  type="text"
                  value={perfil.zone}
                  onChange={e => setPerfil(prev => ({ ...prev, zone: e.target.value }))}
                  placeholder="Ej: Centro, Chamart\u00edn"
                  className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
            </div>
          </div>
        )

      case 2:
        return (
          <div className="space-y-5">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-green-500/10 text-green-400 flex items-center justify-center mx-auto mb-3">
                <MessageCircle size={28} />
              </div>
              <h2 className="text-xl font-bold text-[#F1F5F9] font-syne">Conectar WhatsApp</h2>
              <p className="text-sm text-[#94A3B8] mt-1">Conecta tu n\u00famero de WhatsApp Business</p>
            </div>

            <div>
              <label className="block text-sm text-[#94A3B8] mb-1.5">N\u00famero de tel\u00e9fono</label>
              <div className="flex gap-3">
                <input
                  type="tel"
                  value={whatsapp.phone}
                  onChange={e => setWhatsapp(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+34 612 345 678"
                  className="flex-1 px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-green-500/50 transition-colors"
                />
                <button className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all text-sm font-medium">
                  <Phone size={16} />
                  Conectar
                </button>
              </div>
              <p className="text-xs text-[#4A4A5E] mt-2">
                Recibir\u00e1s un c\u00f3digo de verificaci\u00f3n en este n\u00famero
              </p>
            </div>

            {whatsapp.connected && (
              <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/5 border border-green-500/20 rounded-xl px-4 py-3">
                <Check size={16} />
                WhatsApp conectado correctamente
              </div>
            )}
          </div>
        )

      case 3:
        return (
          <div className="space-y-5">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-3">
                <Home size={28} />
              </div>
              <h2 className="text-xl font-bold text-[#F1F5F9] font-syne">Importar propiedades</h2>
              <p className="text-sm text-[#94A3B8] mt-1">A\u00f1ade al menos 3 propiedades para empezar</p>
            </div>

            <div className="space-y-3">
              {properties.map((prop, i) => (
                <div key={i} className="bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-[#4A4A5E] font-medium">Propiedad #{i + 1}</span>
                    {properties.length > 1 && (
                      <button
                        onClick={() => removeProperty(i)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        value={prop.title}
                        onChange={e => updateProperty(i, 'title', e.target.value)}
                        placeholder="T\u00edtulo de la propiedad"
                        className="w-full px-4 py-2.5 bg-[#13131A] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50 transition-colors text-sm"
                      />
                    </div>
                    <select
                      value={prop.type}
                      onChange={e => updateProperty(i, 'type', e.target.value)}
                      className="px-4 py-2.5 bg-[#13131A] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] focus:outline-none focus:border-indigo-500/50 transition-colors text-sm"
                    >
                      <option value="piso">Piso</option>
                      <option value="chalet">Chalet</option>
                      <option value="local">Local</option>
                      <option value="oficina">Oficina</option>
                      <option value="terreno">Terreno</option>
                    </select>
                    <input
                      type="text"
                      value={prop.location}
                      onChange={e => updateProperty(i, 'location', e.target.value)}
                      placeholder="Ubicaci\u00f3n"
                      className="px-4 py-2.5 bg-[#13131A] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50 transition-colors text-sm"
                    />
                    <input
                      type="text"
                      value={prop.price}
                      onChange={e => updateProperty(i, 'price', e.target.value)}
                      placeholder="Precio (ej: 250.000\u20AC)"
                      className="px-4 py-2.5 bg-[#13131A] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50 transition-colors text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addProperty}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#0A0A0F] border border-dashed border-[#1E1E2E] rounded-xl text-[#94A3B8] hover:border-indigo-500/50 hover:text-indigo-400 transition-all text-sm"
            >
              <Upload size={16} />
              A\u00f1adir otra propiedad
            </button>

            {properties.filter(p => p.title.trim()).length < 3 && (
              <p className="text-xs text-amber-400 text-center">
                A\u00f1ade al menos 3 propiedades para continuar ({properties.filter(p => p.title.trim()).length}/3)
              </p>
            )}
          </div>
        )

      case 4:
        return (
          <div className="space-y-5">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-3">
                <Users2 size={28} />
              </div>
              <h2 className="text-xl font-bold text-[#F1F5F9] font-syne">Activar agentes IA</h2>
              <p className="text-sm text-[#94A3B8] mt-1">Selecciona los agentes de IA que quieres activar</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => toggleAgent(agent.id)}
                  className={`bg-[#0A0A0F] border rounded-xl p-4 cursor-pointer transition-all ${
                    agent.active
                      ? 'border-indigo-500/30 bg-indigo-500/5'
                      : 'border-[#1E1E2E] hover:border-[#2A2A3E]'
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
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-400">
                              Recomendado
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#94A3B8] mt-0.5">{agent.desc}</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleAgent(agent.id) }}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 mt-1 ${
                        agent.active ? 'bg-indigo-500' : 'bg-[#2A2A3E]'
                      }`}
                    >
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

      case 5:
        return (
          <div className="space-y-6 text-center">
            {launched ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="space-y-6"
              >
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/20">
                  <Rocket size={48} className="text-white" />
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-[#F1F5F9] font-syne">
                    \u00a1Todo listo!
                  </h2>
                  <p className="text-[#94A3B8] mt-2 max-w-md mx-auto">
                    Tu agencia <strong className="text-[#F1F5F9]">{perfil.name}</strong> est\u00e1 configurada y lista para operar.
                    Hemos activado {agents.filter(a => a.active).length} agentes de IA para tu equipo.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-6 py-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-indigo-400">{properties.filter(p => p.title.trim()).length}</div>
                    <div className="text-xs text-[#94A3B8]">Propiedades</div>
                  </div>
                  <div className="w-px h-10 bg-[#1E1E2E]" />
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">{agents.filter(a => a.active).length}</div>
                    <div className="text-xs text-[#94A3B8]">Agentes IA</div>
                  </div>
                  <div className="w-px h-10 bg-[#1E1E2E]" />
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-400">1</div>
                    <div className="text-xs text-[#94A3B8]">WhatsApp</div>
                  </div>
                </div>

                <a
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all text-sm font-medium shadow-lg shadow-indigo-500/20"
                >
                  <Zap size={16} />
                  Ir al Dashboard
                </a>

                <div className="flex items-center justify-center gap-6 text-xs text-[#4A4A5E]">
                  <span className="flex items-center gap-1"><Shield size={12} /> Datos seguros</span>
                  <span className="flex items-center gap-1"><Star size={12} /> Sin compromiso</span>
                  <span className="flex items-center gap-1"><Sparkles size={12} /> IA activa</span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="space-y-6"
              >
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/20">
                  <Rocket size={48} className="text-white" />
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-[#F1F5F9] font-syne">
                    \u00a1Estamos listos para lanzar!
                  </h2>
                  <p className="text-[#94A3B8] mt-2 max-w-md mx-auto">
                    Revisa que todos los datos sean correctos y pulsa el bot\u00f3n para activar tu agencia.
                  </p>
                </div>

                <div className="bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl p-4 max-w-sm mx-auto text-left">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#94A3B8]">Agencia</span>
                      <span className="text-[#F1F5F9] font-medium">{perfil.name || 'Sin nombre'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#94A3B8]">Ubicaci\u00f3n</span>
                      <span className="text-[#F1F5F9] font-medium">{perfil.city ? `${perfil.city}, ${perfil.zone}` : 'No especificado'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#94A3B8]">WhatsApp</span>
                      <span className="text-[#F1F5F9] font-medium">{whatsapp.phone || 'No conectado'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#94A3B8]">Propiedades</span>
                      <span className="text-[#F1F5F9] font-medium">{properties.filter(p => p.title.trim()).length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#94A3B8]">Agentes IA</span>
                      <span className="text-[#F1F5F9] font-medium">{agents.filter(a => a.active).length} activos</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleLaunch}
                  className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all text-sm font-medium shadow-lg shadow-indigo-500/20"
                >
                  <Rocket size={16} />
                  \u00a1Lanzar agencia!
                </button>
              </motion.div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  if (launched) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-4">
        {renderStep()}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="bg-[#13131A] border border-[#1E1E2E] rounded-3xl p-8">
          <div className="flex items-center justify-center mb-8 overflow-x-auto pb-1">
            <div className="flex items-center gap-1">
              {steps.map((step, i) => (
                <div key={step.id} className="flex items-center">
                  <StepIndicator step={step} current={currentStep} />
                </div>
              ))}
            </div>
          </div>

          <div className="relative mb-2">
            <div className="w-full h-1.5 bg-[#1E1E2E] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
              />
            </div>
            <span className="absolute right-0 top-2 text-xs text-[#4A4A5E]">
              Paso {currentStep} de {totalSteps}
            </span>
          </div>

          <div className="mt-10 mb-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2, ease: 'easeInOut' }}
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[#1E1E2E]">
            <button
              onClick={prevStep}
              disabled={currentStep === 1}
              className="flex items-center gap-2 px-5 py-2.5 text-sm text-[#94A3B8] hover:text-[#F1F5F9] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowLeft size={16} />
              Anterior
            </button>

            {currentStep < totalSteps ? (
              <button
                onClick={nextStep}
                disabled={!canProceed()}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm font-medium"
              >
                Siguiente
                <ArrowRight size={16} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
