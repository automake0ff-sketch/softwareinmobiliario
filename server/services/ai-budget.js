import { AsyncLocalStorage } from 'node:async_hooks'
import { get } from '../db/db.js'
import { incrementUsage, getUsage } from './usage-counter.js'

// ── Contexto de agencia ─────────────────────────────────────────────────────
// Permite saber a qué agencia imputar cada llamada a la IA sin tener que
// pasar agencyId por las ~15 llamadas a callOpenRouter. Se fija en el
// middleware de auth y en los webhooks (donde se identifica la agencia).
const als = new AsyncLocalStorage()

export function setAgencyContext(agencyId) {
  if (agencyId) als.enterWith({ agencyId })
}
export function runWithAgency(agencyId, fn) {
  return als.run({ agencyId }, fn)
}
export function currentAgencyId() {
  return als.getStore()?.agencyId || null
}

// ── Precios estimados (USD por 1M de tokens: [entrada, salida]) ─────────────
// Son estimaciones para controlar el gasto, no facturación. Revísalas en
// https://openrouter.ai/models cuando cambien. Modelo desconocido -> tarifa
// de gpt-4o (conservadora).
const PRICES = {
  'openai/gpt-4o-mini': [0.15, 0.6],
  'openai/gpt-4o': [2.5, 10],
  'google/gemini-flash-1.5': [0.075, 0.3],
}
const DEFAULT_PRICE = [2.5, 10]

// ── Presupuesto mensual de IA por plan (USD) ────────────────────────────────
// Configurable por entorno. Valores por defecto pensados para que el Starter
// (incluido el precio de demo de 25€) no pierda dinero.
const BUDGET_USD = {
  starter: Number(process.env.AI_BUDGET_STARTER_USD ?? 12),
  profesional: Number(process.env.AI_BUDGET_PROFESIONAL_USD ?? 45),
  agencia: Number(process.env.AI_BUDGET_AGENCIA_USD ?? 150),
}
// Mensajes de WhatsApp proactivos (seguimientos, avisos) al mes por plan.
const PROACTIVE_WA_CAP = {
  starter: Number(process.env.WA_PROACTIVE_STARTER ?? 150),
  profesional: Number(process.env.WA_PROACTIVE_PROFESIONAL ?? 1000),
  agencia: Number(process.env.WA_PROACTIVE_AGENCIA ?? 5000),
}

const COUNTER_COST = 'ai_cost_microusd' // 1 USD = 1_000_000
const COUNTER_TOKENS = 'ai_tokens'
const COUNTER_WA = 'wa_proactive'

export class AIBudgetExceededError extends Error {
  constructor(msg) {
    super(msg)
    this.name = 'AIBudgetExceededError'
    this.code = 'AI_BUDGET_EXCEEDED'
  }
}

async function planOf(agencyId) {
  const row = await get('SELECT plan FROM agencies WHERE id = @id', { id: agencyId })
  return BUDGET_USD[row?.plan] !== undefined ? row.plan : 'starter'
}

/**
 * Decide qué modelo usar realmente según plan y gasto del mes.
 *  - Starter: los modelos "smart" se sirven con el modelo barato.
 *  - Superado el presupuesto: todo pasa al modelo barato.
 *  - Superado 2x el presupuesto: se bloquea (evita facturas sorpresa).
 * Sin agencia identificada (tareas internas) no se aplica nada.
 */
export async function resolveModel(requested, agencyId = currentAgencyId()) {
  if (!agencyId) return { model: requested, degraded: false }
  try {
    const plan = await planOf(agencyId)
    const budgetMicro = BUDGET_USD[plan] * 1_000_000
    const spent = await getUsage(agencyId, COUNTER_COST)

    if (spent >= budgetMicro * 2) {
      throw new AIBudgetExceededError(
        'Se ha alcanzado el límite mensual de uso de IA de tu plan. Amplía el plan o espera al próximo ciclo.'
      )
    }
    let model = requested
    let degraded = false
    if (plan === 'starter' && (requested === 'smart' || requested === 'reason')) {
      model = 'fast'
      degraded = true
    }
    if (spent >= budgetMicro && model !== 'fast') {
      model = 'fast'
      degraded = true
    }
    if (spent >= budgetMicro * 0.8) {
      console.warn(`[AI-BUDGET] agencia ${agencyId} (${plan}) al ${Math.round((spent / budgetMicro) * 100)}% del presupuesto de IA`)
    }
    return { model, degraded }
  } catch (e) {
    if (e instanceof AIBudgetExceededError) throw e
    console.error('[AI-BUDGET] resolveModel falló, se usa el modelo pedido:', e.message)
    return { model: requested, degraded: false }
  }
}

/** Registra tokens y coste estimado de una llamada. Nunca lanza. */
export async function recordUsage(modelName, usage, agencyId = currentAgencyId()) {
  if (!agencyId || !usage) return
  try {
    const inTok = Number(usage.prompt_tokens || 0)
    const outTok = Number(usage.completion_tokens || 0)
    const [pin, pout] = PRICES[modelName] || DEFAULT_PRICE
    const micro = Math.round(inTok * pin + outTok * pout) // USD/1M tok == micro-USD/tok
    await incrementUsage(agencyId, COUNTER_COST, micro)
    await incrementUsage(agencyId, COUNTER_TOKENS, inTok + outTok)
  } catch (e) {
    console.error('[AI-BUDGET] recordUsage falló:', e.message)
  }
}

/** Devuelve true si se puede enviar un WhatsApp proactivo y lo contabiliza. */
export async function allowProactiveWhatsApp(agencyId) {
  if (!agencyId) return true
  try {
    const plan = await planOf(agencyId)
    const used = await getUsage(agencyId, COUNTER_WA)
    if (used >= PROACTIVE_WA_CAP[plan]) {
      console.warn(`[AI-BUDGET] agencia ${agencyId} (${plan}) alcanzó el tope de WhatsApp proactivo (${PROACTIVE_WA_CAP[plan]}/mes)`)
      return false
    }
    await incrementUsage(agencyId, COUNTER_WA, 1)
    return true
  } catch (e) {
    console.error('[AI-BUDGET] allowProactiveWhatsApp falló, se permite:', e.message)
    return true
  }
}

/** Resumen de consumo del mes para mostrar en el panel. */
export async function getAIUsageSummary(agencyId) {
  const plan = await planOf(agencyId)
  const [cost, tokens, wa] = await Promise.all([
    getUsage(agencyId, COUNTER_COST),
    getUsage(agencyId, COUNTER_TOKENS),
    getUsage(agencyId, COUNTER_WA),
  ])
  return {
    plan,
    aiCostUsd: cost / 1_000_000,
    aiBudgetUsd: BUDGET_USD[plan],
    aiTokens: tokens,
    proactiveWhatsApp: wa,
    proactiveWhatsAppCap: PROACTIVE_WA_CAP[plan],
  }
}
