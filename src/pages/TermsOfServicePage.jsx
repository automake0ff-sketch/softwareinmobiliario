import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import SiteFooter from '../components/SiteFooter'

// ⚠️ Alejandro: plantilla base, no un documento revisado por un abogado.
// Antes de operar con clientes reales, revisa especialmente la sección 5
// (nivel de servicio) y 7 (cancelación/exportación) para que coincidan
// exactamente con lo que el producto hace hoy — prometer algo que el
// backend no cumple (como ya pasa con el "gratis" de la home, ver más abajo)
// es justo el tipo de cosa que un cliente serio comprobará.
const SECTIONS = [
  {
    title: '1. Quiénes somos',
    body: (
      <>
        <p>PropIA es un producto de [NOMBRE Y APELLIDOS PENDIENTE], autónomo, con NIF [PENDIENTE] y domicilio en Sevilla, España. Estos términos regulan el acceso y uso de la plataforma PropIA (CRM con agentes de IA para agencias inmobiliarias) por parte de la agencia cliente ("el Cliente").</p>
      </>
    ),
  },
  {
    title: '2. Objeto del contrato',
    body: <p>PropIA presta un servicio SaaS de CRM inmobiliario con automatizaciones y agentes de inteligencia artificial, en la modalidad de suscripción mensual o anual descrita en la página de precios (/pricing), vigente en el momento de la contratación.</p>,
  },
  {
    title: '3. Registro y cuenta',
    body: <p>El Cliente es responsable de la veracidad de los datos aportados en el registro y de la custodia de sus credenciales de acceso. Cada usuario dado de alta dentro de una agencia debe estar autorizado por el administrador de dicha agencia.</p>,
  },
  {
    title: '4. Precios, facturación y periodo de prueba',
    body: (
      <>
        <p>Los precios vigentes de cada plan (Starter, Profesional, Agencia) se muestran en /pricing e incluyen los límites de usuarios, leads y agentes de IA especificados en cada plan. Los precios no incluyen costes de terceros derivados del uso del servicio (por ejemplo, tarifas de conversación de WhatsApp Business/Meta, campañas publicitarias en Meta Ads, integración con portales como Idealista, o consumo adicional del proveedor de modelos de IA), que corren a cargo del Cliente según las tarifas de dichos terceros.</p>
        <p className="mt-2">PropIA no ofrece actualmente un periodo de prueba gratuito: el acceso al panel requiere una suscripción activa desde el momento del registro.</p>
      </>
    ),
  },
  {
    title: '5. Nivel de servicio y disponibilidad',
    body: <p>PropIA hace sus mejores esfuerzos para mantener el servicio disponible, pero no garantiza una disponibilidad del 100%. No se ofrece actualmente un SLA contractual con compensaciones económicas por caídas del servicio.</p>,
  },
  {
    title: '6. Uso de los agentes de IA',
    body: <p>Los agentes de IA incluidos en el plan contratado generan respuestas automáticas a los leads (por ejemplo, por WhatsApp) basadas en modelos de lenguaje. El Cliente entiende que estas respuestas pueden contener errores y es responsable de supervisar razonablemente su funcionamiento, especialmente en mensajes con compromisos comerciales o de precio.</p>,
  },
  {
    title: '7. Cancelación y exportación de datos',
    body: (
      <>
        <p>El Cliente puede cancelar su suscripción en cualquier momento desde el panel de configuración, sin permanencia.</p>
        <p className="mt-2">Tras la cancelación, el Cliente dispone de 30 días para solicitar la exportación completa de sus leads, conversaciones y propiedades (descarga en formato JSON desde el panel, en Control y ROI, o escribiendo a automake0ff@gmail.com). Pasado ese plazo, los datos se eliminan de forma permanente, salvo lo que la ley obligue a conservar (facturación).</p>
        <p className="mt-2 text-amber-300/80 text-xs">
          ⚠️ El plazo de 30 días es una propuesta mía razonable, no un dato ya confirmado por la empresa — cámbialo si prefieres otro número.
        </p>
      </>
    ),
  },
  {
    title: '8. Propiedad intelectual',
    body: <p>PropIA y su código, marca y diseño son propiedad de [NOMBRE Y APELLIDOS PENDIENTE]. El Cliente conserva la propiedad de sus propios datos (leads, propiedades, conversaciones).</p>,
  },
  {
    title: '9. Limitación de responsabilidad',
    body: <p>En la medida permitida por la ley, la responsabilidad de PropIA frente al Cliente se limita al importe abonado por el servicio en los últimos 12 meses. PropIA no responde de daños indirectos derivados del uso del servicio.</p>,
  },
  {
    title: '10. Legislación aplicable',
    body: <p>Estos términos se rigen por la legislación española. Cualquier controversia se someterá a los juzgados y tribunales de Sevilla, salvo que la normativa de consumidores establezca un fuero distinto.</p>,
  },
]

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#080811] text-gray-300">
      <header className="border-b border-[#1E1E2E]/60 py-6">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center gap-3">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={16} /> Volver al inicio
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-bold font-syne text-white mb-2">Términos de servicio</h1>
        <p className="text-sm text-gray-500 mb-10">Última actualización: [PENDIENTE — fecha de publicación]</p>

        <div className="space-y-8 text-sm leading-relaxed">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="text-lg font-semibold text-white mb-2 font-syne">{s.title}</h2>
              <div className="text-gray-400">{s.body}</div>
            </section>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
