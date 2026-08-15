// Fuente de verdad única para todos los planes y límites

export const PLAN_RANK = { starter: 1, profesional: 2, agencia: 3 }

export function planIncludes(userPlan, requiredPlan) {
  return PLAN_RANK[userPlan] >= PLAN_RANK[requiredPlan]
}

export function minPlanForFeature(feature) {
  for (const planId of ['agencia', 'profesional', 'starter']) {
    if (PLANS[planId].features[feature]) return planId
  }
  return 'agencia'
}

export function upgradeMessage(feature, currentPlan) {
  const needed = minPlanForFeature(feature)
  const messages = {
    meta_ads: 'Meta Ads está disponible desde el plan Profesional',
    idealista_integration: 'La integración con Idealista está disponible en el plan Agencia',
    analytics_advanced: 'Analytics avanzado está disponible desde el plan Profesional',
    white_label: 'White-label completo está disponible en el plan Agencia',
    custom_domain: 'Dominio personalizado está disponible en el plan Agencia',
    api_access: 'El acceso a la API está disponible desde el plan Profesional',
    api_full: 'La API completa está disponible en el plan Agencia',
    team_management: 'La gestión de equipo está disponible desde el plan Profesional',
    multi_office: 'Multi-oficina está disponible desde el plan Profesional',
    priority_support: 'El soporte prioritario está disponible desde el plan Profesional',
    dedicated_support: 'El soporte dedicado está disponible en el plan Agencia',
    agents_full: 'El equipo completo de agentes IA está disponible en el plan Agencia',
    automations_unlimited: 'Automatizaciones ilimitadas están disponibles desde el plan Profesional',
  }
  return messages[feature] || `Esta función requiere el plan ${needed}`
}

export function limitLabel(type, planId) {
  const plan = PLANS[planId]
  if (!plan) return ''
  const maxMap = {
    leads: plan.max_leads_per_month,
    users: plan.max_users,
    offices: plan.max_offices,
    agents: plan.max_agents,
    automations: plan.max_automations,
  }
  const max = maxMap[type]
  if (max === -1) return 'ilimitado'
  const labels = {
    leads: `${max} leads/mes`,
    users: `${max} usuarios`,
    offices: `${max} oficina${max > 1 ? 's' : ''}`,
    agents: `${max} agentes IA`,
    automations: `${max} automatizaciones`,
  }
  return labels[type] || ''
}

export const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price_monthly: 79,
    price_yearly: 790,
    max_offices: 1,
    max_users: 5,
    max_leads_per_month: 500,
    max_agents: 3,
    max_automations: 10,
    available_agents: ['captador', 'vendedor', 'coordinador'],
    features: {
      whatsapp_business: true,
      meta_ads: false,
      idealista_integration: false,
      crm_pipeline_kanban: true,
      analytics_basic: true,
      analytics_advanced: false,
      white_label: false,
      custom_domain: false,
      api_access: false,
      api_full: false,
      team_management: false,
      multi_office: false,
      automations_unlimited: false,
      agents_full: false,
      priority_support: false,
      dedicated_support: false,
    },
    support_type: 'email',
    support_sla_hours: 48,
  },
  profesional: {
    id: 'profesional',
    name: 'Profesional',
    price_monthly: 199,
    price_yearly: 1990,
    max_offices: 3,
    max_users: 15,
    max_leads_per_month: 2000,
    max_agents: 8,
    max_automations: -1,
    available_agents: ['captador', 'vendedor', 'coordinador', 'copywriter', 'tasador', 'analista', 'agendador', 'nurturing'],
    features: {
      whatsapp_business: true,
      meta_ads: true,
      idealista_integration: false,
      crm_pipeline_kanban: true,
      analytics_basic: true,
      analytics_advanced: true,
      white_label: false,
      custom_domain: false,
      api_access: true,
      api_full: false,
      team_management: true,
      multi_office: true,
      automations_unlimited: true,
      agents_full: false,
      priority_support: true,
      dedicated_support: false,
    },
    support_type: 'priority',
    support_sla_hours: 4,
  },
  agencia: {
    id: 'agencia',
    name: 'Agencia',
    price_monthly: 499,
    price_yearly: 4990,
    max_offices: -1,
    max_users: -1,
    max_leads_per_month: -1,
    max_agents: 12,
    max_automations: -1,
    available_agents: ['captador', 'vendedor', 'coordinador', 'copywriter', 'tasador', 'analista', 'agendador', 'nurturing', 'documentador', 'seo', 'financiero', 'notificador'],
    features: {
      whatsapp_business: true,
      meta_ads: true,
      idealista_integration: true,
      crm_pipeline_kanban: true,
      analytics_basic: true,
      analytics_advanced: true,
      white_label: true,
      custom_domain: true,
      api_access: true,
      api_full: true,
      team_management: true,
      multi_office: true,
      automations_unlimited: true,
      agents_full: true,
      priority_support: true,
      dedicated_support: true,
    },
    support_type: 'dedicated',
    support_sla_hours: 1,
  },
}
