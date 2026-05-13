import { askClaude, isClientAvailable } from '../services/claude.js';
import { runAgentWithTools } from '../tools/agent-runner.js';

const SYSTEM_PROMPT = `Eres un Tasador IA experto en valoración inmobiliaria. Tu misión es determinar el valor real de mercado de cualquier propiedad.

Metodología:
1. Valoración basada en comparables: analizas propiedades similares vendidas recientemente en la misma zona
2. Precio por m²: calculas el precio medio por metro cuadrado ajustado por factores
3. Estado: applies coeficientes según estado (nuevo, reformado, buen estado, regular, reforma)
4. Extras: valoras extras como parking, piscina, terraza, ascensor, vistas, orientación

Resultados que debes generar:
- Precio mínimo (venta rápida en 30 días): ~5% por debajo del óptimo
- Precio óptimo (venta en 3-6 meses): valor de mercado real
- Precio máximo (venta sin prisa): ~5-10% por encima del óptimo
- Tiempo estimado de venta

Análisis de rentabilidad para inversores:
- Yield bruto: (renta anual / precio compra) * 100
- ROI estimado a 5 años incluyendo plusvalía
- Comparativa con otras opciones de inversión

Análisis de mercado por zona:
- Precio medio por m² en la zona
- Tendencia: subida, estable, bajada
- Demanda: alta, media, baja
- Tiempo medio de venta en la zona

Alertas de oportunidad:
- Propiedad infravalorada respecto al mercado (>10% por debajo)
- Zona en tendencia alcista
- Propiedad con potencial de reforma y alta plusvalía

Siempre respondes en formato JSON con informe de tasación completo: propertySummary, saleValuation (estimatedPrice, priceRange, pricePerM2, confidence, factors), rentValuation, marketContext, methodology, date.`;

const ZONE_PRICES = {
  centro: { sale: 3500, rent: 14, trend: 'subida' },
  norte: { sale: 2800, rent: 11, trend: 'estable' },
  sur: { sale: 2200, rent: 9, trend: 'subida' },
  este: { sale: 2600, rent: 10.5, trend: 'estable' },
  oeste: { sale: 3000, rent: 12, trend: 'subida' },
  playa: { sale: 3200, rent: 13, trend: 'subida' },
  montaña: { sale: 2000, rent: 8, trend: 'estable' },
  ensanche: { sale: 3800, rent: 15, trend: 'subida' },
  periferia: { sale: 1800, rent: 7.5, trend: 'bajada' },
};

function calculatePriceFallback(propertyData) {
  const zone = (propertyData.zone || propertyData.zona || propertyData.location || 'centro').toLowerCase();
  const m2 = propertyData.squareMeters || propertyData.metros || propertyData.meters || propertyData.surface || 80;
  const rooms = propertyData.rooms || propertyData.habitaciones || propertyData.bedrooms || 3;
  const bathrooms = propertyData.bathrooms || propertyData.banos || 1;
  const age = propertyData.age || propertyData.antiguedad || propertyData.year || 20;
  const condition = (propertyData.condition || propertyData.estado || 'bueno').toLowerCase();
  const floor = propertyData.floor || propertyData.planta || 1;
  const hasElevator = propertyData.elevator || propertyData.ascensor || false;
  const hasParking = propertyData.parking || propertyData.plaza || false;
  const hasPool = propertyData.pool || propertyData.piscina || false;

  const zoneData = ZONE_PRICES[zone] || ZONE_PRICES.centro;
  let pricePerM2 = zoneData.sale;

  if (condition === 'nuevo' || condition === 'obra nueva') pricePerM2 *= 1.2;
  else if (condition === 'reformado' || condition === 'excelente') pricePerM2 *= 1.1;
  else if (condition === 'regular' || condition === 'mejorable') pricePerM2 *= 0.85;
  else if (condition === 'malo' || condition === 'reforma') pricePerM2 *= 0.7;

  if (age < 5) pricePerM2 *= 1.15;
  else if (age > 50) pricePerM2 *= 0.8;

  if (floor >= 4 && hasElevator) pricePerM2 *= 1.05;
  if (floor >= 4 && !hasElevator) pricePerM2 *= 0.9;
  if (floor === 1) pricePerM2 *= 0.95;

  const orientation = (propertyData.orientation || propertyData.orientacion || '').toLowerCase();
  if (orientation.includes('sur') || orientation.includes('exterior')) pricePerM2 *= 1.05;

  if (hasParking) pricePerM2 *= 1.08;
  if (hasPool) pricePerM2 *= 1.1;

  const extras = propertyData.extras || propertyData.extraFeatures || [];
  const extraCount = Array.isArray(extras) ? extras.length : 0;
  if (extraCount > 2) pricePerM2 *= 1.03;

  const basePrice = Math.round(pricePerM2 * m2);
  const stdDev = Math.round(basePrice * 0.05);

  return {
    estimatedPrice: basePrice,
    priceRange: { min: basePrice - stdDev, max: basePrice + stdDev },
    pricePerM2: Math.round(pricePerM2),
    confidence: condition === 'nuevo' ? 0.9 : condition === 'reformado' ? 0.85 : 0.75,
    factors: [
      `Precio base por m² en ${zone}: ${zoneData.sale}€/m²`,
      `Factor estado (${condition}): ${condition === 'nuevo' ? 'x1.2' : condition === 'reformado' ? 'x1.1' : condition === 'regular' ? 'x0.85' : 'x0.7'}`,
      `Factor antigüedad (${age} años): ${age < 5 ? 'x1.15' : age > 50 ? 'x0.8' : 'x1.0'}`,
      `Factor altura/ascensor: ${floor >= 4 && hasElevator ? 'x1.05' : floor >= 4 && !hasElevator ? 'x0.9' : 'x1.0'}`,
      hasParking ? 'Parking incluido: x1.08' : null,
      hasPool ? 'Piscina: x1.1' : null,
    ].filter(Boolean),
  };
}

function calculateRentFallback(propertyData) {
  const zone = (propertyData.zone || propertyData.zona || propertyData.location || 'centro').toLowerCase();
  const m2 = propertyData.squareMeters || propertyData.metros || propertyData.meters || propertyData.surface || 80;
  const rooms = propertyData.rooms || propertyData.habitaciones || propertyData.bedrooms || 3;
  const condition = (propertyData.condition || propertyData.estado || 'bueno').toLowerCase();
  const furnished = propertyData.furnished || propertyData.amueblado || false;

  const zoneData = ZONE_PRICES[zone] || ZONE_PRICES.centro;
  let rentPerM2 = zoneData.rent;

  if (condition === 'nuevo' || condition === 'reformado' || condition === 'excelente') rentPerM2 *= 1.15;
  else if (condition === 'regular') rentPerM2 *= 0.9;
  else if (condition === 'malo' || condition === 'reforma') rentPerM2 *= 0.75;

  if (furnished) rentPerM2 *= 1.1;

  const baseRent = Math.round(rentPerM2 * m2);
  const stdDev = Math.round(baseRent * 0.05);

  return {
    estimatedRent: baseRent,
    rentRange: { min: baseRent - stdDev, max: baseRent + stdDev },
    rentPerM2: Math.round(rentPerM2),
    annualYield: Math.round(((baseRent * 12) / (m2 * zoneData.sale)) * 1000) / 10,
    confidence: 0.8,
    factors: [
      `Rentabilidad bruta estimada: ${Math.round(((baseRent * 12) / (m2 * zoneData.sale)) * 1000) / 10}%`,
      condition !== 'bueno' ? `Ajuste por estado: ${condition}` : null,
      furnished ? 'Amueblado: +10%' : null,
    ].filter(Boolean),
  };
}

function analyzeMarketTrendsFallback(zoneData) {
  const zone = (zoneData.zone || zoneData.zona || 'centro').toLowerCase();
  const zoneInfo = ZONE_PRICES[zone] || ZONE_PRICES.centro;

  const trends = {
    priceEvolution: zoneInfo.trend === 'subida' ? '+3-5% anual' : zoneInfo.trend === 'bajada' ? '-2-4% anual' : '0-2% anual',
    demand: zoneInfo.trend === 'subida' ? 'alta' : zoneInfo.trend === 'bajada' ? 'baja' : 'media',
    averageDaysOnMarket: zoneInfo.trend === 'subida' ? '15-30 días' : zoneInfo.trend === 'bajada' ? '60-90 días' : '30-60 días',
    recommendedAction: zoneInfo.trend === 'subida'
      ? 'Vender ahora, los precios están al alza'
      : zoneInfo.trend === 'bajada'
        ? 'Esperar para vender o ajustar precio'
        : 'Momento estable para comprar o vender',
  };

  return {
    zone,
    salePricePerM2: zoneInfo.sale,
    rentPricePerM2: zoneInfo.rent,
    trend: zoneInfo.trend,
    ...trends,
  };
}

function generateValuationReportFallback(propertyData) {
  const saleEstimate = calculatePriceFallback(propertyData);
  const rentEstimate = calculateRentFallback(propertyData);
  const zone = (propertyData.zone || propertyData.zona || propertyData.location || 'centro').toLowerCase();
  const zoneInfo = ZONE_PRICES[zone] || ZONE_PRICES.centro;

  const optimalPrice = saleEstimate.estimatedPrice;
  const minPrice = Math.round(optimalPrice * 0.95);
  const maxPrice = Math.round(optimalPrice * 1.1);

  return {
    propertySummary: {
      address: propertyData.address || propertyData.direccion || 'No especificada',
      zone,
      type: propertyData.type || propertyData.tipo || 'piso',
      m2: propertyData.squareMeters || propertyData.metros || 80,
      rooms: propertyData.rooms || propertyData.habitaciones || 3,
      condition: propertyData.condition || propertyData.estado || 'bueno',
    },
    saleValuation: {
      ...saleEstimate,
      minPrice: minPrice,
      optimalPrice: optimalPrice,
      maxPrice: maxPrice,
      estimatedTimeToSell: saleEstimate.confidence >= 0.85 ? '1-3 meses' : saleEstimate.confidence >= 0.7 ? '3-6 meses' : '6-12 meses',
    },
    rentValuation: rentEstimate,
    marketContext: {
      zoneTrend: zoneInfo.trend,
      averagePriceInZone: `${zoneInfo.sale}€/m²`,
      comparablesCount: 0,
      demand: zoneInfo.trend === 'subida' ? 'alta' : zoneInfo.trend === 'bajada' ? 'baja' : 'media',
    },
    methodology: 'Se ha utilizado el método comparativo de mercado (MCM) ajustando por factores de ubicación, estado, antigüedad, superficie y características adicionales.',
    date: new Date().toISOString().split('T')[0],
  };
}

function comparablesAnalysisFallback(propertyData, similarProperties) {
  const saleEstimate = calculatePriceFallback(propertyData);

  if (!similarProperties || similarProperties.length === 0) {
    return {
      propertyEvaluated: propertyData.title || propertyData.titulo || 'Propiedad',
      estimatedValue: saleEstimate.estimatedPrice,
      comparablesFound: 0,
      comparables: [],
      conclusion: 'No se encontraron comparables suficientes. La tasación se basa en precios de referencia de la zona.',
      confidence: saleEstimate.confidence * 0.7,
    };
  }

  const comparables = similarProperties.slice(0, 10).map((comp) => {
    const compPrice = comp.price || comp.precio || 0;
    const compM2 = comp.squareMeters || comp.metros || comp.surface || 1;
    const compPriceM2 = compPrice / compM2;

    return {
      title: comp.title || comp.titulo || 'Comparable',
      price: compPrice,
      m2: compM2,
      pricePerM2: Math.round(compPriceM2),
      zone: comp.zone || comp.zona || comp.location || 'desconocida',
      condition: comp.condition || comp.estado || 'no especificado',
      distance: comp.distance || comp.distancia || 'no especificada',
    };
  });

  const avgPriceM2 = comparables.reduce((sum, c) => sum + c.pricePerM2, 0) / comparables.length;
  const estimatedPrice = Math.round(avgPriceM2 * (propertyData.squareMeters || propertyData.metros || 80));

  return {
    propertyEvaluated: propertyData.title || propertyData.titulo || 'Propiedad',
    estimatedValue: estimatedPrice,
    comparablesFound: comparables.length,
    comparables,
    avgPricePerM2: Math.round(avgPriceM2),
    conclusion: `Análisis basado en ${comparables.length} propiedades comparables. Precio medio en zona: ${Math.round(avgPriceM2)}€/m². El valor estimado es de ${estimatedPrice.toLocaleString()}€.`,
    confidence: Math.min(0.9, 0.5 + comparables.length * 0.04),
  };
}

export function getSystemPrompt() {
  return SYSTEM_PROMPT;
}

export async function estimatePrice(propertyData, comparables) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Estima el precio de venta óptimo de esta propiedad. Devuelve JSON con: estimatedPrice, priceRange (min, max), pricePerM2, confidence, factors (array de strings).

Property: ${JSON.stringify(propertyData)}
Comparables: ${JSON.stringify(comparables || [])}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Precio estimado: ${parsed.estimatedPrice?.toLocaleString()}€ (${parsed.pricePerM2}€/m²). Confianza: ${Math.round(parsed.confidence * 100)}%`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = calculatePriceFallback(propertyData);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: precio estimado ${result.estimatedPrice.toLocaleString()}€`
      : `Precio estimado: ${result.estimatedPrice.toLocaleString()}€ (${result.pricePerM2}€/m²). Confianza: ${Math.round(result.confidence * 100)}%`,
  };
}

export async function estimateRent(propertyData) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Estima el precio de alquiler óptimo de esta propiedad. Devuelve JSON con: estimatedRent, rentRange (min, max), rentPerM2, annualYield, confidence, factors.

Property: ${JSON.stringify(propertyData)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Alquiler estimado: ${parsed.estimatedRent}€/mes (${parsed.rentPerM2}€/m²). Rentabilidad: ${parsed.annualYield}% anual`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = calculateRentFallback(propertyData);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: alquiler estimado ${result.estimatedRent}€/mes`
      : `Alquiler estimado: ${result.estimatedRent}€/mes (${result.rentPerM2}€/m²). Rentabilidad: ${result.annualYield}% anual`,
  };
}

export async function analyzeMarketTrends(zoneData) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Analiza las tendencias de mercado para esta zona. Devuelve JSON con: zone, salePricePerM2, rentPricePerM2, trend, priceEvolution, demand, averageDaysOnMarket, recommendedAction.

Zone data: ${JSON.stringify(zoneData)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Tendencias en ${parsed.zone}: tendencia ${parsed.trend}, demanda ${parsed.demand}. Precio medio: ${parsed.salePricePerM2}€/m²`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = analyzeMarketTrendsFallback(zoneData);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: tendencias para ${result.zone}`
      : `Tendencias en ${result.zone}: tendencia ${result.trend}, demanda ${result.demand}`,
  };
}

export async function generateValuationReport(propertyData) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Genera un informe de tasación completo. Devuelve JSON con: propertySummary, saleValuation, rentValuation, marketContext, methodology, date.

Property: ${JSON.stringify(propertyData)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Informe de tasación generado para ${parsed.propertySummary?.address || 'propiedad'}. Valor venta: ${parsed.saleValuation?.estimatedPrice?.toLocaleString()}€`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = generateValuationReportFallback(propertyData);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: informe generado`
      : `Informe de tasación generado. Valor venta: ${result.saleValuation.estimatedPrice.toLocaleString()}€`,
  };
}

export async function comparablesAnalysis(propertyData, similarProperties) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Realiza un análisis comparativo de mercado (CMA). Devuelve JSON con: propertyEvaluated, estimatedValue, comparablesFound, comparables (array de {title, price, m2, pricePerM2, zone, condition, distance}), avgPricePerM2, conclusion, confidence.

Property: ${JSON.stringify(propertyData)}
Comparables: ${JSON.stringify(similarProperties || [])}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `CMA: ${parsed.comparablesFound} comparables encontrados. Precio medio: ${parsed.avgPricePerM2}€/m². Valor estimado: ${parsed.estimatedValue?.toLocaleString()}€`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = comparablesAnalysisFallback(propertyData, similarProperties);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: CMA con ${result.comparablesFound} comparables`
      : `CMA: ${result.comparablesFound} comparables. Precio medio: ${result.avgPricePerM2}€/m²`,
  };
}

export async function appraiseWithTools(payload) {
  const { propertyData, agencyId, userId } = payload;
  const errors = [];

  try {
    const systemPrompt = SYSTEM_PROMPT + `\n\nTienes acceso a herramientas. Puedes obtener propiedades comparables en la zona y calcular el precio medio de mercado. Úsalas para realizar una tasación precisa basada en datos reales del CRM.`;
    const userMsg = `Realiza una tasación completa de esta propiedad. Busca comparables en la zona y calcula el precio de mercado.\n\nPropiedad:\n${JSON.stringify(propertyData, null, 2)}`;

    const finalResponse = await runAgentWithTools({
      systemPrompt,
      userMessage: userMsg,
      agentType: 'tasador',
      context: { agencyId, userId },
    });

    let parsed;
    try { parsed = JSON.parse(finalResponse); } catch { parsed = { raw: finalResponse }; }

    return {
      success: true,
      toolUsed: true,
      result: parsed,
      insight: `Tasación completada con tools. Valor: ${parsed.saleValuation?.estimatedPrice || parsed.estimatedPrice || 'N/A'}`,
    };
  } catch (err) {
    errors.push(err.message);
  }

  return generateValuationReport(propertyData);
}

export async function execute(context) {
  const { action, payload } = context;

  switch (action) {
    case 'estimatePrice':
      return estimatePrice(payload.propertyData, payload.comparables);
    case 'estimateRent':
      return estimateRent(payload.propertyData);
    case 'analyzeMarketTrends':
      return analyzeMarketTrends(payload.zoneData);
    case 'generateValuationReport':
      return generateValuationReport(payload.propertyData);
    case 'comparablesAnalysis':
      return comparablesAnalysis(payload.propertyData, payload.similarProperties);
    case 'appraiseWithTools':
      return appraiseWithTools(payload);
    default:
      return {
        success: false,
        result: null,
        insight: `Acción desconocida: ${action}. Acciones disponibles: estimatePrice, estimateRent, analyzeMarketTrends, generateValuationReport, comparablesAnalysis, appraiseWithTools`,
      };
  }
}
