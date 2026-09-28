// ── Agente "financiero" sin IA ──────────────────────────────────────────────
// Antes: se le pedía al LLM que "calculara" la cuota hipotecaria. Un modelo de
// lenguaje no es una calculadora — puede acertar o puede inventar un número
// creíble pero incorrecto, y esto se manda a un cliente real como si fuera un
// dato financiero. Ahora es aritmética determinista (sistema de amortización
// francés, el estándar en hipotecas españolas), siempre con el mismo
// resultado para los mismos datos y marcado como orientativo.
//
// Los supuestos (interés, plazo, entrada) son configurables por variable de
// entorno porque cambian con el mercado — revísalos de vez en cuando.
const DEFAULTS = {
  tinPercent: Number(process.env.MORTGAGE_DEFAULT_TIN ?? 3.2), // % anual, hipoteca fija orientativa
  years: Number(process.env.MORTGAGE_DEFAULT_YEARS ?? 25),
  downPaymentPercent: Number(process.env.MORTGAGE_DOWN_PAYMENT_PCT ?? 20), // + ~10-12% de gastos, no incluidos
}

export function calculateMortgage({ price, downPaymentPercent, tinPercent, years }) {
  const p = Number(price)
  if (!p || p <= 0) return null
  const dp = downPaymentPercent ?? DEFAULTS.downPaymentPercent
  const rate = tinPercent ?? DEFAULTS.tinPercent
  const n = Math.round((years ?? DEFAULTS.years) * 12)

  const principal = p * (1 - dp / 100)
  const downPayment = p - principal
  const monthlyRate = rate / 100 / 12
  const monthlyPayment = monthlyRate === 0
    ? principal / n
    : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n))
  const totalPaid = monthlyPayment * n
  const totalInterest = totalPaid - principal

  return {
    price: round2(p),
    downPaymentPercent: dp,
    downPayment: round2(downPayment),
    principal: round2(principal),
    tinPercent: rate,
    years: years ?? DEFAULTS.years,
    monthlyPayment: round2(monthlyPayment),
    totalInterest: round2(totalInterest),
    totalPaid: round2(totalPaid),
  }
}

function round2(n) { return Math.round(n * 100) / 100 }
function eur(n) { return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) }

/** Mensaje listo para enviar al lead a partir del cálculo. */
export function formatMortgageMessage(calc, leadName) {
  if (!calc) {
    return `Hola${leadName ? ` ${leadName}` : ''}, para calcular la cuota necesito el precio aproximado de la vivienda que te interesa. ¿Me lo puedes indicar?`
  }
  return [
    `Hola${leadName ? ` ${leadName}` : ''}, aquí tienes una simulación orientativa:`,
    ``,
    `Precio: ${eur(calc.price)}`,
    `Entrada estimada (${calc.downPaymentPercent}%): ${eur(calc.downPayment)}`,
    `Importe a financiar: ${eur(calc.principal)}`,
    `Plazo: ${calc.years} años · Interés estimado: ${calc.tinPercent}% TIN`,
    ``,
    `Cuota mensual estimada: ${eur(calc.monthlyPayment)}`,
    `Intereses totales estimados: ${eur(calc.totalInterest)}`,
    ``,
    `⚠️ Es una estimación orientativa (no incluye gastos de compraventa, que suelen ser un 10-12% adicional). El importe real depende del banco y de tu perfil — te recomiendo contrastarlo con tu entidad o con un bróker hipotecario.`,
  ].join('\n')
}

/** Extrae un precio de vivienda del contexto del lead (payload de la petición, o su presupuesto). */
export function extractPriceFromContext(ctx, payload) {
  const fromPayload = Number(payload?.price ?? payload?.property_price ?? payload?.budget)
  if (fromPayload > 0) return fromPayload
  const fromLead = Number(ctx?.budget_max ?? ctx?.budget)
  return fromLead > 0 ? fromLead : null
}

// ── Agente "notificador" sin IA ─────────────────────────────────────────────
// Es un aviso interno para el equipo, no un mensaje al cliente: no aporta
// nada pedirle "creatividad" a un LLM para esto, solo coste y latencia.
export function buildNotificationMessage(ctx, payload = {}) {
  const parts = [
    payload?.title || `Aviso sobre ${ctx.lead_name || 'un lead'}`,
    `Lead: ${ctx.lead_name || '—'} · Tel: ${ctx.phone || '—'}`,
    `Etapa: ${ctx.stage_label || '—'} · Score: ${ctx.score ?? '—'}/100`,
  ]
  if (payload?.reason) parts.push(`Motivo: ${payload.reason}`)
  if (ctx.lead_summary) parts.push(`Resumen: ${ctx.lead_summary}`)
  return parts.join('\n')
}
