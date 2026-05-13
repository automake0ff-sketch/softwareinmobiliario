import { askClaude, isClientAvailable } from '../services/claude.js';

const SYSTEM_PROMPT = `Eres un asesor financiero inmobiliario experto. Calculas hipotecas, evaluas viabilidad financiera, comparas condiciones de mercado y ayudas a compradores a entender los costes reales de una operacion inmobiliaria.

Siempre respondes en formato JSON. Debes considerar: tipo de interes, plazo, perfil del cliente (ingresos, estabilidad, ahorros), gastos asociados (ITP, notaria, registro, tasacion) y condiciones de mercado actuales.`;

function calculateMortgageFallback(propertyPrice, leadProfile) {
  const price = propertyPrice || 0;
  const savings = leadProfile.savings || leadProfile.ahorros || Math.round(price * 0.2);
  const income = leadProfile.monthlyIncome || leadProfile.ingresosMensuales || 3000;
  const employmentType = leadProfile.employmentType || leadProfile.tipoEmpleo || 'indefinido';
  const dependents = leadProfile.dependents || leadProfile.cargas || 0;

  const interestRate = employmentType === 'indefinido' ? 2.5 : employmentType === 'autonomo' ? 3.0 : 3.5;
  const maxFinancing = Math.min(price * 0.8, price - savings);
  const loanAmount = Math.max(0, maxFinancing);
  const termYears = 30;
  const monthlyRate = interestRate / 100 / 12;
  const totalPayments = termYears * 12;
  const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / (Math.pow(1 + monthlyRate, totalPayments) - 1);
  const totalPaid = monthlyPayment * totalPayments;
  const totalInterest = totalPaid - loanAmount;

  const debtRatio = (monthlyPayment / income) * 100;
  const affordable = debtRatio <= 35;
  const maxRecommendedPayment = income * 0.35;

  return {
    propertyPrice: price,
    downPayment: price - loanAmount,
    downPaymentPercentage: ((price - loanAmount) / price * 100).toFixed(1) + '%',
    loanAmount: Math.round(loanAmount),
    interestRate: interestRate + '%',
    termYears,
    monthlyPayment: Math.round(monthlyPayment),
    totalInterest: Math.round(totalInterest),
    totalPaid: Math.round(totalPaid),
    debtToIncomeRatio: Math.round(debtRatio * 10) / 10 + '%',
    affordable,
    maxRecommendedPayment: Math.round(maxRecommendedPayment),
    details: [
      `Entrada necesaria: ${((price - loanAmount) / price * 100).toFixed(0)}% (${(price - loanAmount).toLocaleString()}€)`,
      `Cuota mensual: ${Math.round(monthlyPayment).toLocaleString()}€`,
      `Relacion cuota/ingreso: ${debtRatio.toFixed(1)}%`,
      affordable ? 'La cuota es asumible (menos del 35% de ingresos)' : 'La cuota supera el 35% de ingresos recomendado',
    ],
  };
}

function prequalifyLeadFallback(financialData) {
  const income = financialData.monthlyIncome || financialData.ingresosMensuales || 0;
  const savings = financialData.savings || financialData.ahorros || 0;
  const existingDebts = financialData.existingDebts || financialData.deudas || 0;
  const employmentType = financialData.employmentType || financialData.tipoEmpleo || 'indefinido';
  const age = financialData.age || financialData.edad || 35;
  const dependents = financialData.dependents || financialData.cargas || 0;
  const creditScore = financialData.creditScore || financialData.scoreCrediticio || 650;

  let maxMonthlyPayment = income * 0.35 - existingDebts;
  let maxLoanAmount = 0;
  let rating = 0;
  const reasons = [];

  if (maxMonthlyPayment > 0) {
    const rate = employmentType === 'indefinido' ? 2.5 : employmentType === 'autonomo' ? 3.0 : 3.5;
    const monthlyRate = rate / 100 / 12;
    const totalPayments = 30 * 12;
    maxLoanAmount = maxMonthlyPayment * (Math.pow(1 + monthlyRate, totalPayments) - 1) / (monthlyRate * Math.pow(1 + monthlyRate, totalPayments));
  }

  const maxPrice = maxLoanAmount + savings;

  if (employmentType === 'indefinido') { rating += 25; reasons.push('Contrato indefinido'); }
  else if (employmentType === 'autonomo') { rating += 15; reasons.push('Trabajador autonomo con antiguedad'); }
  else { rating += 5; reasons.push('Empleo temporal o sin contrato'); }

  if (creditScore >= 700) { rating += 20; reasons.push('Buen historial crediticio'); }
  else if (creditScore >= 600) { rating += 10; reasons.push('Historial crediticio aceptable'); }
  else { rating += 0; reasons.push('Historial crediticio bajo'); }

  if (savings >= maxPrice * 0.2) { rating += 20; reasons.push('Ahorros suficientes para entrada'); }
  else if (savings >= maxPrice * 0.1) { rating += 10; reasons.push('Ahorros parciales'); }

  if (income >= 2500) { rating += 15; reasons.push('Ingresos estables y suficientes'); }
  else if (income >= 1500) { rating += 5; reasons.push('Ingresos moderados'); }

  if (existingDebts === 0) { rating += 10; reasons.push('Sin deudas previas'); }
  if (age < 40) { rating += 10; reasons.push('Edad favorable para hipoteca larga'); }

  if (rating >= 80) reasons.push('Excelente perfil para financiacion');
  else if (rating >= 60) reasons.push('Buen perfil, revisar condiciones');
  else reasons.push('Perfil mejorable, considerar aval o mayor entrada');

  return {
    prequalified: rating >= 50,
    rating: Math.min(100, rating),
    maxLoanAmount: Math.round(maxLoanAmount),
    maxPropertyPrice: Math.round(maxPrice),
    maxMonthlyPayment: Math.round(maxMonthlyPayment),
    recommendedDownPayment: Math.round(maxPrice * 0.2),
    reasons,
    status: rating >= 80 ? 'excelente' : rating >= 60 ? 'bueno' : rating >= 40 ? 'aceptable' : 'desfavorable',
  };
}

function compareMarketConditionsFallback() {
  const currentYear = new Date().getFullYear();
  return {
    asOf: new Date().toISOString().split('T')[0],
    marketRates: [
      { entity: 'Banco Santander', product: 'Hipoteca Fija', rate: '2.75%', TAE: '3.15%', maxFinancing: '80%', notes: 'Buena opcion para perfiles estables' },
      { entity: 'BBVA', product: 'Hipoteca Variable', rate: 'EURIBOR + 0.99%', TAE: '2.90%', maxFinancing: '80%', notes: 'Interesante si EURIBOR se mantiene bajo' },
      { entity: 'CaixaBank', product: 'Hipoteca Fija', rate: '2.90%', TAE: '3.30%', maxFinancing: '80%', notes: 'Ofrece vinculacion por nomina' },
      { entity: 'Bankinter', product: 'Hipoteca Mixta', rate: 'Fija 5 anos 2.50% luego variable', TAE: '3.00%', maxFinancing: '80%', notes: 'Buena para quienes planean amortizar pronto' },
      { entity: 'ING', product: 'Hipoteca Fija', rate: '2.70%', TAE: '3.10%', maxFinancing: '75%', notes: 'Sin comisiones, online' },
    ],
    euribor: '2.345%',
    averageFixedRate: '2.78%',
    averageVariableRate: 'EURIBOR + 1.05%',
    recommendation: 'Actualmente las hipotecas fajas ofrecen estabilidad con tipos entre 2.50% y 3.00%. Recomendable para perfiles que buscan seguridad.',
    trends: {
      shortTerm: 'Estabilizacion de tipos durante los proximos meses',
      mediumTerm: 'Posible bajada gradual de tipos desde mediados de ' + currentYear,
      longTerm: 'Se espera que los tipos vuelvan a niveles del 2-3% en 2-3 anos',
    },
  };
}

function estimateTotalCostsFallback(propertyPrice) {
  const price = propertyPrice || 0;
  const isNew = arguments[1] || false;

  const taxRate = isNew ? 0.10 : 0.08;
  const tax = Math.round(price * taxRate);
  const notaryFees = 600 + price * 0.001;
  const registryFees = 400 + price * 0.0005;
  const appraisalFees = 400;
  const managementFees = 500;
  const legalFees = 800;

  const totalCosts = Math.round(tax + notaryFees + registryFees + appraisalFees + managementFees + legalFees);
  const totalInvestment = price + totalCosts;

  return {
    propertyPrice: price,
    costs: {
      tax: { concept: isNew ? 'IVA' : 'ITP', amount: tax, percentage: (taxRate * 100) + '%' },
      notary: { concept: 'Notaria', amount: Math.round(notaryFees), percentage: '~0.1%' },
      registry: { concept: 'Registro de la Propiedad', amount: Math.round(registryFees), percentage: '~0.05%' },
      appraisal: { concept: 'Tasacion', amount: appraisalFees, percentage: 'Fijo' },
      management: { concept: 'Gestion de hipoteca', amount: managementFees, percentage: 'Fijo' },
      legal: { concept: 'Asesoria legal', amount: legalFees, percentage: 'Fijo' },
    },
    totalCosts,
    totalInvestment,
    costPercentageOfPrice: Math.round((totalCosts / price) * 100) + '%',
    estimatedCashNeeded: Math.round(price * 0.2 + totalCosts),
    note: `Ademas del precio de la propiedad (${price.toLocaleString()}€), necesitaras aproximadamente ${totalCosts.toLocaleString()}€ en gastos e impuestos.`,
  };
}

function checkBudgetViabilityFallback(leadBudget, propertyPrice) {
  const budget = leadBudget || 0;
  const price = propertyPrice || 0;
  const totalCosts = Math.round(price * 0.10);
  const totalNeeded = price + totalCosts;
  const difference = budget - totalNeeded;
  const shortfall = budget - price;

  let verdict;
  let suggestions = [];

  if (budget >= totalNeeded) {
    verdict = 'viable';
    suggestions.push('El presupuesto cubre precio + gastos. Operacion recomendada.');
    suggestions.push('Considerar si se desea financiacion para mantener liquidez.');
  } else if (budget >= price) {
    verdict = 'parcial';
    suggestions.push(`El presupuesto cubre el precio pero faltan ${Math.abs(difference).toLocaleString()}€ para gastos.`);
    suggestions.push('Se necesita financiacion para cubrir gastos (ITP, notaria, registro).');
    suggestions.push(`Gastos estimados: ${totalCosts.toLocaleString()}€`);
  } else {
    verdict = 'insuficiente';
    const maxPriceWithFinancing = budget * 0.8 > 0 ? Math.round(budget / 0.8) : 0;
    suggestions.push(`El presupuesto no cubre el precio. Faltan ${Math.abs(shortfall).toLocaleString()}€.`);
    if (maxPriceWithFinancing > 0) {
      suggestions.push(`Con una hipoteca del 80%, podrias optar a propiedades de hasta ${maxPriceWithFinancing.toLocaleString()}€.`);
      suggestions.push(`Entrada necesaria: ${Math.round(maxPriceWithFinancing * 0.2).toLocaleString()}€`);
    }
    suggestions.push('Alternativa: buscar propiedades de menor precio o aumentar ahorros.');
  }

  return {
    budget,
    propertyPrice: price,
    totalCosts,
    totalNeeded,
    difference,
    verdict,
    suggestions,
    feasibilityPercentage: Math.round(Math.min(100, (budget / totalNeeded) * 100)),
  };
}

export function getSystemPrompt() {
  return SYSTEM_PROMPT;
}

export async function calculateMortgage(propertyPrice, leadProfile) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Calcula una hipoteca para esta propiedad y perfil. Devuelve JSON con: propertyPrice, downPayment, downPaymentPercentage, loanAmount, interestRate, termYears, monthlyPayment, totalInterest, totalPaid, debtToIncomeRatio, affordable, maxRecommendedPayment, details.
Price: ${propertyPrice}
Profile: ${JSON.stringify(leadProfile)}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `Hipoteca calculada: ${parsed.monthlyPayment}€/mes (${parsed.interestRate}, ${parsed.termYears} anos)` };
    } catch (err) { errors.push(err.message); }
  }
  const result = calculateMortgageFallback(propertyPrice, leadProfile);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: ${result.monthlyPayment}€/mes` : `Hipoteca: ${result.monthlyPayment}€/mes (${result.interestRate}, ${result.termYears} anos)` };
}

export async function prequalifyLead(financialData) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Preevalua financieramente a un lead. Devuelve JSON con: prequalified, rating, maxLoanAmount, maxPropertyPrice, maxMonthlyPayment, recommendedDownPayment, reasons, status.
Financial data: ${JSON.stringify(financialData)}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `Lead ${parsed.prequalified ? 'PREAPROBADO' : 'NO APROBADO'}. Rating: ${parsed.rating}/100` };
    } catch (err) { errors.push(err.message); }
  }
  const result = prequalifyLeadFallback(financialData);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: ${result.prequalified ? 'PREAPROBADO' : 'NO APROBADO'}` : `Lead ${result.prequalified ? 'PREAPROBADO' : 'NO APROBADO'}. Rating: ${result.rating}/100` };
}

export async function compareMarketConditions() {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Compara condiciones hipotecarias del mercado actual. Devuelve JSON con: asOf, marketRates (array de {entity, product, rate, TAE, maxFinancing, notes}), euribor, averageFixedRate, averageVariableRate, recommendation, trends.
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `Mercado: fija media ${parsed.averageFixedRate}, variable media ${parsed.averageVariableRate}` };
    } catch (err) { errors.push(err.message); }
  }
  const result = compareMarketConditionsFallback();
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: condiciones mercado` : `Mercado: fija media ${result.averageFixedRate}, EURIBOR ${result.euribor}` };
}

export async function estimateTotalCosts(propertyPrice) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Estima los costes totales de compra de una propiedad. Devuelve JSON con: propertyPrice, costs (object con conceptos), totalCosts, totalInvestment, costPercentageOfPrice, estimatedCashNeeded, note.
Price: ${propertyPrice}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `Costes totales: ${parsed.totalCosts?.toLocaleString()}€ (${parsed.costPercentageOfPrice})` };
    } catch (err) { errors.push(err.message); }
  }
  const result = estimateTotalCostsFallback(propertyPrice);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: ${result.totalCosts}€ costes` : `Costes totales: ${result.totalCosts?.toLocaleString()}€ (${result.costPercentageOfPrice})` };
}

export async function checkBudgetViability(leadBudget, propertyPrice) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Evalua la viabilidad de un presupuesto para una propiedad. Devuelve JSON con: budget, propertyPrice, totalCosts, totalNeeded, difference, verdict, suggestions, feasibilityPercentage.
Budget: ${leadBudget}
Price: ${propertyPrice}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `Viabilidad: ${parsed.verdict} (${parsed.feasibilityPercentage}%)` };
    } catch (err) { errors.push(err.message); }
  }
  const result = checkBudgetViabilityFallback(leadBudget, propertyPrice);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: ${result.verdict}` : `Viabilidad: ${result.verdict} (${result.feasibilityPercentage}%)` };
}

export async function execute(context) {
  const { action, payload } = context;
  switch (action) {
    case 'calculateMortgage': return calculateMortgage(payload.propertyPrice, payload.leadProfile);
    case 'prequalifyLead': return prequalifyLead(payload.financialData);
    case 'compareMarketConditions': return compareMarketConditions();
    case 'estimateTotalCosts': return estimateTotalCosts(payload.propertyPrice);
    case 'checkBudgetViability': return checkBudgetViability(payload.leadBudget, payload.propertyPrice);
    default: return { success: false, result: null, insight: `Accion desconocida: ${action}. Disponibles: calculateMortgage, prequalifyLead, compareMarketConditions, estimateTotalCosts, checkBudgetViability` };
  }
}
