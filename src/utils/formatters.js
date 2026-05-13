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
    new: 'Nuevo',
    contacted: 'Contactado',
    qualified: 'Calificado',
    proposal: 'En propuesta',
    negotiation: 'En negociación',
    closed_won: 'Ganado',
    closed_lost: 'Perdido',
    follow_up: 'Seguimiento',
    inactive: 'Inactivo',
  }
  return labels[status] || status
}

export function getStatusColor(status) {
  const colors = {
    new: 'bg-blue-100 text-blue-400 border-blue-200',
    contacted: 'bg-gold-50 text-gold-400 border-gold-200',
    qualified: 'bg-ok/10 text-ok border-ok/20',
    proposal: 'bg-warn/10 text-warn border-warn/20',
    negotiation: 'bg-err/10 text-err border-err/20',
    closed_won: 'bg-ok/10 text-ok border-ok/20',
    closed_lost: 'bg-err/10 text-err border-err/20',
    follow_up: 'bg-blue-100 text-blue-400 border-blue-200',
    inactive: 'bg-muted/10 text-muted border-muted/20',
  }
  return colors[status] || 'bg-muted/10 text-muted border-muted/20'
}

export function getStatusDot(status) {
  const colors = {
    new: 'bg-blue-300',
    contacted: 'bg-gold-300',
    qualified: 'bg-ok',
    proposal: 'bg-warn',
    negotiation: 'bg-err',
    closed_won: 'bg-ok',
    closed_lost: 'bg-err',
    follow_up: 'bg-blue-300',
    inactive: 'bg-muted',
  }
  return colors[status] || 'bg-muted'
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
