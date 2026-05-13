export class RealtimeService {
  constructor(wss) {
    this.wss = wss;
    this.clientSubscriptions = new Map();
    if (this.wss) this.init();
  }

  init() {
    this.wss.on('connection', (ws) => {
      ws.subscriptions = new Set();

      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Conexión en tiempo real establecida.',
        timestamp: new Date().toISOString(),
      }));

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          switch (msg.type) {
            case 'subscribe':
              if (Array.isArray(msg.channels)) {
                msg.channels.forEach((ch) => ws.subscriptions.add(ch));
                ws.send(JSON.stringify({ type: 'subscribed', channels: msg.channels }));
              }
              break;
            case 'unsubscribe':
              if (Array.isArray(msg.channels)) {
                msg.channels.forEach((ch) => ws.subscriptions.delete(ch));
              }
              break;
            case 'ping':
              ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
              break;
          }
        } catch (e) {
          /* ignore malformed messages */
        }
      });

      ws.on('close', () => {
        this.clientSubscriptions.delete(ws);
      });

      ws.on('error', () => {});
    });
  }

  broadcast(event, data, filterFn) {
    if (!this.wss) return;
    const payload = JSON.stringify({
      type: event,
      data,
      timestamp: new Date().toISOString(),
    });
    for (const client of this.wss.clients) {
      if (client.readyState === 1) {
        if (!filterFn || filterFn(client)) {
          try { client.send(payload); } catch (e) { /* client disconnected */ }
        }
      }
    }
  }

  broadcastActivity(activity) {
    this.broadcast('activity', activity);
  }

  broadcastLeadUpdate(lead) {
    this.broadcast('lead_update', lead, (client) => client.subscriptions.has('leads') || client.subscriptions.size === 0);
  }

  broadcastAgentAction(agentType, action) {
    this.broadcast('agent_action', {
      agentType,
      action,
      timestamp: new Date().toISOString(),
    }, (client) => client.subscriptions.has('agents') || client.subscriptions.size === 0);
  }

  broadcastNotification(notification) {
    this.broadcast('notification', notification);
  }

  getConnectedClients() {
    return this.wss ? this.wss.clients.size : 0;
  }
}

export let realtime = null;

export function initRealtime(wss) {
  realtime = new RealtimeService(wss);
  return realtime;
}
