// Lector de emails de aviso de leads de portales inmobiliarios (Idealista, Fotocasa…).
//
// IMPORTANTE: los portales no publican un formato estable de estos emails y
// pueden cambiarlo. Por eso el parser es tolerante: primero busca etiquetas
// habituales ("Nombre:", "Teléfono:", "Email:", "Mensaje:", "Referencia:") y si
// no las encuentra cae a patrones genéricos (teléfono español, email). Todo lo
// que llega se guarda en portal_inbound_log para poder ajustar el parser con
// emails reales de cada agencia.

const PORTALS = [
  { id: 'idealista', re: /idealista/i },
  { id: 'fotocasa', re: /fotocasa/i },
  { id: 'habitaclia', re: /habitaclia/i },
  { id: 'pisos.com', re: /pisos\.com/i },
]

export function htmlToText(html = '') {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

export function detectPortal({ from = '', subject = '', text = '' }) {
  const hay = `${from}\n${subject}\n${text.slice(0, 600)}`
  return PORTALS.find(p => p.re.test(hay))?.id || null
}

const PHONE_RE = /(?:\+?34[\s.-]?)?([6789](?:[\s.-]?\d){8})\b/
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
// Correos que NO son del lead (remitente del portal, no-reply…)
const NOISE_EMAIL_RE = /(no-?reply|noreply|donotreply|idealista|fotocasa|habitaclia|pisos\.com|mailer|notificaciones?)@/i

function labelValue(text, labels) {
  const re = new RegExp(`(?:^|\\n)\\s*(?:${labels.join('|')})\\s*[:：]\\s*(?<v>.+)`, 'i')
  const m = text.match(re)
  return m ? m.groups.v.trim() : null
}

export function normalizePhone(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/[^\d]/g, '')
  const local = digits.startsWith('34') && digits.length === 11 ? digits.slice(2) : digits
  return /^[6789]\d{8}$/.test(local) ? local : null
}

export function parsePortalEmail({ from = '', subject = '', text = '', html = '' }) {
  const body = text && text.trim() ? text : htmlToText(html)
  const portal = detectPortal({ from, subject, text: body })

  let name = labelValue(body, ['nombre', 'nombre y apellidos', 'contacto', 'name'])
  let phoneRaw = labelValue(body, ['tel[eé]fono', 'm[oó]vil', 'tel', 'phone'])
  let email = labelValue(body, ['e-?mail', 'correo(?: electr[oó]nico)?'])
  const message = labelValue(body, ['mensaje', 'comentarios?', 'consulta', 'message'])
  const reference = labelValue(body, ['referencia', 'ref\\.?', 'anuncio', 'c[oó]digo(?: de anuncio)?'])

  let phone = normalizePhone(phoneRaw)
  if (!phone) {
    const m = body.match(PHONE_RE)
    phone = m ? normalizePhone(m[1]) : null
  }
  if (email) {
    const m = email.match(EMAIL_RE)
    email = m ? m[0] : null
  }
  if (!email) {
    const all = body.match(new RegExp(EMAIL_RE.source, 'gi')) || []
    email = all.find(e => !NOISE_EMAIL_RE.test(e)) || null
  }
  if (name) name = name.replace(/[<>]/g, '').slice(0, 120)

  return {
    portal,
    name: name || null,
    phone,
    email: email ? email.toLowerCase() : null,
    message: message ? message.slice(0, 1000) : null,
    reference: reference ? reference.slice(0, 80) : null,
    // Sin teléfono ni email no hay forma de contactar: no se crea lead.
    usable: Boolean(phone || email),
  }
}
