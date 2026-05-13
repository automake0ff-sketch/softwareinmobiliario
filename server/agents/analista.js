import { askClaude, isClientAvailable } from '../services/claude.js';

const ZONE_PRICES = {
  centro: { sale: 3500, rent: 14, trend: 'subida', demand: 'alta' },
  norte: { sale: 2800, rent: 11, trend: 'estable', demand: 'media' },
  sur: { sale: 2200, rent: 9, trend: 'subida', demand: 'media' },
  este: { sale: 2600, rent: 10.5, trend: 'estable', demand: 'media' },
  oeste: { sale: 3000, rent: 12, trend: 'subida', demand: 'alta' },
  playa: { sale: 3200, rent: 13, trend: 'subida', demand: 'alta' },
  montaña: { sale: 2000, rent: 8, trend: 'estable', demand: 'baja' },
  ensanche: { sale: 3800, rent: 15, trend: 'subida', demand: 'alta' },
  periferia: { sale: 1800, rent: 7.5, trend: 'bajada', demand: 'media' },
};

const SYSTEM_PROMPT = `Eres un Analista de Datos IA especializado en CRM inmobiliario. Tu misión es convertir datos en decisiones.

Análisis que realizas:

1. Análisis de pipeline:
   - Cuellos de botella: detectas etapas donde se pierden más leads
   - Conversión entre etapas: calculas tasas de conversión de cada transición
   - Tiempo medio por etapa y total

2. Análisis de comerciales:
   - Ratio de conversión (cierres / leads asignados)
   - Tiempo de respuesta medio
   - Visitas realizadas vs conversión
   - Ranking de rendimiento

3. Análisis de fuentes:
   - Volumen de leads por fuente
   - Calidad (score medio) por fuente
   - Coste estimado por lead y por cierre
   - ROI por fuente

4. Proyección de cierres:
   - Cierres probables (score >70%): leads con alta probabilidad en pipeline
   - Cierres posibles (score 40-70%): leads con seguimiento activo
   - Revenue proyectado: suma de valores estimados ponderados por probabilidad

5. Informe semanal automático:
   - Se genera cada lunes a las 8:00 AM
   - Incluye: KPIs clave, comparativa semanal, tendencias
   - TOP 3 acciones recomendadas basadas en datos

Siempre respondes en formato JSON. Tus análisis deben ser accionables y enfocados en mejorar KPIs: tasa de conversión, tiempo medio de cierre, leads por comercial, coste por lead, ROI de campañas.`;

function analyzePipelineFallback(pipelineData) {
  const stages = pipelineData.stages || pipelineData.etapas || [
    { name: 'nuevo', count: 0 },
    { name: 'contactado', count: 0 },
    { name: 'interesado', count: 0 },
    { name: 'visita', count: 0 },
    { name: 'negociación', count: 0 },
    { name: 'cerrado', count: 0 },
  ];

  const totalLeads = stages.reduce((sum, s) => sum + (s.count || 0), 0);
  const bottlenecks = [];
  const recommendations = [];

  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1];
    const curr = stages[i];
    const prevCount = prev.count || 0;
    const currCount = curr.count || 0;

    if (prevCount > 0) {
      const conversion = (currCount / prevCount) * 100;

      if (conversion < 20 && prevCount > 5) {
        bottlenecks.push({
          from: prev.name,
          to: curr.name,
          conversionRate: Math.round(conversion * 10) / 10,
          severity: 'alta',
          suggestion: `Solo el ${Math.round(conversion * 10) / 10}% pasa de "${prev.name}" a "${curr.name}". Revisar proceso de ${prev.name}.`,
        });
      } else if (conversion < 40) {
        bottlenecks.push({
          from: prev.name,
          to: curr.name,
          conversionRate: Math.round(conversion * 10) / 10,
          severity: 'media',
          suggestion: `Mejorar transición de "${prev.name}" a "${curr.name}" (${Math.round(conversion * 10) / 10}%).`,
        });
      }
    }
  }

  const avgDealTime = pipelineData.averageDealTime || pipelineData.tiempoMedioCierre || 45;
  const conversionRate = pipelineData.conversionRate || pipelineData.tasaConversion || 0;

  return {
    totalLeads,
    stages,
    bottlenecks,
    metrics: {
      averageDealTimeDays: avgDealTime,
      overallConversionRate: conversionRate || (totalLeads > 0 ? Math.round((stages.find((s) => s.name === 'cerrado')?.count || 0) / totalLeads * 1000) / 10 : 0),
      leadsLostInPipeline: bottlenecks.reduce((sum, b) => sum + (b.severity === 'alta' ? 1 : 0), 0),
    },
    recommendations: [
      ...bottlenecks.map((b) => b.suggestion),
      bottlenecks.length === 0 ? 'Pipeline saludable. Sin cuellos de botella detectados.' : null,
      `Tiempo medio de cierre: ${avgDealTime} días.`,
      totalLeads > 50 ? 'Volumen suficiente para análisis estadístico significativo.' : 'Volumen bajo: considerar aumentar generación de leads.',
    ].filter(Boolean),
  };
}

function analyzeAgentPerformanceFallback(agentData) {
  if (!agentData || !agentData.agents || agentData.agents.length === 0) {
    return {
      agents: [],
      topPerformer: null,
      needsImprovement: null,
      averageConversion: 0,
      recommendations: ['No hay datos suficientes de agentes para analizar.'],
    };
  }

  const agents = agentData.agents.map((agent) => {
    const leads = agent.leadsAssigned || agent.leadsAsignados || 0;
    const deals = agent.dealsClosed || agent.operacionesCerradas || 0;
    const visits = agent.visitsDone || agent.visitasRealizadas || 0;
    const responseTime = agent.averageResponseTime || agent.tiempoRespuesta || 60;

    const conversionRate = leads > 0 ? (deals / leads) * 100 : 0;
    const visitRate = leads > 0 ? (visits / leads) * 100 : 0;

    let rating = 0;
    if (conversionRate > 15) rating = 5;
    else if (conversionRate > 10) rating = 4;
    else if (conversionRate > 5) rating = 3;
    else if (conversionRate > 2) rating = 2;
    else rating = 1;

    return {
      name: agent.name || agent.nombre || agent.id || 'Desconocido',
      leadsAssigned: leads,
      visitsDone: visits,
      dealsClosed: deals,
      conversionRate: Math.round(conversionRate * 10) / 10,
      visitRate: Math.round(visitRate * 10) / 10,
      averageResponseTimeMinutes: responseTime,
      rating,
      strengths: conversionRate > 10 ? 'Alta capacidad de cierre' : visitRate > 50 ? 'Buena captación en visitas' : 'Consistente',
      areasForImprovement: conversionRate < 5 ? 'Mejorar técnicas de cierre' : responseTime > 120 ? 'Reducir tiempo de respuesta' : 'Mantener rendimiento',
    };
  });

  agents.sort((a, b) => b.rating - a.rating);
  const avgConv = agents.reduce((s, a) => s + a.conversionRate, 0) / agents.length;

  return {
    agents,
    topPerformer: agents[0] || null,
    needsImprovement: agents[agents.length - 1] || null,
    averageConversion: Math.round(avgConv * 10) / 10,
    recommendations: [
      agents[0] ? `Mejor comercial: ${agents[0].name} (${agents[0].conversionRate}% conversión).` : null,
      agents[agents.length - 1]?.conversionRate < 5 ? `${agents[agents.length - 1].name} necesita formación en cierre.` : null,
      avgConv < 8 ? 'La conversión media está por debajo del objetivo (8%). Revisar proceso de ventas.' : 'Conversión media en buen estado.',
    ].filter(Boolean),
  };
}

function detectOpportunitiesFallback(marketData) {
  const zones = marketData.zones || marketData.zonas || [];
  const trends = marketData.trends || marketData.tendencias || {};

  if (zones.length === 0) {
    const defaultZones = Object.entries(ZONE_PRICES).map(([name, data]) => ({ name, ...data }));
    return {
      opportunities: [
        {
          zone: 'centro',
          type: 'venta rápida',
          reason: 'Alta demanda y precios en subida',
          potentialProfit: 'alto',
          suggestedAction: 'Priorizar captación de propiedades en centro',
        },
      ],
      topZone: 'centro',
      insight: 'Sin datos de mercado. Usando valores por defecto.',
    };
  }

  const opportunities = zones
    .filter((z) => z.trend === 'subida' && z.demand === 'alta')
    .map((z) => ({
      zone: z.name || z.zone || z.zona,
      type: 'inversión',
      reason: `Precio en subida con alta demanda`,
      salePriceM2: z.salePricePerM2 || z.sale || z.precioVenta,
      rentPriceM2: z.rentPricePerM2 || z.rent || z.precioAlquiler,
      potentialProfit: 'alto',
      suggestedAction: 'Captar propiedades para venta rápida',
    }));

  const stableZones = zones
    .filter((z) => z.trend === 'estable' && z.demand === 'media')
    .map((z) => ({
      zone: z.name || z.zone || z.zona,
      type: 'alquiler estable',
      reason: 'Mercado estable con demanda constante',
      potentialProfit: 'medio',
      suggestedAction: 'Foco en alquiler de larga duración',
    }));

  const allOps = [...opportunities, ...stableZones];
  allOps.sort((a, b) => (a.potentialProfit === 'alto' ? -1 : 1));

  return {
    opportunities: allOps,
    topZone: allOps[0]?.zone || 'desconocida',
    insight: `${allOps.length} oportunidades detectadas en el mercado.`,
    recommendations: [
      allOps.length > 0 ? `Zona más prometedora: ${allOps[0].zone} (${allOps[0].type})` : null,
      `Hay ${opportunities.length} zonas con potencial de inversión.`,
      `Hay ${stableZones.length} zonas estables para alquiler.`,
    ].filter(Boolean),
  };
}

function generateWeeklyReportFallback(agencyData) {
  const pipeline = analyzePipelineFallback(agencyData.pipeline || {});
  const agents = analyzeAgentPerformanceFallback(agencyData.agents || {});

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekLabel = `Semana del ${weekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`;

  const top3 = [
    pipeline.bottlenecks[0] ? `Resolver cuello de botella: ${pipeline.bottlenecks[0].from} → ${pipeline.bottlenecks[0].to} (${pipeline.bottlenecks[0].conversionRate}%)` : 'Pipeline sin cuellos de botella',
    agents.needsImprovement ? `Formación para ${agents.needsImprovement.name}: mejorar tasa de cierre (${agents.needsImprovement.conversionRate}%)` : 'Equipo comercial equilibrado',
    pipeline.metrics.overallConversionRate < 10 ? 'Implementar nuevo proceso de cualificación de leads' : 'Mantener estrategia actual de captación',
  ];

  return {
    reportPeriod: weekLabel,
    generatedAt: new Date().toISOString(),
    pipelineSummary: {
      totalLeads: pipeline.totalLeads,
      bottlenecks: pipeline.bottlenecks,
      overallConversion: pipeline.metrics.overallConversionRate,
      averageDealTime: pipeline.metrics.averageDealTimeDays,
    },
    agentSummary: {
      averageConversion: agents.averageConversion,
      topPerformer: agents.topPerformer?.name || 'N/A',
      topPerformerRate: agents.topPerformer?.conversionRate || 0,
    },
    kpis: [
      { metric: 'Leads totales', value: pipeline.totalLeads, unit: 'leads' },
      { metric: 'Tasa de conversión global', value: `${pipeline.metrics.overallConversionRate}%`, unit: '%' },
      { metric: 'Tiempo medio de cierre', value: pipeline.metrics.averageDealTimeDays, unit: 'días' },
      { metric: 'Conversión media agentes', value: `${agents.averageConversion}%`, unit: '%' },
      { metric: 'Cuellos de botella', value: pipeline.bottlenecks.length, unit: 'detectados' },
    ],
    top3Recommendations: top3,
    recommendations: [
      ...pipeline.recommendations,
      ...agents.recommendations,
    ],
  };
}

function predictConversionFallback(leadData) {
  const score = leadData.score || leadData.puntuacion || 50;
  const message = leadData.message || leadData.comments || '';
  const source = leadData.source || leadData.origin || '';
  const visitsDone = leadData.visitsDone || leadData.visitasRealizadas || 0;
  const objectionsCount = leadData.objectionsRaised?.length || leadData.objeciones?.length || 0;
  const daysSinceFirstContact = leadData.daysSinceFirstContact || leadData.diasDesdeContacto || 0;

  let baseProbability = score / 100;

  if (visitsDone >= 1) baseProbability += 0.15;
  if (visitsDone >= 2) baseProbability += 0.1;

  if (message.length > 100) baseProbability += 0.05;
  if (/gracias|me gusta|quiero|necesito/i.test(message)) baseProbability += 0.1;
  if (/no sé|quizás|tal vez|veremos/i.test(message)) baseProbability -= 0.1;
  if (/caro|precio|no puedo|difícil/i.test(message)) baseProbability -= 0.15;

  if (/whatsapp|llamada|teléfono/i.test(source)) baseProbability += 0.1;
  if (/instagram|facebook/i.test(source)) baseProbability -= 0.05;

  if (objectionsCount > 3) baseProbability -= 0.1;
  if (daysSinceFirstContact > 30) baseProbability -= 0.2;
  else if (daysSinceFirstContact > 14) baseProbability -= 0.1;

  const probability = Math.max(0, Math.min(1, baseProbability));

  return {
    conversionProbability: Math.round(probability * 1000) / 10,
    probability: probability,
    factors: [
      visitsDone > 0 ? `Ha realizado ${visitsDone} visita(s): +${Math.round((visitsDone >= 1 ? 0.15 : 0) * 100)}%` : 'Sin visitas todavía',
      `Puntuación base: ${score}/100 (${Math.round(score)}%)`,
      objectionsCount > 0 ? `Objeciones planteadas: ${objectionsCount}` : 'Sin objeciones registradas',
      daysSinceFirstContact > 0 ? `Días desde primer contacto: ${daysSinceFirstContact}` : 'Contacto reciente',
    ],
    suggestedAction: probability >= 0.7
      ? 'Alta probabilidad. Enfocar esfuerzos en cierre.'
      : probability >= 0.4
        ? 'Probabilidad media. Reforzar con seguimiento y visitas.'
        : 'Baja probabilidad. Reactivar o considerar descarte.',
    confidence: Math.round((0.5 + (Math.abs(probability - 0.5) * 0.5)) * 100),
  };
}

export function getSystemPrompt() {
  return SYSTEM_PROMPT;
}

export async function analyzePipeline(pipelineData) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Analiza el pipeline de ventas. Devuelve JSON con: totalLeads, stages (array de {name, count, conversion}), bottlenecks (array de {from, to, conversionRate, severity, suggestion}), metrics (averageDealTimeDays, overallConversionRate, leadsLostInPipeline), recommendations.

Pipeline: ${JSON.stringify(pipelineData)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Pipeline analizado: ${parsed.totalLeads} leads, ${parsed.bottlenecks?.length || 0} cuellos de botella detectados`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = analyzePipelineFallback(pipelineData);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: pipeline analizado`
      : `Pipeline analizado: ${result.totalLeads} leads, ${result.bottlenecks.length} cuellos de botella`,
  };
}

export async function analyzeAgentPerformance(agentData) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Evalúa el rendimiento de los agentes comerciales. Devuelve JSON con: agents (array de {name, leadsAssigned, visitsDone, dealsClosed, conversionRate, rating, strengths, areasForImprovement}), topPerformer, needsImprovement, averageConversion, recommendations.

Agent data: ${JSON.stringify(agentData)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Rendimiento analizado: ${parsed.agents?.length || 0} agentes. Mejor: ${parsed.topPerformer?.name || 'N/A'}`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = analyzeAgentPerformanceFallback(agentData);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: rendimiento analizado`
      : `Rendimiento analizado: ${result.agents.length} agentes. Mejor: ${result.topPerformer?.name || 'N/A'}`,
  };
}

export async function detectOpportunities(marketData) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Detecta oportunidades de mercado para una agencia inmobiliaria. Devuelve JSON con: opportunities (array de {zone, type, reason, potentialProfit, suggestedAction}), topZone, insight, recommendations.

Market data: ${JSON.stringify(marketData)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `${parsed.opportunities?.length || 0} oportunidades detectadas. Mejor zona: ${parsed.topZone}`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = detectOpportunitiesFallback(marketData);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: ${result.opportunities.length} oportunidades`
      : `${result.opportunities.length} oportunidades detectadas. Mejor zona: ${result.topZone}`,
  };
}

export async function generateWeeklyReport(agencyData) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Genera un informe semanal de analytics. Devuelve JSON con: reportPeriod, generatedAt, pipelineSummary, agentSummary, kpis (array de {metric, value, unit}), top3Recommendations, recommendations.

Agency data: ${JSON.stringify(agencyData)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Informe semanal generado: ${parsed.kpis?.length || 0} KPIs, ${parsed.recommendations?.length || 0} recomendaciones`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = generateWeeklyReportFallback(agencyData);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: informe semanal generado`
      : `Informe semanal generado: ${result.kpis.length} KPIs, ${result.recommendations.length} recomendaciones`,
  };
}

export async function predictConversion(leadData) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Predice la probabilidad de conversión de este lead. Devuelve JSON con: conversionProbability (0-100), probability (0-1), factors (array de strings), suggestedAction, confidence (0-100).

Lead: ${JSON.stringify(leadData)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Probabilidad de conversión: ${parsed.conversionProbability}%. Acción sugerida: ${parsed.suggestedAction}`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = predictConversionFallback(leadData);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: ${result.conversionProbability}% probabilidad`
      : `Probabilidad de conversión: ${result.conversionProbability}%. Acción: ${result.suggestedAction}`,
  };
}

export async function execute(context) {
  const { action, payload } = context;

  switch (action) {
    case 'analyzePipeline':
      return analyzePipeline(payload.pipelineData);
    case 'analyzeAgentPerformance':
      return analyzeAgentPerformance(payload.agentData);
    case 'detectOpportunities':
      return detectOpportunities(payload.marketData);
    case 'generateWeeklyReport':
      return generateWeeklyReport(payload.agencyData);
    case 'predictConversion':
      return predictConversion(payload.leadData);
    default:
      return {
        success: false,
        result: null,
        insight: `Acción desconocida: ${action}. Acciones disponibles: analyzePipeline, analyzeAgentPerformance, detectOpportunities, generateWeeklyReport, predictConversion`,
      };
  }
}
