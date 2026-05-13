import { askClaude, isClientAvailable } from '../services/claude.js';

const SYSTEM_PROMPT = `Eres un experto en SEO inmobiliario. Optimizas fichas de propiedades, generas contenido local, sugieres palabras clave y creas meta-datos para mejorar el posicionamiento en buscadores.

Siempre respondes en formato JSON. Conoces: SEO on-page, palabras clave long-tail, SEO local, estrategias de contenido inmobiliario y optimizacion para portales.`;

function optimizePropertySEOFallback(propertyData) {
  const title = propertyData.title || propertyData.titulo || '';
  const type = propertyData.type || propertyData.tipo || 'piso';
  const city = propertyData.city || propertyData.ciudad || '';
  const zone = propertyData.zone || propertyData.zona || '';
  const beds = propertyData.bedrooms || propertyData.habitaciones || 0;
  const baths = propertyData.bathrooms || propertyData.banos || 0;
  const price = propertyData.price || propertyData.precio || '';
  const surf = propertyData.surface || propertyData.metros || 0;
  const desc = propertyData.description || propertyData.descripcion || '';

  const location = zone ? `${zone}, ${city}` : city;
  const priceFormatted = typeof price === 'number' ? `${price.toLocaleString()}€` : price;

  const seoTitle = `${type.charAt(0).toUpperCase() + type.slice(1)} en ${location} - ${beds} hab - ${surf}m2 - ${priceFormatted}`;
  const metaDescription = `Increible ${type} en ${location}. ${beds} dormitorios, ${baths} banos, ${surf}m2. ${priceFormatted}. ${desc.substring(0, 80)}... Visitanos para mas informacion.`;

  const longTailKeywords = [
    `${type} en ${zone || 'venta'} ${city}`,
    `comprar ${type} ${zone ? 'en ' + zone : ''} ${city}`,
    `${type} ${beds} habitaciones ${priceFormatted}`,
    `${type} economico en ${city}`,
    `mejor ${type} en ${zone || city}`,
  ];

  const improvements = [];
  if (!desc || desc.length < 100) improvements.push('Descripcion demasiado corta. Anadir al menos 200 palabras.');
  if (!zone) improvements.push('Especificar la zona para mejorar SEO local.');
  if (surf <= 0) improvements.push('Incluir metros cuadrados en el titulo y descripcion.');

  return {
    originalTitle: title,
    optimizedTitle: seoTitle,
    metaDescription,
    metaKeywords: longTailKeywords,
    slug: `${type}-en-${(zone || city).replace(/\s+/g, '-').toLowerCase()}-${beds}-hab`,
    improvements,
    score: improvements.length === 0 ? 95 : 70,
  };
}

function generateLocalContentFallback(city, zone) {
  const cityName = city || 'la ciudad';
  const zoneName = zone || 'la zona';

  const topics = [
    {
      title: `Guia para comprar vivienda en ${zoneName}, ${cityName}`,
      description: `Todo lo que necesitas saber antes de comprar una propiedad en ${zoneName}. Precios medios, mejores calles, transporte y servicios.`,
      keywords: [`comprar casa ${zoneName}`, `precio vivienda ${zoneName}`, `mejores zonas ${cityName}`],
    },
    {
      title: `Precio del m2 en ${zoneName} - ${new Date().getFullYear()}`,
      description: `Analisis actualizado del precio por metro cuadrado en ${zoneName}, ${cityName}. Evolucion de precios y tendencias del mercado.`,
      keywords: [`precio m2 ${zoneName}`, `metro cuadrado ${zoneName}`, `evolucion precios ${zoneName}`],
    },
    {
      title: `Los 10 mejores barrios para vivir en ${zoneName}`,
      description: `Descubre los mejores barrios de ${zoneName}, ${cityName}. Zonas tranquilas, bien comunicadas y con mejores servicios.`,
      keywords: [`mejores barrios ${zoneName}`, `donde vivir ${zoneName}`, `zonas tranquilas ${cityName}`],
    },
    {
      title: `Vivir en ${zoneName}: opiniones y guia completa`,
      description: `Guia completa sobre ${zoneName}: transporte, colegios, sanidad, ocio y precio de la vivienda. Todo lo que necesitas saber.`,
      keywords: [`vivir en ${zoneName}`, `opiniones ${zoneName}`, `guia ${zoneName} ${cityName}`],
    },
  ];

  return {
    city: cityName,
    zone: zoneName,
    contentIdeas: topics,
    totalArticles: topics.length,
    recommendedFrequency: '2 articulos por semana',
    localKeywords: topics.flatMap((t) => t.keywords).slice(0, 10),
  };
}

function suggestKeywordsFallback(propertyData) {
  const type = propertyData.type || propertyData.tipo || 'piso';
  const city = propertyData.city || propertyData.ciudad || '';
  const zone = propertyData.zone || propertyData.zona || '';
  const price = propertyData.price || propertyData.precio || 0;
  const beds = propertyData.bedrooms || propertyData.habitaciones || 0;
  const features = propertyData.features || propertyData.caracteristicas || [];

  const location = zone ? `${zone} ${city}`.trim() : city;
  const priceCategory = price > 500000 ? 'lujo' : price > 250000 ? 'calidad-precio' : 'economico';

  const keywords = [
    { keyword: `${type} en ${location}`, volume: 'alto', difficulty: 'media', intent: 'compra' },
    { keyword: `${type} ${beds} habitaciones ${location}`, volume: 'medio', difficulty: 'baja', intent: 'compra' },
    { keyword: `${type} ${priceCategory} ${location}`, volume: 'medio', difficulty: 'baja', intent: 'compra' },
    { keyword: `comprar ${type} en ${zone || city}`, volume: 'medio', difficulty: 'media', intent: 'compra' },
  ];

  if (features.length > 0) {
    features.slice(0, 3).forEach((f) => {
      keywords.push({
        keyword: `${type} con ${f} ${location}`,
        volume: 'bajo',
        difficulty: 'baja',
        intent: 'compra',
      });
    });
  }

  return {
    primaryKeywords: keywords.slice(0, 3),
    longTailKeywords: keywords.slice(3),
    totalKeywords: keywords.length,
    recommendedFocus: keywords[0]?.keyword || `${type} en ${city}`,
    strategy: 'Enfocar en keywords long-tail de baja competencia con intencion de compra.',
  };
}

function generateMetaDataFallback(propertyData) {
  const title = propertyData.title || propertyData.titulo || 'Propiedad';
  const type = propertyData.type || propertyData.tipo || 'piso';
  const city = propertyData.city || propertyData.ciudad || '';
  const zone = propertyData.zone || propertyData.zona || '';
  const price = propertyData.price || propertyData.precio || '';
  const beds = propertyData.bedrooms || propertyData.habitaciones || 0;
  const surf = propertyData.surface || propertyData.metros || 0;
  const desc = propertyData.description || propertyData.descripcion || '';
  const priceStr = typeof price === 'number' ? `${price.toLocaleString()}€` : price;
  const location = zone ? `${zone}, ${city}` : city;

  return {
    metaTitle: `${title} | ${type} en ${location} | ${priceStr}`.substring(0, 70),
    metaDescription: `${desc.substring(0, 120)}... ${beds} hab, ${surf}m2, ${priceStr}. Visita nuestra ficha completa.`.substring(0, 160),
    ogTitle: `${type.charAt(0).toUpperCase() + type.slice(1)} en ${location}`,
    ogDescription: desc.substring(0, 200) || `Increible ${type} en ${location}. ${beds} habitaciones, ${surf}m2.`,
    twitterCard: `summary_large_image`,
    canonical: `/propiedades/${type}-${(zone || city).replace(/\s+/g, '-').toLowerCase()}`,
  };
}

function generateBlogPostFallback(topic, zone, keywords) {
  const zoneName = zone || 'tu zona';
  const kwList = keywords || [];
  const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

  const postTemplates = {
    compra: {
      title: `Guia completa para comprar piso en ${zoneName} en ${new Date().getFullYear()}`,
      intro: `Comprar una vivienda en ${zoneName} es una decision importante. En esta guia te contamos todo lo que necesitas saber: precios, tramites, mejores zonas y consejos para acertar.`,
      sections: [
        { heading: `Precio medio de la vivienda en ${zoneName}`, content: `Actualmente, el precio medio del metro cuadrado en ${zoneName} se situa en torno a los 2.500-3.500€ dependiendo de la zona concreta y el estado de la propiedad.` },
        { heading: 'Mejores zonas para comprar', content: `Las zonas mas demandadas en ${zoneName} son aquellas bien comunicadas por transporte publico, con colegios cercanos y zonas verdes.` },
        { heading: 'Tramites necesarios', content: 'Para comprar una vivienda necesitaras: nota simple, certificado energetico, contrato de arras, escrituras y financiacion aprobada.' },
        { heading: 'Consejos para negociar', content: 'Revisa el estado real de la propiedad, compara precios de la zona, y no tengas miedo de negociar el precio.' },
      ],
      conclusion: `En resumen, comprar en ${zoneName} es una excelente inversion. Con la informacion adecuada y el asesoramiento correcto, encontraras la propiedad ideal.`,
      seoKeywords: kwList.slice(0, 5),
    },
    venta: {
      title: `Consejos para vender tu propiedad en ${zoneName} rapido y al mejor precio`,
      intro: `Vender una propiedad en ${zoneName} requiere estrategia. Te contamos como preparar tu casa, fijar el precio adecuado y comercializarla eficazmente.`,
      sections: [
        { heading: 'Prepara tu casa para la venta', content: 'Limpieza profunda, pequenas reparaciones, home staging si es necesario. Las primeras impresiones cuentan.' },
        { heading: `Precio adecuado en ${zoneName}`, content: 'Realiza un estudio de mercado comparativo para fijar un precio realista y competitivo.' },
        { heading: 'Canales de comercializacion', content: 'Portales inmobiliarios, redes sociales, colaboracion con agencias. Multiplica tu alcance.' },
      ],
      conclusion: `Vender en ${zoneName} es posible si sigues estos consejos. Una buena estrategia marca la diferencia.`,
      seoKeywords: kwList.slice(0, 5),
    },
    inversion: {
      title: `Invertir en inmuebles en ${zoneName}: rentabilidad y oportunidades`,
      intro: `La inversion inmobiliaria en ${zoneName} ofrece rentabilidades atractivas. Analizamos las mejores oportunidades y zonas con mayor plusvalia.`,
      sections: [
        { heading: `Rentabilidad por alquiler en ${zoneName}`, content: 'La rentabilidad bruta por alquiler se situa entre el 4% y el 7% anual en las mejores zonas.' },
        { heading: 'Zonas con mayor revalorizacion', content: 'Las zonas en desarrollo o cercanas a nuevas infraestructuras suelen experimentar mayor revalorizacion.' },
      ],
      conclusion: `${zoneName} presenta buenas oportunidades de inversion. La clave esta en elegir bien la zona y el tipo de propiedad.`,
      seoKeywords: kwList.slice(0, 5),
    },
  };

  const topicLower = (topic || '').toLowerCase();
  let template;
  if (/venta|vender/i.test(topicLower)) template = postTemplates.venta;
  else if (/invers/i.test(topicLower)) template = postTemplates.inversion;
  else template = postTemplates.compra;

  return {
    title: template.title,
    date: today,
    estimatedReadTime: '5 min',
    wordCount: template.sections.reduce((sum, s) => sum + s.content.split(' ').length, 0) + template.intro.split(' ').length + template.conclusion.split(' ').length + 100,
    structure: {
      intro: template.intro,
      sections: template.sections,
      conclusion: template.conclusion,
    },
    seo: {
      focusKeyword: kwList[0] || `${topic} ${zoneName}`,
      secondaryKeywords: template.seoKeywords,
      internalLinks: ['/propiedades', '/agentes', '/contacto'],
    },
  };
}

export function getSystemPrompt() {
  return SYSTEM_PROMPT;
}

export async function optimizePropertySEO(propertyData) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Optimiza el SEO de una ficha de propiedad. Devuelve JSON con: originalTitle, optimizedTitle, metaDescription, metaKeywords, slug, improvements, score.
Property: ${JSON.stringify(propertyData)}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `SEO optimizado. Score: ${parsed.score}/100. Slug: ${parsed.slug}` };
    } catch (err) { errors.push(err.message); }
  }
  const result = optimizePropertySEOFallback(propertyData);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: SEO score ${result.score}` : `SEO optimizado. Score: ${result.score}/100` };
}

export async function generateLocalContent(city, zone) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Genera ideas de contenido local SEO para una inmobiliaria. Devuelve JSON con: city, zone, contentIdeas (array de {title, description, keywords}), totalArticles, recommendedFrequency, localKeywords.
City: ${city}
Zone: ${zone}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `${parsed.totalArticles} ideas de contenido para ${zone || city}` };
    } catch (err) { errors.push(err.message); }
  }
  const result = generateLocalContentFallback(city, zone);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: contenido local` : `${result.totalArticles} ideas de contenido para ${zone || city}` };
}

export async function suggestKeywords(propertyData) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Sugiere palabras clave SEO para una propiedad. Devuelve JSON con: primaryKeywords, longTailKeywords, totalKeywords, recommendedFocus, strategy.
Property: ${JSON.stringify(propertyData)}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `${parsed.totalKeywords} keywords sugeridas. Focus: ${parsed.recommendedFocus}` };
    } catch (err) { errors.push(err.message); }
  }
  const result = suggestKeywordsFallback(propertyData);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: ${result.totalKeywords} keywords` : `${result.totalKeywords} keywords sugeridas. Focus: ${result.recommendedFocus}` };
}

export async function generateMetaData(propertyData) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Genera meta datos SEO para una propiedad. Devuelve JSON con: metaTitle, metaDescription, ogTitle, ogDescription, twitterCard, canonical.
Property: ${JSON.stringify(propertyData)}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `Meta title: ${parsed.metaTitle?.substring(0, 50)}...` };
    } catch (err) { errors.push(err.message); }
  }
  const result = generateMetaDataFallback(propertyData);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: meta generado` : `Meta title: ${result.metaTitle?.substring(0, 50)}...` };
}

export async function generateBlogPost(topic, zone, keywords) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = `Genera un post de blog SEO inmobiliario completo. Devuelve JSON con: title, date, estimatedReadTime, wordCount, structure (intro, sections (array de {heading, content}), conclusion), seo (focusKeyword, secondaryKeywords, internalLinks).
Topic: ${topic}
Zone: ${zone}
Keywords: ${JSON.stringify(keywords)}
Responde UNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: `Blog post "${parsed.title}" generado (${parsed.estimatedReadTime} de lectura)` };
    } catch (err) { errors.push(err.message); }
  }
  const result = generateBlogPostFallback(topic, zone, keywords);
  return { success: true, result, insight: errors.length > 0 ? `Modo fallback: blog post generado` : `Blog post "${result.title}" generado (${result.estimatedReadTime})` };
}

export async function execute(context) {
  const { action, payload } = context;
  switch (action) {
    case 'optimizePropertySEO': return optimizePropertySEO(payload.propertyData);
    case 'generateLocalContent': return generateLocalContent(payload.city, payload.zone);
    case 'suggestKeywords': return suggestKeywords(payload.propertyData);
    case 'generateMetaData': return generateMetaData(payload.propertyData);
    case 'generateBlogPost': return generateBlogPost(payload.topic, payload.zone, payload.keywords);
    default: return { success: false, result: null, insight: `Accion desconocida: ${action}. Disponibles: optimizePropertySEO, generateLocalContent, suggestKeywords, generateMetaData, generateBlogPost` };
  }
}
