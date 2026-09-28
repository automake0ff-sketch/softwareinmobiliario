import assert from 'node:assert/strict'
import { calculateMortgage, formatMortgageMessage } from '../services/finance-calc.js'

// 200.000€, 20% entrada, 3.2% TIN, 25 años -> comprobado contra fórmula estándar
const c = calculateMortgage({ price: 200000, downPaymentPercent: 20, tinPercent: 3.2, years: 25 })
assert.equal(c.downPayment, 40000)
assert.equal(c.principal, 160000)
assert.ok(Math.abs(c.monthlyPayment - 774.87) < 1, c.monthlyPayment)
assert.ok(c.totalInterest > 0 && c.totalPaid > c.principal)

assert.equal(calculateMortgage({ price: 0 }), null)
assert.ok(formatMortgageMessage(null, 'Ana').includes('precio aproximado'))
assert.ok(formatMortgageMessage(c, 'Ana').includes('Cuota mensual estimada'))

console.log('finance-calc: OK')
