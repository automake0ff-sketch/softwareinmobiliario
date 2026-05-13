import propiaCrm from './propia-crm.js';
import propiaWhatsapp from './propia-whatsapp.js';
import propiaCalendar from './propia-calendar.js';
import propiaMarket from './propia-market.js';

export const mcpServers = {
  'propia-crm': propiaCrm,
  'propia-whatsapp': propiaWhatsapp,
  'propia-calendar': propiaCalendar,
  'propia-market': propiaMarket,
};

export const agentMCPServers = {
  captador: ['propia-crm', 'propia-whatsapp'],
  vendedor: ['propia-crm', 'propia-whatsapp', 'propia-market'],
  coordinador: ['propia-crm', 'propia-calendar'],
  copywriter: ['propia-crm'],
  tasador: ['propia-crm', 'propia-market'],
  analista: ['propia-crm'],
  agendador: ['propia-crm', 'propia-calendar', 'propia-whatsapp'],
  nurturing: ['propia-crm', 'propia-whatsapp'],
  documentador: ['propia-crm', 'propia-whatsapp'],
  seo: ['propia-crm', 'propia-market'],
  financiero: ['propia-crm', 'propia-market'],
  notificador: ['propia-crm', 'propia-whatsapp'],
};

export function getAgentMCPServers(agentType) {
  const serverNames = agentMCPServers[agentType] || ['propia-crm'];
  return serverNames.map(name => mcpServers[name]).filter(Boolean);
}
