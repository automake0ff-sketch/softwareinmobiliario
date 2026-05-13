import { askClaude, isClientAvailable } from '../services/claude.js';

const SYSTEM_PROMPT = Eres el Agente Documentador IA de PropIA. Gestionas toda la documentación de las operaciones inmobiliarias.

Documentos que gestionas:

Para compradores:
- Nota Simple Registral
- Contrato de arras
- Escrituras
- Estudio de cargas
- Certificado energético
- Documentación hipotecaria

Para vendedores:
- Escrituras de propiedad
- Último recibo IBI
- Certificado de estar al corriente de Hacienda
- Certificado de deuda de comunidad
- Certificado energético
- Cédula de habitabilidad

Documentos que generas:
1. Ficha PDF de propiedad con branding de la agencia
2. Contrato de arras (borrador)
3. Checklist personalizado según operación

Flujo de solicitud de documentos:
- Día 1: Solicitud inicial con mensaje personalizado por WhatsApp
- Día 3 (48h): Primer recordatorio amable
- Día 5 (96h): Segundo recordatorio con urgencia
- Día 7: Escalar a comercial para llamada telefónica

Mensajes de solicitud tipo:
- Para propietario: tono cercano pero profesional, explicar por qué se necesita cada documento
- Para comprador: tono tranquilizador, explicar que es parte del proceso estándar
- Para terceros (comunidad, registro): tono formal y jurídico

Siempre respondes en formato JSON.;

const CHECKLISTS = {
  compraventa: {
    name: 'Compraventa',
    documents: [
      { name: 'Nota Simple Registral', required: true, source: 'registro', daysToObtain: 3 },
      { name: 'Certificado Energético', required: true, source: 'eficiencia', daysToObtain: 7 },
      { name: 'Último Recibo IBI', required: true, source: 'propietario', daysToObtain: 1 },
      { name: 'Escrituras de la propiedad', required: true, source: 'propietario', daysToObtain: 1 },
      { name: 'Documentación identificativa (DNI/NIE)', required: true, source: 'ambas_partes', daysToObtain: 1 },
      { name: 'Contrato de arras', required: true, source: 'agencia', daysToObtain: 1 },
      { name: 'Estudio de cargas', required: true, source: 'registro', daysToObtain: 5 },
      { name: 'Certificado de estar al corriente de Hacienda', required: false, source: 'propietario', daysToObtain: 10 },
      { name: 'Certificado de deuda comunidad', required: true, source: 'comunidad', daysToObtain: 5 },
      { name: 'Documentación hipoteca', required: false, source: 'banco', daysToObtain: 15 },
    ],
  },
  alquiler: {
    name: 'Alquiler',
    documents: [
      { name: 'Contrato de arrendamiento', required: true, source: 'agencia', daysToObtain: 1 },
      { name: 'Último Recibo IBI', required: true, source: 'propietario', daysToObtain: 1 },
      { name: 'Documentación identificativa (DNI/NIE)', required: true, source: 'ambas_partes', daysToObtain: 1 },
      { name: 'Certificado Energético', required: true, source: 'propietario', daysToObtain: 7 },
      { name: 'Nómina/justificante ingresos', required: true, source: 'inquilino', daysToObtain: 3 },
      { name: 'Fianza depósito', required: true, source: 'inquilino', daysToObtain: 1 },
      { name: 'Seguro de impago', required: false, source: 'agencia', daysToObtain: 3 },
      { name: 'Inventario de mobiliario', required: true, source: 'agencia', daysToObtain: 1 },
    ],
  },
  arras: {
    name: 'Contrato de Arras',
    documents: [
      { name: 'Contrato de arras firmado', required: true, source: 'ambas_partes', daysToObtain: 1 },
      { name: 'Resguardo de entrada de señal', required: true, source: 'banco', daysToObtain: 1 },
      { name: 'Documentación identificativa', required: true, source: 'ambas_partes', daysToObtain: 1 },
      { name: 'Nota Simple actualizada', required: true, source: 'registro', daysToObtain: 3 },
    ],
  },
};

function generateChecklistFallback(operationType) {
  const type = (operationType || '').toLowerCase();
  const checklist = CHECKLISTS[type] || CHECKLISTS.compraventa;

  const totalDocs = checklist.documents.length;
  const requiredDocs = checklist.documents.filter((d) => d.required).length;
  const estimatedDays = Math.max(...checklist.documents.map((d) => d.daysToObtain));

  return {
    operationType: checklist.name,
    totalDocuments: totalDocs,
    requiredDocuments: requiredDocs,
    optionalDocuments: totalDocs - requiredDocs,
    estimatedDaysToComplete: estimatedDays,
    documents: checklist.documents.map((d) => ({
      ...d,
      status: 'pendiente',
      priority: d.required ? 'alta' : 'media',
    })),
    steps: [
      'Reunir documentación del propietario',
      'Obtener notas registrales y certificados',
      'Preparar contratos',
      'Firma de documentos',
      'Registro y depósito de fianzas',
    ],
  };
}

function requestDocumentFallback(leadData, documentType) {
  const name = leadData.name || leadData.nombre || 'Cliente';
  const doc = documentType || 'documentación';

  const requestMessages = {
    'Nota Simple Registral': Hola , necesitamos la Nota Simple Registral de la propiedad para continuar con la operación. Puedes solicitar una copia en tu registro de la propiedad más cercano o pedirla online.,
    'Certificado Energético': ${name}, para completar la operación necesitamos el Certificado de Eficiencia Energética. Si no lo tienes, podemos gestionarlo por ti.,
    'Último Recibo IBI': Hola , necesitamos el último recibo del IBI pagado de la propiedad. Puedes enviarnos una copia escaneada o foto.,
    'Escrituras': ${name}, necesitamos las escrituras de la propiedad. Puedes enviarnos una copia escaneada.,
    'DNI/NIE': Hola , necesitamos una copia de tu DNI o NIE por ambas caras para la documentación.,
    default: Hola , necesitamos que nos proporciones la documentación solicitada para continuar con el proceso.,
  };

  const message = requestMessages[doc] || requestMessages.default;

  return {
    documentType: doc,
    message,
    channel: 'whatsapp',
    requestDate: new Date().toISOString(),
    status: 'enviada',
    followUpIn: 3,
    category: 'pendiente',
    escalationDay: 7,
  };
}

function generatePropertyPDFFallback(propertyData, branding) {
  const title = propertyData.title || propertyData.titulo || 'Propiedad';
  const price = propertyData.price || propertyData.precio || 0;
  const desc = propertyData.description || propertyData.descripcion || '';
  const type = propertyData.type || propertyData.tipo || '';
  const city = propertyData.city || propertyData.ciudad || '';
  const zone = propertyData.zone || propertyData.zona || '';
  const beds = propertyData.bedrooms || propertyData.habitaciones || 0;
  const baths = propertyData.bathrooms || propertyData.banos || 0;
  const surf = propertyData.surface || propertyData.metros || 0;
  const features = propertyData.features || propertyData.caracteristicas || [];
  const images = propertyData.images || propertyData.imagenes || [];

  const agencyName = branding?.name || branding?.nombre || 'InmoTech Realty';
  const logo = branding?.logo || branding?.logo_url || '';
  const color = branding?.primaryColor || branding?.color || '#2563eb';
  const phone = branding?.phone || branding?.telefono || '';

  return {
    filename: ${title.replace(/\s+/g, '_')}_ficha.pdf,
    content: {
      header: { agency: agencyName, logo, color, phone },
      property: { title, price, type, city, zone },
      details: { bedrooms: beds, bathrooms: baths, surface: surf },
      description: desc.substring(0, 500),
      features: features.slice(0, 10),
      images: images.slice(0, 5),
      footer: Generado por  - ,
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      pages: 2,
      orientation: 'portrait',
      includesImages: images.length > 0,
    },
  };
}

function generateDraftContractFallback(leadData, propertyData) {
  const buyerName = leadData.name || leadData.nombre || 'Comprador';
  const buyerDNI = leadData.dni || leadData.documento || '[DNI del comprador]';
  const sellerName = propertyData.ownerName || propertyData.propietario || '[Nombre del vendedor]';
  const sellerDNI = propertyData.ownerDNI || propertyData.dniPropietario || '[DNI del vendedor]';
  const propertyTitle = propertyData.title || propertyData.titulo || 'la propiedad';
  const price = propertyData.price || propertyData.precio || 0;
  const deposit = Math.round(price * 0.1);
  const address = propertyData.address || propertyData.direccion || propertyData.zone || '[Dirección]';
  const city = propertyData.city || propertyData.ciudad || '[Ciudad]';
  const daysToClosing = 60;

  return {
    contractType: 'Contrato de Arras',
    title: Contrato de Arras - ,
    date: new Date().toISOString().split('T')[0],
    parties: {
      buyer: { name: buyerName, dni: buyerDNI },
      seller: { name: sellerName, dni: sellerDNI },
    },
    property: { title: propertyTitle, address, city, price },
    clauses: [
      PRIMERA: El vendedor se obliga a vender y el comprador a comprar la finca descrita.,
      SEGUNDA: El precio total de la compraventa se fija en €.,
      TERCERA: En concepto de arras o señal, el comprador entrega en este acto la cantidad de €.,
      CUARTA: El contrato definitivo se firmará en un plazo máximo de  días desde la fecha.,
      QUINTA: Si el comprador incumple, perderá la señal entregada. Si el vendedor incumple, devolverá el doble de la señal.,
      SEXTA: Todos los gastos derivados de la compraventa serán por cuenta del comprador.,
    ],
    deposit,
    depositPercentage: 10,
    daysToClosing,
    notes: 'Este es un borrador generado automáticamente. Requiere revisión legal antes de su uso.',
  };
}

function trackPendingDocumentsFallback(leadData) {
  const docs = leadData.documents || leadData.documentos || [];
  const operationType = leadData.operationType || leadData.tipoOperacion || 'compraventa';
  const checklist = CHECKLISTS[operationType] || CHECKLISTS.compraventa;

  const pending = checklist.documents.filter((doc) => {
    const existing = docs.find((d) => d.name?.toLowerCase() === doc.name.toLowerCase() || d.tipo?.toLowerCase() === doc.name.toLowerCase());
    return !existing || existing.status === 'pendiente' || existing.status === 'rechazado';
  });

  const completed = checklist.documents.length - pending.length;
  const progress = Math.round((completed / checklist.documents.length) * 100);

  return {
    totalRequired: checklist.documents.length,
    completed,
    pending: pending.length,
    progress,
    pendingDocuments: pending.map((d) => ({
      name: d.name,
      required: d.required,
      source: d.source,
      priority: d.required ? 'alta' : 'media',
      daysOverdue: d.daysToObtain ? Math.max(0, d.daysToObtain - 1) : 0,
    })),
    nextSteps: progress < 100
      ? Faltan  documentos. Contactar con las fuentes correspondientes.
      : 'Toda la documentación está completa.',
    estimatedCompletion: progress >= 100 ? 'Completado' : ${Math.ceil(pending.length * 3)} días estimados,
  };
}

function organizeDocumentsFallback(leadData, documents) {
  const name = leadData.name || leadData.nombre || 'Cliente';
  const operationType = leadData.operationType || leadData.tipoOperacion || 'compraventa';
  const docList = documents || [];

  const folders = {
    identificacion: [],
    propiedad: [],
    financiero: [],
    contratos: [],
    certificados: [],
    otros: [],
  };

  docList.forEach((doc) => {
    const docName = (doc.name || doc.nombre || doc.tipo || '').toLowerCase();
    if (/dni|nie|pasaporte|identificacion/i.test(docName)) folders.identificacion.push(doc);
    else if (/escritura|nota simple|ibi|registro/i.test(docName)) folders.propiedad.push(doc);
    else if (/hipoteca|nomina|banco|financiacion/i.test(docName)) folders.financiero.push(doc);
    else if (/contrato|arras|compraventa|alquiler/i.test(docName)) folders.contratos.push(doc);
    else if (/energetico|certificado|cargos/i.test(docName)) folders.certificados.push(doc);
    else folders.otros.push(doc);
  });

  return {
    leadName: name,
    operationType,
    totalDocuments: docList.length,
    folders: Object.entries(folders)
      .filter(([_, docs]) => docs.length > 0)
      .map(([name, docs]) => ({ folder: name, documents: docs.length, items: docs })),
    organized: true,
    structure: 'identificación / propiedad / financiero / contratos / certificados',
  };
}

export function getSystemPrompt() {
  return SYSTEM_PROMPT;
}

export async function generateChecklist(operationType) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = Genera un checklist de documentos para operación inmobiliaria. Devuelve JSON con: operationType, totalDocuments, requiredDocuments, optionalDocuments, estimatedDaysToComplete, documents (array de {name, required, source, daysToObtain, status, priority}), steps.
Operation: 
Responde ÚNICAMENTE con el JSON.;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: Checklist :  documentos };
    } catch (err) { errors.push(err.message); }
  }
  const result = generateChecklistFallback(operationType);
  return { success: true, result, insight: errors.length > 0 ? Modo fallback: checklist  : Checklist :  documentos };
}

export async function requestDocument(leadData, documentType) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = Genera una solicitud de documento para un lead. Devuelve JSON con: documentType, message, channel, requestDate, status, followUpIn, category, escalationDay.
Lead: 
Documento: 
Responde ÚNICAMENTE con el JSON.;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: Solicitud de "" enviada a  };
    } catch (err) { errors.push(err.message); }
  }
  const result = requestDocumentFallback(leadData, documentType);
  return { success: true, result, insight: errors.length > 0 ? Modo fallback: solicitud "" : Solicitud de "" enviada };
}

export async function generatePropertyPDF(propertyData, branding) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = Genera los datos para un PDF de ficha de propiedad. Devuelve JSON con: filename, content (header, property, details, description, features, images, footer), metadata.
Property: 
Branding: 
Responde ÚNICAMENTE con el JSON.;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: PDF "" generado };
    } catch (err) { errors.push(err.message); }
  }
  const result = generatePropertyPDFFallback(propertyData, branding);
  return { success: true, result, insight: errors.length > 0 ? Modo fallback: PDF generado : PDF "" generado };
}

export async function generateDraftContract(leadData, propertyData) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = Genera un borrador de contrato de arras. Devuelve JSON con: contractType, title, date, parties, property, clauses (array), deposit, depositPercentage, daysToClosing, notes.
Lead: 
Property: 
Responde ÚNICAMENTE con el JSON.;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: Borrador de contrato generado:  };
    } catch (err) { errors.push(err.message); }
  }
  const result = generateDraftContractFallback(leadData, propertyData);
  return { success: true, result, insight: errors.length > 0 ? Modo fallback: borrador contrato : Borrador de contrato generado:  };
}

export async function trackPendingDocuments(leadData) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = Hace tracking de documentos pendientes. Devuelve JSON con: totalRequired, completed, pending, progress, pendingDocuments, nextSteps, estimatedCompletion.
Lead: 
Responde ÚNICAMENTE con el JSON.;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: Documentos: / (%) };
    } catch (err) { errors.push(err.message); }
  }
  const result = trackPendingDocumentsFallback(leadData);
  return { success: true, result, insight: errors.length > 0 ? Modo fallback: / : Documentos: / (%) };
}

export async function organizeDocuments(leadData, documents) {
  const errors = [];
  if (isClientAvailable()) {
    try {
      const prompt = Organiza documentos en carpetas. Devuelve JSON con: leadName, operationType, totalDocuments, folders (array de {folder, documents, items}), organized, structure.
Lead: 
Documents: 
Responde ÚNICAMENTE con el JSON.;
      const text = await askClaude(SYSTEM_PROMPT, prompt);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: ${parsed.totalDocuments} documentos organizados en  carpetas };
    } catch (err) { errors.push(err.message); }
  }
  const result = organizeDocumentsFallback(leadData, documents);
  return { success: true, result, insight: errors.length > 0 ? Modo fallback: documentos organizados : ${result.totalDocuments} documentos organizados en  carpetas };
}

export async function execute(context) {
  const { action, payload } = context;
  switch (action) {
    case 'generateChecklist': return generateChecklist(payload.operationType);
    case 'requestDocument': return requestDocument(payload.leadData, payload.documentType);
    case 'generatePropertyPDF': return generatePropertyPDF(payload.propertyData, payload.branding);
    case 'generateDraftContract': return generateDraftContract(payload.leadData, payload.propertyData);
    case 'trackPendingDocuments': return trackPendingDocuments(payload.leadData);
    case 'organizeDocuments': return organizeDocuments(payload.leadData, payload.documents);
    default: return { success: false, result: null, insight: Acción desconocida: . Disponibles: generateChecklist, requestDocument, generatePropertyPDF, generateDraftContract, trackPendingDocuments, organizeDocuments };
  }
}
