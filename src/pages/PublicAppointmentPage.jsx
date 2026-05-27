import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, Clock, MapPin, Video, User, Phone, Mail, CheckCircle, AlertTriangle, RefreshCw, XCircle } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

export default function PublicAppointmentPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('') // 'scheduled', 'confirmed', 'cancelled', 'reschedule_requested'
  const [showReschedule, setShowReschedule] = useState(false)
  const [newStartsAt, setNewStartsAt] = useState('')
  const [newDuration, setNewDuration] = useState(30)
  const [submitting, setSubmitting] = useState(false)

  const fetchAppointmentDetails = () => {
    setLoading(true)
    fetch(`/api/public/appointment/${token}`)
      .then(res => {
        if (!res.ok) throw new Error('Cita no encontrada o enlace vencido.')
        return res.json()
      })
      .then(json => {
        setData(json)
        setStatus(json.appointment?.status || 'scheduled')
      })
      .catch(err => {
        setError(err.message)
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    if (token) {
      fetchAppointmentDetails()
    }
  }, [token])

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/appointment/${token}/confirm`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al confirmar la asistencia')
      
      setStatus('confirmed')
      toast.success('¡Asistencia confirmada con éxito! ✅')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async () => {
    if (!window.confirm('¿Seguro que deseas cancelar esta cita?')) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/appointment/${token}/cancel`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al cancelar la cita')

      setStatus('cancelled')
      toast.success('Cita cancelada correctamente ❌')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRescheduleSubmit = async (e) => {
    e.preventDefault()
    if (!newStartsAt) return

    if (new Date(newStartsAt) <= new Date()) {
      toast.error('La nueva fecha y hora deben ser futuras.')
      return
    }

    setSubmitting(true)
    const ends = new Date(new Date(newStartsAt).getTime() + newDuration * 60000).toISOString()

    try {
      const res = await fetch(`/api/public/appointment/${token}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          starts_at: new Date(newStartsAt).toISOString(),
          ends_at: ends,
          notes: 'Cambio propuesto por el cliente desde el portal público.'
        })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al solicitar cambio')

      setStatus('reschedule_requested')
      setShowReschedule(false)
      fetchAppointmentDetails() // Reload updated dates
      toast.success('Solicitud de cambio enviada correctamente 📅')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white font-sans p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <RefreshCw size={36} className="animate-spin text-pink-500" />
          <p className="text-sm text-white/50">Cargando los detalles de tu cita...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white font-sans p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md bg-white/[0.02] border border-white/10 rounded-3xl p-8 text-center space-y-4 shadow-2xl backdrop-blur-md"
        >
          <AlertTriangle size={48} className="text-amber-500 mx-auto" />
          <h2 className="text-xl font-bold font-syne">Enlace inválido o expirado</h2>
          <p className="text-xs text-white/50 leading-relaxed">No hemos podido encontrar los detalles de la cita solicitada. Por favor, asegúrate de que el enlace sea correcto o ponte en contacto con tu asesor inmobiliario.</p>
        </motion.div>
      </div>
    )
  }

  const { appointment, lead, agency } = data
  const formattedDate = new Date(appointment.starts_at).toLocaleString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  const isOnline = appointment.type === 'online'
  const durationMin = appointment.ends_at ? Math.round((new Date(appointment.ends_at) - new Date(appointment.starts_at)) / 60000) : 30
  const attendant = appointment.attendant_name || agency.appointment_attendant_name || 'Comercial asignado'

  return (
    <div className="min-h-screen bg-[#0a0a0f] bg-radial-gradient text-white font-sans flex items-center justify-center p-4">
      <Toaster position="top-center" />
      <div className="max-w-xl w-full space-y-6">
        
        {/* Branding header */}
        <div className="flex flex-col items-center text-center space-y-3">
          {agency?.logo_url ? (
            <img src={agency.logo_url} alt={agency.name} className="h-12 w-auto max-h-12 object-contain" />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500/20 to-indigo-500/20 flex items-center justify-center text-indigo-400 text-lg font-bold border border-white/5 shadow-inner">
              {agency?.name?.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-xs font-extrabold tracking-widest text-indigo-400 uppercase">{agency?.name || 'Agencia Inmobiliaria'}</h2>
            <p className="text-[10px] text-white/30 font-medium">Gestión de Citas Premium</p>
          </div>
        </div>

        {/* Portal Body Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden backdrop-blur-md"
        >
          {/* Curated visual border */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-pink-500 to-indigo-500" />

          {/* Main Appointment status header */}
          <div className="space-y-4 text-center">
            
            {status === 'confirmed' ? (
              <div className="space-y-2">
                <CheckCircle size={44} className="text-emerald-400 mx-auto" />
                <h3 className="text-lg font-bold font-syne text-emerald-400">¡Asistencia Confirmada!</h3>
                <p className="text-xs text-white/60">Tu cita está perfectamente programada y el equipo inmobiliario ha sido notificado.</p>
              </div>
            ) : status === 'cancelled' ? (
              <div className="space-y-2">
                <XCircle size={44} className="text-rose-400 mx-auto" />
                <h3 className="text-lg font-bold font-syne text-rose-400">Cita Cancelada</h3>
                <p className="text-xs text-white/60">Esta cita ha sido cancelada correctamente y ya no está activa.</p>
              </div>
            ) : status === 'reschedule_requested' ? (
              <div className="space-y-2">
                <Clock size={44} className="text-amber-400 mx-auto animate-pulse" />
                <h3 className="text-lg font-bold font-syne text-amber-400">Reprogramación Solicitada</h3>
                <p className="text-xs text-white/60">Hemos enviado tu solicitud con las nuevas fechas sugeridas al asesor.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Calendar size={44} className="text-indigo-400 mx-auto" />
                <h3 className="text-lg font-bold font-syne text-white">Detalles de tu Cita</h3>
                <p className="text-xs text-white/50">Por favor, revisa la fecha y confírmanos tu asistencia.</p>
              </div>
            )}

            {/* Structured details display */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-5 text-left space-y-4 mt-6">
              
              <div className="flex items-start gap-3">
                <Calendar size={18} className="text-pink-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Fecha y Hora</h4>
                  <p className="text-sm font-bold text-white capitalize mt-0.5">{formattedDate}</p>
                  <p className="text-[10px] text-white/40 mt-0.5">{durationMin} minutos de duración estimada</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                {isOnline ? (
                  <Video size={18} className="text-indigo-400 shrink-0 mt-0.5" />
                ) : (
                  <MapPin size={18} className="text-indigo-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                    {isOnline ? 'Cita Online' : 'Visita Presencial'}
                  </h4>
                  {isOnline ? (
                    appointment.online_url ? (
                      <p className="text-sm font-semibold mt-0.5">
                        <a href={appointment.online_url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                          Ingresar a la Videollamada
                        </a>
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-white mt-0.5">Google Meet / Enlace se enviará antes</p>
                    )
                  ) : (
                    <p className="text-sm font-semibold text-white mt-0.5">{appointment.location || agency.address || 'Oficina principal'}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <User size={18} className="text-pink-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Asesor asignado</h4>
                  <p className="text-sm font-bold text-white mt-0.5">{attendant}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive actions for scheduled appts */}
          {status !== 'cancelled' && !showReschedule && (
            <div className="mt-8 flex flex-col sm:flex-row gap-3 pt-6 border-t border-white/5">
              {status !== 'confirmed' && (
                <button
                  onClick={handleConfirm}
                  disabled={submitting}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-2xl transition-all text-xs font-bold shadow-lg shadow-indigo-600/10"
                >
                  <CheckCircle size={15} />
                  Confirmar Asistencia
                </button>
              )}
              
              <button
                onClick={() => setShowReschedule(true)}
                disabled={submitting}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white rounded-2xl transition-all text-xs font-bold"
              >
                <RefreshCw size={14} />
                Solicitar Cambio
              </button>

              <button
                onClick={handleCancel}
                disabled={submitting}
                className="inline-flex items-center justify-center p-3.5 border border-rose-500/20 hover:bg-rose-500/10 text-rose-400 hover:text-rose-300 disabled:opacity-50 rounded-2xl transition-all text-xs font-bold"
                title="Cancelar Cita"
              >
                <XCircle size={16} />
              </button>
            </div>
          )}

          {/* Reschedule inline Form */}
          <AnimatePresence>
            {showReschedule && (
              <motion.form
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                onSubmit={handleRescheduleSubmit}
                className="mt-6 pt-6 border-t border-white/5 space-y-4 overflow-hidden"
              >
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <RefreshCw size={14} className="text-amber-400" />
                  Sugerir Nueva Fecha y Hora
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block mb-1">Nueva Fecha/Hora *</label>
                    <input
                      type="datetime-local"
                      required
                      value={newStartsAt}
                      onChange={e => setNewStartsAt(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block mb-1">Duración estimada</label>
                    <select
                      value={newDuration}
                      onChange={e => setNewDuration(Number(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white cursor-pointer focus:outline-none focus:border-indigo-500"
                    >
                      <option value={30}>30 minutos</option>
                      <option value={45}>45 minutos</option>
                      <option value={60}>1 hora</option>
                      <option value={90}>1.5 horas</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowReschedule(false)}
                    className="flex-1 px-4 py-2.5 text-xs font-bold text-white/60 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                  >
                    Volver
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !newStartsAt}
                    className="flex-1 px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl transition-all shadow-md shadow-indigo-600/10"
                  >
                    {submitting ? 'Enviando...' : 'Enviar Sugerencia'}
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Agency contact details footer */}
        <div className="flex justify-center gap-6 text-[10px] text-white/30 font-medium">
          {agency?.phone && (
            <a href={`tel:${agency.phone}`} className="flex items-center gap-1 hover:text-white/60 transition-colors">
              <Phone size={10} />
              <span>{agency.phone}</span>
            </a>
          )}
          {agency?.email && (
            <a href={`mailto:${agency.email}`} className="flex items-center gap-1 hover:text-white/60 transition-colors">
              <Mail size={10} />
              <span>{agency.email}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
