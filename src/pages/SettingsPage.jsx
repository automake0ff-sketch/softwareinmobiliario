import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { CreditCard, Settings } from 'lucide-react'
import api from '../lib/api'
import { useStore } from '../lib/store'

// Solo ajustes que el servidor usa de verdad:
//  - datos de la agencia (emails, partes de visita, informe al propietario)
//  - citas (zona horaria, horario, enlace de videollamada, encargado)
//  - texto del parte de visita
//  - email con SendGrid (confirmaciones y recordatorios de citas)
const SECTIONS = [
  {
    id: 'agency', title: 'Datos de la agencia', icon: '🏢',
    description: 'Aparecen en los correos a clientes, en el parte de visita y en el informe al propietario',
    fields: [
      { key: 'name', label: 'Nombre de la agencia', type: 'text', required: true },
      { key: 'city', label: 'Ciudad principal', type: 'text', required: true },
      { key: 'email', label: 'Email de la agencia', type: 'email', required: true },
      { key: 'phone', label: 'Teléfono de contacto', type: 'tel', placeholder: '+34 954 000 000' },
      { key: 'address', label: 'Dirección', type: 'text' },
      { key: 'website', label: 'Web', type: 'url', placeholder: 'https://miagencia.com' },
    ],
  },
  {
    id: 'appointments', title: 'Citas', icon: '📅',
    description: 'Zona horaria, horario laboral, enlace de videollamada y encargado por defecto',
    fields: [
      { key: 'timezone', label: 'Zona horaria', type: 'text', placeholder: 'Europe/Madrid' },
      { key: 'working_hours', label: 'Horario laboral (JSON)', type: 'text', placeholder: '{"start":"09:00","end":"20:00","days":[1,2,3,4,5]}' },
      { key: 'online_meeting_url', label: 'Enlace base de videollamadas', type: 'url', placeholder: 'https://meet.google.com/...' },
      { key: 'appointment_attendant_name', label: 'Encargado de visitas por defecto', type: 'text', placeholder: 'Equipo Comercial' },
    ],
  },
  {
    id: 'visits', title: 'Parte de visita', icon: '✍️',
    description: 'Texto que firma el visitante. Déjalo vacío para usar el texto estándar. Puedes usar {agencia}, {inmueble}, {ciudad}, {referencia} y {fecha}. Conviene que lo revise un abogado.',
    fields: [
      { key: 'visit_terms', label: 'Texto del parte de visita', type: 'textarea', placeholder: 'Declaro que el día {fecha} la agencia {agencia} me ha mostrado el inmueble «{inmueble}»…' },
    ],
  },
  {
    id: 'email', title: 'Email (SendGrid)', icon: '📧', testable: true,
    description: 'Sin esto la aplicación NO envía correos: ni confirmaciones ni recordatorios de citas. Tendrás que avisar tú al cliente.',
    fields: [
      { key: 'sendgrid_api_key', label: 'API Key de SendGrid', type: 'password', placeholder: 'SG.xxxxxxxx' },
      { key: 'sendgrid_from_email', label: 'Email remitente verificado', type: 'email', placeholder: 'citas@miagencia.com' },
      { key: 'sendgrid_from_name', label: 'Nombre del remitente', type: 'text', placeholder: 'Mi Agencia' },
    ],
  },
]

function Field({ field, value, onChange }) {
  const cls = 'w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors'
  return (
    <div className={field.type === 'textarea' ? 'md:col-span-2 space-y-1.5' : 'space-y-1.5'}>
      <label className="flex items-center gap-1.5 text-white/60 text-xs font-medium">
        {field.label}
        {field.required && <span className="text-red-400 text-xs">*</span>}
        {value && <span className="text-emerald-400 text-xs">✓</span>}
      </label>
      {field.type === 'textarea' ? (
        <textarea rows={8} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || ''} className={cls} />
      ) : (
        <input type={field.type || 'text'} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || ''} className={cls} />
      )}
    </div>
  )
}

export default function SettingsPage() {
  const getCurrentPlan = useStore((s) => s.getCurrentPlan)
  const plan = getCurrentPlan()
  const [config, setConfig] = useState({})
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    api.get('/agency/config')
      .then((data) => setConfig(data || {}))
      .catch(() => toast.error('No se pudieron cargar los ajustes'))
      .finally(() => setLoaded(true))
  }, [])

  const update = (key, value) => setConfig((c) => ({ ...c, [key]: value }))

  const required = ['name', 'city', 'email', 'sendgrid_api_key', 'sendgrid_from_email']
  const completeness = Math.round((required.filter((k) => config[k]).length / required.length) * 100)

  async function save() {
    setSaving(true)
    try {
      await api.patch('/agency/config', config)
      setSaved(true)
      toast.success('Ajustes guardados')
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      toast.error(e.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function testEmail() {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await api.post('/agency/test-integration', { integration: 'email', config }))
    } catch (e) {
      setTestResult({ ok: false, msg: e.message || 'No se pudo probar' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 text-indigo-400 flex items-center justify-center"><Settings size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-ink font-syne">Ajustes</h1>
            <p className="text-sm text-muted">Datos y envío de correos de tu agencia</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-surface border border-border-secondary rounded-xl">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-500/10 text-indigo-400"><CreditCard size={16} /></div>
          <div>
            <p className="text-sm font-medium text-ink">Plan {plan.name}</p>
            <p className="text-xs text-muted">{plan.price}€/mes</p>
          </div>
          <a href="/pricing" className="ml-2 px-3 py-1.5 text-xs font-medium text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">Ver planes</a>
        </div>
      </div>

      <div className="bg-white/5 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/60 text-sm">Configuración completada</span>
          <span className={`text-sm font-semibold ${completeness >= 80 ? 'text-emerald-400' : completeness >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{completeness}%</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${completeness >= 80 ? 'bg-emerald-500' : completeness >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${completeness}%` }} />
        </div>
        {!config.sendgrid_api_key && loaded && (
          <p className="text-amber-300/80 text-xs mt-2">⚠️ Sin email configurado, la aplicación no envía confirmaciones ni recordatorios de citas.</p>
        )}
      </div>

      {SECTIONS.map((section) => (
        <div key={section.id} className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
            <span className="text-2xl">{section.icon}</span>
            <div className="flex-1">
              <p className="text-white font-medium text-sm">{section.title}</p>
              <p className="text-white/40 text-xs">{section.description}</p>
            </div>
            {section.testable && (
              <button onClick={testEmail} disabled={testing} className="px-3 py-1.5 border border-white/10 hover:border-white/20 text-white/50 hover:text-white text-xs rounded-lg transition-all disabled:opacity-50">
                {testing ? '...' : 'Probar'}
              </button>
            )}
          </div>
          <div className="p-6">
            {section.testable && testResult && (
              <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${testResult.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {section.fields.map((f) => <Field key={f.key} field={f} value={config[f.key]} onChange={(v) => update(f.key, v)} />)}
            </div>
          </div>
        </div>
      ))}

      <div className="flex justify-end">
        <button onClick={save} disabled={saving || !loaded} className={`px-6 py-3 rounded-xl text-sm font-medium transition-all ${saved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50'}`}>
          {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar ajustes'}
        </button>
      </div>
    </div>
  )
}
