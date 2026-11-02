// InmoFollow — motor de seguimiento (lógica pura: sin BD ni red).
// Todo lo que está aquí es determinista, gratuito y testeable. La IA (opcional) se
// apoya en este módulo y, si falla o no está configurada, esto es lo que se usa.

export const OPEN_STATUSES = ['nuevo', 'contactado', 'interesado', 'visita_agendada', 'negociacion', 'reserva'];

// Días sin contacto a partir de los cuales un lead sin seguimiento se considera "abandonado"
export const STALE_DAYS = {
  nuevo: 1,
  contactado: 4,
  interesado: 5,
  visita_agendada: 3,
  negociacion: 3,
  reserva: 2,
};

// ── Reglas de alerta configurables ────────────────────────────────────
export const DEFAULT_SETTINGS = { stale_days: { ...STALE_DAYS }, inactive_days: 30, visit_followup_days: 1 };

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** Mezcla la fila guardada con los valores por defecto, descartando cualquier valor no válido. */
export function mergeSettings(row = {}) {
  let stored = row?.stale_days;
  if (typeof stored === 'string') { try { stored = JSON.parse(stored); } catch { stored = {}; } }
  const stale = { ...STALE_DAYS };
  for (const k of Object.keys(STALE_DAYS)) stale[k] = clampInt(stored?.[k], 1, 120, STALE_DAYS[k]);
  return {
    stale_days: stale,
    inactive_days: clampInt(row?.inactive_days, 7, 365, DEFAULT_SETTINGS.inactive_days),
    visit_followup_days: clampInt(row?.visit_followup_days, 0, 30, DEFAULT_SETTINGS.visit_followup_days),
  };
}

export const ALERT_CLASSES = {
  inmediata: 'Atención inmediata',
  recomendada: 'Seguimiento recomendado',
  sin_actividad: 'Sin actividad',
  pendiente_confirmar: 'Pendiente de confirmar',
};

export const GOALS = {
  first_contact: 'Primer contacto',
  follow_up: 'Seguimiento',
  visit_proposal: 'Proponer visita',
  post_visit: 'Después de una visita',
  reactivation: 'Reactivar contacto',
  seller_prospecting: 'Captar propietario',
  price_update: 'Cambio de precio',
};
export const CHANNELS = ['whatsapp', 'call', 'email', 'visit', 'other'];
export const OUTCOMES = ['answered', 'no_answer', 'interested', 'not_interested', 'visit_scheduled', 'other'];
export const TONES = ['cercano', 'formal'];

const DAY_MS = 86400000;

export function daysBetween(from, to = new Date()) {
  if (!from) return null;
  const a = new Date(from).getTime();
  if (Number.isNaN(a)) return null;
  return Math.floor((to.getTime() - a) / DAY_MS);
}

// ───────────────────────── Prioridad ─────────────────────────

const STATUS_BASE = { nuevo: 40, contactado: 30, interesado: 45, visita_agendada: 50, negociacion: 60, reserva: 65 };

const STATUS_LABEL = {
  nuevo: 'Nuevo', contactado: 'Contactado', interesado: 'Interesado',
  visita_agendada: 'Visita agendada', negociacion: 'Negociación', reserva: 'Reserva', cerrado: 'Cerrado',
};
export const statusLabel = (s) => STATUS_LABEL[s] || s;

/**
 * Puntúa un elemento de la lista diaria (0-100) y explica el motivo en lenguaje llano.
 * item: { lead, daysSinceContact, daysOverdue, snoozeCount, kind }
 */
export function scoreItem({ lead, daysSinceContact, daysOverdue = 0, snoozeCount = 0, kind = 'followup' }) {
  let score = STATUS_BASE[lead.status] ?? 30;
  const reasons = [];

  if (kind === 'followup') {
    if (daysOverdue > 0) {
      score += Math.min(daysOverdue * 6, 24);
      reasons.push(daysOverdue === 1 ? 'Seguimiento vencido desde ayer' : `Seguimiento vencido hace ${daysOverdue} días`);
    } else {
      reasons.push('Seguimiento programado para hoy');
    }
  } else if (kind === 'visit_no_followup') {
    reasons.push('Visita realizada sin contacto posterior');
    score += 12;
  } else if (kind === 'visit_unconfirmed') {
    reasons.push('Visita próxima sin confirmar');
  } else {
    reasons.push(
      lead.status === 'nuevo' && (daysSinceContact ?? 0) <= 1
        ? 'Lead nuevo sin contactar'
        : `Sin contacto desde hace ${daysSinceContact} días y sin próximo paso`
    );
  }

  if (daysSinceContact != null) score += Math.min(Math.max(daysSinceContact, 0) * 2, 20);
  if (lead.ia_score) score += Math.min(Math.round(Number(lead.ia_score) / 10), 10);
  if (lead.priority === 'alta') score += 10; else if (lead.priority === 'baja') score -= 5;
  if (String(lead.urgency || '').toLowerCase().startsWith('alta')) { score += 8; reasons.push('Urgencia alta'); }
  if (lead.status === 'negociacion' || lead.status === 'reserva') reasons.push('Operación avanzada: no dejes que se enfríe');
  if (snoozeCount >= 2) { score += 4; reasons.push(`Pospuesto ${snoozeCount} veces`); }

  return { priority: Math.min(Math.round(score), 100), reasons };
}

const CLOSE_TO_DEAL = ['negociacion', 'reserva'];

/**
 * Clasifica un elemento de la agenda con REGLAS objetivas (nunca con IA).
 * Devuelve { alert_class, rule } donde rule identifica la regla que se ha cumplido.
 */
export function classifyAlert({ kind, lead, daysOverdue = 0, daysSinceContact = 0, settings = DEFAULT_SETTINGS }) {
  const high = lead.priority === 'alta';
  const deal = CLOSE_TO_DEAL.includes(lead.status);
  if (kind === 'visit_unconfirmed') return { alert_class: 'pendiente_confirmar', rule: 'visita_sin_confirmar' };
  if (kind === 'visit_no_followup') return { alert_class: 'inmediata', rule: 'visita_sin_seguimiento' };
  if (kind === 'followup') {
    if (daysOverdue >= 2) return { alert_class: 'inmediata', rule: 'seguimiento_vencido_2d' };
    if (daysOverdue >= 1 && (deal || high)) return { alert_class: 'inmediata', rule: 'seguimiento_vencido_clave' };
    if (daysOverdue >= 1) return { alert_class: 'recomendada', rule: 'seguimiento_vencido' };
    if (deal) return { alert_class: 'inmediata', rule: 'seguimiento_hoy_operacion_avanzada' };
    return { alert_class: 'recomendada', rule: 'seguimiento_hoy' };
  }
  // kind === 'abandoned' (contacto abierto sin próxima acción)
  if (daysSinceContact >= settings.inactive_days) return { alert_class: 'sin_actividad', rule: 'inactivo_prolongado' };
  if (lead.status === 'nuevo') return { alert_class: 'inmediata', rule: 'nuevo_sin_contactar' };
  if (deal) return { alert_class: 'inmediata', rule: 'operacion_sin_proxima_accion' };
  if (high) return { alert_class: 'inmediata', rule: 'prioridad_alta_sin_proxima_accion' };
  return { alert_class: 'recomendada', rule: 'sin_proxima_accion' };
}

const fmtShort = (d) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

/** HECHOS verificables en los datos (sin interpretar). Lo que se recomienda va aparte, en recommend(). */
export function buildFacts({ kind, lead, property, daysSinceContact, daysOverdue = 0, visitAt = null, hasLastContact = true }) {
  const f = [`Estado: ${statusLabel(lead.status)}`];
  if (lead.priority === 'alta') f.push('Prioridad alta');
  if (property?.title) f.push(`Interesado en «${property.title}»`);
  if (!hasLastContact) f.push('Sin contacto registrado');
  else if (daysSinceContact != null) f.push(daysSinceContact <= 0 ? 'Último contacto: hoy' : `Último contacto: hace ${daysSinceContact} ${daysSinceContact === 1 ? 'día' : 'días'}`);
  if (kind === 'followup') f.push(daysOverdue > 0 ? `Seguimiento vencido hace ${daysOverdue} ${daysOverdue === 1 ? 'día' : 'días'}` : 'Seguimiento programado para hoy');
  if (kind === 'abandoned') f.push('Sin próxima acción programada');
  if (kind === 'visit_no_followup' && visitAt) f.push(`Visita del ${fmtShort(visitAt)} sin contacto posterior registrado`);
  if (kind === 'visit_unconfirmed' && visitAt) f.push(`Visita el ${fmtShort(visitAt)} a las ${fmtTime(visitAt)} sin confirmar por el cliente`);
  return f;
}

/** RECOMENDACIÓN (sugerencia, no un hecho). Devuelve el texto y el objetivo de mensaje asociado. */
export function recommend({ kind, lead, rule }) {
  if (kind === 'visit_no_followup') return { text: 'Contacta para conocer su opinión sobre la visita y resolver dudas.', goal: 'post_visit' };
  if (kind === 'visit_unconfirmed') return { text: 'Confirma la visita con el cliente.', goal: 'follow_up' };
  if (rule === 'nuevo_sin_contactar') return { text: 'Haz el primer contacto.', goal: 'first_contact' };
  if (rule === 'inactivo_prolongado') return { text: 'Decide si merece la pena reactivar este contacto o archivarlo.', goal: 'reactivation' };
  if (rule === 'operacion_sin_proxima_accion') return { text: 'Concreta el siguiente paso de la operación.', goal: 'follow_up' };
  if (kind === 'abandoned') return { text: lead.status === 'interesado' ? 'Propón una visita o una llamada.' : 'Retoma el contacto y programa un siguiente paso.', goal: lead.status === 'interesado' ? 'visit_proposal' : 'follow_up' };
  return { text: 'Retoma la conversación y deja programado el siguiente paso.', goal: 'follow_up' };
}

/** Primera imagen utilizable de un inmueble (JSON o lista separada por comas/saltos). Solo http(s) o ruta propia. */
export function firstImage(images) {
  if (!images) return null;
  let list = images;
  if (typeof images === 'string') {
    try { list = JSON.parse(images); } catch { list = images.split(/[\n,]/); }
  }
  if (!Array.isArray(list)) return null;
  for (const raw of list) {
    const u = typeof raw === 'string' ? raw.trim() : raw?.url?.trim?.();
    if (u && (/^https?:\/\//i.test(u) || u.startsWith('/'))) return u;
  }
  return null;
}

/** Objetivo de mensaje recomendado según el estado del lead. */
export function defaultGoalForLead(lead, daysSinceContact) {
  if (lead.status === 'nuevo') return 'first_contact';
  if ((daysSinceContact ?? 0) >= 14) return 'reactivation';
  if (lead.status === 'visita_agendada') return 'post_visit';
  if (lead.status === 'interesado') return 'visit_proposal';
  return 'follow_up';
}

// ───────────────────────── Teléfono / WhatsApp ─────────────────────────

/** Devuelve el teléfono en formato internacional sin '+' (para wa.me) o null si no es válido. */
export function normalizePhone(raw, defaultCountry = '34') {
  if (!raw) return null;
  let s = String(raw).trim();
  const hadPlus = s.startsWith('+');
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;
  if (!hadPlus && digits.startsWith('00')) digits = digits.slice(2);
  else if (!hadPlus && digits.length === 9 && /^[6-9]/.test(digits)) digits = defaultCountry + digits;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export function buildWhatsAppUrl(phone, text) {
  const p = normalizePhone(phone);
  if (!p) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(text || '')}`;
}

// ───────────────────────── Plantillas de mensajes ─────────────────────────

function hash(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0;
  return h;
}

// Tras "Hola Ana," la frase sigue en minúscula ("Hola Ana, ¿pudiste…?"); tras un punto, en mayúscula.
const afterComma = (g, text) => (g.endsWith(',') ? text.replace(/^(¿?)(\p{Lu})/u, (_, q, c) => q + c.toLowerCase()) : text);

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

function greeting(tone, name, hour) {
  const n = firstName(name);
  if (tone === 'formal') {
    const base = hour < 14 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches';
    return n ? `${base}, ${n}.` : `${base}.`;
  }
  return n ? `Hola ${n},` : 'Hola,';
}

function propRef(ctx) {
  if (!ctx.propTitle) return null;
  const t = `«${ctx.propTitle}»`; // el título es texto libre: se delimita para que lea bien en mitad de una frase
  return ctx.propZone && !ctx.propTitle.toLowerCase().includes(String(ctx.propZone).toLowerCase()) ? `${t} (${ctx.propZone})` : t;
}

const capFirst = (text) => text.replace(/^(¿?)(\p{Ll})/u, (_, q, c) => q + c.toUpperCase());

function who(ctx) {
  if (ctx.agent && ctx.agency) return `soy ${ctx.agent} de ${ctx.agency}`;
  if (ctx.agency) return `te escribo de ${ctx.agency}`;
  if (ctx.agent) return `soy ${ctx.agent}`;
  return null;
}

function interestText(ctx) {
  // Solo usa datos que existen: nada de inventar características
  const parts = [];
  if (ctx.interest) parts.push(ctx.interest);
  if (ctx.leadZone) parts.push(`en ${ctx.leadZone}`);
  return parts.length ? parts.join(' ') : null;
}

// Cada objetivo tiene varias variantes para no enviar siempre el mismo texto.
// Las frases que dependen de un dato que no existe devuelven null y se descartan.
const TEMPLATES = {
  first_contact: [
    (c) => [who(c) && `${who(c)}.`, propRef(c) ? `Vi que te interesó ${propRef(c)}.` : (interestText(c) ? `Vi que buscas ${interestText(c)}.` : 'Gracias por tu interés.'), '¿Te va bien que lo comentemos? Si quieres, te propongo unos horarios para verlo.'],
    (c) => [propRef(c) ? `Gracias por interesarte por ${propRef(c)}.` : 'Gracias por contactar con nosotros.', who(c) && `${who(c)} y me encargo de ayudarte.`, '¿Qué es lo más importante para ti en tu búsqueda?'],
    (c) => [who(c) && `${who(c)}.`, interestText(c) ? `Me comentan que buscas ${interestText(c)}.` : 'Me llegó tu consulta.', '¿Tienes un momento para una llamada rápida o prefieres que sigamos por aquí?'],
  ],
  follow_up: [
    (c) => ['Quería retomar nuestra conversación.', propRef(c) ? `¿Qué te pareció ${propRef(c)}?` : '¿Has podido pensar en lo que hablamos?', 'Si te surge cualquier duda, dímelo y lo vemos.'],
    (c) => ['Te escribo para saber cómo llevas la búsqueda.', propRef(c) ? `Sigo teniendo ${propRef(c)} disponible por si quieres verlo.` : 'Si quieres, te preparo opciones nuevas que encajen con lo que buscas.', '¿Te viene bien que hablemos esta semana?'],
    (c) => ['¿Pudiste darle una vuelta a lo que comentamos?', 'Me gustaría saber si sigues interesado/a para ajustar las opciones que te enseño.'],
  ],
  visit_proposal: [
    (c) => [propRef(c) ? `Si te encaja, podemos visitar ${propRef(c)} esta semana.` : 'Si te encaja, podemos concertar una visita esta semana.', '¿Qué día y franja horaria te vienen mejor?'],
    (c) => ['Creo que merece la pena que lo veas en persona.', propRef(c) ? `¿Te propongo unos horarios para visitar ${propRef(c)}?` : '¿Te propongo unos horarios para una visita?'],
    (c) => [propRef(c) ? `Para avanzar con ${propRef(c)}, lo mejor es verlo.` : 'Para avanzar, lo mejor es verlo.', '¿Podrías mañana o pasado? Si no, dime qué día te va mejor y lo organizo.'],
  ],
  post_visit: [
    (c) => ['Gracias por venir a la visita.', propRef(c) ? `¿Qué te pareció ${propRef(c)}?` : '¿Qué impresión te llevaste?', 'Si quieres, resolvemos dudas o vemos otras opciones parecidas.'],
    (c) => ['¿Qué tal después de la visita?', 'Cuéntame qué te gustó y qué cambiarías, así afino lo que te busco.'],
    (c) => ['Gracias por tu tiempo en la visita.', '¿Te gustaría dar el siguiente paso o prefieres ver alguna alternativa antes de decidir?'],
  ],
  reactivation: [
    (c) => ['Hace tiempo que no hablamos.', interestText(c) ? `¿Sigues buscando ${interestText(c)}?` : '¿Sigues buscando vivienda?', 'Si ha cambiado algo, dímelo y lo ajusto.'],
    (c) => ['Te escribo por si todavía te interesa seguir buscando.', 'Si es así, cuéntame cómo ha cambiado lo que necesitas y te paso novedades.'],
    (c) => ['¿Cómo va todo?', 'Si sigues con la búsqueda, tengo novedades que quizá te encajen. ¿Te las enseño?'],
  ],
  seller_prospecting: [
    (c) => [who(c) && `${who(c)}.`, propRef(c) ? `Te escribo sobre ${propRef(c)}.` : 'Te escribo por si estás pensando en vender o alquilar tu vivienda.', '¿Te vendría bien una valoración sin compromiso?'],
    (c) => ['Si estás valorando vender, puedo ayudarte a conocer en cuánto está tu vivienda hoy.', '¿Hablamos cinco minutos esta semana?'],
    (c) => ['¿Has pensado en vender o alquilar?', 'Puedo prepararte una valoración sin compromiso y explicarte cómo lo trabajaríamos.'],
  ],
  price_update: [
    (c) => [propRef(c) ? `Novedad sobre ${propRef(c)}.` : 'Tengo una novedad.', 'Ha habido un ajuste en el precio. ¿Quieres que te dé los detalles?'],
    (c) => [propRef(c) ? `Te aviso de que ${propRef(c)} ha cambiado de precio.` : 'Te aviso de un cambio de precio.', 'Si te interesaba, ahora puede encajar mejor. ¿Lo vemos?'],
  ],
};

const EMAIL_SUBJECT = {
  first_contact: (c) => (c.propTitle ? `Sobre ${c.propTitle}` : 'Gracias por tu consulta'),
  follow_up: () => 'Seguimiento de tu búsqueda de vivienda',
  visit_proposal: (c) => (c.propTitle ? `Visita a ${c.propTitle}` : 'Propuesta de visita'),
  post_visit: () => 'Después de tu visita',
  reactivation: () => '¿Sigues buscando vivienda?',
  seller_prospecting: () => 'Valoración de tu vivienda sin compromiso',
  price_update: (c) => (c.propTitle ? `Novedad de precio: ${c.propTitle}` : 'Novedad de precio'),
};

/**
 * Genera un mensaje a partir de plantillas. Nunca inventa datos: solo usa lo recibido.
 * lead: { id, name, property_interest, zone }
 * opts: { goal, tone, channel, variant, property:{title,zone}, agentName, agencyName, now }
 */
export function buildMessage(lead, opts = {}) {
  const goal = TEMPLATES[opts.goal] ? opts.goal : 'follow_up';
  const tone = TONES.includes(opts.tone) ? opts.tone : 'cercano';
  const channel = opts.channel === 'email' ? 'email' : 'whatsapp';
  const now = opts.now || new Date();
  const hour = Number.isFinite(opts.hour) ? opts.hour : now.getUTCHours() + 1; // aprox. hora peninsular
  const ctx = {
    agent: firstName(opts.agentName) || null,
    agency: opts.agencyName || null,
    propTitle: opts.property?.title || null,
    propZone: opts.property?.zone || null,
    interest: lead.property_interest || null,
    leadZone: lead.zone || null,
  };

  const variants = TEMPLATES[goal];
  const idx = (hash(lead.id || lead.name || '') + (Number(opts.variant) || 0)) % variants.length;
  const lines = variants[idx](ctx).filter(Boolean).map(capFirst);
  const greet = greeting(tone, lead.name, hour);
  let body = `${greet} ${afterComma(greet, lines.join(' '))}`.trim();

  let subject = null;
  if (channel === 'email') {
    subject = EMAIL_SUBJECT[goal](ctx);
    const sign = [ctx.agent, ctx.agency].filter(Boolean).join(' · ');
    body = `${greet}\n\n${lines.join(' ')}\n\nUn saludo${sign ? `,\n${sign}` : '.'}`;
  } else if (tone === 'formal' && ctx.agent) {
    body += `\n\n${ctx.agent}${ctx.agency ? ` · ${ctx.agency}` : ''}`;
  }

  return { message: body, subject, goal, tone, channel, variant: (Number(opts.variant) || 0) % variants.length, variants: variants.length };
}

// ───────────────────────── Fechas en español ─────────────────────────

const WEEKDAYS = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 0 };
const MONTHS = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };

const strip = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function atNine(d) {
  const x = new Date(d);
  x.setUTCHours(9, 0, 0, 0);
  return x;
}
function addDays(base, n) {
  return atNine(new Date(base.getTime() + n * DAY_MS));
}

/**
 * Busca la primera referencia temporal futura en un texto ("mañana", "el viernes",
 * "dentro de 2 semanas", "el 15 de noviembre"...). Devuelve { date, text } o null.
 * Precisión de día (las 09:00 UTC); la lista diaria trabaja por días, no por horas.
 */
export function parseSpanishDate(text, now = new Date()) {
  const t = strip(text);
  let m;

  if ((m = t.match(/\bpasado manana\b/))) return { date: addDays(now, 2), text: m[0] };

  const re = /\bmanana\b/g;
  while ((m = re.exec(t))) {
    const before = t.slice(Math.max(0, m.index - 10), m.index);
    if (/(la|esta|de la|por la)\s$/.test(before)) continue; // "por la mañana" no es "mañana"
    return { date: addDays(now, 1), text: 'mañana' };
  }

  if ((m = t.match(/\b(?:dentro de|en)\s+(\d{1,2})\s+(dias?|semanas?|meses|mes)\b/))) {
    const n = parseInt(m[1], 10);
    const unit = m[2];
    const days = unit.startsWith('dia') ? n : unit.startsWith('semana') ? n * 7 : n * 30;
    return { date: addDays(now, days), text: m[0] };
  }

  if ((m = t.match(/\b(?:la )?(?:semana que viene|proxima semana|semana proxima)\b/))) {
    const dow = now.getUTCDay();
    const toMonday = ((8 - dow) % 7) || 7;
    return { date: addDays(now, toMonday), text: m[0] };
  }

  if ((m = t.match(/\b(?:el |este |proximo |el proximo )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/))) {
    const target = WEEKDAYS[m[1]];
    let diff = (target - now.getUTCDay() + 7) % 7;
    if (diff === 0) diff = 7;
    return { date: addDays(now, diff), text: m[0].trim() };
  }

  if ((m = t.match(/\b(?:el )?(?:dia )?(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/))) {
    const day = parseInt(m[1], 10);
    const month = MONTHS[m[2]];
    if (day >= 1 && day <= 31) {
      let d = atNine(new Date(Date.UTC(now.getUTCFullYear(), month, day)));
      if (d.getTime() < now.getTime() - DAY_MS) d = atNine(new Date(Date.UTC(now.getUTCFullYear() + 1, month, day)));
      return { date: d, text: m[0].trim() };
    }
  }

  if ((m = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/))) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      let y = m[3] ? parseInt(m[3], 10) : now.getUTCFullYear();
      if (y < 100) y += 2000;
      let d = atNine(new Date(Date.UTC(y, month, day)));
      if (!m[3] && d.getTime() < now.getTime() - DAY_MS) d = atNine(new Date(Date.UTC(y + 1, month, day)));
      return { date: d, text: m[0] };
    }
  }

  if ((m = t.match(/\bel (?:dia )?(\d{1,2})\b(?!\s*(?:\/|euros|€|m2|m²|metros|habitaciones))/))) {
    const day = parseInt(m[1], 10);
    if (day >= 1 && day <= 31) {
      let d = atNine(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day)));
      if (d.getTime() <= now.getTime()) d = atNine(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, day)));
      return { date: d, text: m[0] };
    }
  }

  return null;
}

// ───────────────────────── Resumen (modo básico, sin IA) ─────────────────────────

const OBJECTIONS = [
  { key: 'precio', label: 'precio', re: /\b(muy caro|es caro|caro|precio (?:alto|elevado)|se (?:nos )?va de presupuesto|fuera de presupuesto|bajar (?:el )?precio|rebaja)\b/ },
  { key: 'financiacion', label: 'financiación', re: /\b(hipoteca|banco|financiacion|preaprobad\w+|prestamo)\b/ },
  { key: 'decision', label: 'decisión compartida', re: /\b(pensarlo|pensarnoslo|tengo que pensar\w*|tenemos que pensar\w*|dejame pensar|lo hablo con|consultar(?:lo)? con|mi (?:mujer|marido|pareja|esposa|esposo)|tenemos que hablar)\b/ },
  { key: 'timing', label: 'plazos', re: /\b(no tengo prisa|mas adelante|dentro de unos meses|aun no|todavia no)\b/ },
  { key: 'competencia', label: 'otras opciones', re: /\b(otras? (?:inmobiliarias?|agencias?)|ya lo vi en|estoy viendo otr\w+)\b/ },
  { key: 'vivienda', label: 'características de la vivienda', re: /\b(reforma|ruido|muy pequen\w+|oscuro|sin ascensor|planta baja)\b/ },
];
const POSITIVE = /\b(me interesa|nos interesa|me encanta|nos encanta|quiero (?:verlo|visitar|ver)|podemos (?:ver|visitar)|cuando (?:puedo|podemos) (?:ver|visitar)|vamos a verlo)\b/;
const NEGATIVE = /\b(ya no (?:me )?interesa|descartad\w+|hemos comprado|compre otro|no gracias|no nos interesa)\b/;

/** Quita la marca de hora que añade WhatsApp al exportar un chat ("[10:32, 28/10/2026]" o "28/10/2026, 10:32 -"). */
export function stripChatMeta(line) {
  return String(line)
    .replace(/^\s*\[[^\]]{4,40}\]\s*/, '')
    .replace(/^\s*\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?\s?m\.?)?\s*[-–]\s*/i, '')
    .trim();
}

function extractAmounts(raw) {
  const out = new Set();
  const re = /(\d{1,3}(?:[.\s]\d{3})+|\d{2,7})\s*(€|euros?|eur\b|k\b|mil\b)/gi;
  let m;
  while ((m = re.exec(raw))) {
    let n = parseInt(m[1].replace(/[.\s]/g, ''), 10);
    const unit = m[2].toLowerCase();
    if (unit === 'k' || unit === 'mil') n *= 1000;
    if (n >= 100) out.add(n);
  }
  return [...out].slice(0, 4);
}

const fmtDate = (d) => d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtEur = (n) => `${n.toLocaleString('es-ES')} €`;

/**
 * Resume una conversación pegada y propone próximos pasos con reglas. Es un modo
 * básico: detecta señales concretas, no "entiende" el texto como lo haría una IA.
 */
export function summarizeConversation(text, { leadName = null, now = new Date() } = {}) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(stripChatMeta).filter(Boolean);
  const raw = lines.join('\n');
  const t = strip(raw);

  const objections = OBJECTIONS.filter((o) => o.re.test(t));
  const positive = POSITIVE.test(t);
  const negative = NEGATIVE.test(t);
  const amounts = extractAmounts(raw);
  // Cada pregunta por separado (una línea puede traer varias); se conservan las 3 últimas
  const questions = (raw.match(/¿[^?¿]*\?|[^.!?¿\n]{3,}\?/g) || [])
    .map((q) => q.trim()).filter((q) => q.length > 3).slice(-3)
    .map((q) => (q.length > 140 ? `${q.slice(0, 137)}…` : q));

  // Fechas mencionadas (solo futuras), línea a línea para conservar contexto
  const dates = [];
  const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);
  for (const line of lines) {
    const d = parseSpanishDate(line, now);
    if (!d || d.date.getTime() < todayStart.getTime()) continue; // las fechas pasadas no sirven para programar
    if (!dates.some((x) => x.date.getTime() === d.date.getTime())) dates.push({ ...d, line });
  }
  const mentionedDates = dates.slice(0, 3);

  // Resumen en 2-3 frases
  const parts = [];
  parts.push(`Conversación de ${lines.length} ${lines.length === 1 ? 'línea' : 'líneas'}${leadName ? ` con ${leadName}` : ''}.`);
  if (negative) parts.push('Hay señales de que ya no está interesado/a.');
  else if (positive) parts.push('Muestra interés claro (quiere ver o avanzar).');
  else parts.push('No hay una señal clara de interés ni de rechazo.');
  if (objections.length) parts.push(`Aparecen dudas sobre: ${objections.map((o) => o.label).join(', ')}.`);
  if (amounts.length) parts.push(`Importes mencionados: ${amounts.map(fmtEur).join(', ')}.`);
  if (mentionedDates.length) parts.push(`Fechas citadas: ${mentionedDates.map((d) => fmtDate(d.date)).join(', ')}.`);

  // Próximos pasos
  const steps = [];
  if (negative) steps.push('Confirmar si descarta y, si es así, programar una reactivación en unos 3 meses.');
  if (mentionedDates.length) steps.push(`Contactar el ${fmtDate(mentionedDates[0].date)} (${mentionedDates[0].text}).`);
  if (objections.some((o) => o.key === 'precio')) steps.push('Preparar argumentos de precio y 2-3 comparables de la zona.');
  if (objections.some((o) => o.key === 'financiacion')) steps.push('Ofrecer orientación sobre financiación y gastos de compra.');
  if (objections.some((o) => o.key === 'decision')) steps.push('Proponer una llamada o visita con todas las personas que deciden.');
  if (objections.some((o) => o.key === 'competencia')) steps.push('Destacar lo que diferencia esta propiedad y tu servicio frente a otras opciones.');
  if (questions.length) steps.push(`Responder las preguntas abiertas (${questions.length}).`);
  if (positive && !mentionedDates.length && !negative) steps.push('Proponer dos horarios concretos para una visita.');
  if (!steps.length) steps.push('Hacer un seguimiento breve en unos 3 días.');

  // Seguimiento sugerido
  let due;
  let reason;
  let goal = 'follow_up';
  if (mentionedDates.length) { due = mentionedDates[0].date; reason = `Mencionó ${mentionedDates[0].text}`; }
  else if (negative) { due = addDays(now, 90); reason = 'Reactivación tras posible descarte'; goal = 'reactivation'; }
  else if (positive) { due = addDays(now, 1); reason = 'Hay interés: conviene concretar pronto'; goal = 'visit_proposal'; }
  else if (objections.length) { due = addDays(now, 3); reason = 'Hay dudas que resolver'; }
  else { due = addDays(now, 3); reason = 'Seguimiento estándar'; }

  return {
    summary: parts.join(' '),
    next_steps: steps,
    suggested_followup: { due_at: due.toISOString(), channel: 'whatsapp', goal, reason },
    signals: {
      interest: negative ? 'bajo' : positive ? 'alto' : 'neutro',
      objections: objections.map((o) => o.key),
      amounts,
      dates: mentionedDates.map((d) => ({ text: d.text, date: d.date.toISOString() })),
      open_questions: questions,
    },
    source: 'basic',
  };
}

/** Fecha "en N días" a las 09:00 UTC (para los atajos de la interfaz). */
export function dueInDays(n, now = new Date()) {
  return addDays(now, Math.max(0, Math.min(365, Math.round(n))));
}
