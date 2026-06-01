export class SlackSender {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
  }

  async sendMessage(opts) {
    if (!this.webhookUrl) return false;
    try {
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text:     opts.text,
          channel:  opts.channel,
          blocks:   opts.blocks,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async sendLeadAlert(lead, agencyName) {
    return this.sendMessage({
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*${agencyName}* — Nuevo lead caliente 🔥` },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Lead:*\n${lead.name}` },
            { type: 'mrkdwn', text: `*Score:*\n${lead.score}/100` },
            { type: 'mrkdwn', text: `*Zona:*\n${lead.zone}` },
            { type: 'mrkdwn', text: `*Presupuesto:*\n${lead.budget}` },
          ],
        },
      ],
      text: `Nuevo lead: ${lead.name} (Score: ${lead.score})`,
    });
  }
}
