import { redirect } from "next/navigation";
import { getAgency } from "@/lib/auth/get-agency";
import { createClient } from "@supabase/supabase-js";

// Inicializamos el cliente de Supabase para obtener las métricas de la base de datos
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default async function DashboardPage() {
  // 1. 🛡️ SEGURIDAD INTERNA: Validamos la sesión usando el ayudante del Paso 2-a
  const { agency, user, error } = await getAgency();

  // Si el usuario no está logueado en Supabase, lo expulsamos a la pantalla de login/registro
  if (error || !agency || !user) {
    redirect("/register");
  }

  // 2. 💳 CONTROL DE ACCESO: Si el webhook de Stripe fallara o no ha pagado, bloqueamos el acceso
  if (agency.estado !== "activo" || !agency.plan_activo) {
    redirect("/register?error=pago_requerido");
  }

  // 3. 📊 CONSUMIR MÉTRICAS: Consultamos la vista 'saas_metrics' creada en tu Paso 1-h
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: metrics } = await supabase
    .from("saas_metrics")
    .select("*")
    .single(); // Trae las métricas calculadas por tu base de datos

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* 🧭 Menú Lateral Izquierdo */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 p-6 flex flex-col justify-between">
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-wider text-blue-500">PropIA</span>
            <span className="bg-blue-500/10 text-blue-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border border-blue-500/20">CRM</span>
          </div>
          
          <nav className="space-y-1">
            <a href="#" className="flex items-center gap-3 px-4 py-2.5 bg-blue-600 rounded-lg text-sm font-medium text-white transition">
              📊 Panel Principal
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-2.5 text-gray-400 hover:bg-gray-800 hover:text-white rounded-lg text-sm font-medium transition">
              🤖 Automatizaciones
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-2.5 text-gray-400 hover:bg-gray-800 hover:text-white rounded-lg text-sm font-medium transition">
              📞 Chatbot WhatsApp
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-2.5 text-gray-400 hover:bg-gray-800 hover:text-white rounded-lg text-sm font-medium transition">
              ⚙️ Ajustes API
            </a>
          </nav>
        </div>

        <div className="border-t border-gray-800 pt-4">
          <p className="text-xs text-gray-500">Sesión iniciada como:</p>
          <p className="text-sm font-medium text-gray-300 truncate">{user.email}</p>
        </div>
      </aside>

      {/* 💻 Contenedor de Información Principal */}
      <main className="flex-1 p-10 space-y-8 overflow-y-auto">
        {/* Encabezado dinámico */}
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Bienvenido de nuevo</h1>
            <p className="text-gray-400 text-sm mt-1">Panel operativo de: <span className="text-blue-400 font-semibold">{agency.name}</span></p>
          </div>
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold text-green-400">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            Suscripción PropIA Activa
          </div>
        </header>

        {/* 📈 Cuadrícula de Métricas SaaS (Paso 1-h) */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-400">Automatizaciones Ejecutadas</p>
            <p className="text-4xl font-bold mt-2 text-blue-400">{metrics?.total_ejecuciones || 0}</p>
            <p className="text-xs text-gray-500 mt-2">Mensajes e emails procesados por la IA</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-400">Plantillas Instaladas</p>
            <p className="text-4xl font-bold mt-2 text-purple-400">{metrics?.plantillas_activas || 0} <span className="text-sm font-normal text-gray-500">/ 25</span></p>
            <p className="text-xs text-gray-500 mt-2">Flujos activos en tu inmobiliaria</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-400">Clientes Potenciales Captados</p>
            <p className="text-4xl font-bold mt-2 text-green-400">{metrics?.leads_totales || 0}</p>
            <p className="text-xs text-gray-500 mt-2">Contactos cualificados este mes</p>
          </div>
        </section>

        {/* ⚡ Sección de Control Operativo */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-8 space-y-4">
          <h2 className="text-xl font-bold">Estado del Entorno de Inteligencia Artificial</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="flex items-center justify-between p-4 bg-gray-950 rounded-lg border border-gray-800">
              <span className="text-sm font-medium">Conexión WhatsApp API</span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${agency.api_whatsapp_key ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}`}>${agency.api_whatsapp_key ? 'Conectado' : 'Pendiente de Clave'}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-950 rounded-lg border border-gray-800">
              <span className="text-sm font-medium">Servidor Correo SMTP</span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${agency.api_correo_key ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}`}>${agency.api_correo_key ? 'Conectado' : 'Pendiente de Clave'}</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
