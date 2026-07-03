import { MCPServer, logActivity } from './framework.js';
import { all, get } from '../db/db.js';

const server = new MCPServer('propia-whatsapp', '1.0.0');

server
  .resource('whatsapp://conversations/active', 'Conversaciones activas', 'Conversaciones abiertas con leads', async (agencyId) => {
    return await all(
      `SELECT c.id, c.lead_id, l.name, l.phone, l.status, l.ia_score,
              c.created_at as last_message_at
       FROM conversations c
       JOIN leads l ON l.id = c.lead_id
       WHERE c.messages IS NOT NULL AND c.messages != '[]'
       ${agencyId ? 'AND l.agency_id = @aid' : ''}
       ORDER BY c.created_at DESC LIMIT 20`,
      agencyId ? { aid: agencyId } : {}
    );
  })
  .resource('whatsapp://templates', 'Plantillas WhatsApp', 'Plantillas de mensaje disponibles', async () => {
    return [
      { name: 'captador_contacto_inicial', description: 'El Captador: Contacto Inicial a Particular Vende', variables: ['nombre_propietario', 'barrio_zona'] },
      { name: 'agendador_confirmacion_cita', description: 'El Agendador: Confirmación de Cita con Filtro Anti-Despistes', variables: ['nombre_cliente', 'nombre_inmobiliaria', 'direccion_inmueble', 'nombre_asesor', 'hora_cita'] },
      { name: 'vendedor_seguimiento_post_visita', description: 'El Vendedor: Seguimiento Caliente Post-Visita', variables: ['nombre_cliente'] },
      { name: 'bienvenida', description: 'Mensaje de bienvenida inicial', variables: ['nombre'] },
      { name: 'recordatorio_visita', description: 'Recordatorio de visita 24h antes', variables: ['nombre', 'fecha', 'hora', 'direccion'] },
      { name: 'seguimiento_post_visita', description: 'Seguimiento después de una visita', variables: ['nombre'] },
      { name: 'urgencia', description: 'Mensaje de urgencia por demanda', variables: ['nombre', 'propiedad'] },
      { name: 'happy_birthday', description: 'Felicitación de cumpleaños', variables: ['nombre'] },
    ];
  });

server
  .tool('send_message', 'Envía un mensaje de WhatsApp al lead', {
    type: 'object',
    properties: {
      phone: { type: 'string', description: 'Número de teléfono' },
      message: { type: 'string', description: 'Texto del mensaje' },
      lead_id: { type: 'string', description: 'ID del lead (para logging)' },
    },
    required: ['phone', 'message'],
  }, async (args, context) => {
    const leadName = args.lead_id ? await get('SELECT name FROM leads WHERE id = @id', { id: args.lead_id })?.name : 'desconocido';
    logActivity(context.agencyId, args.lead_id, context.userId, 'whatsapp_sent',
      `WhatsApp enviado a ${args.phone}`, { message: args.message?.substring(0, 100) });

    return {
      sent: true,
      to: args.phone,
      message: args.message,
      timestamp: new Date().toISOString(),
      leadName,
    };
  })

  .tool('send_template', 'Envía una plantilla de WhatsApp aprobada', {
    type: 'object',
    properties: {
      phone: { type: 'string' },
      template_name: { type: 'string', description: 'Nombre de la plantilla' },
      params: { type: 'array', items: { type: 'string' }, description: 'Variables de la plantilla' },
      lead_id: { type: 'string' },
    },
    required: ['phone', 'template_name'],
  }, async (args, context) => {
    const templates = {
      captador_contacto_inicial: `Hola {0}, buenas tardes. Verá, sigo de cerca el mercado inmobiliario en {1} y acabo de revisar el anuncio de su vivienda. Lo primero, enhorabuena por las fotos de la cocina, hacen que resalte mucho el espacio. Trabajo con compradores validados por banco que buscan activamente un perfil de vivienda idéntico al de su casa en esta misma zona. Para no hacerle perder el tiempo con visitas innecesarias, ¿le vendría bien una llamada corta de 3 minutos esta tarde para confirmar un par de detalles de la distribución? Un saludo.`,
      agendador_confirmacion_cita: `Hola {0}, le escribo de {1} para confirmar nuestra visita de mañana a la vivienda de {2}. Nuestro asesor {3} ya tiene reservada la hora de {4} en exclusiva para atenderle y resolver sus dudas sobre la finca. Como hay dos familias más interesadas esperando turno para esa tarde, por favor responda a este mensaje con un 'SÍ' para asegurar que mantenemos la cita en pie. ¡Nos vemos mañana!`,
      vendedor_seguimiento_post_visita: `Hola {0}, un placer haberle enseñado el piso hoy. Mientras volvía a la oficina pensaba en lo que me comentó de la luz del salón; es exactamente el espacio familiar que estaba buscando. El propietario me acaba de confirmar que va a valorar las propuestas que entren antes del viernes, ya que hay bastante interés tras las visitas de esta semana. Si de verdad se ve viviendo ahí, le sugiero que dejemos planteada una propuesta de reserva formal hoy mismo para adelantar posiciones. ¿Quiere que le envíe el documento digital para que le eche un vistazo?`,
      bienvenida: `¡Hola {0}! Soy el asistente virtual de la agencia. Estamos buscando las mejores propiedades para ti. ¿En qué puedo ayudarte?`,
      recordatorio_visita: `Hola {0}, te recordamos que mañana {1} a las {2} tienes tu visita en {3}. ¡Te esperamos!`,
      seguimiento_post_visita: `Hola {0}, esperamos que la visita te haya gustado. ¿Tienes alguna duda o te gustaría ver más propiedades?`,
      urgencia: `¡{0}! Te escribimos porque {1} está teniendo mucho interés. No me gustaría que te quedases sin ella. ¿Podemos hablar hoy?`,
      happy_birthday: `¡Feliz cumpleaños, {0}! 🎂 Desde el equipo de la agencia te deseamos un día estupendo.`,
    };

    const template = templates[args.template_name];
    if (!template) throw new Error(`Plantilla no encontrada: ${args.template_name}`);

    let message = template;
    (args.params || []).forEach((p, i) => { message = message.replace(`{${i}}`, p); });

    logActivity(context.agencyId, args.lead_id, context.userId, 'whatsapp_template',
      `Plantilla "${args.template_name}" enviada a ${args.phone}`);

    return { sent: true, to: args.phone, template: args.template_name, message };
  })

  .tool('send_property_card', 'Envía una ficha de propiedad por WhatsApp con datos clave', {
    type: 'object',
    properties: {
      phone: { type: 'string' },
      property_id: { type: 'string' },
      lead_id: { type: 'string' },
    },
    required: ['phone', 'property_id'],
  }, async (args) => {
    const property = await get('SELECT * FROM properties WHERE id = @id', { id: args.property_id });
    if (!property) throw new Error('Propiedad no encontrada');

    const message =
      `*${property.title}*\n\n` +
      `📍 ${property.city}${property.zone ? ', ' + property.zone : ''}\n` +
      `💰 ${(property.price || 0).toLocaleString('es-ES')}€\n` +
      `🛏️ ${property.bedrooms || 0} hab · 🛁 ${property.bathrooms || 0} baños · 📐 ${property.surface || 0}m²\n\n` +
      (property.description ? `${property.description.substring(0, 200)}\n\n` : '') +
      `¿Te gustaría visitarla?`;

    return { sent: true, to: args.phone, propertyId: args.property_id, message };
  })

  .tool('get_conversation_history', 'Obtiene el historial de mensajes de un lead', {
    type: 'object',
    properties: {
      lead_id: { type: 'string' },
      limit: { type: 'number' },
    },
    required: ['lead_id'],
  }, async (args) => {
    const conv = await get('SELECT * FROM conversations WHERE lead_id = @lid ORDER BY created_at DESC LIMIT 1', { lid: args.lead_id });
    if (!conv) return [];

    let messages = [];
    try { messages = JSON.parse(conv.messages || '[]'); } catch { messages = []; }

    return messages.slice(-(args.limit || 20));
  })

  .tool('get_unread_count', 'Obtiene el número de mensajes no leídos por agencia', {
    type: 'object',
    properties: { agency_id: { type: 'string' } },
    required: ['agency_id'],
  }, async (args) => {
    const count = await get(
      `SELECT COUNT(*) as count FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       JOIN leads l ON l.id = c.lead_id
       WHERE m.author = 'lead' AND l.agency_id = @aid`,
      { aid: args.agency_id }
    );
    return { unread: count?.count || 0 };
  });

export default server;
