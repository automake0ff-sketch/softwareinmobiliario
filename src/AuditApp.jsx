import { Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useEffect } from 'react'
import Navbar from './components/Navbar'
import AuditPage from './pages/AuditPage'
import PricingPage from './pages/PricingPage'
import DashboardPage from './pages/DashboardPage'
import SettingsPage from './pages/SettingsPage'
import PropBotPage from './pages/PropBotPage'
import StudioPage from './pages/StudioPage'
import AuditResults from './components/AuditResults'
import { useStore } from './lib/store'
import { loadSharedResult } from './utils/sharing'
import { recordAudit } from './utils/analytics'
import { getAnalytics } from './utils/analytics'

function SharedResultRedirect() {
  const { setCurrentResult, clearResult } = useStore()
  useEffect(() => {
    const shared = loadSharedResult()
    if (shared) { setCurrentResult(shared); recordAudit(shared.score_general) }
    return () => clearResult()
  }, [setCurrentResult, clearResult])
  const shared = loadSharedResult()
  if (shared) return <Navigate to="/" replace />
  return <Navigate to="/" replace />
}

function Footer() {
  const analytics = getAnalytics()

  return (
    <footer style={{ borderTop: '1px solid var(--border)', padding: '20px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: '13px', color: 'var(--text3)' }}>
        {analytics.total > 0
          ? `${analytics.total} propiedades auditadas desde ${new Date(analytics.firstAuditDate).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`
          : 'Auditoria inmobiliaria impulsada por IA multi-agente'}
      </p>
      {analytics.total > 0 && (
        <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px', opacity: 0.6 }}>
          Score promedio: {analytics.avgScore}/100
        </p>
      )}
    </footer>
  )
}

export default function AuditApp() {
  return (
    <div className="grain" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <div style={{ flex: 1, width: '100%' }}>
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<AuditPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/propbot" element={<PropBotPage />} />
            <Route path="/studio" element={<StudioPage />} />
            <Route path="/shared" element={<SharedResultRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </div>
      <Footer />
    </div>
  )
}
