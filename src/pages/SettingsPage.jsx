import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, Building2, Key, Puzzle, Users, Palette,
  Save, CheckCircle, X, Eye, EyeOff, Globe, Mail,
  Phone, MessageCircle, Link, Server, RefreshCw,
  Image, Edit3, CreditCard, Upload, Shield, Lock
} from 'lucide-react'
import { useStore } from '../lib/store'
import toast from 'react-hot-toast'

function PlanGate({ feature, children, fallback = null }) {
  const canUse = useStore((s) => s.canUseFeature)
  const hasAccess = canUse(feature)
  if (hasAccess) return children
  return fallback
}

function UpgradeBanner({ feature, requiredPlan }) {
  return (
    <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-5 text-center">
      <Lock size={24} className="text-indigo-400 mx-auto mb-3" />
      <p className="text-sm font-medium text-[#F1F5F9] mb-1">
        Esta característica requiere el plan {requiredPlan}
      </p>
      <p className="text-xs text-[#94A3B8] mb-3">
        Actualiza para acceder a {feature}
      </p>
      <a
        href="/pricing"
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all"
      >
        Ver planes
      </a>
    </div>
  )
}

export default function SettingsPage() {
  const { canUseFeature, getCurrentPlan } = useStore()
  const plan = getCurrentPlan()

  const allTabs = [
    { id: 'general', label: 'General', icon: Building2, feature: null },
    { id: 'api', label: 'API', icon: Key, feature: 'apiAccess' },
    { id: 'integrations', label: 'Integraciones', icon: Puzzle, feature: null },
    { id: 'team', label: 'Roles y equipo', icon: Users, feature: null },
    { id: 'whitelabel', label: 'White-label', icon: Palette, feature: 'whiteLabel' },
  ]

  const tabs = allTabs.filter((t) => !t.feature || canUseFeature(t.feature))
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || 'general')

  const [general, setGeneral] = useState({
    agencyName: 'Inmobiliaria Centro',
    logoPreview: null,
    primaryColor: '#1849c6',
    domain: 'inmobiliariacentro.com',
    email: 'info@inmobiliariacentro.com',
    phone: '+34 912 345 678',
    address: 'Calle Mayor 42, Madrid',
  })

  const [api, setApi] = useState({
    anthropicKey: '',
    openrouterKey: '',
    showAnthropic: false,
    showOpenrouter: false,
    testing: false,
    connected: false,
  })

  const [integrations, setIntegrations] = useState({
    whatsappNumber: '+34 612 345 678',
    whatsappApiKey: '',
    metaWebhookUrl: 'https://webhook.example.com/meta-ads',
    smtpHost: 'smtp.gmail.com',
    smtpPort: '587',
    smtpUser: 'notificaciones@inmobiliariacentro.com',
    smtpPass: '',
    smtpSecure: true,
  })

  const [teamSettings, setTeamSettings] = useState({
    defaultRole: 'comercial',
    maxLeadsPerAgent: '30',
    autoAssignment: true,
    managersCanInvite: true,
    agentsCanTransfer: true,
  })

  const [whitelabel, setWhitelabel] = useState({
    customLogo: null,
    favicon: null,
    customDomain: '',
    primaryColor: '#1849c6',
    secondaryColor: '#8b5cf6',
    customCss: '/* Custom styles */\n.bg-primary { background-color: #1849c6; }',
    removeBranding: false,
    customFooter: '© 2026 Inmobiliaria Centro. Todos los derechos reservados.',
  })

   const [saved, setSaved] = useState({})

   useEffect(() => {
     const tabIds = tabs.map(t => t.id)
     if (!tabIds.includes(activeTab)) {
       setActiveTab(tabIds[0] || 'general')
     }
   }, [tabs, activeTab])

   const handleSave = (section) => {
    setSaved(prev => ({ ...prev, [section]: true }))
    toast.success('Configuración guardada correctamente')
    setTimeout(() => setSaved(prev => ({ ...prev, [section]: false })), 2000)
  }

  const testApiConnection = () => {
    setApi(prev => ({ ...prev, testing: true }))
    setTimeout(() => {
      setApi(prev => ({ ...prev, testing: false, connected: true }))
      toast.success('Conexión exitosa con la API')
      setTimeout(() => setApi(prev => ({ ...prev, connected: false })), 3000)
    }, 1500)
  }

  const tabContent = {
    general: (
      <div className="space-y-5 max-w-2xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center">
            <Image size={18} className="text-muted" />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">Logo de la agencia</p>
            <p className="text-xs text-muted">PNG, JPG o SVG. Recomendado 200x200px</p>
          </div>
          <button className="ml-auto px-3.5 py-2 text-xs font-medium text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-xl hover:bg-indigo-500/20 transition-all">
            Subir logo
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: 'Nombre de la agencia', value: general.agencyName, key: 'agencyName' },
            { label: 'Dominio', value: general.domain, key: 'domain' },
            { label: 'Email', value: general.email, key: 'email' },
            { label: 'Teléfono', value: general.phone, key: 'phone' },
          ].map(field => (
            <div key={field.key} className={field.key === 'agencyName' ? 'sm:col-span-2' : ''}>
              <label className="text-xs font-medium text-muted block mb-1">{field.label}</label>
              <input
                type="text"
                value={field.value}
                onChange={e => setGeneral(prev => ({ ...prev, [field.key]: e.target.value }))}
                className="w-full px-3.5 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted block mb-1">Dirección</label>
            <input
              type="text"
              value={general.address}
              onChange={e => setGeneral(prev => ({ ...prev, address: e.target.value }))}
              className="w-full px-3.5 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted block mb-1">Color principal</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={general.primaryColor}
                onChange={e => setGeneral(prev => ({ ...prev, primaryColor: e.target.value }))}
                className="w-10 h-10 rounded-xl border border-border-secondary cursor-pointer bg-surface2 overflow-hidden"
              />
              <span className="text-sm text-muted font-mono">{general.primaryColor}</span>
            </div>
          </div>
        </div>
      </div>
    ),
    api: (
      <div className="space-y-5 max-w-2xl">
        <div className="bg-surface/50 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber flex items-center justify-center">
              <Key size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Anthropic API Key</p>
              <p className="text-xs text-muted">Necesaria para las funcionalidades de IA del CRM</p>
            </div>
          </div>
          <div className="relative">
            <input
              type={api.showAnthropic ? 'text' : 'password'}
              value={api.anthropicKey}
              onChange={e => setApi(prev => ({ ...prev, anthropicKey: e.target.value }))}
              placeholder="sk-ant-..."
              className="w-full px-3.5 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none pr-10"
            />
            <button
              onClick={() => setApi(prev => ({ ...prev, showAnthropic: !prev.showAnthropic }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted2 hover:text-muted transition-colors"
            >
              {api.showAnthropic ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="bg-surface/50 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Server size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">OpenRouter API Key</p>
              <p className="text-xs text-muted">Alternativa para modelos de IA adicionales</p>
            </div>
          </div>
          <div className="relative">
            <input
              type={api.showOpenrouter ? 'text' : 'password'}
              value={api.openrouterKey}
              onChange={e => setApi(prev => ({ ...prev, openrouterKey: e.target.value }))}
              placeholder="sk-or-..."
              className="w-full px-3.5 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none pr-10"
            />
            <button
              onClick={() => setApi(prev => ({ ...prev, showOpenrouter: !prev.showOpenrouter }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted2 hover:text-muted transition-colors"
            >
              {api.showOpenrouter ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={testApiConnection}
            disabled={api.testing}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-glow"
          >
            {api.testing ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Link size={16} />
            )}
            {api.testing ? 'Probando conexión...' : 'Probar conexión'}
          </button>
          {api.connected && (
            <span className="flex items-center gap-1.5 text-sm text-ok font-medium">
              <CheckCircle size={16} />
              Conectado
            </span>
          )}
        </div>
      </div>
    ),
    integrations: (
      <div className="space-y-5 max-w-2xl">
        <div className="bg-surface/50 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-500/10 text-green-400 flex items-center justify-center">
              <MessageCircle size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">WhatsApp Business</p>
              <p className="text-xs text-muted">Número y API key de WhatsApp Business</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted block mb-1">Número de WhatsApp</label>
              <input
                type="text"
                value={integrations.whatsappNumber}
                onChange={e => setIntegrations(prev => ({ ...prev, whatsappNumber: e.target.value }))}
                className="w-full px-3.5 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted block mb-1">API Key</label>
              <input
                type="password"
                value={integrations.whatsappApiKey}
                onChange={e => setIntegrations(prev => ({ ...prev, whatsappApiKey: e.target.value }))}
                className="w-full px-3.5 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
              />
            </div>
          </div>
        </div>

        <div className="bg-surface/50 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Globe size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Meta Ads</p>
              <p className="text-xs text-muted">Webhook para recibir leads de Meta Ads</p>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted block mb-1">Webhook URL</label>
            <input
              type="text"
              value={integrations.metaWebhookUrl}
              onChange={e => setIntegrations(prev => ({ ...prev, metaWebhookUrl: e.target.value }))}
              className="w-full px-3.5 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none font-mono text-xs"
            />
          </div>
        </div>

        <div className="bg-surface/50 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Mail size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Email SMTP</p>
              <p className="text-xs text-muted">Configuración del servidor de correo saliente</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted block mb-1">Servidor SMTP</label>
              <input
                type="text"
                value={integrations.smtpHost}
                onChange={e => setIntegrations(prev => ({ ...prev, smtpHost: e.target.value }))}
                className="w-full px-3.5 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted block mb-1">Puerto</label>
              <input
                type="text"
                value={integrations.smtpPort}
                onChange={e => setIntegrations(prev => ({ ...prev, smtpPort: e.target.value }))}
                className="w-full px-3.5 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
              />
            </div>
            <div className="flex items-end pb-2.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={integrations.smtpSecure}
                  onChange={e => setIntegrations(prev => ({ ...prev, smtpSecure: e.target.checked }))}
                  className="w-4 h-4 rounded border-border-secondary text-indigo-500 focus:ring-indigo-500/20 bg-surface2"
                />
                <span className="text-sm text-muted">Usar TLS</span>
              </label>
            </div>
            <div>
              <label className="text-xs font-medium text-muted block mb-1">Usuario</label>
              <input
                type="text"
                value={integrations.smtpUser}
                onChange={e => setIntegrations(prev => ({ ...prev, smtpUser: e.target.value }))}
                className="w-full px-3.5 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted block mb-1">Contraseña</label>
              <input
                type="password"
                value={integrations.smtpPass}
                onChange={e => setIntegrations(prev => ({ ...prev, smtpPass: e.target.value }))}
                className="w-full px-3.5 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    ),
    team: (
      <div className="space-y-5 max-w-2xl">
        <div className="bg-surface/50 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Shield size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Configuración de roles</p>
              <p className="text-xs text-muted">Gestiona los permisos y límites por rol</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted block mb-1">Rol por defecto</label>
              <select
                value={teamSettings.defaultRole}
                onChange={e => setTeamSettings(prev => ({ ...prev, defaultRole: e.target.value }))}
                className="w-full px-3.5 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
              >
                <option value="comercial">Comercial</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted block mb-1">Máx. leads por agente</label>
              <input
                type="number"
                value={teamSettings.maxLeadsPerAgent}
                onChange={e => setTeamSettings(prev => ({ ...prev, maxLeadsPerAgent: e.target.value }))}
                className="w-full px-3.5 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
              />
            </div>
          </div>
          <div className="space-y-2">
            {[
              { key: 'autoAssignment', label: 'Asignación automática de leads' },
              { key: 'managersCanInvite', label: 'Managers pueden invitar miembros' },
              { key: 'agentsCanTransfer', label: 'Agentes pueden transferir leads' },
            ].map(opt => (
              <label key={opt.key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={teamSettings[opt.key]}
                  onChange={e => setTeamSettings(prev => ({ ...prev, [opt.key]: e.target.checked }))}
                  className="w-4 h-4 rounded border-border-secondary text-indigo-500 focus:ring-indigo-500/20 bg-surface2"
                />
                <span className="text-sm text-ink">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-surface/50 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Users size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Gestionar roles</p>
              <p className="text-xs text-muted">Define los permisos de cada rol en el sistema</p>
            </div>
          </div>
          <div className="space-y-2">
              {[
                { role: 'Admin', color: 'text-err bg-err/10', perms: 'Acceso total al sistema' },
                { role: 'Manager', color: 'text-indigo-400 bg-indigo-500/10', perms: 'Gestión de equipo y leads' },
                { role: 'Comercial', color: 'text-ok bg-ok/10', perms: 'Gestión de leads y propiedades' },
                { role: 'Agente IA', color: 'text-purple-400 bg-purple-500/10', perms: 'Automatizaciones y análisis' },
              ].map(r => (
              <div key={r.role} className="flex items-center gap-3 p-3 bg-surface border border-border-secondary rounded-xl">
                <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${r.color}`}>{r.role}</span>
                <span className="text-xs text-muted flex-1">{r.perms}</span>
                <button className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Editar</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    whitelabel: (
      <div className="space-y-5 max-w-2xl">
        <div className="bg-surface/50 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-pink-500/10 text-pink-400 flex items-center justify-center border border-pink-500/20">
              <Image size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Personalización de marca</p>
              <p className="text-xs text-muted">Sube tu logo y favicon personalizados</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-6 bg-surface border-2 border-dashed border-border-secondary hover:border-indigo-500/50 rounded-xl transition-all text-center cursor-pointer">
              <Upload size={24} className="mx-auto text-muted2 mb-2" />
              <p className="text-xs font-medium text-muted">Logo principal</p>
              <p className="text-[10px] text-muted2">PNG, SVG, JPG</p>
            </div>
            <div className="p-6 bg-surface border-2 border-dashed border-border-secondary hover:border-indigo-500/50 rounded-xl transition-all text-center cursor-pointer">
              <Upload size={24} className="mx-auto text-muted2 mb-2" />
              <p className="text-xs font-medium text-muted">Favicon</p>
              <p className="text-[10px] text-muted2">ICO, PNG, SVG</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted block mb-1">Color primario</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={whitelabel.primaryColor}
                onChange={e => setWhitelabel(prev => ({ ...prev, primaryColor: e.target.value }))}
                className="w-10 h-10 rounded-xl border border-border-secondary cursor-pointer bg-surface2 overflow-hidden"
              />
              <span className="text-sm text-muted font-mono">{whitelabel.primaryColor}</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted block mb-1">Color secundario</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={whitelabel.secondaryColor}
                onChange={e => setWhitelabel(prev => ({ ...prev, secondaryColor: e.target.value }))}
                className="w-10 h-10 rounded-xl border border-border-secondary cursor-pointer bg-surface2 overflow-hidden"
              />
              <span className="text-sm text-muted font-mono">{whitelabel.secondaryColor}</span>
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted block mb-1">Dominio personalizado</label>
            <input
              type="text"
              value={whitelabel.customDomain}
              onChange={e => setWhitelabel(prev => ({ ...prev, customDomain: e.target.value }))}
              placeholder="crm.tuinmobiliaria.com"
              className="w-full px-3.5 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted block mb-1">CSS personalizado</label>
            <textarea
              value={whitelabel.customCss}
              onChange={e => setWhitelabel(prev => ({ ...prev, customCss: e.target.value }))}
              rows={4}
              className="w-full px-3.5 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none font-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted block mb-1">Footer personalizado</label>
            <input
              type="text"
              value={whitelabel.customFooter}
              onChange={e => setWhitelabel(prev => ({ ...prev, customFooter: e.target.value }))}
              className="w-full px-3.5 py-2.5 text-sm bg-surface2 border border-border-secondary rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
            />
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={whitelabel.removeBranding}
            onChange={e => setWhitelabel(prev => ({ ...prev, removeBranding: e.target.checked }))}
            className="w-4 h-4 rounded border-border-secondary text-indigo-500 focus:ring-indigo-500/20 bg-surface2"
          />
          <div>
            <span className="text-sm font-medium text-ink">Eliminar marca "Powered by"</span>
            <p className="text-xs text-muted">Oculta las referencias a la plataforma en la interfaz</p>
          </div>
        </label>
      </div>
    ),
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 text-indigo-400 flex items-center justify-center shadow-sm border border-indigo-500/20">
          <Settings size={22} />
        </div>
         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
           <div>
             <h1 className="text-2xl font-bold text-ink font-syne">Configuración</h1>
             <p className="text-sm text-muted">Gestiona los ajustes de tu agencia</p>
           </div>
           <div className="flex items-center gap-3 p-3 bg-surface border border-border-secondary rounded-xl">
             <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
               plan.id === 'starter' ? 'bg-gray-500/10 text-gray-400' :
               plan.id === 'profesional' ? 'bg-indigo-500/10 text-indigo-400' :
               'bg-purple-500/10 text-purple-400'
             }`}>
               <CreditCard size={16} />
             </div>
             <div>
               <p className="text-sm font-medium text-ink">Plan {plan.name}</p>
               <p className="text-xs text-muted">{plan.price}€/mes</p>
             </div>
             <a
               href="/pricing"
               className="ml-2 px-3 py-1.5 text-xs font-medium text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-lg hover:bg-indigo-500/20 transition-all"
             >
               {plan.id === 'agencia' ? 'Gestionar' : 'Cambiar plan'}
             </a>
           </div>
         </div>

       <div className="flex gap-0 lg:gap-6 flex-col lg:flex-row">
        <nav className="lg:w-52 xl:w-60 shrink-0 flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-indigo-600 text-white shadow-glow'
                    : 'text-muted hover:text-ink hover:bg-surface2'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            )
          })}
        </nav>

        <div className="flex-1 min-w-0">
          <div className="bg-surface rounded-2xl border border-border-secondary p-6 shadow-card">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                {tabContent[activeTab]}
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 pt-5 border-t border-border-secondary flex items-center justify-between">
              <span className="text-xs text-muted">
                Los cambios se guardan localmente
              </span>
              <button
                onClick={() => handleSave(activeTab)}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-glow"
              >
                {saved[activeTab] ? (
                  <CheckCircle size={16} />
                ) : (
                  <Save size={16} />
                )}
                {saved[activeTab] ? 'Guardado' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
