export const captadorTools = [
  {
    name: 'buscar_propiedades_compatibles',
    description: 'Busca propiedades en el CRM que coincidan con los criterios del lead',
    input_schema: {
      type: 'object',
      properties: {
        budget_max: { type: 'number', description: 'Presupuesto máximo en euros' },
        zones: { type: 'array', items: { type: 'string' }, description: 'Zonas de interés' },
        property_type: { type: 'string', enum: ['piso', 'casa', 'chalet', 'local', 'atico', 'estudio'] },
        bedrooms_min: { type: 'number' },
        city: { type: 'string' },
      },
    },
  },
  {
    name: 'crear_lead',
    description: 'Crea un lead en la base de datos del CRM',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        budget: { type: 'number' },
        zone: { type: 'string' },
        property_interest: { type: 'string' },
        source: { type: 'string' },
        ia_score: { type: 'number', minimum: 0, maximum: 100 },
        ia_insight: { type: 'string' },
        ia_summary: { type: 'string' },
      },
      required: ['name', 'phone'],
    },
  },
  {
    name: 'detectar_duplicado',
    description: 'Verifica si ya existe un lead con ese teléfono o email',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string' },
        email: { type: 'string' },
      },
    },
  },
  {
    name: 'enviar_whatsapp',
    description: 'Envía un mensaje de WhatsApp al lead',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Número de teléfono del lead' },
        message: { type: 'string', description: 'Mensaje de texto a enviar' },
      },
      required: ['phone', 'message'],
    },
  },
];

export const coordinadorTools = [
  {
    name: 'obtener_leads_sin_asignar',
    description: 'Lista leads que no tienen comercial asignado ordenados por score',
    input_schema: {
      type: 'object',
      properties: {
        agency_id: { type: 'string' },
        min_score: { type: 'number' },
        limit: { type: 'number' },
      },
      required: ['agency_id'],
    },
  },
  {
    name: 'obtener_comerciales_disponibles',
    description: 'Obtiene comerciales activos con su carga de trabajo actual',
    input_schema: {
      type: 'object',
      properties: {
        agency_id: { type: 'string' },
        office_id: { type: 'string' },
      },
      required: ['agency_id'],
    },
  },
  {
    name: 'asignar_lead',
    description: 'Asigna un lead a un comercial específico',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        user_id: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['lead_id', 'user_id'],
    },
  },
  {
    name: 'enviar_alerta_equipo',
    description: 'Registra una notificación urgente para el equipo',
    input_schema: {
      type: 'object',
      properties: {
        user_ids: { type: 'array', items: { type: 'string' } },
        role: { type: 'string', enum: ['admin', 'manager', 'comercial'] },
        message: { type: 'string' },
        lead_id: { type: 'string' },
      },
      required: ['message'],
    },
  },
  {
    name: 'detectar_leads_bloqueados',
    description: 'Detecta leads sin actividad en las últimas N horas',
    input_schema: {
      type: 'object',
      properties: {
        agency_id: { type: 'string' },
        hours_threshold: { type: 'number' },
        pipeline_stages: { type: 'array', items: { type: 'string' } },
      },
      required: ['agency_id'],
    },
  },
];

export const agendadorTools = [
  {
    name: 'consultar_disponibilidad_comercial',
    description: 'Obtiene los huecos libres del calendario de un comercial',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        days_ahead: { type: 'number' },
        duration_minutes: { type: 'number' },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'crear_visita',
    description: 'Crea una visita en el CRM',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        property_id: { type: 'string' },
        user_id: { type: 'string' },
        scheduled_at: { type: 'string', description: 'ISO 8601 datetime' },
        duration_minutes: { type: 'number' },
        notes: { type: 'string' },
      },
      required: ['lead_id', 'user_id', 'scheduled_at'],
    },
  },
  {
    name: 'reagendar_visita',
    description: 'Cancela la visita actual y crea una nueva con otro horario',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        new_scheduled_at: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['lead_id', 'new_scheduled_at'],
    },
  },
];

export const tasadorTools = [
  {
    name: 'obtener_comparables_zona',
    description: 'Obtiene propiedades similares en la zona para comparación de precios',
    input_schema: {
      type: 'object',
      properties: {
        zone: { type: 'string' },
        city: { type: 'string' },
        property_type: { type: 'string' },
        m2_min: { type: 'number' },
        m2_max: { type: 'number' },
        limit: { type: 'number' },
      },
      required: ['zone', 'city', 'property_type'],
    },
  },
  {
    name: 'calcular_precio_mercado',
    description: 'Calcula el precio medio por m² en una zona según propiedades disponibles',
    input_schema: {
      type: 'object',
      properties: {
        zone: { type: 'string' },
        city: { type: 'string' },
        property_type: { type: 'string' },
      },
      required: ['zone', 'city'],
    },
  },
];

export const allTools = {
  captador: captadorTools,
  coordinador: coordinadorTools,
  agendador: agendadorTools,
  tasador: tasadorTools,
};
