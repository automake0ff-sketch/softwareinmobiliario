import { askClaude, isClientAvailable } from '../services/claude.js';

const SYSTEM_PROMPT = `Eres un Copywriter IA experto en marketing inmobiliario. Creas contenido persuasivo que convierte.

Especialidades:

1. Fichas de propiedades:
   - Título SEO (máx 70 caracteres, incluyendo tipo, zona y precio)
   - Descripción corta (1-2 frases impactantes para vista previa)
   - Descripción larga (estructurada: beneficio principal → características → estilo de vida → CTA)
   - Bullets destacados (máx 6 puntos clave)
   - Lenguaje: beneficios antes que características ("disfruta de luz natural todo el día" vs "ventana grande")

2. Copies para Meta Ads (Facebook/Instagram):
   - Variante A: enfoque emocional-aspiracional
   - Variante B: enfoque racional-económico
   - Cada variante: titular (máx 40 caracteres), texto principal (máx 125 caracteres), CTA

3. Emails de seguimiento personalizados:
   - Post-visita: agradecimiento + resumen + siguiente paso
   - Newsletter mensual: propiedades destacadas + artículo de valor + CTA
   - Reactivación: nueva propiedad + oferta especial + urgencia
   - Pre-lanzamiento: exclusividad + anticipación + CTA limitado

4. Contenido redes sociales:
   - Instagram: copy aspiracional + hashtags estratégicos + CTA en comentarios
   - TikTok: hooks inmediatos + storytelling rápido + tendencias
   - LinkedIn: tono profesional + datos de mercado + autoridad

5. Newsletter mensual:
   - Asunto llamativo (máx 50 caracteres)
   - Preview text (máx 100 caracteres)
   - Secciones: editorial → propiedades destacadas → artículo → CTA

Reglas de oro:
- Beneficios antes que características
- Lenguaje sensorial: "imagina", "siente", "disfruta"
- Urgencia natural, no fabricada
- CTA claro y único por pieza
- Tono consistente con la marca (Profesional-cercano)

Siempre respondes en formato JSON. Adapta el tono según la plataforma.`;

function generateListingAdFallback(propertyData, platform) {
  const title = propertyData.title || propertyData.titulo || 'Propiedad';
  const price = propertyData.price || propertyData.precio || 'Consultar';
  const desc = propertyData.description || propertyData.descripcion || '';
  const rooms = propertyData.rooms || propertyData.habitaciones || propertyData.bedrooms || '?';
  const baths = propertyData.bathrooms || propertyData.banos || '?';
  const m2 = propertyData.squareMeters || propertyData.metros || propertyData.surface || '?';
  const zone = propertyData.zone || propertyData.zona || propertyData.location || 'excelente zona';
  const features = propertyData.features || propertyData.caracteristicas || [];

  const featText = features.length > 0
    ? features.slice(0, 5).join(', ')
    : 'amplio salón, cocina equipada, armarios empotrados, calefacción central';

  switch (platform?.toLowerCase()) {
    case 'idealista':
    case 'fotocasa':
      return {
        title: `${title} en ${zone} - ${rooms} habs - ${m2}m²`,
        description: `${title} en ${zone}\n\n${desc ? desc.substring(0, 200) + '...' : `Increíble oportunidad en ${zone}. ${rooms} habitaciones, ${baths} baños, ${m2}m² construidos.`}\n\nCaracterísticas destacadas:\n${featText}\n\nUbicación privilegiada\nListo para entrar\n\n${price}\n\nNo dudes en contactarnos para visitarla sin compromiso.`,
        highlights: [`${rooms} habitaciones`, `${m2}m²`, `${zone}`],
        seoKeywords: [`piso en ${zone}`, `comprar ${title.toLowerCase()}`, `inmobiliaria ${zone}`],
        callToAction: 'Contáctanos para visitarla sin compromiso',
        platform: 'idealista',
        tone: 'profesional',
      };

    case 'instagram':
      return {
        title: `Tu nuevo hogar en ${zone}`,
        description: `Despierta cada día en el lugar de tus sueños\n\n📍 ${zone}\n🛏 ${rooms} habs | 🛁 ${baths} baños | ${m2}m²\n💰 ${price}\n\n${featText}\n\n¿Te imaginas viviendo aquí? Nosotros sí.\n\nDM para visitas`,
        hashtags: ['inmobiliaria', 'comprarcasa', 'nuevohogar', 'vivienda', 'realestate', `viviren${zone.replace(/\s+/g, '')}`, 'oportunidad'],
        callToAction: 'DM para visitas o enlace en bio',
        platform: 'instagram',
        tone: 'aspiracional',
      };

    case 'tiktok':
      return {
        title: `${rooms} habs, ${m2}m², ${price} - Todo lo que tienes que ver`,
        description: `Así es ${title.toLowerCase()} en ${zone} por dentro\n\n${rooms} habitaciones · ${baths} baños · ${m2}m²\n\nLo mejor: ${featText.substring(0, 100)}\n\n💰 ${price}\n\n#inmobiliaria #casas #tour #property`,
        hashtags: ['inmobiliaria', 'casas', 'tour', 'property', 'realestate', 'parati'],
        callToAction: 'Guárdalo para cuando busques casa',
        platform: 'tiktok',
        tone: 'directo y viral',
      };

    default:
      return {
        title: `${title} en ${zone}`,
        description: `${title} en ${zone}. ${rooms} habitaciones, ${baths} baños, ${m2}m². Precio: ${price}. ${featText}. Contacta para más información.`,
        highlights: [`${rooms} hab`, `${m2}m²`, price],
        callToAction: 'Contacta para más información',
        platform: 'genérico',
        tone: 'profesional',
      };
  }
}

function generateEmailFallback(leadData, campaignType) {
  const name = leadData.name || leadData.nombre || '';
  const property = leadData.propertyTitle || leadData.property?.title || '';
  const campaign = (campaignType || '').toLowerCase();

  const campaigns = {
    followup: {
      subject: `${name}, ¿qué te pareció la propiedad?`,
      body: `Hola ${name},\n\nEspero que te encuentres bien. Quería saber qué te pareció ${property || 'la propiedad que viste'}.\n\nSi tienes cualquier duda o quieres dar el siguiente paso, estoy aquí para ayudarte.\n\nUn saludo cordial.`,
      type: 'follow-up',
    },
    newsletter: {
      subject: `Novedades inmobiliarias - ${new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`,
      body: `Hola ${name},\n\nEste mes tenemos novedades que te van a interesar:\n\nNuevas propiedades en zonas exclusivas\nAnálisis de mercado actualizado\nOportunidades de inversión\n\nNo dejes pasar las mejores oportunidades.\n\n¿Hablamos?`,
      type: 'newsletter',
    },
    reactivation: {
      subject: `${name}, ¿sigues buscando?`,
      body: `Hola ${name},\n\nHacía tiempo que no sabía de ti. Quería retomar el contacto porque hemos incorporado nuevas propiedades que podrían interesarte.\n\n¿Te gustaría echarles un vistazo?\n\nQuedo a tu disposición.`,
      type: 'reactivación',
    },
    promotion: {
      subject: `Oferta especial en ${property || 'nuestras propiedades'}`,
      body: `Hola ${name},\n\nTenemos una oferta especial que creo que te va a encantar.\n\n${property || 'Seleccionadas propiedades'} con condiciones únicas por tiempo limitado.\n\nPrecio especial\nTrámites rápidos\nAsesoría personalizada\n\nPlazas limitadas. ¡No te quedes sin la tuya!`,
      type: 'promoción',
    },
  };

  return campaigns[campaign] || campaigns.followup;
}

function generateSocialPostFallback(propertyData, platform) {
  const title = propertyData.title || propertyData.titulo || 'Propiedad';
  const price = propertyData.price || propertyData.precio || 'Consultar';
  const rooms = propertyData.rooms || propertyData.habitaciones || propertyData.bedrooms || '?';
  const zone = propertyData.zone || propertyData.zona || 'excelente zona';

  const baseHashtags = ['inmobiliaria', 'realestate', 'propiedades', `viviren${zone.replace(/\s+/g, '')}`];

  switch (platform?.toLowerCase()) {
    case 'instagram':
      return {
        caption: `${title} en ${zone}\n\n🛏 ${rooms} hab • 💰 ${price}\n\n¿Es tu próximo hogar? Cuéntanos qué te parece en los comentarios 👇\n\nEnlace en bio\nConsulta por DM`,
        hashtags: [...baseHashtags, 'nuevohogar', 'comprarcasa', 'oportunidad'],
        bestTime: '13:00-15:00 o 19:00-21:00',
        platform: 'instagram',
      };
    case 'tiktok':
      return {
        caption: `${title} en ${zone} 🏠 ${rooms} habs ${price} ¿TE LO ESPERABAS?\n\n#inmobiliaria #casas #parati #fyp #realestate`,
        hashtags: ['inmobiliaria', 'casas', 'parati', 'fyp', 'realestate', 'propertytour'],
        bestTime: '19:00-23:00',
        platform: 'tiktok',
      };
    case 'facebook':
      return {
        caption: `${title} - ${zone}\n\n🛏 ${rooms} dormitorios\n💰 ${price}\n\nMás información por mensaje privado o llamada. Comparte si conoces a alguien interesado 🙌`,
        hashtags: [...baseHashtags, 'comprarcasa', 'vivienda'],
        bestTime: '12:00-14:00 o 20:00-22:00',
        platform: 'facebook',
      };
    default:
      return {
        caption: `${title} en ${zone}. ${rooms} habitaciones. ${price}. Consúltanos!`,
        hashtags: baseHashtags,
        bestTime: '13:00',
        platform: 'genérico',
      };
  }
}

function improveDescriptionFallback(rawDescription) {
  const improvements = [
    { from: /\bgrande\b/gi, to: 'espacioso' },
    { from: /\bpequeño\b/gi, to: 'acogedor' },
    { from: /\bviejo\b/gi, to: 'con carácter' },
    { from: /\bantiguo\b/gi, to: 'clásico' },
    { from: /\bnormal\b/gi, to: 'funcional' },
    { from: /\bbien\b/gi, to: 'óptimas condiciones' },
    { from: /\bbarato\b/gi, to: 'excelente relación calidad-precio' },
    { from: /\bcerca\b/gi, to: 'a pocos minutos de' },
  ];

  let improved = rawDescription;
  for (const { from, to } of improvements) {
    improved = improved.replace(from, to);
  }

  const sentences = improved.match(/[^.!?]+[.!?]+/g) || [improved];
  const capitalized = sentences
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');

  return {
    original: rawDescription.substring(0, 500),
    improved: capitalized.substring(0, 1000) || 'Descripción mejorada disponible',
    changes: [
      'Vocabulario mejorado con términos persuasivos',
      'Corrección de mayúsculas y puntuación',
      'Tono profesional aplicado',
    ],
    wordCount: capitalized.split(/\s+/).length,
  };
}

export function getSystemPrompt() {
  return SYSTEM_PROMPT;
}

export async function generateListingAd(propertyData, platform) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Genera un anuncio para ${platform} con estos datos de propiedad. Devuelve JSON con: title, description, highlights, seoKeywords, callToAction, platform, tone.

Property: ${JSON.stringify(propertyData)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Anuncio para ${platform} generado: "${parsed.title?.substring(0, 60)}..."`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = generateListingAdFallback(propertyData, platform);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: anuncio para ${platform} generado`
      : `Anuncio para ${platform} generado: "${result.title?.substring(0, 60)}..."`,
  };
}

export async function generateEmail(leadData, campaignType) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Genera un email de tipo "${campaignType}" para este lead. Devuelve JSON con: subject, body, type.

Lead: ${JSON.stringify(leadData)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Email "${parsed.type}" generado para ${leadData.name || 'lead'}`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = generateEmailFallback(leadData, campaignType);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: email ${result.type} generado`
      : `Email "${result.type}" generado para ${leadData.name || 'lead'}`,
  };
}

export async function generateSocialPost(propertyData, platform) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Genera un post para ${platform} con estos datos. Devuelve JSON con: caption, hashtags, bestTime, platform.

Property: ${JSON.stringify(propertyData)}

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Post para ${platform} generado con ${parsed.hashtags?.length || 0} hashtags`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = generateSocialPostFallback(propertyData, platform);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: post para ${platform} generado`
      : `Post para ${platform} generado con ${result.hashtags.length} hashtags`,
  };
}

export async function improveDescription(rawDescription) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const prompt = `Mejora esta descripción de propiedad inmobiliaria. Devuelve JSON con: original, improved, changes (array de cambios realizados), wordCount.

Descripción original: "${rawDescription}"

Responde ÚNICAMENTE con el JSON.`;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return {
        success: true,
        result: parsed,
        insight: `Descripción mejorada: de ${rawDescription.split(/\s+/).length} a ${parsed.wordCount} palabras`,
      };
    } catch (err) {
      errors.push(err.message);
    }
  }

  const result = improveDescriptionFallback(rawDescription);
  return {
    success: true,
    result,
    insight: errors.length > 0
      ? `Modo fallback: descripción mejorada`
      : `Descripción mejorada: de ${rawDescription.split(/\s+/).length} a ${result.wordCount} palabras`,
  };
}

export async function execute(context) {
  const { action, payload } = context;

  switch (action) {
    case 'generateListingAd':
      return generateListingAd(payload.propertyData, payload.platform);
    case 'generateEmail':
      return generateEmail(payload.leadData, payload.campaignType);
    case 'generateSocialPost':
      return generateSocialPost(payload.propertyData, payload.platform);
    case 'improveDescription':
      return improveDescription(payload.rawDescription);
    default:
      return {
        success: false,
        result: null,
        insight: `Acción desconocida: ${action}. Acciones disponibles: generateListingAd, generateEmail, generateSocialPost, improveDescription`,
      };
  }
}
