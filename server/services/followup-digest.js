// InmoFollow — resumen diario por email ("hoy tienes N contactos que atender").
// Una vez al día por usuario, a primera hora (hora local de la agencia), de lunes a sábado.
// Seguro con varias instancias: cada envío se "reserva" antes en followup_digest_log.
import { all, get, run } from '../db/db.js';
import { EmailService } from './email.js';
import { computeToday } from '../routes/followup.js';

const START_HOUR = parseInt(process.env.FOLLOWUP_DIGEST_HOUR || '8', 10);
const END_HOUR = START_HOUR + 4; // ventana de recuperación si el servidor estuvo caído
const MAX_PER_TICK = 200;

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildDigestEmail({ userName, data, appUrl }) {
  const s = data.summary;
  const items = [...data.overdue, ...data.today, ...data.abandoned].slice(0, 8);
  const subject = s.attention_total === 1 ? 'Hoy: 1 contacto necesita atención' : `Hoy: ${s.attention_total} contactos necesitan atención`;
  const rows = items.map((i) => `
    <tr><td style="padding:10px 0;border-bottom:1px solid #eee">
      <strong>${escapeHtml(i.lead.name)}</strong>${i.property?.title ? ` <span style="color:#666">· ${escapeHtml(i.property.title)}</span>` : ''}<br>
      <span style="color:#555;font-size:13px">${escapeHtml(i.reasons[0] || '')}</span>
    </td></tr>`).join('');
  const link = `${String(appUrl || '').replace(/\/$/, '')}/seguimiento`;
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:16px">
    <h2 style="margin:0 0 4px">Buenos días${userName ? `, ${escapeHtml(String(userName).split(' ')[0])}` : ''}</h2>
    <p style="margin:0 0 16px;color:#444">${s.overdue} vencidos · ${s.today} para hoy · ${s.abandoned} sin próximo paso</p>
    <table width="100%" cellspacing="0" cellpadding="0">${rows}</table>
    ${s.attention_total > items.length ? `<p style="color:#666;font-size:13px">y ${s.attention_total - items.length} más…</p>` : ''}
    <p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#6366f1;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir seguimiento de hoy</a></p>
    <p style="color:#888;font-size:12px">Puedes desactivar este resumen en la pantalla de Seguimiento.</p>
  </body></html>`;
  return { subject, html };
}

/**
 * Ejecuta una pasada. `send` se puede inyectar (tests). `ignoreWindow` salta la franja horaria.
 * Devuelve { sent, skipped, failed }.
 */
export async function runDigestOnce({ appUrl, send, ignoreWindow = false } = {}) {
  const out = { sent: 0, skipped: 0, failed: 0 };
  const sender = send || (async (msg) => {
    const svc = new EmailService({ sendgridKey: process.env.SENDGRID_API_KEY, fromEmail: process.env.FOLLOWUP_FROM_EMAIL, agencyName: 'InmoFollow' });
    const r = await svc.sendEmail(msg);
    if (r.mock || !r.success) throw new Error(r.error || 'sin proveedor de email');
    return r;
  });
  if (!send && !process.env.SENDGRID_API_KEY) return out; // sin proveedor no se intenta nada

  const rows = await all(
    `SELECT u.id AS user_id, u.email, u.name, u.role, u.agency_id,
            COALESCE(z.name, 'Europe/Madrid') AS tz,
            (NOW() AT TIME ZONE COALESCE(z.name, 'Europe/Madrid'))::date AS local_day
     FROM users u
     JOIN agencies a ON a.id = u.agency_id
     LEFT JOIN pg_timezone_names z ON z.name = a.timezone
     WHERE u.active = true AND u.followup_digest IS NOT FALSE AND u.email IS NOT NULL
       AND a.plan_status IN ('trialing','active','past_due')
       AND NOT EXISTS (SELECT 1 FROM followup_digest_log d WHERE d.user_id = u.id
                       AND d.sent_on = (NOW() AT TIME ZONE COALESCE(z.name, 'Europe/Madrid'))::date)
       ${ignoreWindow ? '' : `AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE COALESCE(z.name, 'Europe/Madrid'))) >= ${START_HOUR}
       AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE COALESCE(z.name, 'Europe/Madrid'))) < ${END_HOUR}
       AND EXTRACT(DOW FROM (NOW() AT TIME ZONE COALESCE(z.name, 'Europe/Madrid'))) <> 0`}
     ORDER BY u.id LIMIT ${MAX_PER_TICK}`
  );

  for (const r of rows) {
    // Reserva: si otra instancia ya la tomó, no hacemos nada
    const claim = await get(
      `INSERT INTO followup_digest_log (user_id, sent_on, sent) VALUES (@u, @d, false) ON CONFLICT DO NOTHING RETURNING user_id`,
      { u: r.user_id, d: r.local_day }
    );
    if (!claim) continue;
    try {
      const admin = ['admin', 'manager'].includes(r.role);
      const data = await computeToday({ agencyId: r.agency_id, uid: r.user_id, mine: !admin });
      if (data.summary.attention_total === 0) { out.skipped++; continue; } // queda reservado: hoy no hay nada que avisar
      const { subject, html } = buildDigestEmail({ userName: r.name, data, appUrl });
      await sender({ to: r.email, subject, html });
      await run('UPDATE followup_digest_log SET sent = true WHERE user_id = @u AND sent_on = @d', { u: r.user_id, d: r.local_day });
      out.sent++;
    } catch (e) {
      out.failed++;
      console.error('[followup-digest] fallo con', r.user_id, e.message);
      await run('DELETE FROM followup_digest_log WHERE user_id = @u AND sent_on = @d', { u: r.user_id, d: r.local_day }).catch(() => {});
    }
  }
  return out;
}

export function startDigestWorker({ intervalMs = 15 * 60 * 1000, appUrl } = {}) {
  const tick = () => runDigestOnce({ appUrl }).then((r) => { if (r.sent || r.failed) console.log('[followup-digest]', r); }).catch((e) => console.error('[followup-digest] error', e.message));
  setTimeout(tick, 30_000);
  return setInterval(tick, intervalMs);
}
