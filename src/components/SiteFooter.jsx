import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'

// Footer público compartido entre LandingPage, PricingPage (vista pública),
// PrivacyPolicyPage y TermsOfServicePage.
//
// ⚠️ ACCIÓN PENDIENTE PARA ALEJANDRO:
// Rellenado con lo que confirmaste (autónomo, Sevilla, contacto). Sigue
// pendiente tu NOMBRE COMPLETO y NIF — como autónomo, la LSSICE (art. 10)
// exige identificarte con nombre y NIF, no solo "autónomo" y la ciudad.
// Sin esos dos datos el aviso legal sigue incompleto.
const LEGAL = {
  razonSocial: '[NOMBRE Y APELLIDOS PENDIENTE] (autónomo)',
  nifCif: '[NIF PENDIENTE]',
  domicilio: 'Sevilla, España',
  emailContacto: 'automake0ff@gmail.com',
}

export default function SiteFooter() {
  const user = useStore((s) => s.user)

  return (
    <footer className="relative z-10 border-t border-[#1E1E2E]/60 bg-[#080811] py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-start gap-8">
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

        <div className="text-xs text-gray-500 leading-relaxed max-w-xs">
          <p className="text-gray-400 font-medium mb-1">{LEGAL.razonSocial}</p>
          <p>NIF/CIF: {LEGAL.nifCif}</p>
          <p>{LEGAL.domicilio}</p>
          <p>Contacto: {LEGAL.emailContacto}</p>
          <p className="mt-2 text-gray-600">© {new Date().getFullYear()} PropIA. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  )
}
