export class EmailSender {
  constructor(apiKey, fromEmail, fromName = 'PropIA') {
    this.apiKey = apiKey;
    this.fromEmail = fromEmail;
    this.fromName = fromName;
  }

  async send(opts) {
    if (!this.apiKey || !this.fromEmail) return false;
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
      });
      return res.ok || res.status === 202;
    } catch (err) {
      console.error('[Email]', err);
      return false;
    }
  }

  static async sendViaSMTP(opts) {
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: opts.host,
        port: opts.port,
        secure: opts.port === 465,
        auth: { user: opts.user, pass: opts.pass },
      });
      await transporter.sendMail({
        from: opts.from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      });
      return true;
    } catch (err) {
      console.error('[SMTP]', err);
      return false;
    }
  }
}
