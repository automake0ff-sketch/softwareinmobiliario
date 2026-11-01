// Corpus de frases reales de clientes (WhatsApp, email, notas) para el resumen por reglas.
import { summarizeConversation } from '../services/followup-engine.js';
const now = new Date('2026-10-29T10:00:00Z');
const cases = [
  ['preguntas sin señal clara', 'Hola, vi el piso de Triana. ¿Sigue disponible? ¿Cuánto es la comunidad?', (r) => r.signals.open_questions.length === 2 && r.signals.interest === 'neutro'],
  ['hipoteca + importes + interés', 'Nos encanta el piso, pero con la hipoteca nos queda justo. El banco nos da 150.000 € y el piso son 185.000 €.', (r) => r.signals.objections.includes('financiacion') && r.signals.amounts.includes(150000) && r.signals.amounts.includes(185000) && r.signals.interest === 'alto'],
  ['descarte', 'Gracias pero hemos comprado otro piso, ya no nos interesa.', (r) => r.signals.interest === 'bajo' && r.suggested_followup.goal === 'reactivation'],
  ['pensarlo + semana que viene', 'Me lo tengo que pensar, te digo algo la semana que viene.', (r) => r.signals.objections.includes('decision') && new Date(r.suggested_followup.due_at).toISOString().slice(0, 10) === '2026-11-02'],
  ['otras agencias', 'Estoy viendo otras inmobiliarias también, os digo algo.', (r) => r.signals.objections.includes('competencia')],
  ['sábado', '¿Podéis enseñármelo el sábado?', (r) => new Date(r.suggested_followup.due_at).toISOString().slice(0, 10) === '2026-10-31'],
  ['sin acentos: caro', 'esta muy caro, podeis bajar el precio?', (r) => r.signals.objections.includes('precio')],
  ['sin prisa', 'No tengo prisa, lo vemos más adelante.', (r) => r.signals.objections.includes('timing')],
  ['fecha con mes', 'Firmamos el 20 de diciembre si todo va bien.', (r) => new Date(r.suggested_followup.due_at).toISOString().slice(0, 10) === '2026-12-20'],
  ['mañana por la tarde', 'Podemos vernos mañana por la tarde?', (r) => new Date(r.suggested_followup.due_at).toISOString().slice(0, 10) === '2026-10-30'],
  ['por la mañana NO es mañana', 'Prefiero por la mañana.', (r) => r.signals.dates.length === 0],
  ['metros y precio no son fecha', 'Son 85 m2 por 210.000 euros, 3 habitaciones.', (r) => r.signals.dates.length === 0 && r.signals.amounts.includes(210000)],
  ['alquiler (importe mensual bajo)', 'Busco alquiler hasta 900 euros al mes.', (r) => r.signals.amounts.includes(900)],
  ['k abreviado', 'Mi tope es 200k', (r) => r.signals.amounts.includes(200000)],
  ['whatsapp con marcas de tiempo', '[10:32, 28/10/2026] Ana: Hola, me interesa el piso\n[10:35, 28/10/2026] Laura: Genial, ¿lo vemos?\n[10:40, 28/10/2026] Ana: Sí, el viernes', (r) => r.signals.interest === 'alto' && new Date(r.suggested_followup.due_at).toISOString().slice(0, 10) === '2026-10-30'],
  ['marca de tiempo antigua no es fecha futura', '[10:32, 12/10/2026] Ana: Gracias por todo', (r) => new Date(r.suggested_followup.due_at) > now],
  ['vacío', '   ', (r) => !!r.summary && r.next_steps.length >= 1],
];
let ok = 0;
for (const [name, text, check] of cases) { const r = summarizeConversation(text, { now }); const pass = (() => { try { return check(r); } catch { return false; } })(); ok += pass; console.log(pass ? '  ✓' : '  ✗', name, pass ? '' : JSON.stringify({ signals: r.signals, due: r.suggested_followup.due_at, goal: r.suggested_followup.goal })); }
console.log(`\n${ok}/${cases.length} frases reales OK`); process.exit(ok === cases.length ? 0 : 1);
