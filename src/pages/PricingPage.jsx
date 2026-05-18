import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, Zap, Building2, Crown, Star,
  Users, Shield, Infinity, ChevronDown, CreditCard, Banknote, Loader2, Sparkles
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useStore } from '../lib/store'

const PAYMENT_METHODS = [
  { id: 'stripe', name: 'Tarjeta (Stripe)', desc: 'Pago seguro con tarjeta', icon: CreditCard },
  { id: 'paypal', name: 'PayPal', desc: 'Paga con tu cuenta de PayPal', icon: Banknote },
  { id: 'transfer', name: 'Transferencia', desc: 'Recibirás datos para transferir', icon: Banknote },
]

const PLANS = [
  {
    id: 'starter', icon: Zap, name: 'Starter',
    price: 79, priceYearly: 790,
    desc: 'Para agentes y pequeñas agencias',
    cta: 'Contratar Starter', popular: false,
    savings: 'Ahorra 158€',
    features: [
      '1 oficina',
      'Hasta 5 usuarios',
      '500 leads/mes',
      '3 Agentes IA',
      '10 automatizaciones',
      'WhatsApp Business',
      'CRM + Pipeline Kanban',
      'Soporte por email',
    ],
  },
  {
    id: 'profesional', icon: Building2, name: 'Profesional',
    price: 199, priceYearly: 1990,
    desc: 'Para agencias en crecimiento',
    cta: 'Contratar Profesional', popular: true,
    savings: 'Ahorra 398€',
    features: [
      '3 oficinas',
      'Hasta 15 usuarios',
      '2.000 leads/mes',
      '8 Agentes IA',
      'Automatizaciones ilimitadas',
      'WhatsApp + Meta Ads',
      'Analytics avanzado',
      'API básica',
      'Soporte prioritario',
    ],
  },
  {
    id: 'agencia', icon: Crown, name: 'Agencia',
    price: 499, priceYearly: 4990,
    desc: 'Para agencias consolidadas',
    cta: 'Contratar Agencia', popular: false,
    savings: 'Ahorra 998€',
    features: [
      'Oficinas ilimitadas',
      'Usuarios ilimitados',
      'Leads ilimitados',
      '12 Agentes IA',
      'Automatizaciones ilimitadas',
      'WhatsApp + Meta Ads + Idealista',
      'White-label completo',
      'Dominio personalizado',
      'API completa',
      'Soporte dedicado',
    ],
  },
]

const FAQ = [
  {
    q: '¿Puedo cambiar de plan en cualquier momento?',
    a: 'Sí, puedes migrar de plan cuando quieras. La diferencia se prorratea y solo pagas la diferencia del periodo restante.',
  },
  {
    q: '¿Hay permanencia?',
    a: 'No, ninguno de nuestros planes tiene permanencia. Puedes cancelar cuando quieras desde el panel de configuración.',
  },
  {
    q: '¿Qué incluye el white-label del plan Agencia?',
    a: 'El plan Agencia te permite usar tu propia marca y dominio. Personalizamos colores, logo, correos y el portal de clientes.',
  },
  {
    q: '¿Los agentes IA cuentan para el límite de usuarios?',
    a: 'No, los agentes IA son asistentes virtuales independientes. No ocupan licencias de usuario humano.',
  },
  {
    q: '¿Qué medios de pago aceptan?',
    a: 'Aceptamos tarjetas de crédito/débito (Stripe), PayPal y transferencia bancaria.',
  },
  {
    q: '¿Puedo pagar por PayPal en cualquier plan?',
    a: 'Sí, todos los planes aceptan pago con PayPal, tarjeta (Stripe) y transferencia bancaria.',
  },
]

const containerAnim = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

const itemAnim = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [selectedMethods, setSelectedMethods] = useState({})
  const [loading, setLoading] = useState(false)
  const [openFaq, setOpenFaq] = useState(null)
  const subscription = useStore(s => s.subscription)
  const fetchSubscription = useStore(s => s.fetchSubscription)
  const userPlan = subscription?.planId || null
  const planStatus = subscription?.status || null

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      toast.success('¡Suscripción activada con éxito!')
      window.history.replaceState({}, '', '/pricing')
      fetchSubscription()
    }
    if (params.get('canceled') === 'true') {
      toast.error('Pago cancelado')
      window.history.replaceState({}, '', '/pricing')
    }
  }, [fetchSubscription])

  const handleSelect = async (planId) => {
    if (userPlan === planId && (planStatus === 'active' || planStatus === 'trialing')) {
      toast.success('Ya tienes este plan activo')
      return
    }
    setSelectedPlan(planId)
    setLoading(true)
    try {
      const data = await api.post('/billing/create-checkout', {
        planId,
        interval: annual ? 'year' : 'month',
        paymentMethod: selectedMethods[planId] || 'stripe',
      })

      if (data.url) {
        window.location.href = data.url
      } else if (data.mock) {
        toast.success(
          `[MODO DEMO] Plan ${
            PLANS.find(p => p.id === planId)?.name
          } contratado (${selectedMethods[planId] || 'stripe'}).${data.message ? ' ' + data.message : ''}`
        )
        fetchSubscription()
      } else {
        toast.error('Error al crear la sesión de pago')
      }
    } catch (e) {
      toast.error('Error al procesar la solicitud')
    } finally {
      setLoading(false)
    }
  }

  const toggleFaq = (i) => {
    setOpenFaq(openFaq === i ? null : i)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="max-w-7xl mx-auto">
        <motion.div
          variants={itemAnim}
          initial="hidden"
          animate="show"
          className="text-center mb-10"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-4">
            <Sparkles size={12} />
            Planes y precios
          </span>
          <h1 className="text-3xl lg:text-4xl font-bold font-syne text-[#F1F5F9]">
            Elige el plan ideal para tu{' '}
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              agencia inmobiliaria
            </span>
          </h1>
          <p className="text-[#94A3B8] mt-3 max-w-2xl mx-auto">
            Sin permanencia. Cancela cuando quieras desde el panel de configuración.
          </p>

          <div className="flex items-center justify-center gap-3 mt-8">
            <span className={`text-sm font-medium ${!annual ? 'text-[#F1F5F9]' : 'text-[#64748B]'}`}>
              Mensual
            </span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative w-14 h-7 rounded-full transition-colors ${
                annual ? 'bg-indigo-500' : 'bg-[#1E1E2E]'
              }`}
            >
              <div
                className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform ${
                  annual ? 'translate-x-7.5' : 'translate-x-0.5'
                }`}
                style={{
                  transform: annual ? 'translateX(29px)' : 'translateX(2px)',
                }}
              />
            </button>
            <span className={`text-sm font-medium ${annual ? 'text-[#F1F5F9]' : 'text-[#64748B]'}`}>
              Anual
            </span>
            <span className="ml-1.5 px-3 py-1 bg-emerald-500/15 text-emerald-300 text-[11px] font-bold rounded-full border border-emerald-500/30 animate-pulse-soft tracking-wide">
              🎁 2 MESES GRATIS
            </span>
          </div>
        </motion.div>

        <motion.div
          variants={containerAnim}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-3 gap-5"
        >
          {PLANS.map((plan, i) => {
            const Icon = plan.icon
            const isPopular = plan.popular
            const displayPrice = annual ? plan.priceYearly : plan.price
            const displayPeriod = annual ? '/año' : '/mes'
            return (
              <motion.div
                key={plan.id}
                variants={itemAnim}
                className={`relative bg-[#13131A] border rounded-2xl p-6 flex flex-col transition-all ${
                  isPopular
                    ? 'border-indigo-500/50 shadow-lg shadow-indigo-500/5'
                    : 'border-[#1E1E2E] hover:border-[#2A2A3E]'
                } ${userPlan === plan.id && (planStatus === 'active' || planStatus === 'trialing') ? 'ring-2 ring-emerald-500/50' : ''}`}
              >
                {(isPopular && userPlan !== plan.id) && (
                  <>
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full text-xs font-semibold text-white shadow-lg whitespace-nowrap">
                      Más popular
                    </div>
                    <div className="absolute inset-0 rounded-2xl border border-indigo-500/20 pointer-events-none" />
                  </>
                )}
                {userPlan === plan.id && (planStatus === 'active' || planStatus === 'trialing') && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full text-xs font-semibold text-white shadow-lg whitespace-nowrap">
                    Plan actual
                  </div>
                )}

                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                  isPopular
                    ? 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400'
                    : 'bg-[#1E1E2E] text-[#94A3B8]'
                }`}>
                  <Icon size={24} />
                </div>

                <h3 className="text-lg font-bold text-[#F1F5F9] font-syne">{plan.name}</h3>
                <p className="text-sm text-[#94A3B8] mt-1 mb-4">{plan.desc}</p>

                <div className="mb-5">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-[#F1F5F9] tracking-tight">
                      {displayPrice}<span className="text-xl text-[#94A3B8] font-normal">€</span>
                    </span>
                    <span className="text-sm text-[#64748B] ml-1">{displayPeriod}</span>
                  </div>
                  {annual ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 bg-emerald-400 rounded-full" />
                        {(plan.priceYearly / 12).toFixed(2)}€/mes — {plan.savings} al año
                      </p>
                      <p className="text-[11px] text-[#64748B]">
                        {plan.priceYearly}€ facturados al año (2 meses gratis)
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-1">
                      <p className="text-[11px] text-[#64748B]">
                        {plan.priceYearly}€/año <span className="text-emerald-400 font-medium">(ahorra {plan.savings})</span>
                      </p>
                      <p className="text-[10px] text-emerald-400/70">2 meses gratis si facturas anualmente</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-1.5 mb-4">
                  {PAYMENT_METHODS.map((pm) => {
                    const PmIcon = pm.icon
                    return (
                      <button
                        key={pm.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedMethods(prev => ({ ...prev, [plan.id]: pm.id }))
                        }}
                        className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[10px] font-medium transition-all ${
                          (selectedMethods[plan.id] || 'stripe') === pm.id
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                            : 'bg-[#1A1A24] text-[#64748B] border border-transparent hover:border-[#2A2A3E]'
                        }`}
                      >
                        <PmIcon size={14} />
                        <span className="truncate w-full text-center leading-tight">
                          {pm.name.split(' ')[0]}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={() => handleSelect(plan.id)}
                  disabled={(loading && selectedPlan === plan.id) || (userPlan === plan.id && (planStatus === 'active' || planStatus === 'trialing'))}
                  className={`w-full py-3 rounded-xl text-sm font-medium transition-all mb-6 flex items-center justify-center gap-2 ${
                    userPlan === plan.id && (planStatus === 'active' || planStatus === 'trialing')
                      ? 'bg-emerald-600/20 text-emerald-400 cursor-default'
                      : isPopular
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600 shadow-lg shadow-indigo-500/20'
                        : 'bg-[#1E1E2E] text-[#F1F5F9] hover:bg-[#2A2A3E]'
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {loading && selectedPlan === plan.id ? (
                    <><Loader2 size={16} className="animate-spin" /> Procesando...</>
                  ) : userPlan === plan.id && (planStatus === 'active' || planStatus === 'trialing') ? (
                    'Plan activo ✓'
                  ) : (
                    plan.cta
                  )}
                </button>

                <div className="space-y-2.5 flex-1">
                  {plan.features.map((f, j) => (
                    <div key={j} className="flex items-start gap-2.5">
                      <Check size={14} className="text-indigo-400 mt-0.5 shrink-0" />
                      <span className="text-sm text-[#94A3B8]">{f}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )
          })}
        </motion.div>


        <div className="mt-10 p-6 bg-[#13131A] border border-[#1E1E2E] rounded-2xl flex items-center justify-center flex-wrap gap-6">
          <div className="flex items-center gap-2 text-sm text-[#94A3B8]">
            <Users size={16} className="text-indigo-400" />
            <span><strong className="text-[#F1F5F9]">+500</strong> agencias activas</span>
          </div>
          <div className="w-px h-6 bg-[#1E1E2E]" />
          <div className="flex items-center gap-2 text-sm text-[#94A3B8]">
            <Shield size={16} className="text-indigo-400" />
            <span><strong className="text-[#F1F5F9]">Sin permanencia</strong></span>
          </div>
          <div className="w-px h-6 bg-[#1E1E2E]" />
          <div className="flex items-center gap-2 text-sm text-[#94A3B8]">
            <Infinity size={16} className="text-indigo-400" />
            <span><strong className="text-[#F1F5F9]">Sin permanencia</strong></span>
          </div>
          <div className="w-px h-6 bg-[#1E1E2E]" />
          <div className="flex items-center gap-2 text-sm text-[#94A3B8]">
            <CreditCard size={16} className="text-indigo-400" />
            <span><strong className="text-[#F1F5F9]">Pago seguro</strong> SSL + 3DS</span>
          </div>
        </div>

        <div className="mt-16">
          <h2 className="text-2xl font-bold text-[#F1F5F9] font-syne text-center mb-8">
            Preguntas frecuentes
          </h2>
          <div className="max-w-3xl mx-auto space-y-3">
            {FAQ.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.05 }}
                className="bg-[#13131A] border border-[#1E1E2E] rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => toggleFaq(i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                >
                  <span className="text-sm font-medium text-[#F1F5F9]">{item.q}</span>
                  <ChevronDown
                    size={16}
                    className={`text-[#94A3B8] transition-transform shrink-0 ${
                      openFaq === i ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-4 text-sm text-[#94A3B8] leading-relaxed">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
