import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, Zap, Building2, Crown, Star,
  Users, Shield, Infinity, ChevronDown, CreditCard, Banknote, Loader2, Sparkles
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'

const PAYMENT_METHODS = [
  {
    id: 'stripe',
    name: 'Tarjeta (Stripe)',
    desc: 'Pago seguro con tarjeta de crédito o débito',
    icon: CreditCard,
  },
  {
    id: 'paypal',
    name: 'PayPal',
    desc: 'Paga con tu cuenta de PayPal',
    icon: Banknote,
  },
  {
    id: 'transfer',
    name: 'Transferencia Bancaria',
    desc: 'Recibirás los datos para transferir',
    icon: Banknote,
  },
]

const PLANS = [
  {
    id: 'starter',
    icon: Zap,
    name: 'Starter',
    price: 79,
    priceYearly: 69,
    period: '/mes',
    desc: 'Para agentes y pequeñas agencias que quieren empezar con IA',
    cta: 'Empezar ahora',
    popular: false,
    savings: 'Ahorra 120€',
    features: [
      '1 oficina',
      'Hasta 5 usuarios',
      '500 leads/mes',
      '3 Agentes IA (Captador, Vendedor, Coordinador)',
      '10 automatizaciones',
      'WhatsApp Business',
      'CRM + Pipeline Kanban',
      'Soporte por email',
    ],
  },
  {
    id: 'profesional',
    icon: Building2,
    name: 'Profesional',
    price: 199,
    priceYearly: 169,
    period: '/mes',
    desc: 'Para agencias en crecimiento que necesitan escalar con IA completa',
    cta: 'Empezar ahora',
    popular: true,
    savings: 'Ahorra 360€',
    features: [
      '3 oficinas',
      'Hasta 15 usuarios',
      '2.000 leads/mes',
      '8 Agentes IA',
      'Automatizaciones ilimitadas',
      'WhatsApp + Meta Ads',
      'Analytics avanzado',
      'API básica',
      'Soporte prioritario (<4h)',
    ],
  },
  {
    id: 'agencia',
    icon: Crown,
    name: 'Agencia',
    price: 499,
    priceYearly: 419,
    period: '/mes',
    desc: 'Para agencias consolidadas que quieren IA completa sin límites',
    cta: 'Hablar con ventas',
    popular: false,
    savings: 'Ahorra 960€',
    features: [
      'Oficinas ilimitadas',
      'Usuarios ilimitados',
      'Leads ilimitados',
      '12 Agentes IA completos',
      'Automatizaciones ilimitadas',
      'WhatsApp + Meta Ads + Idealista',
      'White-label completo',
      'Dominio personalizado',
      'API completa',
      'Soporte dedicado + onboarding',
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
  show: { transition: { staggerChildren: 0.08 } },
}

const itemAnim = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('stripe')
  const [loading, setLoading] = useState(false)
  const [openFaq, setOpenFaq] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      toast.success('¡Suscripción activada con éxito!')
      window.history.replaceState({}, '', '/pricing')
    }
    if (params.get('canceled') === 'true') {
      toast.error('Pago cancelado')
      window.history.replaceState({}, '', '/pricing')
    }
  }, [])

  const handleSelect = async (planId) => {
    setSelectedPlan(planId)
    setLoading(true)
    try {
      const data = await api.post('/billing/create-checkout', {
        planId,
        interval: annual ? 'year' : 'month',
        paymentMethod,
      })

      if (data.url) {
        window.location.href = data.url
      } else if (data.mock) {
        toast.success(
          `[MODO DEMO] Plan ${
            PLANS.find(p => p.id === planId)?.name
          } contratado (${paymentMethod}).${data.message ? ' ' + data.message : ''}`
        )
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
            <span className="ml-1 px-2 py-0.5 bg-green-500/10 text-green-400 text-[10px] font-semibold rounded-full border border-green-500/20">
              2 MESES GRATIS
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
            const displayPeriod = annual ? '/año' : plan.period
            return (
              <motion.div
                key={plan.id}
                variants={itemAnim}
                className={`relative bg-[#13131A] border rounded-2xl p-6 flex flex-col transition-all ${
                  isPopular
                    ? 'border-indigo-500/50 shadow-lg shadow-indigo-500/5'
                    : 'border-[#1E1E2E] hover:border-[#2A2A3E]'
                }`}
              >
                {isPopular && (
                  <>
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full text-xs font-semibold text-white shadow-lg whitespace-nowrap">
                      Más popular
                    </div>
                    <div className="absolute inset-0 rounded-2xl border border-indigo-500/20 pointer-events-none" />
                  </>
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

                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-[#F1F5F9]">
                      {displayPrice}<span className="text-lg text-[#94A3B8] font-normal">€</span>
                    </span>
                    <span className="text-sm text-[#94A3B8]">{displayPeriod}</span>
                  </div>
                  {annual && (
                    <p className="text-xs text-green-400 mt-1">
                      {(plan.priceYearly / 12).toFixed(0)}€/mes - {plan.savings}
                    </p>
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
                          setPaymentMethod(pm.id)
                        }}
                        className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[10px] font-medium transition-all ${
                          paymentMethod === pm.id
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
                  disabled={loading && selectedPlan === plan.id}
                  className={`w-full py-3 rounded-xl text-sm font-medium transition-all mb-6 flex items-center justify-center gap-2 ${
                    isPopular
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600 shadow-lg shadow-indigo-500/20'
                      : 'bg-[#1E1E2E] text-[#F1F5F9] hover:bg-[#2A2A3E]'
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {loading && selectedPlan === plan.id ? (
                    <><Loader2 size={16} className="animate-spin" /> Procesando...</>
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

        <div className="mt-10 p-6 bg-[#13131A] border border-[#1E1E2E] rounded-2xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PAYMENT_METHODS.map((pm) => {
              const PmIcon = pm.icon
              const active = paymentMethod === pm.id
              return (
                <button
                  key={pm.id}
                  onClick={() => setPaymentMethod(pm.id)}
                  className={`flex items-center gap-4 p-4 rounded-xl text-left transition-all border ${
                    active
                      ? 'bg-indigo-500/5 border-indigo-500/30'
                      : 'bg-[#1A1A24] border-[#1E1E2E] hover:border-[#2A2A3E]'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    active
                      ? 'bg-indigo-500/20 text-indigo-400'
                      : 'bg-[#13131A] text-[#64748B]'
                  }`}>
                    <PmIcon size={20} />
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${active ? 'text-[#F1F5F9]' : 'text-[#94A3B8]'}`}>
                      {pm.name}
                    </p>
                    <p className="text-xs text-[#64748B] mt-0.5">{pm.desc}</p>
                  </div>
                  {active && (
                    <div className="ml-auto w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

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
