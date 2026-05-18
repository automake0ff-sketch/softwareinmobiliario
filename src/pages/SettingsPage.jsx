import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, Building2, Key, Puzzle, Users, Palette,
  Save, CheckCircle, X, Eye, EyeOff, Globe, Mail,
  Phone, MessageCircle, Link, Server, RefreshCw,
  Image, Edit3, CreditCard, Upload, Shield, Lock,
  Send, Trash2, Zap, Wifi, WifiOff, Plus, Smartphone,
  Database, Bell, Webhook as WebhookIcon
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
    { id: 'destinations', label: 'Destinos', icon: Send, feature: null },
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
    integrations: <IntegrationsSection />,
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

    destinations: <DestinationsTab />,
  }

  function IntegrationsSection() {
    const [config, setConfig] = useState({})
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [testing, setTesting] = useState(null)
    const [testResults, setTestResults] = useState({})
    const [emailTab, setEmailTab] = useState('sendgrid')
    const [completeness, setCompleteness] = useState(0)

    useEffect(() => {
      fetch('/api/agency/config')
        .then(r => r.json())
        .then(data => {
          setConfig(data || {})
          calcCompleteness(data || {})
        })
        .catch(() => {})
    }, [])

    const calcCompleteness = (cfg) => {
      const required = ['name','city','email','whatsapp_token','whatsapp_phone_id','sendgrid_api_key','sendgrid_from_email']
      const filled = required.filter(k => cfg[k])
      setCompleteness(Math.round((filled.length / required.length) * 100))
    }

    const update = (key, value) => {
      const updated = { ...config, [key]: value }
      setConfig(updated)
      calcCompleteness(updated)
    }

    const save = async () => {
      setSaving(true)
      try {
        const res = await fetch('/api/agency/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        })
        if (!res.ok) throw new Error('Error al guardar')
        setSaved(true)
        toast.success('Configuración guardada')
        setTimeout(() => setSaved(false), 3000)
      } catch (e) { toast.error(e.message) }
      finally { setSaving(false) }
    }

    const test = async (integration) => {
      setTesting(integration)
      try {
        const res = await fetch('/api/agency/test-integration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ integration, config }),
        })
        const result = await res.json()
        setTestResults(p => ({ ...p, [integration]: result }))
      } catch (e) { toast.error(e.message) }
      finally { setTesting(null) }
    }

    const renderField = (field) => (
      <div key={field.key} className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-white/60 text-xs font-medium">
          {field.label}
          {field.required && <span className="text-red-400 text-xs">*</span>}
          {config[field.key] && <span className="text-emerald-400 text-xs">✓</span>}
        </label>
        <input
          type={field.type || 'text'}
          value={config[field.key] || ''}
          onChange={e => update(field.key, e.target.value)}
          placeholder={field.placeholder || ''}
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>
    )

    const SECTIONS = [
      {
        id: 'agency', title: 'Datos de la agencia', icon: '🏢',
        description: 'Nombre, ciudad, contacto y redes sociales',
        fields: [
          { key: 'name', label: 'Nombre de la agencia', type: 'text', required: true },
          { key: 'city', label: 'Ciudad principal', type: 'text', required: true },
          { key: 'email', label: 'Email de la agencia', type: 'email', required: true },
          { key: 'phone', label: 'Teléfono de contacto', type: 'tel', placeholder: '+34 954 000 000' },
          { key: 'address', label: 'Dirección', type: 'text' },
          { key: 'website', label: 'Web', type: 'url', placeholder: 'https://miagencia.com' },
          { key: 'instagram', label: 'Instagram', type: 'text', placeholder: '@miagencia' },
          { key: 'facebook', label: 'Facebook', type: 'url' },
        ],
      },
      {
        id: 'whatsapp', title: 'WhatsApp Business', icon: '💬',
        description: 'Conecta tu número para enviar mensajes reales a los leads',
        testable: true,
        fields: [
          { key: 'whatsapp_number', label: 'Número WhatsApp visible', type: 'tel', placeholder: '+34 600 000 000', required: true },
          { key: 'whatsapp_token', label: 'Token de acceso permanente', type: 'password', required: true },
          { key: 'whatsapp_phone_id', label: 'Phone Number ID', type: 'text', required: true },
        ],
      },
      {
        id: 'email', title: 'Email', icon: '📧',
        description: 'Para enviar emails desde las automatizaciones',
        testable: true,
        tabs: [
          {
            id: 'sendgrid', label: 'SendGrid (recomendado)',
            fields: [
              { key: 'sendgrid_api_key', label: 'API Key', type: 'password', required: true },
              { key: 'sendgrid_from_email', label: 'Email remitente', type: 'email', required: true },
              { key: 'sendgrid_from_name', label: 'Nombre remitente', type: 'text', required: true },
            ],
          },
          {
            id: 'smtp', label: 'SMTP propio',
            fields: [
              { key: 'smtp_host', label: 'Servidor SMTP', type: 'text', placeholder: 'smtp.gmail.com' },
              { key: 'smtp_port', label: 'Puerto', type: 'text', placeholder: '587' },
              { key: 'smtp_user', label: 'Usuario', type: 'email' },
              { key: 'smtp_password', label: 'Contraseña', type: 'password' },
            ],
          },
        ],
      },
      {
        id: 'notifications', title: 'Notificaciones del equipo', icon: '🔔',
        description: 'Slack y Telegram para alertas en tiempo real',
        testable: true,
        fields: [
          { key: 'slack_webhook_url', label: 'Slack Webhook URL', type: 'url', placeholder: 'https://hooks.slack.com/...' },
          { key: 'telegram_bot_token', label: 'Telegram Bot Token', type: 'password', placeholder: '123456789:ABC...' },
          { key: 'telegram_chat_id', label: 'Telegram Chat ID', type: 'text', placeholder: '-100123456789' },
        ],
      },
      {
        id: 'databases', title: 'Bases de datos externas', icon: '🗄️',
        description: 'Notion, Airtable y Google Sheets para sincronizar datos',
        fields: [
          { key: 'notion_api_key', label: 'Notion Integration Token', type: 'password' },
          { key: 'notion_database_id', label: 'Notion Database ID', type: 'text' },
          { key: 'airtable_api_key', label: 'Airtable Personal Token', type: 'password' },
          { key: 'airtable_base_id', label: 'Airtable Base ID', type: 'text', placeholder: 'appXXXXXXXXX' },
          { key: 'airtable_table', label: 'Nombre de la tabla', type: 'text', placeholder: 'Leads' },
          { key: 'google_sheets_id', label: 'Google Sheets ID', type: 'text' },
        ],
      },
      {
        id: 'webhooks', title: 'Webhooks externos', icon: '🔗',
        description: 'Conecta con Zapier, Make o tu instancia de n8n',
        testable: true,
        fields: [
          { key: 'zapier_webhook_url', label: 'Zapier Webhook URL', type: 'url', placeholder: 'https://hooks.zapier.com/...' },
          { key: 'make_webhook_url', label: 'Make Webhook URL', type: 'url', placeholder: 'https://hook.eu1.make.com/...' },
          { key: 'n8n_webhook_url', label: 'n8n Webhook URL', type: 'url', placeholder: 'https://tu-n8n.com/webhook/...' },
        ],
      },
    ]

    return (
      <div className="space-y-6">
        {/* Header con barra de completitud */}
        <div>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-white/40">Estos datos se usan automáticamente en todas tus automatizaciones</p>
            </div>
            <button
              onClick={save}
              disabled={saving}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                saved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50'
              }`}
            >
              {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar cambios'}
            </button>
          </div>
          <div className="bg-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/60 text-sm">Configuración completada</span>
              <span className={`text-sm font-semibold ${
                completeness >= 80 ? 'text-emerald-400' : completeness >= 50 ? 'text-amber-400' : 'text-red-400'
              }`}>{completeness}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  completeness >= 80 ? 'bg-emerald-500' : completeness >= 50 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${completeness}%` }}
              />
            </div>
            {completeness < 100 && (
              <p className="text-white/30 text-xs mt-2">
                {completeness < 50 ? '⚠️ Configura WhatsApp y email para que las automatizaciones funcionen' :
                 completeness < 80 ? '💡 Añade más integraciones para activar más automatizaciones' :
                 '✓ Configuración básica completa'}
              </p>
            )}
          </div>
        </div>

        {/* Secciones */}
        {SECTIONS.map(section => (
          <div key={section.id} className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
              <span className="text-2xl">{section.icon}</span>
              <div className="flex-1">
                <p className="text-white font-medium text-sm">{section.title}</p>
                <p className="text-white/40 text-xs">{section.description}</p>
              </div>
              {section.testable && (
                <button
                  onClick={() => test(section.id)}
                  disabled={testing === section.id}
                  className="px-3 py-1.5 border border-white/10 hover:border-white/20 text-white/50 hover:text-white text-xs rounded-lg transition-all"
                >
                  {testing === section.id ? '...' : 'Probar'}
                </button>
              )}
            </div>
            <div className="p-6">
              {testResults[section.id] && (
                <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
                  testResults[section.id].ok
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}>
                  {testResults[section.id].ok ? '✓ ' : '✗ '}{testResults[section.id].msg}
                </div>
              )}
              {section.tabs ? (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    {section.tabs.map(tab => (
                      <button key={tab.id}
                        onClick={() => setEmailTab(tab.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          emailTab === tab.id
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white/5 text-white/40 hover:text-white/70'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {section.tabs.find(t => t.id === emailTab)?.fields.map(renderField)}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {section.fields?.map(renderField)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  function DestinationsTab() {
    const [destinations, setDestinations] = useState([])
    const [types, setTypes] = useState([])
    const [adding, setAdding] = useState(false)
    const [selectedType, setSelectedType] = useState(null)
    const [destName, setDestName] = useState('')
    const [creds, setCreds] = useState({})
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(null)
    const [testResult, setTestResult] = useState(null)

    useEffect(() => {
      fetch('/api/destinations').then(r => r.json()).then(setDestinations).catch(() => {})
      fetch('/api/destinations/types').then(r => r.json()).then(setTypes).catch(() => {})
    }, [])

    const addDest = async () => {
      if (!selectedType || !destName.trim()) return toast.error('Nombre y tipo requeridos')
      setSaving(true)
      try {
        const res = await fetch('/api/destinations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: selectedType.id, name: destName, credentials: creds }),
        })
        if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
        const d = await res.json()
        setDestinations(prev => [d, ...prev])
        setAdding(false); setDestName(''); setCreds({}); setSelectedType(null)
        toast.success('Destino añadido')
      } catch (e) { toast.error(e.message) }
      finally { setSaving(false) }
    }

    const deleteDest = async (id) => {
      try {
        await fetch(`/api/destinations/${id}`, { method: 'DELETE' })
        setDestinations(prev => prev.filter(d => d.id !== id))
        toast.success('Destino eliminado')
      } catch (e) { toast.error(e.message) }
    }

    const testDest = async (id) => {
      setTesting(id)
      try {
        const res = await fetch(`/api/destinations/${id}/test`, { method: 'POST' })
        const result = await res.json()
        setTestResult(result)
        setDestinations(prev => prev.map(d => d.id === id ? { ...d, last_test_ok: result.ok ? 1 : 0, last_tested_at: new Date().toISOString() } : d))
        if (result.ok) toast.success(result.detail)
        else toast.error(result.detail)
      } catch (e) { toast.error(e.message) }
      finally { setTesting(null) }
    }

    const typeColor = (id) => types.find(t => t.id === id)?.color || '#6b7280'
    const typeLabel = (id) => types.find(t => t.id === id)?.label || id

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">Destinos configurados para enviar resultados de automatizaciones</p>
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-xl transition-all">
            <Plus size={15} />
            Añadir
          </button>
        </div>

        {adding && (
          <div className="border border-border-secondary rounded-xl p-5 space-y-4 bg-[#0B0B1A]">
            <p className="text-sm font-medium text-[#F1F5F9]">Nuevo destino</p>
            <input value={destName} onChange={e => setDestName(e.target.value)}
              placeholder="Nombre (ej: WhatsApp Oficina Sevilla)"
              className="w-full bg-[#0a0a1a] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {types.map(t => (
                <button key={t.id} onClick={() => { setSelectedType(t); setCreds({}) }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs transition-all ${
                    selectedType?.id === t.id ? 'border-indigo-500 bg-indigo-950/30 text-white' : 'border-white/10 text-white/50 hover:border-white/20 hover:text-white/80'
                  }`}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.label}
                </button>
              ))}
            </div>
            {selectedType && selectedType.fields?.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-white/40 uppercase tracking-wider">Credenciales</p>
                {selectedType.fields.map(f => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-xs text-white/50">{f.label}</label>
                    <input type={f.type || 'text'} value={creds[f.key] || ''}
                      onChange={e => setCreds(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full bg-[#0a0a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500" />
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={addDest} disabled={saving || !selectedType || !destName}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm rounded-xl">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={() => { setAdding(false); setSelectedType(null); setCreds({}); setDestName('') }}
                className="px-4 py-2.5 border border-white/10 text-white/50 text-sm rounded-xl hover:border-white/20">Cancelar</button>
            </div>
          </div>
        )}

        {destinations.length === 0 && !adding && (
          <div className="text-center py-16 text-white/30">
            <Send size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Sin destinos configurados</p>
            <p className="text-xs mt-1">Añade WhatsApp, Email, Webhooks o integraciones</p>
          </div>
        )}

        <div className="space-y-2">
          {destinations.map(d => (
            <div key={d.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: typeColor(d.type) }} />
                <div>
                  <p className="text-sm text-white font-medium">{d.name}</p>
                  <p className="text-xs text-white/40">{typeLabel(d.type)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {d.last_test_ok !== null && d.last_test_ok !== undefined && (
                  d.last_test_ok
                    ? <Wifi size={14} className="text-emerald-400" title="Conectado" />
                    : <WifiOff size={14} className="text-red-400" title="Error en prueba" />
                )}
                <button onClick={() => testDest(d.id)} disabled={testing === d.id}
                  className="px-3 py-1.5 border border-white/10 hover:border-white/20 text-white/50 hover:text-white text-xs rounded-lg transition-all">
                  {testing === d.id ? '...' : <Zap size={13} />}
                </button>
                <button onClick={() => deleteDest(d.id)}
                  className="p-1.5 text-white/30 hover:text-red-400 transition-all">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
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
