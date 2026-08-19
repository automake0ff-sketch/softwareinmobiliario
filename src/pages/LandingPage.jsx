import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import {
  ChevronDown,
  Check,
  ArrowRight,
  Target,
  Briefcase,
  Brain,
  MessageSquare,
  Sparkles,
  Zap,
  Building,
  Crown,
  Users,
  Clock,
  Shield,
  Activity,
  Play
} from 'lucide-react'

export default function LandingPage() {
  const user = useStore(state => state.user)
  const [billingPeriod, setBillingPeriod] = useState('monthly') // 'monthly' | 'yearly'
  const [openFaq, setOpenFaq] = useState(null)

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index)
  }

  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      price: billingPeriod === 'monthly' ? '79€' : '790€',
      period: billingPeriod === 'monthly' ? '/mes' : '/año',
      desc: 'Para agentes y pequeñas agencias',
      features: [
        '1 oficina activa',
        'Hasta 5 usuarios humanos',
        '500 leads nuevos al mes',
        '3 Agentes IA activos',
        '10 automatizaciones activas',
        'Canal de WhatsApp Business',
        'CRM + Pipeline Kanban',
        'Soporte estándar'
      ],
      cta: 'Empezar ahora',
      popular: false
    },
    {
      id: 'profesional',
      name: 'Profesional',
      price: billingPeriod === 'monthly' ? '199€' : '1990€',
      period: billingPeriod === 'monthly' ? '/mes' : '/año',
      desc: 'Para agencias en crecimiento',
      features: [
        '3 oficinas activas',
        'Hasta 15 usuarios humanos',
        '2.000 leads nuevos al mes',
        '8 Agentes IA activos',
        'Automatizaciones ilimitadas',
        'WhatsApp + Meta Ads',
        'Analytics avanzado',
        'Soporte prioritario'
      ],
      cta: 'Empezar ahora',
      popular: true
    },
    {
      id: 'agencia',
      name: 'Agencia',
      price: billingPeriod === 'monthly' ? '499€' : '4990€',
      period: billingPeriod === 'monthly' ? '/mes' : '/año',
      desc: 'Para agencias consolidadas',
      features: [
        'Oficinas ilimitadas',
        'Usuarios ilimitados',
        'Leads ilimitados',
        '12 Agentes IA activos',
        'Automatizaciones ilimitadas',
        'WhatsApp + Meta Ads + Idealista',
        'White-label completo',
        'Soporte dedicado 24/7'
      ],
      cta: 'Empezar ahora',
      popular: false
    }
  ]

  const faqs = [
    {
      q: '¿Necesito saber programar?',
      a: 'No, todo se configura desde el panel sin código. Hemos diseñado la plataforma para que cualquier profesional inmobiliario pueda configurar sus agentes y flujos en cuestión de minutos.'
    },
    {
      q: '¿Funciona con cualquier inmobiliaria?',
      a: 'Sí, cada agencia tiene su propio espacio privado. La IA se adapta a la cartera de inmuebles, tono de voz y zona de operaciones de tu inmobiliaria.'
    },
    {
      q: '¿Qué pasa con mis datos?',
      a: 'Solo tú los ves. Cada agencia tiene sus datos completamente aislados de forma segura mediante políticas Row-Level Security en nuestra base de datos.'
    },
    {
      q: '¿Puedo cancelar cuando quiera?',
      a: 'Sí, sin permanencia ni penalización. Si decides cancelar, tu suscripción continuará activa hasta el final del período de facturación actual.'
    },
    {
      q: '¿El WhatsApp es el mío?',
      a: 'Sí, conectas tu propio número de WhatsApp Business a través de nuestra integración oficial con la API de Meta.'
    },
    {
      q: '¿En cuánto tiempo está funcionando?',
      a: 'En menos de 10 minutos tras el registro. Puedes activar tu cuenta, cargar tus primeras propiedades y poner en marcha el Captador IA de inmediato.'
    }
  ]

  return (
    <div className="min-h-screen bg-[#080811] text-[#F1F5F9] font-sans selection:bg-indigo-500/30 selection:text-indigo-200 overflow-x-hidden">
      {/* Background Decorative Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] pointer-events-none overflow-hidden z-0 opacity-30">
        <div className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-indigo-600/40 to-purple-600/0 blur-[120px]" />
        <div className="absolute top-[20%] right-[10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/0 blur-[100px]" />
      </div>

      {/* NAVBAR */}
      <nav className="relative z-10 border-b border-[#1E1E2E]/60 backdrop-blur-md bg-[#080811]/75 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-white font-extrabold text-lg">P</span>
            </div>
            <span className="text-xl font-bold tracking-tight text-white font-syne">
              Prop<span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">IA</span>
            </span>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  to="/dashboard"
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20"
                >
                  Ir al dashboard
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
                >
                  Iniciar sesión
                </Link>
                <Link
                  to="/register"
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-4 py-2 sm:px-5 sm:py-2.5 rounded-lg text-sm font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20"
                >
                  Empezar gratis
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* SECCIÓN 1 — HERO */}
      <section className="relative z-10 pt-16 pb-24 sm:pt-24 sm:pb-32 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 mb-6 sm:mb-8 animate-pulse-soft">
            <Sparkles size={12} className="text-indigo-400" />
            <span>El Futuro del Sector Inmobiliario con Inteligencia Artificial</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-[1.15]">
            Tu agencia inmobiliaria con{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-300 bg-clip-text text-transparent">
              IA trabajando 24/7
            </span>
          </h1>

          <p className="text-base sm:text-lg text-gray-400 max-w-3xl mx-auto mb-10 leading-relaxed">
            12 agentes IA que captan, cualifican y cierran leads por ti. Respuesta automática en menos de 2 minutos, a cualquier hora.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            {user ? (
              <Link
                to="/dashboard"
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-xl text-base hover:from-indigo-600 hover:to-purple-700 transition-all shadow-xl shadow-indigo-500/25 flex items-center justify-center gap-2 hover:scale-[1.02]"
              >
                Ir al dashboard
                <ArrowRight size={18} />
              </Link>
            ) : (
              <Link
                to="/register"
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-xl text-base hover:from-indigo-600 hover:to-purple-700 transition-all shadow-xl shadow-indigo-500/25 flex items-center justify-center gap-2 hover:scale-[1.02]"
              >
                Empezar con -20% el primer mes →
              </Link>
            )}
            <a
              href="#demo"
              className="w-full sm:w-auto px-8 py-4 bg-[#13131A] text-gray-300 font-semibold rounded-xl text-base border border-[#1E1E2E] hover:border-indigo-500/50 hover:bg-[#1E1E2E] transition-all flex items-center justify-center gap-2"
            >
              <Play size={16} className="fill-current text-indigo-400" />
              Ver demo
            </a>
          </div>

          <p className="text-xs text-gray-500 mb-16 tracking-wide uppercase">
            Sin permanencia · Cancela cuando quieras · Setup en 10 minutos
          </p>

          {/* Premium CSS Mockup of Dashboard */}
          <div id="demo" className="relative max-w-4xl mx-auto rounded-2xl border border-[#1E1E2E] bg-[#0c0c16] shadow-2xl shadow-indigo-500/5 overflow-hidden">
            <div className="h-10 border-b border-[#1E1E2E] bg-[#0c0c16] flex items-center px-4 gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/40" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/40" />
              <div className="w-3 h-3 rounded-full bg-green-500/40" />
              <div className="ml-4 text-[10px] text-gray-500 font-mono tracking-wider bg-[#131322] px-3 py-1 rounded border border-[#1E1E2E]">
                app.propia.ai/dashboard
              </div>
            </div>
            
            <div className="p-4 sm:p-6 bg-[#080811] text-left opacity-90 relative overflow-hidden h-[300px] sm:h-[450px]">
              {/* Dashboard Layout Mockup */}
              <div className="grid grid-cols-12 gap-4 h-full">
                {/* Sidebar Mockup */}
                <div className="col-span-3 hidden sm:flex flex-col gap-3 border-r border-[#1E1E2E]/60 pr-4 h-full">
                  <div className="h-8 rounded bg-[#131322] animate-pulse-soft w-2/3" />
                  <div className="h-6 rounded bg-indigo-500/10 border border-indigo-500/20 w-full" />
                  <div className="h-6 rounded bg-[#131322] w-5/6" />
                  <div className="h-6 rounded bg-[#131322] w-4/5" />
                  <div className="h-6 rounded bg-[#131322] w-11/12" />
                  <div className="h-6 rounded bg-[#131322] w-3/4" />
                </div>
                
                {/* Main Content Mockup */}
                <div className="col-span-12 sm:col-span-9 flex flex-col gap-4 h-full">
                  {/* Top Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-[#13131A] border border-[#1E1E2E] p-3 rounded-xl">
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider">Leads Nuevos</div>
                      <div className="text-lg sm:text-2xl font-bold text-white mt-1">142</div>
                      <div className="text-[10px] text-emerald-400 mt-0.5">+24% este mes</div>
                    </div>
                    <div className="bg-[#13131A] border border-[#1E1E2E] p-3 rounded-xl">
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider">Tasa Respuesta</div>
                      <div className="text-lg sm:text-2xl font-bold text-indigo-400 mt-1">1.8m</div>
                      <div className="text-[10px] text-indigo-300 mt-0.5">Automático 24/7</div>
                    </div>
                    <div className="bg-[#13131A] border border-[#1E1E2E] p-3 rounded-xl">
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider">Trabajo Auto.</div>
                      <div className="text-lg sm:text-2xl font-bold text-purple-400 mt-1">68.4%</div>
                      <div className="text-[10px] text-purple-300 mt-0.5">Por Agentes IA</div>
                    </div>
                  </div>
                  
                  {/* Chart and Activity Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 min-h-0">
                    {/* Inbox / Conversations Mockup */}
                    <div className="bg-[#13131A] border border-[#1E1E2E] p-4 rounded-xl flex flex-col gap-3 overflow-hidden">
                      <div className="text-xs font-semibold text-white flex items-center justify-between border-b border-[#1E1E2E] pb-2">
                        <span>Conversaciones Recientes</span>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      </div>
                      <div className="flex flex-col gap-2 overflow-y-auto pr-1">
                        <div className="bg-indigo-500/5 border border-indigo-500/10 p-2 rounded-lg flex flex-col gap-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="font-semibold text-indigo-300">WhatsApp (Captador IA)</span>
                            <span className="text-gray-500">Hace 1 min</span>
                          </div>
                          <p className="text-[10px] text-gray-400 truncate">"Hola Carlos, veo que buscas piso con ascensor..."</p>
                        </div>
                        <div className="bg-[#1c1c28]/40 border border-[#1E1E2E]/40 p-2 rounded-lg flex flex-col gap-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="font-semibold text-gray-300">Juan Pérez</span>
                            <span className="text-gray-500">Hace 15 mins</span>
                          </div>
                          <p className="text-[10px] text-gray-500 truncate">"Me gustaría agendar una visita para el viernes..."</p>
                        </div>
                      </div>
                    </div>

                    {/* AI Insights & Agent Activity */}
                    <div className="bg-[#13131A] border border-[#1E1E2E] p-4 rounded-xl flex flex-col gap-3 overflow-hidden">
                      <div className="text-xs font-semibold text-white border-b border-[#1E1E2E] pb-2">
                        IA Feed de Actividad
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2 items-start text-[10px] text-gray-400">
                          <span className="text-xs">🎯</span>
                          <div>
                            <span className="font-semibold text-white">Captador IA</span> cualificó lead <span className="text-indigo-400">Sofía G.</span> con Score: <strong className="text-emerald-400">92/100</strong>
                          </div>
                        </div>
                        <div className="flex gap-2 items-start text-[10px] text-gray-400">
                          <span className="text-xs">💼</span>
                          <div>
                            <span className="font-semibold text-white">Vendedor IA</span> propuso visita para chalet en Pozuelo.
                          </div>
                        </div>
                        <div className="flex gap-2 items-start text-[10px] text-gray-400">
                          <span className="text-xs">🧠</span>
                          <div>
                            <span className="font-semibold text-white">Coordinador IA</span> asignó lead caliente a comercial Andrés.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Glassmorphism gradient overlay to blend into bottom */}
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#080811] via-[#080811]/90 to-transparent pointer-events-none" />
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN 2 — PROBLEMA vs SOLUCIÓN */}
      <section className="relative z-10 py-20 sm:py-28 bg-[#0b0b14] border-y border-[#1E1E2E]/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
              ¿Por qué elegir PropIA?
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-4 font-syne">
              Transforma tu captación inmobiliaria
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Column 1: ANTES */}
            <div className="bg-[#13131A] border border-red-500/20 p-8 rounded-2xl relative overflow-hidden transition-all hover:border-red-500/30 group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl pointer-events-none" />
              <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 text-lg font-bold mb-6">
                ❌
              </div>
              <h3 className="text-xl font-bold text-[#F1F5F9] mb-4">
                ANTES
              </h3>
              <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
                Responder leads a las 3am, seguimientos manuales, leads perdidos por no responder a tiempo.
              </p>
            </div>

            {/* Column 2: DESPUÉS */}
            <div className="bg-[#13131A] border border-emerald-500/20 p-8 rounded-2xl relative overflow-hidden transition-all hover:border-emerald-500/30 group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg font-bold mb-6">
                ✅
              </div>
              <h3 className="text-xl font-bold text-[#F1F5F9] mb-4">
                DESPUÉS
              </h3>
              <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
                PropIA responde en 2 minutos, 24/7, califica automáticamente y avisa al equipo cuando hay oportunidad de cierre.
              </p>
            </div>

            {/* Column 3: RESULTADO */}
            <div className="bg-[#13131A] border border-indigo-500/20 p-8 rounded-2xl relative overflow-hidden transition-all hover:border-indigo-500/30 group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 text-lg font-bold mb-6">
                📊
              </div>
              <h3 className="text-xl font-bold text-[#F1F5F9] mb-4">
                RESULTADO
              </h3>
              <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
                Más del 60% del trabajo de captación automatizado desde el día 1.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN 3 — LOS 3 AGENTES PRINCIPALES */}
      <section className="relative z-10 py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
              Equipo Virtual Starter
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-4 font-syne">
              Los 3 agentes principales
            </h2>
            <p className="text-gray-400 mt-4 max-w-xl mx-auto">
              Descubre a los especialistas virtuales que vienen incluidos en el plan Starter para automatizar tu embudo.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Captador IA */}
            <div className="bg-[#13131A]/60 border border-[#1E1E2E] p-8 rounded-2xl relative overflow-hidden transition-all hover:border-indigo-500/30 hover:-translate-y-1 group">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6">
                <Target size={24} />
              </div>
              <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                🎯 Captador IA
              </h3>
              <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
                Responde a nuevos leads en &lt;2 minutos. Hace las preguntas clave y asigna un score de probabilidad de compra automáticamente.
              </p>
            </div>

            {/* Card 2: Vendedor IA */}
            <div className="bg-[#13131A]/60 border border-[#1E1E2E] p-8 rounded-2xl relative overflow-hidden transition-all hover:border-indigo-500/30 hover:-translate-y-1 group">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6">
                <Briefcase size={24} />
              </div>
              <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                💼 Vendedor IA
              </h3>
              <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
                Gestiona objeciones, hace seguimiento y propone visitas. Escala al equipo humano cuando detecta señal de cierre.
              </p>
            </div>

            {/* Card 3: Coordinador IA */}
            <div className="bg-[#13131A]/60 border border-[#1E1E2E] p-8 rounded-2xl relative overflow-hidden transition-all hover:border-indigo-500/30 hover:-translate-y-1 group">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6">
                <Brain size={24} />
              </div>
              <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                🧠 Coordinador IA
              </h3>
              <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
                Asigna leads al comercial adecuado, detecta urgencias y genera el briefing matutino de cada comercial.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN 4 — PLANES Y PRECIOS */}
      <section className="relative z-10 py-20 sm:py-28 bg-[#0b0b14] border-y border-[#1E1E2E]/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
              Elige tu Plan
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-4 font-syne">
              Planes y precios flexibles
            </h2>
            <p className="text-gray-400 mt-4">
              Escala tu agencia a tu ritmo sin contratos de permanencia.
            </p>

            {/* Toggle Mensual/Anual */}
            <div className="flex items-center justify-center gap-3 mt-8">
              <span className={`text-sm font-semibold ${billingPeriod === 'monthly' ? 'text-white' : 'text-gray-500'}`}>
                Mensual
              </span>
              <button
                type="button"
                onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'yearly' : 'monthly')}
                className={`relative w-14 h-7 rounded-full transition-colors flex items-center ${
                  billingPeriod === 'yearly' ? 'bg-indigo-500' : 'bg-[#1A1A24]'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full bg-white transition-transform ${
                    billingPeriod === 'yearly' ? 'translate-x-7.5' : 'translate-x-0.5'
                  }`}
                  style={{
                    transform: billingPeriod === 'yearly' ? 'translateX(29px)' : 'translateX(2px)'
                  }}
                />
              </button>
              <span className={`text-sm font-semibold ${billingPeriod === 'yearly' ? 'text-white' : 'text-gray-500'}`}>
                Anual
              </span>
              <span className="ml-2.5 px-2.5 py-0.5 bg-emerald-500/15 text-emerald-300 text-[10px] font-bold rounded-full border border-emerald-500/20 uppercase tracking-wider">
                🎁 Ahorra 2 Meses
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {plans.map((plan) => {
              const isPopular = plan.popular;
              return (
                <div
                  key={plan.id}
                  className={`relative bg-[#13131A] border rounded-2xl p-6 sm:p-8 flex flex-col transition-all duration-300 ${
                    isPopular
                      ? 'border-indigo-500 shadow-xl shadow-indigo-500/5 md:scale-[1.03]'
                      : 'border-[#1E1E2E] hover:border-gray-800'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full text-[10px] font-bold tracking-wider text-white shadow-lg uppercase">
                      MÁS POPULAR
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-white font-syne">{plan.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">{plan.desc}</p>
                  </div>

                  <div className="mb-6 flex items-baseline gap-1.5">
                    <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                    <span className="text-sm text-gray-400">{plan.period}</span>
                  </div>

                  <div className="mb-8 flex-grow">
                    <ul className="space-y-3">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-400">
                          <Check size={16} className="text-indigo-400 shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link
                    to={`/register?plan=${plan.id}`}
                    className={`w-full py-3 px-4 rounded-xl text-center text-sm font-bold transition-all ${
                      isPopular
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700 shadow-md shadow-indigo-500/10'
                        : 'bg-[#1E1E2E] text-gray-300 hover:bg-[#2A2A3E]'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECCIÓN 5 — FAQ */}
      <section className="relative z-10 py-20 sm:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
              Resolviendo Dudas
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-4 font-syne">
              Preguntas frecuentes
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={index}
                  className="bg-[#13131A] border border-[#1E1E2E]/60 rounded-xl overflow-hidden transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(index)}
                    className="w-full flex items-center justify-between px-6 py-5 text-left font-medium text-white hover:text-indigo-300 transition-colors"
                  >
                    <span className="text-sm sm:text-base">{faq.q}</span>
                    <ChevronDown
                      size={18}
                      className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180 text-indigo-400' : ''}`}
                    />
                  </button>
                  <div
                    className={`transition-all duration-200 overflow-hidden ${
                      isOpen ? 'max-h-[300px] border-t border-[#1E1E2E]/30 bg-[#151522]/20' : 'max-h-0'
                    }`}
                  >
                    <p className="p-6 text-xs sm:text-sm text-gray-400 leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECCIÓN 6 — CTA FINAL */}
      <section className="relative z-10 py-20 sm:py-28 bg-gradient-to-b from-[#080811] to-[#0c0c17]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative overflow-hidden rounded-3xl border border-[#1E1E2E] bg-[#131322]/40 backdrop-blur-md p-10 sm:p-16">
          <div className="absolute -top-1/2 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
          
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white mb-6 font-syne tracking-tight">
            Empieza hoy. Tu primer lead lo gestiona la IA.
          </h2>

          <div className="flex flex-col items-center gap-4">
            {user ? (
              <Link
                to="/dashboard"
                className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-xl text-base hover:from-indigo-600 hover:to-purple-700 transition-all shadow-xl shadow-indigo-500/25 flex items-center gap-2"
              >
                Acceder al panel de control
                <ArrowRight size={18} />
              </Link>
            ) : (
              <Link
                to="/register"
                className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-xl text-base hover:from-indigo-600 hover:to-purple-700 transition-all shadow-xl shadow-indigo-500/25 flex items-center gap-2"
              >
                Crear mi cuenta gratis →
              </Link>
            )}
            <p className="text-xs text-gray-500 mt-2">
              -20% el primer mes · Cancela cuando quieras
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-[#1E1E2E]/60 bg-[#080811] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-extrabold text-sm">P</span>
            </div>
            <span className="text-lg font-bold tracking-tight text-white font-syne">
              Prop<span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">IA</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 text-sm text-gray-400">
            <Link to="/" className="hover:text-white transition-colors">Inicio</Link>
            <Link to="/pricing" className="hover:text-white transition-colors">Precios</Link>
            {user ? (
              <Link to="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="hover:text-white transition-colors">Iniciar sesión</Link>
                <Link to="/register" className="hover:text-white transition-colors">Registrarse</Link>
              </>
            )}
            <span className="w-1.5 h-1.5 rounded-full bg-gray-700 hidden md:inline-block" />
            <Link to="/privacy-policy" className="hover:text-white transition-colors">Política de privacidad</Link>
            <Link to="/terms-of-service" className="hover:text-white transition-colors">Términos de servicio</Link>
          </div>

          <div className="text-xs text-gray-600">
            © 2025 PropIA. Todos los derechos reservados.
          </div>
        </div>
      </footer>
    </div>
  )
}
