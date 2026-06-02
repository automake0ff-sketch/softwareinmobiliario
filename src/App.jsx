import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Layout from './components/Layout/Layout'

// Lazy loaded page components to optimize bundle size
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const PipelinePage = lazy(() => import('./pages/PipelinePage'))
const LeadsPage = lazy(() => import('./pages/LeadsPage'))
const LeadDetailPage = lazy(() => import('./pages/LeadDetailPage'))
const PropertiesPage = lazy(() => import('./pages/PropertiesPage'))
const ConversationsPage = lazy(() => import('./pages/ConversationsPage'))
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'))
const AgentsIAPage = lazy(() => import('./pages/AgentsIAPage'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const PricingPage = lazy(() => import('./pages/PricingPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const PublicAppointmentPage = lazy(() => import('./pages/PublicAppointmentPage'))

// Premium self-contained loading fallback
const PageLoader = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '80vh',
    width: '100%',
    flexDirection: 'column',
    gap: '12px',
    color: '#D4A853',
    fontFamily: 'Outfit, sans-serif'
  }}>
    <div style={{
      width: '36px',
      height: '36px',
      border: '3px solid rgba(212, 168, 83, 0.1)',
      borderTop: '3px solid #D4A853',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }} />
    <style>{`
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
    <span style={{ fontSize: '13px', letterSpacing: '0.05em', opacity: 0.8 }}>Cargando panel...</span>
  </div>
)

export default function App() {
  return (
    <AnimatePresence mode="wait">
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<LoginPage />} />

    <Route path="/register" element={<RegisterPage />} />
          <Route path="/appointment/:token" element={<PublicAppointmentPage />} />
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/leads/:id" element={<LeadDetailPage />} />
            <Route path="/properties" element={<PropertiesPage />} />
            <Route path="/conversations" element={<ConversationsPage />} />
            <Route path="/automations" element={<AutomationsPage />} />
            <Route path="/automations/templates" element={<TemplatesPage />} />
            <Route path="/agents" element={<AgentsIAPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Routes>
      </Suspense>
    </AnimatePresence>
  )
}
