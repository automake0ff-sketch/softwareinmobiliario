import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Email no válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  phone: z.string().optional().nullable(),
  agencyName: z.string().min(2, 'El nombre de la agencia debe tener al menos 2 caracteres'),
  agencyCity: z.string().optional().nullable(),
  agencyPhone: z.string().optional().nullable(),
  agencyEmail: z.string().optional().nullable(),
  plan: z.enum(['starter', 'profesional', 'agencia']).optional(),
});

export const leadSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  phone: z.string().optional().nullable(),
  email: z.string().email('Email no válido').optional().or(z.literal('')).nullable(),
  budget: z.number().nonnegative().optional().nullable(),
  zone: z.string().optional().nullable(),
  property_interest: z.string().optional().nullable(),
  source: z.enum(['whatsapp', 'web', 'idealista', 'meta_ads', 'manual', 'email']).optional(),
  status: z.enum(['nuevo', 'contactado', 'interesado', 'visita_agendada', 'negociacion', 'reserva', 'cerrado']).optional(),
  operation_type: z.string().optional().nullable(),
  budget_max: z.number().nonnegative().optional().nullable(),
  zones: z.string().optional().nullable(),
  urgency: z.string().optional().nullable(),
  property_type: z.string().optional().nullable(),
  assigned_to: z.string().optional().nullable(),
  office_id: z.string().optional().nullable(),
  pipeline_stage: z.string().optional().nullable(),
  pipeline_stage_updated_at: z.string().optional().nullable(),
  ia_score: z.number().int().optional().nullable(),
  ia_insights: z.union([z.string(), z.array(z.any())]).optional().nullable(),
  ia_insight: z.string().optional().nullable(),
  ia_summary: z.string().optional().nullable(),
});

export const propertySchema = z.object({
  title: z.string().min(3, 'El título debe tener al menos 3 caracteres'),
  description: z.string().optional().nullable(),
  price: z.number().nonnegative('El precio debe ser un número no negativo'),
  type: z.string().min(2, 'El tipo de propiedad es obligatorio'),
  operation_type: z.enum(['sale', 'rent']).optional(),
  city: z.string().min(2, 'La ciudad es obligatoria'),
  zone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  postal_code: z.string().optional().nullable(),
  bedrooms: z.number().int().nonnegative().optional().nullable(),
  bathrooms: z.number().int().nonnegative().optional().nullable(),
  surface: z.number().positive().optional().nullable(),
  floor: z.string().optional().nullable(),
  has_elevator: z.union([z.boolean(), z.number()]).optional(),
  has_terrace: z.union([z.boolean(), z.number()]).optional(),
  has_garage: z.union([z.boolean(), z.number()]).optional(),
  condition: z.string().optional().nullable(),
  features: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  images: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  public_url: z.string().url().optional().or(z.literal('')).nullable(),
  status: z.enum(['disponible', 'reservado', 'vendido', 'alquilado']).optional(),
  source: z.string().optional(),
  external_source: z.string().optional().nullable(),
  external_id: z.string().optional().nullable(),
  external_url: z.string().optional().nullable(),
  assigned_to: z.string().optional().nullable(),
  quality_score: z.number().int().min(0).max(100).optional(),
});

export const automationSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  trigger_event: z.string().min(2, 'El disparador es obligatorio'),
  trigger_type: z.string().optional(),
  condition: z.string().optional().nullable(),
  action: z.string().optional().nullable().or(z.literal('')),
  is_active: z.number().int().min(0).max(1).optional(),
  description: z.string().optional().nullable(),
  trigger_config: z.string().optional(),
  conditions: z.string().optional(),
  actions: z.string().optional(),
  destinations: z.string().optional(),
});

export const validateBody = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
      return res.status(400).json({ error: `Datos de entrada no válidos: ${messages}` });
    }
    next(error);
  }
};
