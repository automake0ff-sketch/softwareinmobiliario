export class TelegramSender {
  constructor(botToken) {
    this.botToken = botToken;
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  async sendMessage(chatId, text) {
    if (!this.botToken || !chatId) return false;
    try {
      const res = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id:    chatId,
          text:       text.slice(0, 4096),
          parse_mode: 'Markdown',
        }),
      });
      return res.ok;
    } catch (err) {
      console.error('[Telegram]', err);
      return false;
    }
  }

  async sendAlert(chatId, alert) {
    const emojis = { urgente: '🚨', importante: '⚡', info: 'ℹ️' };
    const text = `${emojis[alert.level] || 'ℹ️'} *${alert.title}*\n${alert.message}${alert.leadName ? `\n_Lead: ${alert.leadName}_` : ''}`;
    return this.sendMessage(chatId, text);
  }
}
