export class CalendarService {
  constructor(config = {}) {
    this.config = config;
    this.tokens = new Map();
    this.mockEvents = [];
  }

  async getAuthUrl(userId) {
    if (!this.config.googleClientId) {
      return { mock: true, url: null, message: 'Google Calendar no configurado. Usando modo demo.' };
    }
    const scopes = ['https://www.googleapis.com/auth/calendar'];
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${this.config.googleClientId}&redirect_uri=${this.config.redirectUri || 'http://localhost:3002/api/calendar/callback'}&response_type=code&scope=${encodeURIComponent(scopes.join(' '))}&access_type=offline&state=${userId}`;
    return { mock: false, url };
  }

  async handleCallback(code, userId) {
    if (!this.config.googleClientId || !this.config.googleClientSecret) {
      return { mock: true, message: 'Callback ignorado (modo demo).' };
    }
    try {
      const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.config.googleClientId,
          client_secret: this.config.googleClientSecret,
          redirect_uri: this.config.redirectUri || 'http://localhost:3002/api/calendar/callback',
          grant_type: 'authorization_code',
        }),
      });
      const data = await resp.json();
      this.tokens.set(userId, { accessToken: data.access_token, refreshToken: data.refresh_token, expiry: Date.now() + data.expires_in * 1000 });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async createEvent(eventData) {
    const { leadName, propertyTitle, leadPhone, leadEmail, dateTime, notes, userId } = eventData;
    if (!this.config.googleClientId) {
      const mockEvent = {
        id: `mock_evt_${Date.now()}`,
        title: `Visita ${leadName} - ${propertyTitle}`,
        start: dateTime,
        end: new Date(new Date(dateTime).getTime() + 3600000).toISOString(),
        description: this._buildDescription(leadName, leadPhone, leadEmail, propertyTitle, notes),
        mock: true,
      };
      this.mockEvents.push(mockEvent);
      return { googleEventId: mockEvent.id, mock: true, ...mockEvent };
    }

    try {
      const token = this.tokens.get(userId);
      if (!token) throw new Error('User not authenticated with Google Calendar');
      const event = {
        summary: `Visita ${leadName} - ${propertyTitle}`,
        description: this._buildDescription(leadName, leadPhone, leadEmail, propertyTitle, notes),
        start: { dateTime, timeZone: 'Europe/Madrid' },
        end: { dateTime: new Date(new Date(dateTime).getTime() + 3600000).toISOString(), timeZone: 'Europe/Madrid' },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
      };
      const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
      const data = await resp.json();
      return { googleEventId: data.id, ...data };
    } catch (e) {
      return { googleEventId: `mock_${Date.now()}`, mock: true, error: e.message, title: `Visita ${leadName} - ${propertyTitle}`, start: dateTime };
    }
  }

  async checkAvailability(userId, date, durationMinutes) {
    if (!this.config.googleClientId) {
      const slots = [];
      const startHour = 9;
      const endHour = 19;
      const baseDate = new Date(date);
      for (let h = startHour; h < endHour; h++) {
        const slotStart = new Date(baseDate);
        slotStart.setHours(h, 0, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);
        const conflict = this.mockEvents.some((ev) => {
          const evStart = new Date(ev.start);
          const evEnd = new Date(ev.end);
          return slotStart < evEnd && slotEnd > evStart;
        });
        if (!conflict) {
          slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString(), available: true });
        }
      }
      return { mock: true, date, durationMinutes, availableSlots: slots };
    }
    return { mock: true, date, durationMinutes, availableSlots: [] };
  }

  async updateEvent(eventId, eventData) {
    if (!this.config.googleClientId) {
      const idx = this.mockEvents.findIndex((e) => e.id === eventId);
      if (idx >= 0) {
        this.mockEvents[idx] = { ...this.mockEvents[idx], ...eventData, updated: true };
      }
      return { mock: true, eventId, updated: true };
    }
    try {
      const token = this.tokens.get(eventData.userId);
      if (!token) throw new Error('Not authenticated');
      const body = {};
      if (eventData.title) body.summary = eventData.title;
      if (eventData.dateTime) {
        body.start = { dateTime: eventData.dateTime, timeZone: 'Europe/Madrid' };
        body.end = { dateTime: new Date(new Date(eventData.dateTime).getTime() + 3600000).toISOString(), timeZone: 'Europe/Madrid' };
      }
      const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return await resp.json();
    } catch (e) {
      return { mock: true, eventId, updated: true, error: e.message };
    }
  }

  async deleteEvent(eventId) {
    if (!this.config.googleClientId) {
      this.mockEvents = this.mockEvents.filter((e) => e.id !== eventId);
      return { mock: true, eventId, deleted: true };
    }
    try {
      const token = this.tokens.get('default');
      if (!token) throw new Error('Not authenticated');
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      return { success: true, eventId };
    } catch (e) {
      return { mock: true, eventId, deleted: true, error: e.message };
    }
  }

  async getEvents(userId, dateFrom, dateTo) {
    if (!this.config.googleClientId) {
      const filtered = this.mockEvents.filter((e) => {
        const evDate = new Date(e.start);
        return (!dateFrom || evDate >= new Date(dateFrom)) && (!dateTo || evDate <= new Date(dateTo));
      });
      return { mock: true, events: filtered };
    }
    try {
      const token = this.tokens.get(userId);
      if (!token) throw new Error('Not authenticated');
      const params = new URLSearchParams({
        timeMin: dateFrom || new Date().toISOString(),
        timeMax: dateTo || new Date(Date.now() + 86400000 * 30).toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
      });
      const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      const data = await resp.json();
      return { events: data.items || [] };
    } catch (e) {
      return { mock: true, events: this.mockEvents, error: e.message };
    }
  }

  _buildDescription(leadName, leadPhone, leadEmail, propertyTitle, notes) {
    const lines = [
      `Visita programada - CRM Inmobiliario`,
      ``,
      `Cliente: ${leadName || 'No especificado'}`,
      `Teléfono: ${leadPhone || 'No especificado'}`,
      `Email: ${leadEmail || 'No especificado'}`,
      `Propiedad: ${propertyTitle || 'No especificada'}`,
      ``,
      `Notas: ${notes || 'Sin notas adicionales'}`,
      `---`,
      `Generado automáticamente por el CRM Inmobiliario IA`,
    ];
    return lines.join('\n');
  }
}

export default CalendarService;
