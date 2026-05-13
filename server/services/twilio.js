export class TwilioService {
  constructor(config = {}) {
    this.config = config;
    this.callLog = [];
  }

  async makeCall(to, from, twimlUrl) {
    if (!this.config.accountSid || !this.config.authToken) {
      const log = {
        to, from: from || this.config.phoneNumber || '+34123456789',
        twimlUrl: twimlUrl || 'default_twiml',
        status: 'logged',
        timestamp: new Date().toISOString(),
        mock: true,
      };
      this.callLog.push(log);
      console.log(`[TWILIO MOCK] Llamada a ${to} desde ${log.from}`);
      return { mock: true, callSid: `mock_call_${Date.now()}`, ...log };
    }

    try {
      const accountSid = this.config.accountSid;
      const authToken = this.config.authToken;
      const base64 = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${base64}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          From: from || this.config.phoneNumber,
          Url: twimlUrl || 'http://demo.twilio.com/docs/voice.xml',
        }),
      });
      const data = await resp.json();
      return { callSid: data.sid, status: data.status, ...data };
    } catch (e) {
      return { mock: true, callSid: `mock_call_${Date.now()}`, error: e.message };
    }
  }

  async sendSMS(to, body) {
    if (!this.config.accountSid || !this.config.authToken) {
      const log = {
        to, body: body.substring(0, 100), status: 'logged', mock: true, timestamp: new Date().toISOString(),
      };
      this.callLog.push(log);
      console.log(`[TWILIO MOCK] SMS a ${to}: ${body.substring(0, 60)}...`);
      return { mock: true, messageSid: `mock_sms_${Date.now()}`, ...log };
    }

    try {
      const accountSid = this.config.accountSid;
      const authToken = this.config.authToken;
      const base64 = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${base64}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: this.config.phoneNumber, Body: body }),
      });
      const data = await resp.json();
      return { messageSid: data.sid, status: data.status, ...data };
    } catch (e) {
      return { mock: true, messageSid: `mock_sms_${Date.now()}`, error: e.message };
    }
  }

  generateCallScript(lead, property) {
    const name = lead?.name || 'cliente';
    const propTitle = property?.title || 'la propiedad';
    const propPrice = typeof property?.price === 'number' ? property.price.toLocaleString('es-ES') + '€' : property?.price || '';
    const location = [property?.zone, property?.city].filter(Boolean).join(', ') || 'ubicación';
    const beds = property?.bedrooms || 0;
    const baths = property?.bathrooms || 0;
    const surf = property?.surface || 0;

    const probingQuestions = [
      `¿Qué te pareció la propiedad que viste?`,
      `¿Hay algo en particular que estés buscando y no hayas encontrado?`,
      `¿Cuándo te gustaría hacer la visita?`,
      `¿Tienes alguna duda sobre la financiación?`,
      `¿Has visto otras propiedades similares?`,
    ];

    const objections = [
      `Entiendo que el precio puede parecer elevado, pero ${propTitle} tiene características únicas en el mercado actual.`,
      `Si te preocupa la zona, puedo asegurarte que es una de las que más revalorización ha tenido este año.`,
      `Muchos clientes tenían la misma duda, pero después de la visita cambiaron de opinión.`,
    ];

    return {
      introduction: `Hola ${name}, soy [nombre comercial] del equipo de ${this.config.agencyName || 'InmoTech Realty'}. Te llamo porque vi que mostraste interés en ${propTitle}. ¿Tienes un momento para hablar?`,
      probing_questions: probingQuestions,
      closing_technique: `¿Qué te parece si agendamos una visita para que puedas verla en persona? Podemos ir el [día] a las [hora]. ¿Te viene bien?`,
      objection_handling: objections,
      property_highlights: {
        title: propTitle,
        price: propPrice,
        location,
        specs: `${beds} habitaciones, ${baths} baños, ${surf}m²`,
      },
      lead_profile: {
        name,
        budget: lead?.budget ? `${lead.budget.toLocaleString('es-ES')}€` : 'No especificado',
        zone: lead?.zone || 'No especificada',
        interest: lead?.property_interest || 'No especificado',
      },
    };
  }
}

export default TwilioService;
