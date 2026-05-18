import { v4 as uuidv4 } from 'uuid'
import { get, run } from '../db/db.js'

function currentPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function incrementUsage(agencyId, counter, amount = 1) {
  const period = currentPeriod()
  const existing = get(
    'SELECT id, value FROM usage_monthly WHERE agency_id = @aid AND period = @period AND counter = @counter',
    { aid: agencyId, period, counter }
  )
  if (existing) {
    run(
      `UPDATE usage_monthly SET value = value + @amount, updated_at = datetime('now')
       WHERE id = @id`,
      { id: existing.id, amount }
    )
  } else {
    run(
      `INSERT INTO usage_monthly (id, agency_id, period, counter, value, created_at, updated_at)
       VALUES (@id, @aid, @period, @counter, @amount, datetime('now'), datetime('now'))`,
      { id: uuidv4(), aid: agencyId, period, counter, amount }
    )
  }
}

export function getUsage(agencyId, counter) {
  const period = currentPeriod()
  const row = get(
    'SELECT value FROM usage_monthly WHERE agency_id = @aid AND period = @period AND counter = @counter',
    { aid: agencyId, period, counter }
  )
  return row?.value || 0
}
