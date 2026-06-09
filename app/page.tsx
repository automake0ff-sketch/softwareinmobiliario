import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#080811] text-white font-sans">
      {/* ===== SECTION 1 – HERO ===== */}
      <section className="container mx-auto px-4 py-12 md:py-20">
        <nav className="flex justify-between items-center mb-10">
          <span className="text-2xl font-bold text-indigo-400">PropIA</span>
          <div className="space-x-4">
            <Link href="/login" className="text-sm text-gray-300 hover:text-white">Iniciar sesión</Link>
            <Link href="/registro" className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-md text-sm font-medium">Empezar gratis</Link>
          </div>
        </nav>
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4 text-indigo-200">
            Tu agencia inmobiliaria con IA trabajando 24/7
          </h1>
          <p className="text-lg md:text-xl text-gray-300 mb-6">
            12 agentes IA que captan, cualifican y cierran leads por ti. Respuesta automática en menos de 2 minutos, a cualquier hora.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-4">
            <Link href="/registro" className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-md text-base font-medium">
              Empezar 14 días gratis →
            </Link>
            <Link href="#demo" className="border border-indigo-400 text-indigo-300 hover:bg-indigo-900 px-6 py-3 rounded-md text-base font-medium">
              Ver demo
            </Link>
          </div>
          <p className="text-sm text-gray-500">
            Sin permanencia · Cancela cuando quieras · Setup en 10 minutos
          </p>
          <div className="mt-8 flex justify-center">
            <div className="w-full max-w-md h-48 bg-gray-900 rounded-md" aria-label="Dashboard mockup placeholder" />
          </div>
        </div>
      </section>

      {/* ===== SECTION 2 – PROBLEMA vs SOLUCIÓN ===== */}
      <section className="bg-[#0a0b13] py-12">
        <div className="container mx-auto px-4 grid md:grid-cols-3 gap-8 text-center">
          <div>
            <h3 className="text-xl font-semibold mb-2 text-red-400">❌ ANTES</h3>
            <p className="text-gray-300 text-sm">Responder leads a las 3am, seguimientos manuales, leads perdidos por no responder a tiempo</p>
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-2 text-green-400">✅ DESPUÉS</h3>
            <p className="text-gray-300 text-sm">PropIA responde en 2 minutos, 24/7, califica automáticamente y avisa al equipo cuando hay oportunidad de cierre</p>
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-2 text-blue-400">📊 RESULTADO</h3>
            <p className="text-gray-300 text-sm">Más del 60% del trabajo de captación automatizado desde el día 1</p>
          </div>
        </div>
      </section>

      {/* ===== SECTION 3 – AGENTES PRINCIPALES ===== */}
      <section className="container mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-center mb-8 text-indigo-300">Los 3 agentes principales</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-gray-900 p-6 rounded-lg text-center">
            <div className="text-3xl mb-2">🎯</div>
            <h3 className="text-lg font-semibold mb-2 text-indigo-200">Captador IA</h3>
            <p className="text-sm text-gray-400">Responde a nuevos leads en <2 minutos. Hace preguntas clave y asigna un score de probabilidad de compra automáticamente.</p>
          </div>
          <div className="bg-gray-900 p-6 rounded-lg text-center">
            <div className="text-3xl mb-2">💼</div>
            <h3 className="text-lg font-semibold mb-2 text-indigo-200">Vendedor IA</h3>
            <p className="text-sm text-gray-400">Gestiona objeciones, hace seguimiento y propone visitas. Escala al equipo humano cuando detecta señal de cierre.</p>
          </div>
          <div className="bg-gray-900 p-6 rounded-lg text-center">
            <div className="text-3xl mb-2">🧠</div>
            <h3 className="text-lg font-semibold mb-2 text-indigo-200">Coordinador IA</h3>
            <p className="text-sm text-gray-400">Asigna leads al comercial adecuado, detecta urgencias y genera el briefing matutino de cada comercial.</p>
          </div>
        </div>
      </section>

      {/* ===== SECTION 4 – PLANES Y PRECIOS (placeholder) ===== */}
      <section className="bg-[#0a0b13] py-12">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-6 text-indigo-300">Planes y precios</h2>
          <p className="text-gray-400 mb-4">Los planes están disponibles en la página <Link href="/precios" className="text-indigo-400 underline">/precios</Link>. Usa el toggle mensual/anual allí.</p>
          <Link href="/registro?plan=starter" className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-md font-medium">
            Empezar ahora
          </Link>
        </div>
      </section>

      {/* ===== SECTION 5 – FAQ ===== */}
      <section className="container mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold mb-8 text-center text-indigo-300">Preguntas frecuentes</h2>
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <div className="bg-gray-900 p-4 rounded">
            <h4 className="font-semibold text-indigo-200 mb-2">¿Necesito saber programar?</h4>
            <p className="text-sm text-gray-400">No, todo se configura desde el panel sin código.</p>
          </div>
          <div className="bg-gray-900 p-4 rounded">
            <h4 className="font-semibold text-indigo-200 mb-2">¿Funciona con cualquier inmobiliaria?</h4>
            <p className="text-sm text-gray-400">Sí, cada agencia tiene su propio espacio privado.</p>
          </div>
          <div className="bg-gray-900 p-4 rounded">
            <h4 className="font-semibold text-indigo-200 mb-2">¿Qué pasa con mis datos?</h4>
            <p className="text-sm text-gray-400">Solo tú los ves. Cada agencia tiene sus datos completamente aislados.</p>
          </div>
          <div className="bg-gray-900 p-4 rounded">
            <h4 className="font-semibold text-indigo-200 mb-2">¿Puedo cancelar cuando quiera?</h4>
            <p className="text-sm text-gray-400">Sí, sin permanencia ni penalización.</p>
          </div>
          <div className="bg-gray-900 p-4 rounded">
            <h4 className="font-semibold text-indigo-200 mb-2">¿El WhatsApp es el mío?</h4>
            <p className="text-sm text-gray-400">Sí, conectas tu propio número de WhatsApp Business.</p>
          </div>
          <div className="bg-gray-900 p-4 rounded">
            <h4 className="font-semibold text-indigo-200 mb-2">¿En cuánto tiempo está funcionando?</h4>
            <p className="text-sm text-gray-400">En menos de 10 minutos tras el registro.</p>
          </div>
        </div>
      </section>

      {/* ===== SECTION 6 – CTA FINAL ===== */}
      <section className="bg-[#0a0b13] py-12 text-center">
        <h2 className="text-3xl font-bold mb-4 text-indigo-200">Empieza hoy. Tu primer lead lo gestiona la IA.</h2>
        <Link href="/registro" className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-md text-lg font-medium">
          Crear mi cuenta gratis →
        </Link>
        <p className="mt-2 text-sm text-gray-500">14 días de prueba · Sin tarjeta de crédito</p>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="bg-[#0a0b13] py-6">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center text-gray-400 text-sm">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <span className="text-xl font-bold text-indigo-400">PropIA</span>
          </div>
          <nav className="flex flex-wrap gap-4">
            <Link href="/" className="hover:text-white">Inicio</Link>
            <Link href="/precios" className="hover:text-white">Precios</Link>
            <Link href="/login" className="hover:text-white">Iniciar sesión</Link>
            <Link href="/registro" className="hover:text-white">Registrarse</Link>
            <Link href="/privacy" className="hover:text-white">Política de privacidad</Link>
            <Link href="/terms" className="hover:text-white">Términos de servicio</Link>
          </nav>
          <p className="mt-4 md:mt-0">© 2025 PropIA. Todos los derechos reservados.</p>
        </div>
      </footer>
    </main>
  );
}
