import assert from 'node:assert/strict'
import { parsePortalEmail, normalizePhone, htmlToText } from '../services/portal-parser.js'
import { detectConsentCommand } from '../services/message-policy.js'

// Etiquetas habituales
let r = parsePortalEmail({
  from: 'Idealista <no-reply@idealista.com>',
  subject: 'Nuevo contacto sobre tu anuncio',
  text: `Nombre: María López\nTeléfono: 654 32 10 98\nEmail: maria@example.com\nMensaje: Me interesa el piso, ¿podemos verlo?\nReferencia: 12345`,
})
assert.equal(r.portal, 'idealista')
assert.equal(r.name, 'María López')
assert.equal(r.phone, '654321098')
assert.equal(r.email, 'maria@example.com')
assert.equal(r.reference, '12345')
assert.ok(r.usable)

// Prefijo +34, HTML, y sin etiqueta de teléfono
r = parsePortalEmail({
  from: 'avisos@fotocasa.es',
  subject: 'Nuevo lead',
  html: '<p>Nombre: <b>Juan</b></p><p>Contacto: +34 611-222-333</p><p>Escríbenos a juan.p@gmail.com</p>',
})
assert.equal(r.portal, 'fotocasa')
assert.equal(r.phone, '611222333')
assert.equal(r.email, 'juan.p@gmail.com')

// El email del portal no se toma como email del lead
r = parsePortalEmail({ from: 'no-reply@idealista.com', subject: 'x', text: 'Tel: 699000111\nnotificaciones@idealista.com' })
assert.equal(r.email, null)
assert.equal(r.phone, '699000111')

// Sin datos de contacto => no usable
r = parsePortalEmail({ from: 'a@b.com', subject: 'hola', text: 'sin datos' })
assert.equal(r.usable, false)

assert.equal(normalizePhone('+34 654 321 098'), '654321098')
assert.equal(normalizePhone('123'), null)
assert.ok(!htmlToText('<script>x</script><b>hola</b>').includes('script'))

// Baja/alta: solo si el mensaje ES la orden
for (const t of ['BAJA', ' stop ', 'Baja.', 'no quiero más mensajes', 'darme de baja']) assert.equal(detectConsentCommand(t), 'opt_out', t)
for (const t of ['no quiero parar de ver pisos', 'dame de baja el precio', 'hola', 'quiero ver el piso de baja altura']) assert.equal(detectConsentCommand(t), null, t)
assert.equal(detectConsentCommand('ALTA'), 'opt_in')

console.log('portal-parser + consentimiento: OK')
