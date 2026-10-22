// Comprobación orientativa de un anuncio inmobiliario antes de publicarlo.
// NO es asesoramiento legal: resume obligaciones habituales y avisa de lo que falta.
//
// Reglas que cubre:
//  - Ley 10/2025: el anuncio debe mostrar el precio final (impuestos y gastos repercutibles)
//    y los honorarios de intermediación; no puede decir que van aparte.
//  - Etiqueta de eficiencia energética en la publicidad de venta o alquiler.
//  - Zonas tensionadas (alquiler): precio máximo de referencia / última renta y condición de gran tenedor.
//  - Cataluña (alquiler): cédula de habitabilidad en el anuncio.

const CATALUNYA_HINTS = ['catalu', 'barcelona', 'girona', 'gerona', 'lleida', 'lerida', 'tarragona'];
const ENERGY_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

// Frases que sugieren que honorarios, gastos o impuestos NO están incluidos en el precio.
const FEES_NOT_INCLUDED = [
  /honorarios?\s+(de\s+(la\s+)?(agencia|intermediaci[oó]n)\s+)?(no\s+inclu[ií]d|aparte|a\s+parte)/i,
  /gastos?\s+(de\s+\w+\s+)?(no\s+inclu[ií]d|aparte|a\s+parte)/i,
  /impuestos?\s+(no\s+inclu[ií]d|aparte|a\s+parte)/i,
  /comisi[oó]n\s+(no\s+inclu[ií]d|aparte|a\s+parte)/i,
  /(\+|m[aá]s)\s*(honorarios|comisi[oó]n|gastos)/i,
  // Precio con IVA/impuestos añadidos justo después de la cifra: "200.000 € + IVA"
  /[\d.,]+\s*(€|euros?)\s*(\+|m[aá]s)\s*(iva|impuestos)/i,
];

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function isCatalunya(p) {
  const text = `${norm(p.province)} ${norm(p.city)}`;
  return CATALUNYA_HINTS.some((h) => text.includes(h));
}

function truthy(v) {
  return v === true || v === 1 || v === '1' || v === 'true';
}

// 3 estados: true / false / null (sin responder)
function tri(v) {
  if (v === null || v === undefined || v === '') return null;
  return truthy(v);
}

function parseEnergy(value) {
  const raw = String(value || '').trim();
  if (!raw) return { state: 'missing' };
  const n = norm(raw);
  if (n.includes('exent')) return { state: 'exempt' };
  if (n.includes('tramit')) return { state: 'pending' };
  const letter = raw.toUpperCase().match(/\b([A-G])\b/);
  if (letter && ENERGY_LETTERS.includes(letter[1])) return { state: 'ok', letter: letter[1] };
  return { state: 'invalid' };
}

export function checkListing(p) {
  const checks = [];
  const add = (id, label, ok, severity, help) =>
    checks.push({ id, label, ok: !!ok, severity: ok ? 'ok' : severity, help: ok ? '' : help });

  const isRent = p.operation_type === 'rent';
  const catalunya = isCatalunya(p);
  const tensioned = truthy(p.tensioned_zone);
  const price = Number(p.price || 0);
  const text = [p.title, p.description].filter(Boolean).join(' \n ');

  // ── Reglas generales (venta y alquiler) ──────────────────────────────
  add('price', 'Precio indicado', price > 0, 'error', 'Indica el precio. Un anuncio sin precio no cumple la información mínima al consumidor.');

  add(
    'fees_info',
    'Honorarios y gastos informados',
    String(p.fees_info || '').trim().length >= 5,
    'error',
    'Indica los honorarios de la agencia, los impuestos y los gastos repercutibles al consumidor (por ejemplo: "Honorarios: 3 % + IVA a cargo del vendedor. Impuestos y gastos de la compraventa no incluidos en el precio, aprox. 10 %"). Si no puedes calcular el precio final exacto, explica la base de cálculo.',
  );

  const suspicious = FEES_NOT_INCLUDED.find((re) => re.test(text));
  add(
    'fees_wording',
    'El texto no dice que los honorarios o gastos van aparte',
    !suspicious,
    'error',
    'Hay una frase que sugiere que honorarios, gastos o impuestos no están incluidos en el precio. Reescríbela indicando el importe o el porcentaje, para que el consumidor sepa lo que pagará.',
  );

  const energy = parseEnergy(p.energy_certificate);
  if (energy.state === 'pending') {
    add('energy', 'Certificado energético', false, 'warn', 'Consta "en trámite". Antes de publicar debes tener la etiqueta; en cuanto la tengas, indícala (A–G).');
  } else {
    add(
      'energy',
      'Etiqueta de eficiencia energética',
      energy.state === 'ok' || energy.state === 'exempt',
      'error',
      energy.state === 'invalid'
        ? 'Escribe la letra de la etiqueta (A, B, C, D, E, F o G) o "Exento".'
        : 'La etiqueta energética debe aparecer en el anuncio. Indica la letra (A–G) o "Exento" si es el caso.',
    );
  }

  add(
    'basics',
    'Datos básicos (ubicación, superficie, tipo)',
    !!(p.city && p.city !== 'Pendiente') && Number(p.surface || 0) > 0 && !!p.type,
    'warn',
    'Completa ciudad, superficie y tipo de inmueble: son las características esenciales que debe mostrar el anuncio.',
  );

  // ── Zona tensionada (alquiler) ───────────────────────────────────────
  if (isRent && tensioned) {
    const hasRef = Number(p.reference_price || 0) > 0 || Number(p.last_rent_price || 0) > 0;
    add(
      'reference_price',
      'Precio máximo de referencia o última renta',
      hasRef,
      'error',
      'En zona tensionada el anuncio debe informar del precio máximo que resulta del índice de referencia y/o de la última renta del contrato vigente en los últimos cinco años.',
    );
    if (Number(p.reference_price || 0) > 0) {
      add(
        'price_vs_reference',
        'Precio dentro del máximo de referencia',
        price <= Number(p.reference_price),
        'error',
        `El precio (${price} €) supera el máximo de referencia indicado (${p.reference_price} €). Revísalo: salvo excepción aplicable, no puedes anunciarlo por encima.`,
      );
    }
    add(
      'large_holder',
      'Condición de gran tenedor indicada',
      tri(p.large_holder) !== null,
      'error',
      'En zona tensionada hay que indicar si el propietario es gran tenedor (sí o no).',
    );
  }

  // ── Cataluña (alquiler) ──────────────────────────────────────────────
  if (isRent && catalunya) {
    add(
      'cedula',
      'Cédula de habitabilidad (Cataluña)',
      String(p.cedula_habitabilidad || '').trim().length >= 3,
      'error',
      'En Cataluña el anuncio de alquiler debe incluir el número de la cédula de habitabilidad.',
    );
  }

  const errors = checks.filter((c) => c.severity === 'error').length;
  const warnings = checks.filter((c) => c.severity === 'warn').length;
  return {
    status: errors > 0 ? 'error' : warnings > 0 ? 'warn' : 'ok',
    errors,
    warnings,
    region: catalunya ? 'cataluna' : null,
    checks,
    disclaimer:
      'Comprobación orientativa basada en la normativa de información al consumidor en anuncios. No sustituye el asesoramiento de un abogado: las normas varían por comunidad autónoma y cambian con frecuencia.',
  };
}

// Añade al texto del anuncio las líneas obligatorias que falten (honorarios, etiqueta, cédula...).
export function appendComplianceFooter(description, p) {
  const base = String(description || '').trim();
  const lines = [];
  const has = (needle) => needle && norm(base).includes(norm(String(needle).slice(0, 40)));

  const fees = String(p.fees_info || '').trim();
  if (fees && !has(fees)) lines.push(`Honorarios y gastos: ${fees}`);

  const energy = parseEnergy(p.energy_certificate);
  if (energy.state === 'ok' && !/etiqueta|certificado energ|eficiencia energ/i.test(base)) {
    lines.push(`Certificado energético: ${energy.letter}`);
  } else if (energy.state === 'exempt' && !/exent/i.test(base)) {
    lines.push('Certificado energético: exento');
  }

  if (p.operation_type === 'rent') {
    if (isCatalunya(p) && String(p.cedula_habitabilidad || '').trim() && !has(p.cedula_habitabilidad)) {
      lines.push(`Cédula de habitabilidad: ${String(p.cedula_habitabilidad).trim()}`);
    }
    if (truthy(p.tensioned_zone)) {
      if (Number(p.reference_price || 0) > 0 && !/referencia/i.test(base)) {
        lines.push(`Zona de mercado residencial tensionado. Precio máximo de referencia: ${p.reference_price} €/mes`);
      }
      if (Number(p.last_rent_price || 0) > 0 && !/[uú]ltima renta/i.test(base)) {
        lines.push(`Última renta del contrato anterior: ${p.last_rent_price} €/mes`);
      }
      const lh = tri(p.large_holder);
      if (lh !== null && !/gran tenedor/i.test(base)) {
        lines.push(`Propietario gran tenedor: ${lh ? 'sí' : 'no'}`);
      }
    }
  }

  if (!lines.length) return base;
  return `${base}${base ? '\n\n' : ''}${lines.join('\n')}`;
}
