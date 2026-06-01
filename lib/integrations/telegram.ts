export class TelegramSender {
  private baseUrl: string

  constructor(private botToken: string) {
    this.baseUrl = `https://api.telegram.org/bot${botToken}`
  }

  async sendMessage(chatId: string, text: string): Promise<boolean> {
    if (!this.botToken || !chatId) return false
    try {
      const res = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id:    chatId,
          text:       text.slice(0, 4096),  // límite de Telegram
          parse_mode: 'Markdown',
        }),
      })
      return res.ok
    } catch (err) {
      console.error('[Telegram]', err)
      return false
    }
  }

  async sendAlert(chatId: string, alert: {
    level: 'urgente' | 'importante' | 'info'
    title: string
    message: string
    leadName?: string
  }): Promise<boolean> {
    const emojis = { urgente: '🚨', importante: '⚡', info: 'ℹ️' }
    const text = `${emojis[alert.level]} *${alert.title}*\n${alert.message}${alert.leadName ? `\n_Lead: ${alert.leadName}_` : ''}`
    return this.sendMessage(chatId, text)
  }
}
