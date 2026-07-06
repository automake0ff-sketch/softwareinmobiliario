import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { LogIn, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useStore } from '../lib/store'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/dashboard' }
      })
      if (error) throw error
    } catch (err) {
      toast.error('Error al conectar con Google')
      setGoogleLoading(false)
    }
  }
  const navigate = useNavigate()
  const { setUser, setAgency } = useStore()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Completa todos los campos')
      return
    }
    setLoading(true)
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) throw authError

      // Sincronizar con el backend Express para obtener el JWT propio y los datos de agencia
      const apiBase = import.meta.env.VITE_API_URL || '/api'
      const backendUrl = apiBase.endsWith('/api') ? apiBase : `${apiBase}/api`
      const res = await fetch(`${backendUrl.replace(/\/api$/, '')}/api/auth/social-login-or-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authData.user.email,
          name: authData.user.user_metadata?.full_name || authData.user.email?.split('@')[0],
          supabase_uid: authData.user.id,
        }),
      })

      if (res.ok) {
        const loginData = await res.json()
        setUser(loginData.user)
        setAgency(loginData.agency)
        // api.setAuth se llama automáticamente a través del store.subscribe
      } else {
        // Fallback: establecer usuario sin token de backend (funcionalidad reducida)
        setUser({
          id: authData.user.id,
          email: authData.user.email,
          name: authData.user.email?.split('@')[0],
          role: 'admin',
          agency_id: authData.user.id,
        })
      }

      toast.success('¡Bienvenido de nuevo!')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.message || 'Credenciales inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/20">
            <span className="text-2xl font-bold text-white">P</span>
          </div>
          <h1 className="text-2xl font-bold text-[#F1F5F9]">PropIA</h1>
          <p className="text-[#64748B] mt-1">Inicia sesión en tu agencia</p>
        </div>

        {/* Google Login */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 py-3 bg-[#1E1E2E] border border-[#2E2E3E] rounded-xl text-[#F1F5F9] text-sm font-medium hover:bg-[#2A2A3E] transition-colors mb-4 disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {googleLoading ? 'Conectando...' : 'Continuar con Google'}
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-[#1E1E2E]" />
          <span className="text-xs text-[#4A4A5E]">o con email</span>
          <div className="flex-1 h-px bg-[#1E1E2E]" />
        </div>

        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#13131A] border border-[#1E1E2E] rounded-3xl p-8 space-y-5"
        >
          <div>
            <label className="block text-sm text-[#94A3B8] mb-1.5">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4A4A5E]" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="manager@inmotech.es"
                className="w-full pl-10 pr-4 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-[#94A3B8] mb-1.5">Contraseña</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4A4A5E]" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-3 bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl text-[#F1F5F9] placeholder-[#4A4A5E] focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#4A4A5E] hover:text-[#94A3B8]"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all text-sm font-medium disabled:opacity-50"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <><LogIn size={16} /> Iniciar sesión</>
            )}
          </button>

          <p className="text-center text-sm text-[#64748B]">
            ¿No tienes cuenta?{' '}
            <Link to="/register" className="text-indigo-400 hover:text-indigo-300 font-medium">
              Registra tu agencia
            </Link>
          </p>
        </motion.form>
      </div>
    </div>
  )
}
