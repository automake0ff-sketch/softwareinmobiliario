export class WhatsAppSender {
  constructor(
    private token: string,
    private phoneNumberId: string
  ) {}

  private cleanPhone(phone: string): string {
    const clean = phone.replace(/[\s\-\(\)\+]/g, '')
    return clean.startsWith('34') ? clean : `34${clean}`
  }

  async sendText(phone: string, message: string): Promise<boolean> {
    if (!this.token || !this.phoneNumberId) return false
    try {
      const res = await fetch(
        `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type:    'individual',
            to:                this.cleanPhone(phone),
            type:              'text',
            text: { preview_url: false, body: message },
          }),
        }
      )
      if (!res.ok) {
        const err = await res.json()
        console.error('[WhatsApp]', err.error?.message ?? res.status)
        return false
      }
      return true
    } catch (err) {
      console.error('[WhatsApp]', err)
      return false
    }
  }

  async sendTemplate(
    phone: string,
    templateName: string,
    params: string[],
    language: string = 'es'
  ): Promise<boolean> {
    if (!this.token || !this.phoneNumberId) return false
    try {
      const res = await fetch(
        `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: this.cleanPhone(phone),
            type: 'template',
            template: {
              name: templateName,
              language: { code: language },
              components: [{
                type: 'body',
                parameters: params.map(p => ({ type: 'text', text: p })),
              }],
            },
          }),
        }
      )
      return res.ok
    } catch {
      return false
    }
  }
}
