import { all, get, run } from '../db/db.js'

/**
 * Reparto de leads entre comerciales: gana el que tiene menos leads abiertos
 * (desempate estable por id). Solo actúa si la agencia tiene activado el
 * reparto automático y el lead no tiene ya responsable.
 * Devuelve el id del comercial asignado o null.
 */
export async function assignLead(agencyId, leadId) {
  const agency = await get('SELECT auto_assign FROM agencies WHERE id = @id', { id: agencyId })
  if (agency && agency.auto_assign === false) return null

  const lead = await get('SELECT assigned_to FROM leads WHERE id = @id AND agency_id = @aid', { id: leadId, aid: agencyId })
  if (!lead || lead.assigned_to) return null

  const users = await all(
    `SELECT u.id,
            (SELECT COUNT(*) FROM leads l
              WHERE l.assigned_to = u.id AND l.status NOT IN ('cerrado','perdido')) AS open_leads
     FROM users u
     WHERE u.agency_id = @aid AND u.role = 'comercial' AND u.active = true
     ORDER BY open_leads ASC, u.id ASC`,
    { aid: agencyId }
  )
  if (!users.length) return null

  await run('UPDATE leads SET assigned_to = @uid, updated_at = NOW() WHERE id = @id AND agency_id = @aid', {
    uid: users[0].id, id: leadId, aid: agencyId,
  })
  return users[0].id
}
