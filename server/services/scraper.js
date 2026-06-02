import fetch from 'node-fetch';

/**
 * Normalizes operation type to 'sale' or 'rent'
 */
function normalizeOperationType(url, html = '') {
  const u = url.toLowerCase();
  const h = html.toLowerCase();
  if (
    u.includes('alquiler') || 
    u.includes('rent') || 
    u.includes('alquila') ||
    h.includes('alquiler') ||
    h.includes('rent')
  ) {
    return 'rent';
  }
  return 'sale';
}

/**
 * Normalizes property type
 */
function normalizePropertyType(url, html = '') {
  const text = (url + ' ' + html).toLowerCase();
  
  if (text.includes('piso') || text.includes('flat') || text.includes('apartamento') || text.includes('apartment')) return 'apartment';
  if (text.includes('chalet') || text.includes('villa')) return 'house';
  if (text.includes('casa') || text.includes('house') || text.includes('adosado')) return 'house';
  if (text.includes('ático') || text.includes('atico') || text.includes('penthouse')) return 'penthouse';
  if (text.includes('estudio') || text.includes('studio')) return 'studio';
  if (text.includes('dúplex') || text.includes('duplex')) return 'duplex';
  if (text.includes('terreno') || text.includes('solar') || text.includes('land')) return 'land';
  if (text.includes('local') || text.includes('commercial')) return 'commercial';
  if (text.includes('oficina') || text.includes('office')) return 'office';
  if (text.includes('garaje') || text.includes('parking') || text.includes('garage')) return 'garage';
  if (text.includes('nave') || text.includes('industrial') || text.includes('warehouse')) return 'warehouse';
  
  return 'apartment'; // Default fallback
}

/**
 * Detects the origin portal name
 */
export function detectPortal(url) {
  const u = url.toLowerCase();
  if (u.includes('idealista')) return 'idealista';
  if (u.includes('fotocasa')) return 'fotocasa';
  if (u.includes('habitaclia')) return 'habitaclia';
  if (u.includes('pisos.com')) return 'pisoscom';
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace('www.', '').split('.')[0] || 'otro';
  } catch {
    return 'otro';
  }
}

/**
 * Extracts and cleans numeric price
 */
function extractPrice(html) {
  // Try OpenGraph og:price:amount
  const ogPriceMatch = html.match(/<meta[^>]+property="og:price:amount"[^>]+content="([^"]+)"/i) ||
                       html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:price:amount"/i);
  if (ogPriceMatch) {
    const p = parseFloat(ogPriceMatch[1].replace(/[^0-9.]/g, ''));
    if (p > 0) return p;
  }

  // Try JSON-LD patterns later, let's keep regex as first fallback
  const priceMatches = [
    /(\d[\d.]*)\s*€/,
    /€\s*(\d[\d.]*)/,
    /price"\s*:\s*"?(\d+)"?/i,
    /valor"\s*:\s*"?(\d+)"?/i
  ];

  for (const regex of priceMatches) {
    const match = html.match(regex);
    if (match) {
      const clean = match[1].replace(/\./g, '').replace(/,/g, '');
      const price = parseInt(clean, 10);
      if (price > 100) return price;
    }
  }
  return 0;
}

/**
 * Deep search a JSON object for specific keys
 */
function deepFind(obj, keys) {
  const results = [];
  const search = (item) => {
    if (!item) return;
    if (Array.isArray(item)) {
      item.forEach(search);
    } else if (typeof item === 'object') {
      for (const k in item) {
        if (keys.includes(k.toLowerCase())) {
          results.push(item[k]);
        }
        search(item[k]);
      }
    }
  };
  search(obj);
  return results;
}

/**
 * Scraping main logic
 */
export async function scrapeUrl(url) {
  const portal = detectPortal(url);
  let externalId = '';
  try {
    const urlObj = new URL(url);
    const idMatch = urlObj.pathname.match(/\/(\d+)/) || urlObj.search.match(/id=(\d+)/);
    if (idMatch) externalId = idMatch[1];
  } catch {}

  const result = {
    title: '',
    price: 0,
    description: '',
    images: [],
    city: '',
    zone: '',
    address: '',
    province: '',
    postal_code: '',
    bedrooms: 0,
    bathrooms: 0,
    surface: 0,
    floor: '',
    has_elevator: 0,
    has_terrace: 0,
    has_garage: 0,
    condition: '',
    features: [],
    operation_type: 'sale',
    type: 'apartment',
    portal,
    external_id: externalId,
    url,
    blocked: false,
    quality_score: 0,
  };

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
      timeout: 8000,
    });

    if (!response.ok) {
      result.blocked = true;
    }

    const html = await response.text();
    result.operation_type = normalizeOperationType(url, html);
    result.type = normalizePropertyType(url, html);

    // 1. EXTRACT OPENGRAPH / TWITTER METADATA
    const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) || 
                    html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i);
    const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i) || 
                   html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:description"/i) ||
                   html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) ||
                   html.match(/<meta[^>]+content="([^"]+)"[^>]+name="description"/i);
    const ogImg = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) || 
                  html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
    const twitterImg = html.match(/<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i) ||
                       html.match(/<meta[^>]+content="([^"]+)"[^>]+name="twitter:image"/i);
    
    const pageTitle = html.match(/<title>([^<]+)<\/title>/i);

    if (ogTitle) result.title = ogTitle[1];
    else if (pageTitle) result.title = pageTitle[1];

    if (ogDesc) result.description = ogDesc[1];

    if (ogImg) result.images.push(ogImg[1]);
    if (twitterImg && !result.images.includes(twitterImg[1])) result.images.push(twitterImg[1]);

    // 2. EXTRACT JSON-LD DATA
    const ldJsonMatches = html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of ldJsonMatches) {
      try {
        const parsed = JSON.parse(match[1].trim());
        
        // Try to search for properties
        const titles = deepFind(parsed, ['name', 'headline']);
        const descriptions = deepFind(parsed, ['description']);
        const prices = deepFind(parsed, ['price', 'amount']);
        const lImages = deepFind(parsed, ['image', 'images', 'thumbnailurl', 'contenturl', 'url', 'src']);
        const addressData = deepFind(parsed, ['address']);
        
        const rooms = deepFind(parsed, ['numberofrooms', 'numberofbedroomstotal', 'bedrooms']);
        const baths = deepFind(parsed, ['numberofbathroomstotal', 'bathrooms']);
        const surfaces = deepFind(parsed, ['floorsize', 'surface']);

        if (titles.length && !result.title) result.title = String(titles[0]);
        if (descriptions.length && !result.description) result.description = String(descriptions[0]);
        if (prices.length && !result.price) {
          const parsedPrice = parseFloat(String(prices[0]).replace(/[^0-9.]/g, ''));
          if (parsedPrice > 100) result.price = parsedPrice;
        }

        lImages.forEach(img => {
          if (typeof img === 'string' && img.startsWith('http') && !result.images.includes(img)) {
            result.images.push(img);
          } else if (typeof img === 'object' && img.url && !result.images.includes(img.url)) {
            result.images.push(img.url);
          }
        });

        if (addressData.length) {
          const addr = addressData[0];
          if (typeof addr === 'object') {
            if (addr.addressLocality) result.city = addr.addressLocality;
            if (addr.addressRegion) result.province = addr.addressRegion;
            if (addr.streetAddress) result.address = addr.streetAddress;
            if (addr.postalCode) result.postal_code = addr.postalCode;
          } else if (typeof addr === 'string') {
            result.address = addr;
          }
        }

        if (rooms.length && !result.bedrooms) result.bedrooms = parseInt(rooms[0], 10) || 0;
        if (baths.length && !result.bathrooms) result.bathrooms = parseInt(baths[0], 10) || 0;
        if (surfaces.length && !result.surface) {
          if (typeof surfaces[0] === 'object' && surfaces[0].value) {
            result.surface = parseFloat(surfaces[0].value) || 0;
          } else {
            result.surface = parseFloat(String(surfaces[0]).replace(/[^0-9.]/g, '')) || 0;
          }
        }
      } catch (jsonErr) {}
    }

    // 3. REGEX FALLBACKS FOR BODY OR GENERAL SCRIPTS
    if (!result.price) {
      result.price = extractPrice(html);
    }

    // Try to scrape hidden scripts variables (initial state / preloaded props)
    const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    const imgRegex = /https?:\/\/[^\s"'`<>]+?\.(?:jpg|jpeg|png|webp)/gi;
    for (const match of scriptMatches) {
      const scriptText = match[1];
      if (scriptText.includes('images') || scriptText.includes('photos') || scriptText.includes('galeria')) {
        const foundUrls = scriptText.match(imgRegex);
        if (foundUrls) {
          foundUrls.slice(0, 15).forEach(img => {
            if (!result.images.includes(img) && !img.includes('logo') && !img.includes('icon')) {
              result.images.push(img);
            }
          });
        }
      }
    }

    // Extract features & characteristics from HTML text
    const cleanText = html.replace(/<[^>]+>/g, ' ');

    // Match Bedrooms
    if (!result.bedrooms) {
      const bedMatch = cleanText.match(/(\d+)\s*(?:habitaci|hab\b|dormitorio|rooms|beds)/i);
      if (bedMatch) result.bedrooms = parseInt(bedMatch[1], 10);
    }

    // Match Bathrooms
    if (!result.bathrooms) {
      const bathMatch = cleanText.match(/(\d+)\s*(?:baño|baths|wc|toilets)/i);
      if (bathMatch) result.bathrooms = parseInt(bathMatch[1], 10);
    }

    // Match Surface
    if (!result.surface) {
      const surfMatch = cleanText.match(/(\d+[\d.,]*)\s*(?:m²|m2|metros|sqm)/i);
      if (surfMatch) result.surface = parseFloat(surfMatch[1].replace(/,/g, '.')) || 0;
    }

    // Match Floor
    if (!result.floor) {
      const floorMatch = cleanText.match(/(\d+)[ªººº]?\s*planta/i) || cleanText.match(/planta\s*(\d+)/i) || cleanText.match(/(\d+)(?:st|nd|rd|th)\s*floor/i);
      if (floorMatch) result.floor = floorMatch[1] + 'ª';
    }

    // Match Extras
    if (cleanText.match(/ascensor|elevator|lift/i)) result.has_elevator = 1;
    if (cleanText.match(/terraza|terrace|balcon/i)) result.has_terrace = 1;
    if (cleanText.match(/garaje|parking|garage|cochera/i)) result.has_garage = 1;

    // Location fallbacks via URL
    if (!result.city) {
      try {
        const segments = urlObj.pathname.split('/').filter(Boolean);
        if (segments.length > 0) {
          const cityZone = segments[segments.length - 2] || '';
          if (cityZone && cityZone.includes('-')) {
            const parts = cityZone.split('-');
            result.city = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
            result.zone = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
          } else if (segments[1] && segments[1] !== 'inmueble' && segments[1] !== 'es') {
            result.city = segments[1].charAt(0).toUpperCase() + segments[1].slice(1);
          }
        }
      } catch {}
    }

    // Standardize title and description clean ups
    if (result.title) {
      result.title = result.title.replace(/[\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
      // Remove portal brandings from titles
      result.title = result.title.replace(/\b(?:idealista|fotocasa|habitaclia|pisos\.com)\b.*/gi, '').trim();
      // Remove trailing separator chars
      result.title = result.title.replace(/[-\s,|]+$/, '').trim();
    }

    if (result.description) {
      result.description = result.description.replace(/[\n\t]+/g, '\n').replace(/\s+/g, ' ').trim();
    }

    // Fallbacks if blocked or missing basic elements
    if (!result.title || result.title.length < 5) {
      result.title = `Ficha de ${portal.charAt(0).toUpperCase() + portal.slice(1)}`;
      result.blocked = true;
    }

    // Calculate Quality Score
    let q = 0;
    if (result.images.length > 0) q += 20;
    if (result.description && result.description.trim() !== '') q += 20;
    if (result.price && result.price > 0) q += 20;
    if (result.city && result.city.trim() !== 'Sin especificar' && result.city.trim() !== '') q += 15;
    if (result.surface && result.surface > 0) q += 10;
    if (result.bedrooms > 0) q += 5;
    if (result.bathrooms > 0) q += 5;
    if (result.has_elevator || result.has_terrace || result.has_garage) q += 5;
    result.quality_score = q;

  } catch (err) {
    result.blocked = true;
    result.title = `Ficha preliminar (${portal.toUpperCase()})`;
    result.quality_score = 10; // low score
  }

  // Ensure arrays contain clean strings
  result.images = result.images.filter(img => typeof img === 'string' && img.trim().startsWith('http'));
  
  return result;
}
