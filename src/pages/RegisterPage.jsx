import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { UserPlus, Building2, CreditCard, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import api from '../lib/api'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabaseClient'

const BotonPago = ({ usuario, idPrecio, cargando }) => {
  const manejarPago = async () => {
    if (!usuario?.id || !usuario?.email) {
      toast.error('Datos de usuario incompletos.');
      return;
    }
    try {
      const respuesta = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idUsuarioActual: usuario.id, emailUsuarioActual: usuario.email, idPrecio }),
      });
      const datos = await respuesta.json();
      if (datos.url) window.location.href = datos.url;
      else toast.error('Error al generar el enlace de pago.');
    } catch (error) {
      toast.error('Error al conectar con la pasarela de pagos.');
    }
  };

  return (
    <button onClick={manejarPago} disabled={cargando} className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl transition-all text-sm font-medium disabled:opacity-50">
      {cargando ? 'Procesando...' : 'Proceder al Pago Seguro'} <CreditCard size={16} />
    </button>
  );
};

const PLANS = [
  { id: import.meta.env.VITE_STRIPE_PRICE_STARTER || 'starter', name: 'Starter', price: 79 },
  { id: import.meta.env.VITE_STRIPE_PRICE_PROFESIONAL || 'profesional', name: 'Profesional', price: 199 },
  { id: import.meta.env.VITE_STRIPE_PRICE_AGENCIA || 'agencia', name: 'Agencia', price: 499 }
];

export default function RegisterPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '',
    agencyName: '', agencyCity: '', agencyPhone: '', agencyEmail: '',
    plan: import.meta.env.VITE_STRIPE_PRICE_STARTER || 'starter', apiWhatsapp: '', apiCorreo: ''
  })
  const [loading, setLoading] = useState(false)
  const [createdUser, setCreatedUser] = useState(null)
  const { setUser, setAgency } = useStore()

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }))
  const canProceedStep1 = form.name && form.email && form.password && form.phone
  const canProceedStep2 = form.agencyName && form.agencyCity && form.agencyPhone

  const registrarConGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/onboarding',
        },
      })
      if (error) throw error
    } catch (err) {
      toast.error('Error al conectar con Google')
    }
  }

  const handleRegistroSubmit = async () => {
    setLoading(true)
    try {
      // 1. Registrar en Supabase
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      })

      if (authError) {
        if (authError.message?.includes('already registered') || authError.message?.includes('already been registered') || authError.message?.includes('User already registered')) {
          toast.error('Este email ya está registrado. ¿Quieres iniciar sesión?')
          navigate('/login')
          return
        }
        throw authError
      }

      if (authData?.user) {
        // El aprovisionamiento de agencia/usuario se hace en el backend Express
        // a través de /api/auth/social-login-or-register (ver Layout.jsx y LoginPage.jsx)
        // No se usa la tabla inmosaas — fue eliminada del schema.
      }

      // 2. Registrar en la base de datos local SQLite (servidor Express)
      let planBackend = 'starter';
      if (form.plan?.includes('profesional') || form.plan === import.meta.env.VITE_STRIPE_PRICE_PROFESIONAL) planBackend = 'profesional';
      else if (form.plan?.includes('agencia') || form.plan === import.meta.env.VITE_STRIPE_PRICE_AGENCIA) planBackend = 'agencia';

      const regRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          name: form.name,
          phone: form.phone,
          agencyName: form.agencyName,
          agencyCity: form.agencyCity,
          agencyPhone: form.agencyPhone,
          agencyEmail: form.email,
          plan: planBackend,
        })
      });

      if (!regRes.ok) {
        let errorMsg = 'Error en el registro local';
        try {
          const errData = await regRes.json();
          errorMsg = errData.error || errorMsg;
        } catch (e) {}
        throw new Error(errorMsg);
      }

      // 3. Autologin en el backend para inicializar la sesión local
      const loginRes = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password })
      });

      if (loginRes.ok) {
        let loginData = null;
        try {
          loginData = await loginRes.json();
        } catch (e) {}
        
        if (loginData) {
          setUser(loginData.user);
          setAgency(loginData.agency);
          api.setAuth(loginData.token, loginData.user.id, loginData.user.role, loginData.user.agency_id, loginData.user.office_id);
        }
      }

      setCreatedUser({ id: authData?.user?.id || 'temp', email: form.email })
      toast.success('¡Agencia guardada! Elige tu plan.')
      setStep(3)
    } catch (err) {
      toast.error(err.message || 'Error al crear la cuenta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-4 text-white">
      <div className="w-full max-w-lg bg-[#13131A] border border-[#1E1E2E] rounded-3xl p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">Crear tu agencia en PropIA</h1>
        </div>

        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${step >= s ? 'bg-indigo-600' : 'bg-[#1E1E2E] text-gray-500'}`}>                
              {step > s ? <Check size={14} /> : s}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" className="space-y-4">
              {/* BOTÓN DE GOOGLE */}
              <button
                type="button"
                onClick={registrarConGoogle}
                className="w-full flex items-center justify-center gap-2 bg-[#1E1E2E] hover:bg-[#27273F] border border-[#2E2E3E] text-white font-medium p-3 rounded-xl transition text-sm shadow-sm"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Registrarse con Google
              </button>

              <div className="flex items-center my-3 text-xs text-gray-500 before:flex-1 before:border-t before:border-[#1E1E2E] before:me-3 after:flex-1 after:border-t after:border-[#1E1E2E] after:ms-3">
                o continúa con correo
              </div>

              <input value={form.name} onChange={e => updateField('name', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Nombre completo" />
              <input type="email" value={form.email} onChange={e => updateField('email', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Email" />
              <input type="password" value={form.password} onChange={e => updateField('password', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Contraseña" />
              <input value={form.phone} onChange={e => updateField('phone', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Teléfono" />
              <button onClick={() => canProceedStep1 && setStep(2)} disabled={!canProceedStep1} className="w-full py-3 bg-indigo-600 rounded-xl disabled:opacity-40">Siguiente</button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" className="space-y-4">
              <input value={form.agencyName} onChange={e => updateField('agencyName', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Nombre de la agencia" />
              <input value={form.agencyCity} onChange={e => updateField('agencyCity', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Ciudad" />
              <input value={form.agencyPhone} onChange={e => updateField('agencyPhone', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Teléfono de la agencia" />
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="w-1/3 py-3 bg-[#1E1E2E] rounded-xl">Atrás</button>
                <button onClick={() => canProceedStep2 && handleRegistroSubmit()} disabled={!canProceedStep2 || loading} className="w-2/3 py-3 bg-indigo-600 rounded-xl disabled:opacity-40">{loading ? 'Guardando...' : 'Siguiente'}</button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" className="space-y-4">
              <input value={form.apiWhatsapp} onChange={e => updateField('apiWhatsapp', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Token WhatsApp (opcional)" />
              <input value={form.apiCorreo} onChange={e => updateField('apiCorreo', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Token API Email (opcional)" />
              <div className="grid grid-cols-3 gap-2 p-2 bg-[#0A0A0F] rounded-xl">
                {PLANS.map(p => (
                  <button key={p.id} type="button" onClick={() => updateField('plan', p.id)} className={`p-2 rounded-lg border text-xs flex flex-col items-center ${form.plan === p.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-[#1E1E2E]'}`}>
                    <span>{p.name}</span><strong>${p.price}</strong>
                  </button>
                ))}
              </div>
              <BotonPago usuario={createdUser || { id: 'temp', email: form.email }} idPrecio={form.plan} cargando={loading} />
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-center text-sm text-[#64748B] mt-6">
          ¿Ya tienes una cuenta? <Link to="/login" className="text-indigo-500 hover:underline">Inicia sesión</Link>
        </p>
      </div>
    </div>
  )
}
