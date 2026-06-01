import { run, get } from '../db/db.js';

export class CalendarManager {
  constructor(agencyId) {
    this.agencyId = agencyId;
  }

  async createVisitEvent(opts) {
    try {
      // Intentar obtener token de Google Calendar si el usuario asignado lo tiene
      let user = null;
      if (opts.assignedUserId) {
        user = get('SELECT id, google_sheets_id as google_calendar_token, name FROM users WHERE id = @id', {
          id: opts.assignedUserId
        });
      }

      if (!user || !user.google_calendar_token) {
        // Sin token de calendar, solo guardar visita en base de datos local SQLite
        run(
          `INSERT INTO visits (id, lead_id, assigned_to, scheduled_at, notes, status, created_at)
           VALUES (@id, @lead_id, @assigned_to, @scheduled_at, @notes, 'scheduled', datetime('now'))`,
          {
            id: `visit_${Date.now()}`,
            lead_id: opts.leadId,
            assigned_to: opts.assignedUserId || null,
            scheduled_at: opts.scheduledAt,
            notes: `Visita programada de forma nativa en: ${opts.propertyAddress}`,
          }
        );
        return true;
      }

      // Proceso real con Google Calendar si cuenta con token
      const token = JSON.parse(user.google_calendar_token);
      const start = new Date(opts.scheduledAt);
      const end = new Date(start.getTime() + (opts.durationMinutes ?? 60) * 60000);

      const res = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary:     `Visita: ${opts.leadName}`,
            description: `Visita programada de PropIA\nLead: ${opts.leadName}\nPropiedad: ${opts.propertyAddress}`,
            start: { dateTime: start.toISOString(), timeZone: 'Europe/Madrid' },
            end:   { dateTime: end.toISOString(),   timeZone: 'Europe/Madrid' },
            reminders: {
              useDefault: false,
              overrides: [
                { method: 'email',  minutes: 60 },
                { method: 'popup',  minutes: 30 },
              ],
            },
          }),
        }
      );

      if (res.ok) {
        const event = await res.json();
        run(
          `INSERT INTO visits (id, lead_id, assigned_to, scheduled_at, notes, status, created_at)
           VALUES (@id, @lead_id, @assigned_to, @scheduled_at, @notes, 'scheduled', datetime('now'))`,
          {
            id: event.id || `visit_${Date.now()}`,
            lead_id: opts.leadId,
            assigned_to: opts.assignedUserId || null,
            scheduled_at: opts.scheduledAt,
            notes: `Google Event: ${event.htmlLink}. Visita en: ${opts.propertyAddress}`,
          }
        );
        return true;
      }
      return false;
    } catch (err) {
      console.error('[Calendar]', err);
      return false;
    }
  }
}
