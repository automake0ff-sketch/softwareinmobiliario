import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import PricingPage from './PricingPage'
import SiteFooter from '../components/SiteFooter'

// /pricing debe ser visible para cualquier visitante, con o sin sesión
// (prospectos comparando planes antes de registrarse). Antes vivía dentro
// del Layout privado (sidebar + topbar de la app), así que un visitante sin
// cuenta acababa redirigido a /login solo por intentar ver los precios.
export default function PublicPricingPage() {
  return (
    <div className="min-h-screen bg-[#080811]">
      <header className="border-b border-[#1E1E2E]/60 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-3">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={16} /> Volver al inicio
          </Link>
        </div>
      </header>
      <main className="px-4 sm:px-6 py-12">
        <PricingPage />
      </main>
      <SiteFooter />
    </div>
  )
}
