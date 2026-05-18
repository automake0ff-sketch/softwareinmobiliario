import { Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Layout from './components/Layout/Layout'

import DashboardPage from './pages/DashboardPage'
import PipelinePage from './pages/PipelinePage'
import LeadsPage from './pages/LeadsPage'
import LeadDetailPage from './pages/LeadDetailPage'
import PropertiesPage from './pages/PropertiesPage'
import ConversationsPage from './pages/ConversationsPage'
import AutomationsPage from './pages/AutomationsPage'
import AgentsIAPage from './pages/AgentsIAPage'
import OnboardingPage from './pages/OnboardingPage'
import PricingPage from './pages/PricingPage'
import AnalyticsPage from './pages/AnalyticsPage'
import TeamPage from './pages/TeamPage'
import SettingsPage from './pages/SettingsPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import TemplatesPage from './pages/TemplatesPage'
import AdminPage from './pages/AdminPage'

export default function App() {
  return (
    <AnimatePresence mode="wait">
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
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
    </AnimatePresence>
  )
}
