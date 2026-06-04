import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { UserPlus, Building2, CreditCard, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import api from '../lib/api'
import { useStore } from '../lib/store'
import { supabase } from '../supabaseClient'

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
    <button onClick={manejarPago} disabled={cargando} className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl transition-all text-sm font-medium shadow-lg disabled:opacity-50">
      {cargando ? 'Procesando...' : 'Proceder al Pago Seguro'} <CreditCard size={16} />
    </button>
  );
};

const PLANS = [
  { id: 'price_starter_id_de_stripe', name: 'Starter', price: 79 },
  { id: 'price_profesional_id_de_stripe', name: 'Profesional', price: 199 },
  { id: 'price_agencia_id_de_stripe', name: 'Agencia', price: 499 }
];

export default function RegisterPage() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '',
    agencyName: '', agencyCity: '', agencyPhone: '', agencyEmail: '',
    plan: 'price_starter_id_de_stripe', apiWhatsapp: '', apiCorreo: ''
  })
  const [loading, setLoading] = useState(false)
  const [createdUser, setCreatedUser] = useState(null)

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }))
  const canProceedStep1 = form.name && form.email && form.password && form.phone
  const canProceedStep2 = form.agencyName && form.agencyCity && form.agencyPhone

  const handleRegisterBackendOnly = async () => {
    setLoading(true)
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      })

      if (authError) throw authError

      if (authData?.user) {
        const { error: tablaError } = await supabase
          .from('inmosaas')
          .insert([
            {
              user_id: authData.user.id,
              nombre_completo: form.name,
              email: form.email,
              telefono: form.phone,
              nombre_agencia: form.agencyName,
              ciudad: form.agencyCity,
              telefono_corporativo: form.agencyPhone,
              api_whatsapp: form.apiWhatsapp,
              api_correo: form.apiCorreo,
            }
          ])

        if (tablaError) throw tablaError
      }

      setCreatedUser({ id: authData.user.id, email: form.email })
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
              <input value={form.name} onChange={e => updateField('name', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Nombre completo" />
              <input type="email" value={form.email} onChange={e => updateField('email', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Email" />
              <input type="password" value={form.password} onChange={e => updateField('password', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Contraseña" />
              <input value={form.phone} onChange={e => updateField('phone', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Teléfono" />
              <button onClick={() => canProceedStep1 && setStep(2)} disabled={!canProceedStep1} className="w-full py-3 bg-indigo-600 rounded-xl disabled:opacity-40">Siguiente</button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" className="space-y-4">
              <input value={form.agencyName} onChange={e => updateField('agencyName', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Nombre de la Empresa" />
              <input value={form.agencyCity} onChange={e => updateField('agencyCity', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Ciudad" />
              <input value={form.agencyPhone} onChange={e => updateField('agencyPhone', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Teléfono corporativo" />
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="w-1/3 py-3 bg-[#1E1E2E] rounded-xl">Atrás</button>
                <button onClick={() => canProceedStep2 && handleRegisterBackendOnly()} disabled={!canProceedStep2 || loading} className="w-2/3 py-3 bg-indigo-600 rounded-xl disabled:opacity-40">{loading ? 'Guardando...' : 'Configurar APIs'}</button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" className="space-y-4">
              <input value={form.apiWhatsapp} onChange={e => updateField('apiWhatsapp', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Token API WhatsApp (Opcional)" />
              <input value={form.apiCorreo} onChange={e => updateField('apiCorreo', e.target.value)} className="w-full p-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl" placeholder="Token API Correo (Opcional)" />
              <div className="grid grid-cols-3 gap-2 p-2 bg-[#0A0A0F] rounded-xl">
                {PLANS.map(p => (
                  <button key={p.id} type="button" onClick={() => updateField('plan', p.id)} className={`p-2 rounded-lg border text-xs flex flex-col items-center ${form.plan === p.id ? 'border-indigo-500 text-indigo-400' : 'border-[#1E1E2E] text-gray-500'}`}>                    
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
