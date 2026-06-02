
import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  UserPlus, Building2, CreditCard, ArrowRight, ArrowLeft,
  Check, Zap, Shield, Star, ChevronRight
} from 'lucide-react'
import api from '../lib/api'
import { useStore } from '../lib/store'

const BotonPago = ({ usuario }) => {
  const manejarPago = async () => {
    try {
      const respuesta = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idUsuarioActual: usuario.id,
          emailUsuarioActual: usuario.email
        }),
      });

      const datos = await respuesta.json();

      if (datos.url) {
        window.location.href = datos.url;
      } else {
        alert('Hubo un problema al generar el enlace de pago.');
      }
    } catch (error) {
      console.error('Error en el proceso de redirección:', error);
    }
  };

  return (
    <button 
      onClick={manejarPago}
      className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
    >
      Activar mi Suscripción en PropIA
    </button>
  );
};
const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 79,
    desc: 'Para agentes y pequeñas agencias',
    features: ['1 oficina', '5 usuarios', '500 leads/mes', '3 Agentes IA', '10 automatizaciones'],
    popular: false,
  },
  {
    id: 'profesional',
    name: 'Profesional',
    price: 199,
    desc: 'Para agencias en crecimiento',
    features: ['3 oficinas', '15 usuarios', '2000 leads/mes', '8 Agentes IA', 'Automatizaciones ilimitadas'],
    popular: true,
  },
  {
    id: 'agencia',
    name: 'Agencia',
    price: 499,
    desc: 'Para agencias consolidadas',
    features: ['Oficinas ilimitadas', 'Usuarios ilimitados', 'Leads ilimitados', '12 Agentes IA', 'Todo incluido'],
    popular: false,
  },
]

export default function RegisterPage() {
  const [step, setStep] = useState(1)
  const navigate = useNavigate()
  const { setUser, setAgency } = useStore()

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    agencyName: '',
    agencyCity: '',
    agencyPhone: '',
    agencyEmail: '',
    plan: 'starter',
  })

  const [loading, setLoading] = useState(false)

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const canProceedStep1 = form.name && form.email && form.password && form.phone
  const canProceedStep2 = form.agencyName && form.agencyCity && form.agencyPhone

  const handleRegister = async () => {
    setLoading(true)
    try {
      const res = await api.post('/auth/register', {
        email: form.email,
        password: form.password,
        name: form.name,
        phone: form.phone,
        agencyName: form.agencyName,
        agencyCity: form.agencyCity,
        agencyPhone: form.agencyPhone,
        agencyEmail: form.agencyEmail || form.email,
        plan: form.plan,
      })

      const loginRes = await api.post('/login', {
        email: form.email,
        password: form.password,
      })

      setUser(loginRes.user)
      setAgency(loginRes.agency)
      api.setAuth(loginRes.token, loginRes.user.id, loginRes.user.role, loginRes.user.agency_id, loginRes.user.office_id)

      toast.success('¡Cuenta creada con éxito!')
      navigate('/onboarding')
    } catch (err) {
      toast.error(err.message || 'Error al crear la cuenta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-indigo-500/20">
            <span className="text-xl font-bold text-white">P</span>
          </div>
          <h1 className="text-2xl font-bold text-[#F1F5F9]">Crear tu agencia</h1>
          <p className="text-[#64748B] mt-1">Configura tu espacio en PropIA</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                step >= s ? 'bg-indigo-600 text-white' : 'bg-[#1E1E2E] text-[#4A4A5E]'
              }`}>
                {step > s ? <Check size={14} /> : s}
              </div>
              {s < 3 && <div className={`w-8 h-px ${step > s ? 'bg-indigo-600' : 'bg-[#1E1E2E]'}`} />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-[#13131A] border border-[#1E1E2E] rounded-3xl p-8 space-y-4"
            >
              <div className="text-center mb-2">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-2">
                  <UserPlus size={24} />
                </div>
                <h2 className="text-lg font-bold text-[#F1F5F9]">Datos personales</h2>
              </div>

              <div>
                <label className="block text-sm text-[#94A3B8] mb-1">Nombre completo</label>
                <input value={form.name} onChange={e => updateField('name', e.target.value)}
                  className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50"
                  placeholder="Tu nombre" />
              </div>
              <div>
                <label className="block text-sm text-[#94A3B8] mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => updateField('email', e.target.value)}
                  className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50"
                  placeholder="tu@email.com" />
              </div>
              <div>
                <label className="block text-sm text-[#94A3B8] mb-1">Contraseña</label>
                <input type="password" value={form.password} onChange={e => updateField('password', e.target.value)}
                  className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50"
                  placeholder="Mínimo 6 caracteres" />
              </div>
              <div>
                <label className="block text-sm text-[#94A3B8] mb-1">Teléfono</label>
                <input value={form.phone} onChange={e => updateField('phone', e.target.value)}
                  className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50"
                  placeholder="+34 612 345 678" />
              </div>

              <button onClick={() => canProceedStep1 && setStep(2)}
                disabled={!canProceedStep1}
                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all text-sm font-medium disabled:opacity-40 mt-2">
                Siguiente <ArrowRight size={16} />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-[#13131A] border border-[#1E1E2E] rounded-3xl p-8 space-y-4"
            >
              <div className="text-center mb-2">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-2">
                  <Building2 size={24} />
                </div>
                <h2 className="text-lg font-bold text-[#F1F5F9]">Datos de la agencia</h2>
              </div>

              <div>
                <label className="block text-sm text-[#94A3B8] mb-1">Nombre de la agencia</label>
                <input value={form.agencyName} onChange={e => updateField('agencyName', e.target.value)}
                  className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50"
                  placeholder="Ej: Inmobiliaria Centro" />
              </div>
              <div>
                <label className="block text-sm text-[#94A3B8] mb-1">Ciudad principal</label>
                <input value={form.agencyCity} onChange={e => updateField('agencyCity', e.target.value)}
                  className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50"
                  placeholder="Ej: Madrid" />
              </div>
              <div>
                <label className="block text-sm text-[#94A3B8] mb-1">Teléfono de la agencia</label>
                <input value={form.agencyPhone} onChange={e => updateField('agencyPhone', e.target.value)}
                  className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50"
                  placeholder="+34 91 123 45 67" />
              </div>
              <div>
                <label className="block text-sm text-[#94A3B8] mb-1">Email de contacto (opcional)</label>
                <input value={form.agencyEmail} onChange={e => updateField('agencyEmail', e.target.value)}
                  className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50"
                  placeholder="info@tuagencia.com" />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep(1)}
                  className="flex items-center gap-2 px-5 py-3 text-sm text-[#94A3B8] hover:text-[#F1F5F9] transition-colors">
                  <ArrowLeft size={16} /> Atrás
                </button>
                <button onClick={() => canProceedStep2 && setStep(3)}
                  disabled={!canProceedStep2}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all text-sm font-medium disabled:opacity-40">
                  Siguiente <ArrowRight size={16} />
                </button>
              </div>
            </motion.div>
          )}

              <div className="mt-6">
                <BotonPago usuario={user || { id: 'temp', email: 'temp@example.com' }}/>
              </div>
            
              <div className="grid gap-3">
                {PLANS.map(p => (
                  <div
                    key={p.id}
                    onClick={() => updateField('plan', p.id)}
                    className={`relative bg-[#13131A] border rounded-2xl p-5 cursor-pointer transition-all ${
                      form.plan === p.id
                        ? 'border-indigo-500 bg-indigo-500/5'
                        : 'border-[#1E1E2E] hover:border-[#2A2A3E]'
                    }`}
                  >
                    {p.popular && (
                      <span className="absolute -top-2.5 right-4 bg-indigo-600 text-white text-xs px-2.5 py-0.5 rounded-full font-medium">
                        Más popular
                      </span>
                    )}
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-white font-semibold">{p.name}</h3>
                        <p className="text-[#64748B] text-xs mt-0.5">{p.desc}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-bold text-white">{p.price}€</span>
                        <span className="text-[#64748B] text-sm">/mes</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                      {p.features.map((f, i) => (
                        <span key={i} className="text-xs bg-white/5 text-[#94A3B8] px-2 py-0.5 rounded-full">
                          {f}
                        </span>
                      ))}
                    </div>
                    {form.plan === p.id && (
                      <div className="absolute right-5 top-1/2 -translate-y-1/2">
                        <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center">
                          <Check size={14} className="text-white" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={handleRegister}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl transition-all text-sm font-medium shadow-lg shadow-indigo-500/20 disabled:opacity-50"
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><Shield size={16} /> Crear cuenta — Prueba 14 días gratis</>
                )}
              </button>

              <div className="mt-6">
                <BotonPago usuario={{ id: form.email, email: form.email }} />
              </div>

              <p className="text-center text-xs text-[#64748B]">
                Al registrarte aceptas nuestros términos y condiciones
              </p>

              <div className="flex justify-center gap-2">
                <button onClick={() => setStep(2)}
                  className="flex items-center gap-1 px-4 py-2 text-sm text-[#94A3B8] hover:text-[#F1F5F9] transition-colors">
                  <ArrowLeft size={14} /> Atrás
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-center text-sm text-[#64748B] mt-4">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
