interface EmailOptions {
  to: string
  toName?: string
  subject: string
  html: string
  text?: string
}

export class EmailSender {
  constructor(
    private apiKey: string,
    private fromEmail: string,
    private fromName: string = 'PropIA'
  ) {}

  async send(opts: EmailOptions): Promise<boolean> {
    if (!this.apiKey || !this.fromEmail) return false
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: opts.to, name: opts.toName ?? opts.to }],
          }],
          from: { email: this.fromEmail, name: this.fromName },
          subject: opts.subject,
          content: [
            { type: 'text/html', value: opts.html },
            ...(opts.text ? [{ type: 'text/plain', value: opts.text }] : []),
          ],
        }),
      })
      return res.ok || res.status === 202
    } catch (err) {
      console.error('[Email]', err)
      return false
    }
  }

  // SMTP alternativo (para agencias con email propio)
  static async sendViaSMTP(opts: {
    host: string; port: number; user: string; pass: string
    from: string; to: string; subject: string; html: string
  }): Promise<boolean> {
    // Usar nodemailer si está disponible
    try {
      const nodemailer = await import('nodemailer')
      const transporter = nodemailer.createTransport({
        host: opts.host, port: opts.port, secure: opts.port === 465,
        auth: { user: opts.user, pass: opts.pass },
      })
      await transporter.sendMail({
        from: opts.from, to: opts.to,
        subject: opts.subject, html: opts.html,
      })
      return true
    } catch (err) {
      console.error('[SMTP]', err)
      return false
    }
  }
}
