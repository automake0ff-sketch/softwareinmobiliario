import { MCPServer } from './framework.js';
import { all, get } from '../db/db.js';

const server = new MCPServer('propia-market', '1.0.0');

const ZONE_PRICE_REFERENCE = {
  'centro': { sale: 3500, rent: 14, trend: 'subida' },
  'salamanca': { sale: 6000, rent: 18, trend: 'subida' },
  'chamberi': { sale: 4500, rent: 15, trend: 'subida' },
  'chamartin': { sale: 4000, rent: 14, trend: 'estable' },
  'retiro': { sale: 5000, rent: 16, trend: 'subida' },
  'eixample': { sale: 4800, rent: 16, trend: 'subida' },
  'gracia': { sale: 4000, rent: 14, trend: 'estable' },
  'ciuutat-vella': { sale: 4000, rent: 14, trend: 'estable' },
  'sarria': { sale: 5500, rent: 17, trend: 'subida' },
  'ruzafa': { sale: 3200, rent: 12, trend: 'subida' },
  'ensanche': { sale: 3500, rent: 13, trend: 'subida' },
  'cabanyal': { sale: 2800, rent: 11, trend: 'subida' },
  'benimaclet': { sale: 2500, rent: 10, trend: 'estable' },
  'alguno': { sale: 3000, rent: 12, trend: 'subida' },
  'la moraleja': { sale: 7000, rent: 20, trend: 'subida' },
  'sierra': { sale: 2200, rent: 9, trend: 'estable' },
  'periferia': { sale: 1800, rent: 7.5, trend: 'bajada' },
};

server
  .resource('market://zones/reference', 'Precios de referencia por zona', 'Precio medio €/m² por zona y tendencia', async () => {
    return ZONE_PRICE_REFERENCE;
  })
  .resource('market://trends', 'Tendencias del mercado', 'Análisis de tendencia del mercado inmobiliario', async () => {
    return {
      nationalTrend: 'subida moderada',
      averagePricePerM2: 2500,
      annualIncrease: '3-5%',
      averageDaysToSell: 45,
      demandLevel: 'alta',
      segments: {
        premium: { trend: 'subida fuerte', demand: 'muy alta' },
        medium: { trend: 'subida moderada', demand: 'alta' },
        economic: { trend: 'estable', demand: 'media' },
      },
      updatedAt: new Date().toISOString().split('T')[0],
    };
  });

server
  .tool('search_portal_listings', 'Busca propiedades en datos internos del CRM como referencia de mercado', {
    type: 'object',
    properties: {
      zone: { type: 'string' },
      city: { type: 'string' },
      property_type: { type: 'string', enum: ['piso', 'casa', 'chalet', 'local', 'atico', 'estudio'] },
      price_max: { type: 'number' },
      bedrooms_min: { type: 'number' },
      limit: { type: 'number' },
    },
    required: ['zone', 'city'],
  }, async (args) => {
    const params = { zone: `%${args.zone}%`, city: `%${args.city}%` };
    let sql = `SELECT id, title, price, type, city, zone, bedrooms, bathrooms, surface, status, created_at
               FROM properties WHERE (zone LIKE @zone OR city LIKE @city) AND status = 'disponible'`;

    if (args.property_type) { sql += ' AND type = @type'; params.type = args.property_type; }
    if (args.price_max) { sql += ' AND price <= @max_price'; params.max_price = Number(args.price_max); }
    if (args.bedrooms_min) { sql += ' AND bedrooms >= @beds'; params.beds = Number(args.bedrooms_min); }
    sql += ' ORDER BY created_at DESC';
    if (args.limit) { sql += ' LIMIT @lim'; params.lim = Number(args.limit); } else sql += ' LIMIT 15';

    return all(sql, params);
  })

  .tool('get_price_per_sqm', 'Calcula el precio medio por m² en una zona', {
    type: 'object',
    properties: {
      zone: { type: 'string', description: 'Barrio o distrito' },
      city: { type: 'string' },
      property_type: { type: 'string' },
    },
    required: ['zone', 'city'],
  }, async (args) => {
    const zoneKey = args.zone?.toLowerCase().replace(/\s+/g, '-') || '';
    const ref = ZONE_PRICE_REFERENCE[zoneKey];

    const dbResult = await all(
      `SELECT price, surface, type, zone, city FROM properties
       WHERE (zone LIKE @zone OR city LIKE @city) AND status IN ('disponible', 'vendido')
       AND price > 0 AND surface > 0
       ${args.property_type ? "AND type = @type" : ""}
       LIMIT 50`,
      { zone: `%${args.zone}%`, city: `%${args.city}%`, type: args.property_type || '' }
    );

    const pricesPerM2 = dbResult.map(p => p.price / p.surface).filter(v => v > 0 && v < 50000);
    const dbAvg = pricesPerM2.length ? Math.round(pricesPerM2.reduce((a, b) => a + b, 0) / pricesPerM2.length) : null;

    return {
      zone: args.zone,
      city: args.city,
      propertyType: args.property_type || 'todos',
      referencePricePerM2: ref?.sale || null,
      referenceTrend: ref?.trend || 'desconocida',
      databaseAvgPricePerM2: dbAvg,
      databaseSampleSize: pricesPerM2.length,
      estimatedPriceFor100m2: (ref?.sale || dbAvg || 2500) * 100,
    };
  })

  .tool('analyze_investment', 'Analiza la rentabilidad de una inversión inmobiliaria en una zona', {
    type: 'object',
    properties: {
      zone: { type: 'string' },
      city: { type: 'string' },
      property_type: { type: 'string' },
      estimated_price: { type: 'number' },
    },
    required: ['zone', 'city'],
  }, async (args) => {
    const zoneKey = args.zone?.toLowerCase().replace(/\s+/g, '-') || '';
    const ref = ZONE_PRICE_REFERENCE[zoneKey] || { sale: 2500, rent: 10, trend: 'estable' };
    const price = args.estimated_price || (ref.sale * 80);
    const monthlyRent = ref.rent * 80;
    const annualRent = monthlyRent * 12;
    const grossYield = (annualRent / price) * 100;

    const  itp = price * 0.08;
    const notary = 600;
    const registry = 400;
    const totalCosts = itp + notary + registry;
    const totalInvestment = price + totalCosts;
    const netYield = (annualRent / totalInvestment) * 100;

    const yearlyAppreciation = ref.trend === 'subida' ? 0.04 : ref.trend === 'bajada' ? -0.02 : 0.01;
    const roi5Years = ((annualRent * 5) + (price * (1 + yearlyAppreciation) ** 5 - price)) / totalInvestment * 100;
    const paybackYears = totalInvestment / annualRent;
    const monthlyMortgageEstimate80 = price * 0.8 * (0.035 / 12 * (1 + 0.035 / 12) ** 360) / ((1 + 0.035 / 12) ** 360 - 1);

    return {
      property: { zone: args.zone, city: args.city, type: args.property_type || 'piso', estimatedPrice: price },
      rentalIncome: { monthly: Math.round(monthlyRent), annual: Math.round(annualRent) },
      yields: { grossYield: grossYield.toFixed(1) + '%', netYield: netYield.toFixed(1) + '%', roi5Years: roi5Years.toFixed(1) + '%' },
      costs: { itp: Math.round(itp), notary, registry, totalCosts: Math.round(totalCosts) },
      projections: {
        paybackYears: paybackYears.toFixed(1),
        monthlyMortgageEstimate80: Math.round(monthlyMortgageEstimate80),
        yearlyAppreciation: (yearlyAppreciation * 100).toFixed(1) + '%',
      },
      marketContext: { trend: ref.trend, zonePricePerM2: ref.sale, rentPricePerM2: ref.rent },
    };
  });

export default server;
