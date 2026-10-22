// Pruebas de las reglas de cumplimiento de anuncios (sin servidor ni base de datos).
import assert from 'node:assert/strict';
import { checkListing, appendComplianceFooter, isCatalunya } from '../services/listing-compliance.js';

const ids = (r, sev) => r.checks.filter((c) => c.severity === sev).map((c) => c.id);
const base = { title: 'Piso luminoso', description: 'Piso reformado', price: 200000, operation_type: 'sale', city: 'Sevilla', province: 'Sevilla', surface: 80, type: 'piso' };

// Anuncio vacío de datos legales: faltan honorarios y etiqueta
let r = checkListing(base);
assert.equal(r.status, 'error');
assert.deepEqual(ids(r, 'error').sort(), ['energy', 'fees_info']);

// Completo
r = checkListing({ ...base, fees_info: 'Honorarios 3 % + IVA a cargo del vendedor. Gastos de compraventa no incluidos, aprox. 10 %.', energy_certificate: 'D' });
assert.equal(r.status, 'ok', JSON.stringify(ids(r, 'error')));

// "Honorarios aparte" se detecta en título, descripción o campo
for (const txt of ['Precio 200.000 € honorarios no incluidos', '200.000 € + IVA', 'comisión aparte', 'gastos no incluidos', '+ honorarios', 'más gastos']) {
  r = checkListing({ ...base, description: txt, fees_info: 'Honorarios 3 % + IVA', energy_certificate: 'C' });
  assert.ok(ids(r, 'error').includes('fees_wording'), `no detectó: ${txt}`);
}
// ...y no da falsos positivos con redacciones correctas (el campo de honorarios puede decir "+ IVA" o "gastos no incluidos")
r = checkListing({ ...base, description: 'Precio final con todos los gastos incluidos', fees_info: 'Honorarios 3 % + IVA a cargo del vendedor. Gastos no incluidos, aprox. 10 %', energy_certificate: 'C' });
assert.ok(!ids(r, 'error').includes('fees_wording'));

// Etiqueta: letra, exento, en trámite, inválida
assert.ok(!ids(checkListing({ ...base, energy_certificate: 'exento', fees_info: 'abcde' }), 'error').includes('energy'));
assert.ok(ids(checkListing({ ...base, energy_certificate: 'en trámite', fees_info: 'abcde' }), 'warn').includes('energy'));
assert.ok(ids(checkListing({ ...base, energy_certificate: 'H', fees_info: 'abcde' }), 'error').includes('energy'));

// Alquiler en Cataluña: cédula obligatoria
const cat = { ...base, operation_type: 'rent', price: 900, city: 'Barcelona', province: 'Barcelona', fees_info: 'Sin honorarios al inquilino', energy_certificate: 'E' };
assert.equal(isCatalunya(cat), true);
assert.ok(ids(checkListing(cat), 'error').includes('cedula'));
assert.ok(!ids(checkListing({ ...cat, cedula_habitabilidad: 'HAB-123456' }), 'error').includes('cedula'));
// En Sevilla no se exige cédula
assert.ok(!ids(checkListing({ ...cat, city: 'Sevilla', province: 'Sevilla' }), 'error').includes('cedula'));

// Zona tensionada: referencia y gran tenedor
const tens = { ...cat, cedula_habitabilidad: 'HAB-1', tensioned_zone: true };
r = checkListing(tens);
assert.deepEqual(ids(r, 'error').sort(), ['large_holder', 'reference_price']);
r = checkListing({ ...tens, reference_price: 800, large_holder: false });
assert.deepEqual(ids(r, 'error'), ['price_vs_reference']);          // 900 > 800
r = checkListing({ ...tens, reference_price: 950, large_holder: true });
assert.equal(r.status, 'ok');
r = checkListing({ ...tens, last_rent_price: 700, large_holder: false });
assert.equal(r.status, 'ok');

// Pie de cumplimiento: añade lo que falta y no duplica
let t = appendComplianceFooter('Piso reformado.', { ...tens, reference_price: 950, large_holder: true, fees_info: 'Honorarios: 1 mensualidad + IVA', energy_certificate: 'E' });
assert.match(t, /Honorarios y gastos: Honorarios: 1 mensualidad/);
assert.match(t, /Certificado energético: E/);
assert.match(t, /Cédula de habitabilidad: HAB-1/);
assert.match(t, /Precio máximo de referencia: 950/);
assert.match(t, /gran tenedor: sí/);
const again = appendComplianceFooter(t, { ...tens, reference_price: 950, large_holder: true, fees_info: 'Honorarios: 1 mensualidad + IVA', energy_certificate: 'E' });
assert.equal(again, t, 'no debe duplicar líneas');
assert.equal(appendComplianceFooter('Texto', { operation_type: 'sale' }), 'Texto');

console.log('compliance: OK');
