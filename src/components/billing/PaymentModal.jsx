import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CreditCard, Banknote, X, Loader2, Check, AlertCircle,
  Building2, Lock
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { useStore } from '../../lib/store'

const PAYMENT_FORMS = {
  stripe: {
    id: 'stripe',
    title: 'Pago con tarjeta',
    icon: CreditCard,
    fields: [
      { key: 'cardNumber', label: 'Número de tarjeta', placeholder: '4242 4242 4242 4242', type: 'text' },
      { key: 'cardExpiry', label: 'Fecha de caducidad', placeholder: 'MM/AA', type: 'text' },
      { key: 'cardCvc', label: 'CVC', placeholder: '123', type: 'text' },
      { key: 'cardName', label: 'Titular de la tarjeta', placeholder: 'Nombre completo', type: 'text' },
    ],
  },
  paypal: {
    id: 'paypal',
    title: 'Pago con PayPal',
    icon: Banknote,
    fields: [
      { key: 'paypalEmail', label: 'Email de PayPal', placeholder: 'tu@email.com', type: 'email' },
    ],
  },
  transfer: {
    id: 'transfer',
    title: 'Transferencia bancaria',
    icon: Building2,
    fields: [
      { key: 'accountHolder', label: 'Titular de la cuenta', placeholder: 'Nombre o empresa', type: 'text' },
      { key: 'accountIban', label: 'IBAN', placeholder: 'ES00 0000 0000 0000 0000 0000', type: 'text' },
    ],
  },
}

export default function PaymentModal({ plan, interval, open, onClose, onSuccess, initialMethod = 'stripe' }) {
  const [method, setMethod] = useState(initialMethod)
  const [formData, setFormData] = useState({})
  const [step, setStep] = useState('select') // select | form | processing | done
  const [result, setResult] = useState(null)
  const fetchSubscription = useStore(s => s.fetchSubscription)

  useEffect(() => {
    if (open) {
      setMethod(initialMethod)
      setStep(initialMethod ? 'form' : 'select')
      setFormData({})
      setResult(null)
    }
  }, [open, initialMethod])

  const updateField = (key, value) => setFormData(prev => ({ ...prev, [key]: value }))

  const displayPrice = plan ? (interval === 'year' ? plan.priceYearly : plan.price) : 0
  const displayPeriod = interval === 'year' ? '/año' : '/mes'

  const handleMethodSelect = (m) => {
    setMethod(m)
    setStep('form')
    setFormData({})
  }

  const handleSubmit = async () => {
    setStep('processing')
    try {
      const data = await api.post('/billing/create-checkout', {
        planId: plan?.id,
        interval,
        paymentMethod: method,
      })

      if (data.url) {
        window.location.href = data.url
        return
      }

      if (data.mock) {
        setResult({ success: true, message: `Plan ${plan?.name || ''} contratado (${method}).${data.message ? ' ' + data.message : ''}` })
        setStep('done')
        fetchSubscription()
        setTimeout(() => {
          onClose()
          onSuccess?.()
        }, 2000)
      } else {
        setResult({ success: false, message: 'Error al crear la sesión de pago' })
        setStep('done')
      }
    } catch (e) {
      setResult({ success: false, message: e.message || 'Error al procesar el pago' })
      setStep('done')
    }
  }

  const selectedMethod = PAYMENT_FORMS[method]
  const MethodIcon = selectedMethod?.icon

  const isValid =
    method === 'stripe'
      ? formData.cardNumber?.length >= 16 && formData.cardExpiry?.length >= 4 && formData.cardCvc?.length >= 3 && formData.cardName
      : method === 'paypal'
        ? formData.paypalEmail?.includes('@')
        : method === 'transfer'
          ? formData.accountHolder && formData.accountIban?.length >= 10
          : false

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg bg-[#13131A] border border-[#1E1E2E] rounded-3xl overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E1E2E]">
              <div className="flex items-center gap-2">
                <Lock size={14} className="text-indigo-400" />
                <span className="text-sm font-medium text-[#F1F5F9]">Pago seguro</span>
              </div>
              <button onClick={onClose} className="text-[#64748B] hover:text-[#F1F5F9] transition-colors p-1">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-xs text-[#64748B] uppercase tracking-wider font-medium">Plan seleccionado</p>
                  <p className="text-lg font-bold text-[#F1F5F9]">{plan?.name || ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-[#F1F5F9]">{displayPrice}<span className="text-sm text-[#64748B]">€</span></p>
                  <p className="text-xs text-[#64748B]">{displayPeriod}</p>
                </div>
              </div>

              {step === 'select' && (
                <div className="space-y-3">
                  <p className="text-sm text-[#94A3B8] mb-4">Selecciona tu método de pago:</p>
                  {Object.values(PAYMENT_FORMS).map((pm) => {
                    const PmIcon = pm.icon
                    return (
                      <button
                        key={pm.id}
                        onClick={() => handleMethodSelect(pm.id)}
                        className="w-full flex items-center gap-4 p-4 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl hover:border-indigo-500/30 transition-all group text-left"
                      >
                        <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
                          <PmIcon size={20} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-[#F1F5F9]">{pm.title}</p>
                          <p className="text-xs text-[#64748B] mt-0.5">
                            {pm.id === 'stripe' ? 'Tarjeta de crédito o débito' : pm.id === 'paypal' ? 'Paga con tu cuenta PayPal' : 'Recibirás instrucciones por email'}
                          </p>
                        </div>
                        <ChevronRightIcon />
                      </button>
                    )
                  })}
                </div>
              )}

              {step === 'form' && selectedMethod && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <button onClick={() => setStep('select')} className="text-[#64748B] hover:text-[#F1F5F9] text-sm transition-colors">
                      ← Cambiar método
                    </button>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl">
                    <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                      <MethodIcon size={18} />
                    </div>
                    <span className="text-sm font-medium text-[#F1F5F9]">{selectedMethod.title}</span>
                  </div>

                  <div className="space-y-3">
                    {selectedMethod.fields.map((field) => (
                      <div key={field.key}>
                        <label className="block text-sm text-[#94A3B8] mb-1">{field.label}</label>
                        <input
                          type={field.type}
                          value={formData[field.key] || ''}
                          onChange={(e) => updateField(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50 font-mono text-sm"
                          autoComplete="off"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                    <AlertCircle size={14} className="text-amber-400 shrink-0" />
                    <p className="text-xs text-amber-400/80">
                      {method === 'stripe'
                        ? 'Modo demo — no se realizará ningún cargo real.'
                        : method === 'paypal'
                          ? 'Se abrirá una ventana de PayPal para confirmar el pago.'
                          : 'Te enviaremos los datos de transferencia por email.'}
                    </p>
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={!isValid}
                    className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                  >
                    <Lock size={14} />
                    Pagar {displayPrice}€ {displayPeriod}
                  </button>
                </div>
              )}

              {step === 'processing' && (
                <div className="flex flex-col items-center py-10">
                  <Loader2 size={40} className="text-indigo-400 animate-spin mb-4" />
                  <p className="text-[#F1F5F9] font-medium">Procesando pago...</p>
                  <p className="text-sm text-[#64748B] mt-1">Por favor, espera un momento</p>
                </div>
              )}

              {step === 'done' && result && (
                <div className="flex flex-col items-center py-8">
                  {result.success ? (
                    <>
                      <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
                        <Check size={28} />
                      </div>
                      <p className="text-lg font-bold text-[#F1F5F9]">¡Pago confirmado!</p>
                      <p className="text-sm text-[#94A3B8] mt-2 text-center">{result.message}</p>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mb-4">
                        <X size={28} />
                      </div>
                      <p className="text-lg font-bold text-[#F1F5F9]">Error en el pago</p>
                      <p className="text-sm text-[#94A3B8] mt-2 text-center">{result.message}</p>
                      <button
                        onClick={() => { setStep('select'); setResult(null) }}
                        className="mt-4 px-6 py-2 bg-[#1E1E2E] text-[#F1F5F9] rounded-xl text-sm hover:bg-[#2A2A3E] transition-colors"
                      >
                        Intentar de nuevo
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-[#0A0A0F] border-t border-[#1E1E2E] flex items-center justify-center gap-4 text-xs text-[#64748B]">
              <span className="flex items-center gap-1"><Lock size={10} /> SSL 256-bit</span>
              <span>Pago seguro con 3DS</span>
              <span>Sin permanencia</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#64748B] group-hover:text-[#F1F5F9] transition-colors">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}
