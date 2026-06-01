import { SupabaseClient } from '@supabase/supabase-js'

export class CalendarManager {
  constructor(
    private supabase: SupabaseClient,
    private agencyId: string
  ) {}

  async createVisitEvent(opts: {
    leadId:          string
    leadName:        string
    scheduledAt:     string
    propertyAddress: string
    durationMinutes?: number
    assignedUserId?:  string
  }): Promise<boolean> {
    try {
      // Obtener credenciales de Google Calendar del usuario asignado
      const { data: user } = await this.supabase.from('users')
        .select('google_calendar_token, name')
        .eq('id', opts.assignedUserId ?? '')
        .single()

      if (!user?.google_calendar_token) {
        // Sin Google Calendar → solo guardar en DB
        await this.supabase.from('visits').insert({
          lead_id:       opts.leadId,
          agency_id:     this.agencyId,
          assigned_to:   opts.assignedUserId ?? null,
          scheduled_at:  opts.scheduledAt,
          duration_minutes: opts.durationMinutes ?? 60,
          status:        'scheduled',
          notes:         `Visita a: ${opts.propertyAddress}`,
        })
        return true
      }

      // Con Google Calendar → crear evento real
      const token = user.google_calendar_token as { access_token: string }
      const start = new Date(opts.scheduledAt)
      const end = new Date(start.getTime() + (opts.durationMinutes ?? 60) * 60000)

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
            description: `Visita de PropIA\nLead: ${opts.leadName}\nPropiedad: ${opts.propertyAddress}`,
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
      )

      if (res.ok) {
        const event = await res.json()
        // Guardar visita en DB con el ID del evento de Google
        await this.supabase.from('visits').insert({
          lead_id:          opts.leadId,
          agency_id:        this.agencyId,
          assigned_to:      opts.assignedUserId ?? null,
          scheduled_at:     opts.scheduledAt,
          duration_minutes: opts.durationMinutes ?? 60,
          status:           'scheduled',
          google_event_id:  event.id,
          notes:            `Visita a: ${opts.propertyAddress}`,
        })
        return true
      }
      return false
    } catch (err) {
      console.error('[Calendar]', err)
      return false
    }
  }
}
