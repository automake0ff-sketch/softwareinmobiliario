import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'

export function formatCurrency(n) {
  if (n == null || isNaN(n)) return '€0'
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatDate(date) {
  if (!date) return ''
  const d = new Date(date)
  if (isToday(d)) return formatDistanceToNow(d, { addSuffix: true, locale: es })
  if (isYesterday(d)) return 'Ayer'
  if (d.getFullYear() === new Date().getFullYear()) {
    return format(d, 'd MMM', { locale: es })
  }
  return format(d, 'd MMM yyyy', { locale: es })
}

export function formatFullDate(date) {
  if (!date) return ''
  return format(new Date(date), 'd MMM yyyy, HH:mm', { locale: es })
}

export function getScoreColor(score) {
  if (score == null) return 'text-muted'
  if (score >= 80) return 'text-ok'
  if (score >= 50) return 'text-warn'
  return 'text-err'
}

export function getScoreBg(score) {
  if (score == null) return 'bg-muted/10'
  if (score >= 80) return 'bg-ok/10'
  if (score >= 50) return 'bg-warn/10'
  return 'bg-err/10'
}

export function getScoreLabel(score) {
  if (score == null) return 'Sin calificar'
  if (score >= 90) return 'Excelente'
  if (score >= 80) return 'Muy bueno'
  if (score >= 65) return 'Bueno'
  if (score >= 50) return 'Regular'
  if (score >= 30) return 'Bajo'
  return 'Muy bajo'
}

export function getStatusLabel(status) {
  const labels = {
    nuevo: 'Nuevo',
    contactado: 'Contactado',
    interesado: 'Interesado',
    visita_agendada: 'Visita agendada',
    negociacion: 'En negociación',
    reserva: 'Reserva',
    cerrado: 'Cerrado',
    perdido: 'Perdido',
    archivo: 'Archivado',
  }
  return labels[status] || status || 'Nuevo'
}

export function getStatusColor(status) {
  const colors = {
    nuevo: 'bg-blue-100 text-blue-500 border-blue-200',
    contactado: 'bg-indigo-100 text-indigo-500 border-indigo-200',
    interesado: 'bg-purple-100 text-purple-500 border-purple-200',
    visita_agendada: 'bg-pink-100 text-pink-500 border-pink-200',
    negociacion: 'bg-orange-100 text-orange-500 border-orange-200',
    reserva: 'bg-amber-100 text-amber-500 border-amber-200',
    cerrado: 'bg-emerald-100 text-emerald-500 border-emerald-200',
    perdido: 'bg-red-100 text-red-500 border-red-200',
    archivo: 'bg-gray-100 text-gray-500 border-gray-200',
  }
  return colors[status] || 'bg-gray-100 text-gray-500 border-gray-200'
}

export function getStatusDot(status) {
  const colors = {
    nuevo: 'bg-blue-400',
    contactado: 'bg-indigo-400',
    interesado: 'bg-purple-400',
    visita_agendada: 'bg-pink-400',
    negociacion: 'bg-orange-400',
    reserva: 'bg-amber-400',
    cerrado: 'bg-emerald-400',
    perdido: 'bg-red-400',
    archivo: 'bg-gray-400',
  }
  return colors[status] || 'bg-gray-400'
}

export function getInitials(name) {
  if (!name) return '??'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export function getPropertyTypeLabel(type) {
  const labels = {
    apartment: 'Apartamento',
    house: 'Casa',
    penthouse: 'Ático',
    studio: 'Estudio',
    loft: 'Loft',
    duplex: 'Dúplex',
    townhouse: 'Adosado',
    villa: 'Villa',
    land: 'Terreno',
    commercial: 'Local comercial',
    office: 'Oficina',
    garage: 'Garaje',
    warehouse: 'Nave',
  }
  return labels[type] || type
}

export function getOperationLabel(op) {
  const labels = {
    sale: 'Venta',
    rent: 'Alquiler',
    transfer: 'Traspaso',
    vacation: 'Alquiler vacacional',
  }
  return labels[op] || op
}
