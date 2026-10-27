import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Zap, Building2, Crown, Shield, ChevronDown, Sparkles, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useStore } from '../lib/store'

// Prueba gratuita con tarjeta y descuento sobre la suscripción. Los mismos valores
// están en el servidor (BillingService.TRIAL_*): si los cambias, cámbialos en los dos sitios.
const TRIAL_DAYS = 3
const DISCOUNT_PERCENT = 10

const eur = (n) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n)
const withDiscount = (n) => Math.round(n * (100 - DISCOUNT_PERCENT)) / 100

const PLANS = [
  {
    id: 'starter', icon: Zap, name: 'Starter',
    price: 19, priceYearly: 190,
    desc: 'Para agentes y pequeñas agencias',
    cta: 'Starter', popular: false,
    savings: 'Ahorra 38€',
    features: [
      '500 leads nuevos al mes',
      'Partes de visita firmados con QR',
      'Encargos y exclusivas con avisos',
      'Informe de visitas al propietario',
      'Comprobación de anuncios antes de publicar',
      'Mejora de anuncios con IA',
      'Entrada de leads por email de portales',
      'CRM + Pipeline Kanban',
      'Soporte por email',
    ],
  },
  {
    id: 'profesional', icon: Building2, name: 'Profesional',
    price: 39, priceYearly: 390,
    desc: 'Para agencias en crecimiento',
    cta: 'Profesional', popular: true,
    savings: 'Ahorra 78€',
    features: [
      '2.000 leads nuevos al mes',
      'Partes de visita firmados con QR',
      'Encargos y exclusivas con avisos',
      'Informe de visitas al propietario',
      'Comprobación de anuncios antes de publicar',
      'Mejora de anuncios con IA',
      'Entrada de leads por email de portales',
      'CRM + Pipeline Kanban',
      'Soporte prioritario',
    ],
  },
  {
    id: 'agencia', icon: Crown, name: 'Agencia',
    price: 79, priceYearly: 790,
    desc: 'Para agencias consolidadas',
    cta: 'Agencia', popular: false,
    savings: 'Ahorra 158€',
    features: [
      'Leads ilimitados',
      'Partes de visita firmados con QR',
      'Encargos y exclusivas con avisos',
      'Informe de visitas al propietario',
      'Comprobación de anuncios antes de publicar',
      'Mejora de anuncios con IA',
      'Entrada de leads por email de portales',
      'CRM + Pipeline Kanban',
      'Soporte dedicado',
    ],
  },
]

const FAQ = [
  {
    q: '¿Cómo funciona la prueba de 3 días?',
    a: `Introduces tu tarjeta y usas PropIA ${TRIAL_DAYS} días sin pagar nada. Si no cancelas antes de que terminen, empezamos a cobrar la suscripción con un ${DISCOUNT_PERCENT} % de descuento. Si cancelas durante la prueba, no se te cobra.`,
  },
  {
    q: '¿Cuánto pagaré cuando termine la prueba?',
    a: `El precio del plan con un ${DISCOUNT_PERCENT} % de descuento: Starter ${eur(withDiscount(19))} €/mes, Profesional ${eur(withDiscount(39))} €/mes y Agencia ${eur(withDiscount(79))} €/mes (IVA aparte si corresponde). Con facturación anual, el mismo descuento sobre el precio anual.`,
  },
  {
    q: '¿Puedo cancelar cuando quiera?',
    a: 'Sí, desde Ajustes. Durante la prueba se cancela al momento y no pagas nada. Después, la suscripción sigue activa hasta el final del periodo ya pagado. No hay permanencia.',
  },
  {
    q: '¿Qué medios de pago aceptan?',
    a: 'Tarjeta de crédito o débito, a través de Stripe. Tus datos de tarjeta los gestiona Stripe; nosotros no los vemos.',
  },
  {
    q: '¿Puedo cambiar de plan?',
    a: 'Escríbenos y lo cambiamos sin coste. Por ahora el cambio de plan lo hacemos nosotros a mano para evitar cobros duplicados.',
  },
]

export default function PricingPage() {
  const navigate = useNavigate()
  const [annual, setAnnual] = useState(false)
  const [openFaq, setOpenFaq] = useState(null)
  const [busyPlan, setBusyPlan] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const subscription = useStore((s) => s.subscription)
  const fetchSubscription = useStore((s) => s.fetchSubscription)
  const currentUser = useStore((s) => s.user)
  const userPlan = subscription?.planId || null
  const planStatus = subscription?.status || null
  const hasLiveSub = planStatus === 'active' || planStatus === 'trialing' || planStatus === 'past_due'
  // Solo la primera vez hay prueba y descuento
  const trialAvailable = !subscription?.stripeSubscriptionId

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('canceled') === 'true') {
      toast.error('Has cancelado el pago. No se ha cobrado nada.')
      window.history.replaceState({}, '', '/pricing')
    }
    if (params.get('success') === 'true') {
      window.history.replaceState({}, '', '/pricing')
      setConfirming(true)
      // El aviso de Stripe puede tardar unos segundos: esperamos a que la cuenta quede activada.
      let tries = 0
      const timer = setInterval(async () => {
        tries += 1
        await fetchSubscription()
        const st = useStore.getState().subscription?.status
        if (st === 'trialing' || st === 'active') {
          clearInterval(timer)
          setConfirming(false)
          toast.success(st === 'trialing' ? `¡Prueba de ${TRIAL_DAYS} días iniciada!` : '¡Suscripción activada!')
          navigate('/dashboard', { replace: true })
        } else if (tries >= 20) {
          clearInterval(timer)
          setConfirming(false)
          toast('Estamos confirmando tu pago. Si en un minuto no puedes entrar, escríbenos.', { icon: '⏳', duration: 8000 })
        }
      }, 1500)
      return () => clearInterval(timer)
    }
  }, [fetchSubscription, navigate])

  async function choose(plan) {
    if (!currentUser) {
      window.location.href = `/register?plan=${plan.id}${annual ? '&interval=year' : ''}`
      return
    }
    setBusyPlan(plan.id)
    try {
      const data = await api.post('/billing/create-checkout', { planId: plan.id, interval: annual ? 'year' : 'month' })
      if (data?.url) { window.location.href = data.url; return }
      toast.error('No se pudo iniciar el pago. Inténtalo de nuevo.')
    } catch (err) {
      toast.error(err.message || 'No se pudo iniciar el pago.')
    } finally {
      setBusyPlan(null)
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <Loader2 className="animate-spin text-indigo-400" size={36} />
        <p className="text-[#F1F5F9] font-semibold">Confirmando tu suscripción…</p>
        <p className="text-sm text-[#94A3B8]">Solo tarda unos segundos.</p>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-4">
            <Sparkles size={12} />
            {trialAvailable ? `${TRIAL_DAYS} días gratis` : 'Planes y precios'}
          </span>
          <h1 className="text-3xl lg:text-4xl font-bold font-syne text-[#F1F5F9]">
            {trialAvailable ? 'Prueba PropIA ' : 'Elige tu plan de '}
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              {trialAvailable ? `${TRIAL_DAYS} días gratis` : 'PropIA'}
            </span>
          </h1>
          <p className="text-[#94A3B8] mt-3 max-w-2xl mx-auto">
            {trialAvailable
              ? `Introduce tu tarjeta para empezar. No se cobra nada durante ${TRIAL_DAYS} días; después, la suscripción con un ${DISCOUNT_PERCENT} % de descuento. Cancela antes y no pagas.`
              : 'Sin permanencia. Cancela cuando quieras desde Ajustes.'}
          </p>

          <div className="flex items-center justify-center gap-3 mt-8">
            <span className={`text-sm font-medium ${!annual ? 'text-[#F1F5F9]' : 'text-[#64748B]'}`}>Mensual</span>
            <button
              onClick={() => setAnnual(!annual)}
              aria-label="Cambiar entre facturación mensual y anual"
              className={`relative w-14 h-7 rounded-full transition-colors ${annual ? 'bg-indigo-500' : 'bg-[#1E1E2E]'}`}
            >
              <div className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform" style={{ transform: annual ? 'translateX(29px)' : 'translateX(2px)' }} />
            </button>
            <span className={`text-sm font-medium ${annual ? 'text-[#F1F5F9]' : 'text-[#64748B]'}`}>Anual</span>
            <span className="ml-1.5 px-3 py-1 bg-emerald-500/15 text-emerald-300 text-[11px] font-bold rounded-full border border-emerald-500/30 tracking-wide">
              2 MESES GRATIS
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.map((plan) => {
            const Icon = plan.icon
            const isCurrent = hasLiveSub && userPlan === plan.id
            const list = annual ? plan.priceYearly : plan.price
            const after = trialAvailable ? withDiscount(list) : list
            const period = annual ? '/año' : '/mes'
            const disabled = busyPlan === plan.id || hasLiveSub
            return (
              <div key={plan.id} className={`relative bg-[#13131A] border rounded-2xl p-6 flex flex-col ${plan.popular ? 'border-indigo-500/50 shadow-lg shadow-indigo-500/5' : 'border-[#1E1E2E]'} ${isCurrent ? 'ring-2 ring-emerald-500/50' : ''}`}>
                {plan.popular && !isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full text-xs font-semibold text-white">Más popular</div>
                )}
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full text-xs font-semibold text-white">
                    {planStatus === 'trialing' ? 'En prueba' : 'Plan actual'}
                  </div>
                )}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${plan.popular ? 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400' : 'bg-[#1E1E2E] text-[#94A3B8]'}`}>
                  <Icon size={24} />
                </div>
                <h3 className="text-lg font-bold text-[#F1F5F9] font-syne">{plan.name}</h3>
                <p className="text-sm text-[#94A3B8] mt-1 mb-4">{plan.desc}</p>

                <div className="mb-5">
                  {trialAvailable ? (
                    <>
                      <p className="text-xs font-semibold text-emerald-400">{TRIAL_DAYS} días gratis, después:</p>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-xl text-[#64748B] line-through decoration-2">{eur(list)}€</span>
                        <span className="text-4xl font-bold text-[#F1F5F9] tracking-tight">{eur(after)}<span className="text-xl text-[#94A3B8] font-normal">€</span></span>
                        <span className="text-sm text-[#64748B]">{period}</span>
                      </div>
                      <p className="text-[11px] text-[#64748B] mt-1">{DISCOUNT_PERCENT} % de descuento en tu suscripción</p>
                    </>
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold text-[#F1F5F9] tracking-tight">{eur(list)}<span className="text-xl text-[#94A3B8] font-normal">€</span></span>
                      <span className="text-sm text-[#64748B]">{period}</span>
                    </div>
                  )}
                  {annual && <p className="text-[11px] text-emerald-400 mt-1">{plan.savings} frente a pagar mes a mes</p>}
                </div>

                <button
                  onClick={() => choose(plan)}
                  disabled={disabled}
                  className={`w-full py-3 rounded-xl text-sm font-medium transition-all mb-6 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                    isCurrent ? 'bg-emerald-600/20 text-emerald-400'
                      : plan.popular ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600 shadow-lg shadow-indigo-500/20'
                      : 'bg-[#1E1E2E] text-[#F1F5F9] hover:bg-[#2A2A3E]'
                  }`}
                >
                  {busyPlan === plan.id && <Loader2 size={16} className="animate-spin" />}
                  {isCurrent ? 'Plan activo ✓' : hasLiveSub ? 'Ya tienes una suscripción' : trialAvailable ? `Empezar ${TRIAL_DAYS} días gratis` : `Suscribirme a ${plan.cta}`}
                </button>

                <div className="space-y-2.5 flex-1">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-start gap-2.5">
                      <Check size={14} className="text-indigo-400 mt-0.5 shrink-0" />
                      <span className="text-sm text-[#94A3B8]">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-10 p-6 bg-[#13131A] border border-[#1E1E2E] rounded-2xl flex items-center justify-center flex-wrap gap-6">
          <div className="flex items-center gap-2 text-sm text-[#94A3B8]">
            <Shield size={16} className="text-indigo-400" />
            <span><strong className="text-[#F1F5F9]">Sin permanencia</strong> · cancela cuando quieras</span>
          </div>
          <div className="w-px h-6 bg-[#1E1E2E]" />
          <div className="text-sm text-[#94A3B8]"><strong className="text-[#F1F5F9]">Pago seguro</strong> con Stripe</div>
        </div>

        <div className="mt-12 max-w-3xl mx-auto">
          <h2 className="text-xl font-bold font-syne text-[#F1F5F9] mb-4 text-center">Preguntas frecuentes</h2>
          <div className="space-y-2">
            {FAQ.map((item, i) => (
              <div key={item.q} className="bg-[#13131A] border border-[#1E1E2E] rounded-xl">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left">
                  <span className="text-sm font-medium text-[#F1F5F9]">{item.q}</span>
                  <ChevronDown size={16} className={`text-[#64748B] shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {openFaq === i && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <p className="px-5 pb-4 text-sm text-[#94A3B8] leading-relaxed">{item.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
