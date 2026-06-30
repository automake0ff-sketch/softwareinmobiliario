import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';

export class MCPServer {
  constructor(name, version = '1.0.0') {
    this.name = name;
    this.version = version;
    this._resources = [];
    this._tools = [];
    this._resourceHandlers = {};
    this._toolHandlers = {};
  }

  resource(uri, name, description, handler) {
    this._resources.push({ uri, name, description, mimeType: 'application/json' });
    this._resourceHandlers[uri] = handler;
    return this;
  }

  tool(name, description, inputSchema, handler) {
    this._tools.push({ name, description, inputSchema });
    this._toolHandlers[name] = handler;
    return this;
  }

  async listResources() {
    return { resources: this._resources };
  }

  async readResource(uri, agencyId) {
    const handler = this._resourceHandlers[uri];
    if (!handler) throw new Error(`Resource not found: ${uri}`);
    const data = await handler(agencyId);
    return { contents: [{ uri, mimeType: 'application/json', text: typeof data === 'string' ? data : JSON.stringify(data) }] };
  }

  async listTools() {
    return { tools: this._tools };
  }

  async callTool(name, args, context = {}) {
    const handler = this._toolHandlers[name];
    if (!handler) throw new Error(`Tool not found: ${name}`);
    const result = await handler(args, context);
    return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }] };
  }
}

export function calculateCompatibility(lead, property) {
  let score = 0;
  if (!lead || !property) return 0;
  if (property.price <= (lead.budget || 999999999)) score += 30;
  if (lead.zone && property.zone && lead.zone.toLowerCase() === property.zone.toLowerCase()) score += 25;
  if (lead.property_interest && property.type && lead.property_interest.toLowerCase() === property.type.toLowerCase()) score += 20;
  if (property.bedrooms >= (lead.bedrooms_min || 0)) score += 15;
  return Math.min(score, 100);
}

export function getMatchReasons(lead, property) {
  const reasons = [];
  if (property.price <= (lead.budget || 999999999)) reasons.push('Dentro del presupuesto');
  if (lead.zone && property.zone && lead.zone.toLowerCase() === property.zone.toLowerCase()) reasons.push('Misma zona');
  if (lead.property_interest && property.type && lead.property_interest.toLowerCase() === property.type.toLowerCase()) reasons.push('Mismo tipo de propiedad');
  if (property.bedrooms >= (lead.bedrooms_min || 0)) reasons.push('Habitaciones suficientes');
  return reasons;
}

function logActivity(agencyId, leadId, userId, type, description, metadata) {
  run(
    `INSERT INTO activities (id, agency_id, lead_id, user_id, type, description, metadata, created_at)
     VALUES (@id, @aid, @lid, @uid, @type, @desc, @meta, NOW())`,
    {
      id: uuidv4(), aid: agencyId, lid: leadId, uid: userId || null,
      type, desc: description, meta: metadata ? JSON.stringify(metadata) : null,
    }
  );
}

export { logActivity };
