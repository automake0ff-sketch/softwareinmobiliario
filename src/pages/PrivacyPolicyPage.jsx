import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import SiteFooter from '../components/SiteFooter'

// ⚠️ Alejandro: este texto es una base RGPD/LOPDGDD razonable para un CRM que
// trata datos personales de leads inmobiliarios (incluyendo mensajes de
// WhatsApp), pero es una plantilla, no un documento revisado por un abogado.
// Antes de tratar datos reales de clientes en producción:
//   1. Rellena los campos marcados como [PENDIENTE] con los datos reales.
//   2. Confirma con quién compartís datos exactamente (proveedor de WhatsApp
//      Business/Meta, proveedor de IA — OpenRouter/Anthropic/OpenAI según el
//      caso —, Supabase como encargado del tratamiento, Stripe para pagos).
//   3. Idealmente que un abogado la revise antes de lanzarlo con clientes reales.
const SECTIONS = [
  {
    title: '1. Responsable del tratamiento',
    body: (
      <>
        <p>El responsable del tratamiento de los datos personales recogidos a través de PropIA es:</p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>Titular: [NOMBRE Y APELLIDOS PENDIENTE] (autónomo)</li>
          <li>NIF: [PENDIENTE]</li>
          <li>Domicilio: Sevilla, España</li>
          <li>Email de contacto para asuntos de privacidad: automake0ff@gmail.com</li>
        </ul>
      </>
    ),
  },
  {
    title: '2. Qué datos tratamos',
    body: (
      <>
        <p>Según cómo se use PropIA, podemos tratar:</p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>Datos de la cuenta: nombre, email, teléfono y contraseña (cifrada) de los usuarios de la agencia.</li>
          <li>Datos de la agencia inmobiliaria cliente: nombre comercial, dirección, teléfono, empleados dados de alta.</li>
          <li>Datos de leads y clientes finales de la inmobiliaria: nombre, teléfono, email, preferencias de vivienda, historial de conversación por WhatsApp u otros canales conectados.</li>
          <li>Datos de propiedades inmobiliarias gestionadas en el CRM.</li>
          <li>Datos técnicos: dirección IP, cookies estrictamente necesarias para el funcionamiento del panel.</li>
        </ul>
      </>
    ),
  },
  {
    title: '3. Base jurídica y finalidad',
    body: (
      <>
        <p>Tratamos estos datos para:</p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>Prestar el servicio contratado (ejecución del contrato) — gestión del CRM, automatizaciones y agentes de IA.</li>
          <li>Facturación y cumplimiento de obligaciones legales.</li>
          <li>Mejora del producto y soporte al cliente (interés legítimo).</li>
          <li>Comunicaciones comerciales, solo con consentimiento previo.</li>
        </ul>
      </>
    ),
  },
  {
    title: '4. Con quién compartimos los datos (encargados del tratamiento)',
    body: (
      <>
        <p>Para operar PropIA usamos proveedores que actúan como encargados del tratamiento bajo contrato (art. 28 RGPD), entre ellos, según el módulo contratado:</p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>Supabase (base de datos y almacenamiento de ficheros).</li>
          <li>Meta/WhatsApp Business Platform (envío y recepción de mensajes de WhatsApp).</li>
          <li>El proveedor de modelos de IA utilizado para los agentes conversacionales.</li>
          <li>Stripe (procesamiento de pagos con tarjeta).</li>
          <li>Proveedor de hosting (Vercel / Render).</li>
        </ul>
        <p className="mt-2">No vendemos datos personales a terceros con fines publicitarios.</p>
      </>
    ),
  },
  {
    title: '5. Conservación de los datos',
    body: <p>Conservamos los datos mientras dure la relación contractual con la agencia cliente y, tras su finalización, durante los plazos exigidos por la legislación mercantil y fiscal aplicable. La agencia puede solicitar la exportación o borrado de sus datos según se describe en la sección 7.</p>,
  },
  {
    title: '6. Transferencias internacionales',
    body: <p>Algunos proveedores (por ejemplo, proveedores de infraestructura o de modelos de IA) pueden procesar datos fuera del Espacio Económico Europeo. En esos casos nos apoyamos en las garantías previstas por el RGPD (Cláusulas Contractuales Tipo u otro mecanismo equivalente reconocido por la normativa europea).</p>,
  },
  {
    title: '7. Tus derechos',
    body: (
      <>
        <p>Puedes ejercer en cualquier momento tus derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad de tus datos, escribiendo a automake0ff@gmail.com. También tienes derecho a presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).</p>
        <p className="mt-2">Si tu agencia cancela su suscripción, puede solicitar la exportación completa de sus leads, conversaciones y propiedades, así como el borrado definitivo de los datos.</p>
      </>
    ),
  },
  {
    title: '8. Seguridad',
    body: <p>Aplicamos medidas técnicas y organizativas razonables (control de acceso por agencia, cifrado de contraseñas, aislamiento multi-tenant a nivel de base de datos) para proteger los datos frente a accesos no autorizados, pérdida o alteración.</p>,
  },
  {
    title: '9. Cambios en esta política',
    body: <p>Podemos actualizar esta política para reflejar cambios legales o del servicio. Notificaremos cambios relevantes a las agencias clientes por email o mediante aviso en el panel.</p>,
  },
]

export default function PrivacyPolicyPage() {
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
        <h1 className="text-3xl font-bold font-syne text-white mb-2">Política de privacidad</h1>
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
