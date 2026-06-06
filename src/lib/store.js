import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from './api'

function syncAuth(user) {
  if (user) {
    api.setAuth(
      user.token || 'demo-token-dev',
      user.id,
      user.role || 'manager',
      user.agency_id,
      user.office_id,
      user.email
    )
  } else {
    api.setAuth(null)
  }
}

export const PLAN_ORDER = { starter: 1, profesional: 2, agencia: 3 }

export function planIncludes(userPlan, requiredPlan) {
  return PLAN_ORDER[userPlan] >= PLAN_ORDER[requiredPlan]
}

export const SECTION_PLAN_REQUIREMENTS = {
  '/dashboard': { minPlan: 'starter', message: '' },
  '/pipeline': { minPlan: 'starter', message: '' },
  '/leads': { minPlan: 'starter', message: '' },
  '/properties': { minPlan: 'starter', message: '' },
  '/conversations': { minPlan: 'starter', message: '' },
  '/agents': { minPlan: 'starter', message: '' },
  '/automations': { minPlan: 'starter', message: '' },
  '/analytics': { minPlan: 'profesional', message: 'Analytics avanzado disponible desde plan Profesional' },
  '/team': { minPlan: 'profesional', message: 'Gestión de equipo disponible desde plan Profesional' },
  '/settings': { minPlan: 'starter', message: '' },
}

export const FEATURE_PLAN_MAP = {
  whatsapp: 'starter',
  leads: 'starter',
  users: 'starter',
  agents: 'starter',
  automations: 'starter',
  meta_ads: 'profesional',
  fullAnalytics: 'profesional',
  apiAccess: 'profesional',
  prioritySupport: 'profesional',
  whiteLabel: 'agencia',
  customIntegrations: 'agencia',
  dedicatedAccountManager: 'agencia',
}

const PLAN_CONFIG = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 79,
    priceYearly: 69,
    limits: { leads: 500, agents: 3, offices: 1, users: 5, automations: 10 },
    availableAgentTypes: ['captador', 'vendedor', 'coordinador'],
    features: {
      whiteLabel: false,
      apiAccess: false,
      advancedAutomation: false,
      fullAnalytics: false,
      whatsappApi: true,
      metaAds: false,
      prioritySupport: false,
      customIntegrations: false,
      dedicatedAccountManager: false,
    },
  },
  profesional: {
    id: 'profesional',
    name: 'Profesional',
    price: 199,
    priceYearly: 169,
    limits: { leads: 2000, agents: 8, offices: 3, users: 15, automations: -1 },
    availableAgentTypes: ['captador', 'vendedor', 'coordinador', 'copywriter', 'tasador', 'analista', 'agendador', 'nurturing'],
    features: {
      whiteLabel: false,
      apiAccess: true,
      advancedAutomation: true,
      fullAnalytics: true,
      whatsappApi: true,
      metaAds: true,
      prioritySupport: true,
      customIntegrations: false,
      dedicatedAccountManager: false,
    },
  },
  agencia: {
    id: 'agencia',
    name: 'Agencia',
    price: 499,
    priceYearly: 419,
    limits: { leads: -1, agents: 12, offices: -1, users: -1, automations: -1 },
    availableAgentTypes: ['captador', 'vendedor', 'coordinador', 'copywriter', 'tasador', 'analista', 'agendador', 'nurturing', 'documentador', 'seo', 'financiero', 'notificador'],
    features: {
      whiteLabel: true,
      apiAccess: true,
      advancedAutomation: true,
      fullAnalytics: true,
      whatsappApi: true,
      metaAds: true,
      prioritySupport: true,
      customIntegrations: true,
      dedicatedAccountManager: true,
    },
  },
};

const initialState = {
  user: null,
  agency: null,
  leads: [],
  properties: [],
  conversations: [],
  activities: [],
  agents: {},
  pipelineLeads: {},
  sidebarOpen: true,
  selectedLead: null,
  showLeadProfile: false,
  darkMode: false,
  loading: {
    leads: false,
    properties: false,
    conversations: false,
    activities: false,
    stats: false,
    limits: false,
    subscription: false,
  },
  stats: null,
  ranking: [],
  subscription: null,
  limits: null,
}

export const useStore = create(
  persist(
    (set, get) => ({
      ...initialState,

      setUser: (user) => {
        syncAuth(user)
        set({ user })
        if (!user) {
          // Asegurar de que también cerramos sesión en Supabase si se limpia el usuario
          import('./supabaseClient').then(({ supabase }) => {
            supabase.auth.signOut().catch(() => {})
          }).catch(() => {})
        }
      },
      setAgency: (agency) => set({ agency }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

      setLoading: (key, value) =>
        set((s) => ({ loading: { ...s.loading, [key]: value } })),

      fetchLeads: async (params) => {
        set((s) => ({ loading: { ...s.loading, leads: true } }))
        try {
          const data = await api.get('/leads', params)
          const raw = data.leads || data
          const mapLead = (l) => ({
            ...l,
            score: l.ia_score,
            insight: l.ia_insight,
            propertyInterest: l.property_interest,
            propertyLocation: l.zone,
            location: l.zone,
            createdAt: l.created_at,
            budget: l.budget,
          })
          const leads = Array.isArray(raw) ? raw.map(mapLead) : raw
          set({ leads })
        } catch {
          // error already handled by api client
        } finally {
          set((s) => ({ loading: { ...s.loading, leads: false } }))
        }
      },

      fetchProperties: async (params) => {
        set((s) => ({ loading: { ...s.loading, properties: true } }))
        try {
          const data = await api.get('/properties', params)
          set({ properties: data.properties || data })
        } catch (e) {
          console.error('fetchProperties error:', e)
        } finally {
          set((s) => ({ loading: { ...s.loading, properties: false } }))
        }
      },

      fetchConversations: async (params) => {
        set((s) => ({ loading: { ...s.loading, conversations: true } }))
        try {
          const data = await api.get('/conversations', params)
          set({ conversations: data.conversations || data })
        } catch {
          // handled
        } finally {
          set((s) => ({ loading: { ...s.loading, conversations: false } }))
        }
      },

      fetchActivities: async (params) => {
        set((s) => ({ loading: { ...s.loading, activities: true } }))
        try {
          const data = await api.get('/activities', params)
          set({ activities: data.activities || data })
        } catch {
          // handled
        } finally {
          set((s) => ({ loading: { ...s.loading, activities: false } }))
        }
      },

      createLead: async (leadData) => {
        const lead = await api.post('/leads', leadData)
        set((s) => ({ leads: [lead, ...s.leads] }))
        return lead
      },

      updateLead: async (id, leadData) => {
        const updated = await api.patch(`/leads/${id}`, leadData)
        set((s) => ({
          leads: s.leads.map((l) => (l.id === id ? { ...l, ...updated } : l)),
        }))
        return updated
      },

      deleteLead: async (id) => {
        await api.delete(`/leads/${id}`)
        set((s) => ({
          leads: s.leads.filter((l) => l.id !== id),
          selectedLead: s.selectedLead?.id === id ? null : s.selectedLead,
          showLeadProfile: s.selectedLead?.id === id ? false : s.showLeadProfile,
        }))
      },

      moveLeadStatus: async (leadId, newStatus, index) => {
        const { leads } = get()
        const lead = leads.find((l) => l.id === leadId)
        if (!lead) return

        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === leadId ? { ...l, status: newStatus } : l
          ),
        }))

        try {
          await api.patch(`/leads/${leadId}/status`, { status: newStatus, index })
        } catch {
          set((s) => ({
            leads: s.leads.map((l) =>
              l.id === leadId ? { ...l, status: lead.status } : l
            ),
          }))
        }
      },

      createProperty: async (propertyData) => {
        const property = await api.post('/properties', propertyData)
        set((s) => ({ properties: [property, ...s.properties] }))
        return property
      },

      fetchProperty: async (id) => {
        const data = await api.get(`/properties/${id}`)
        return data
      },

      updateProperty: async (id, propertyData) => {
        const updated = await api.patch(`/properties/${id}`, propertyData)
        set((s) => ({
          properties: s.properties.map((p) =>
            p.id === id ? { ...p, ...updated } : p
          ),
        }))
        return updated
      },

      deleteProperty: async (id) => {
        await api.delete(`/properties/${id}`)
        set((s) => ({
          properties: s.properties.filter((p) => p.id !== id),
        }))
      },

      importPropertyFromUrl: async (url) => {
        const result = await api.post('/properties/import/url', { url })
        if (result.created && result.created.length > 0) {
          set((s) => ({ properties: [...result.created, ...s.properties] }))
        }
        if (result.updated && result.updated.length > 0) {
          set((s) => ({
            properties: s.properties.map(p => {
              const match = result.updated.find(u => u.id === p.id)
              return match ? { ...p, ...match } : p
            })
          }))
        }
        return result
      },

      importPropertiesFromIdealista: async (urls) => {
        const result = await api.post('/properties/import/idealista', { urls })
        if (result.imported && result.imported.length > 0) {
          set((s) => ({
            properties: [...result.imported, ...s.properties],
          }))
        }
        return result
      },

      importPropertiesFromCsv: async (csvData) => {
        const result = await api.post('/properties/import/csv', { csv_data: csvData })
        if (result.imported && result.imported.length > 0) {
          set((s) => ({
            properties: [...result.imported, ...s.properties],
          }))
        }
        return result
      },

      fetchCompatibleLeads: async (propertyId) => {
        const data = await api.post(`/properties/${propertyId}/match-leads`)
        return data
      },

      duplicateProperty: async (id) => {
        const property = await api.post(`/properties/${id}/duplicate`)
        set((s) => ({ properties: [property, ...s.properties] }))
        return property
      },

      changePropertyStatus: async (id, status) => {
        const updated = await api.patch(`/properties/${id}/status`, { status })
        set((s) => ({
          properties: s.properties.map((p) =>
            p.id === id ? { ...p, ...updated } : p
          ),
        }))
        return updated
      },

      shareProperty: async (id) => {
        const result = await api.post(`/properties/${id}/share`)
        return result
      },

      generatePropertyDescription: async (id) => {
        const result = await api.post(`/properties/${id}/generate-description`)
        return result
      },

      previewCsv: async (csvData) => {
        const result = await api.post('/properties/csv-preview', { csv_data: csvData })
        return result
      },

      fetchPropertyMetrics: async () => {
        const data = await api.get('/properties', { metrics: 'true' })
        return data
      },

      fetchPropertyInterests: async (propertyId) => {
        const data = await api.get(`/properties/${propertyId}/interests`)
        return data
      },

      createPropertyInterest: async (propertyId, leadId, channel) => {
        const data = await api.post(`/properties/${propertyId}/interests`, { lead_id: leadId, channel })
        return data
      },

      deletePropertyInterest: async (propertyId, interestId) => {
        await api.delete(`/properties/${propertyId}/interests/${interestId}`)
      },

      fetchPropertyStats: async (propertyId) => {
        const data = await api.get(`/properties/${propertyId}/stats`)
        return data
      },

      generateWhatsAppMessage: async (propertyId, phone) => {
        const data = await api.post(`/properties/${propertyId}/generate-whatsapp`, { phone })
        return data
      },

      generateEmailContent: async (propertyId, email) => {
        const data = await api.post(`/properties/${propertyId}/generate-email`, { email })
        return data
      },

      generateSocialPost: async (propertyId) => {
        const data = await api.post(`/properties/${propertyId}/generate-post`)
        return data
      },

      createPropertyAI: async (description) => {
        const result = await api.post('/properties/create-ai', { description })
        return result
      },

      improvePropertyAI: async (id) => {
        const result = await api.post(`/properties/${id}/improve-ai`)
        return result
      },

      generateMarketingAsset: async (id, action) => {
        const result = await api.post(`/properties/${id}/marketing`, { action })
        return result
      },

      fetchInterestedLeads: async (id) => {
        const data = await api.get(`/properties/${id}/interested-leads`)
        return data
      },

      fetchPropertyActivity: async (id) => {
        const data = await api.get(`/properties/${id}/activity`)
        return data
      },

      scrapePropertyUrl: async (url) => {
        const data = await api.post('/properties/scrape-url', { url })
        return data
      },

      selectLead: (lead) => set({ selectedLead: lead, showLeadProfile: true }),
      closeLeadProfile: () => set({ selectedLead: null, showLeadProfile: false }),

      fetchAgencyStats: async () => {
        set((s) => ({ loading: { ...s.loading, stats: true } }))
        try {
          const data = await api.get('/agency/stats')
          set({ stats: data })
        } catch {
          // handled
        } finally {
          set((s) => ({ loading: { ...s.loading, stats: false } }))
        }
      },

      fetchRanking: async () => {
        try {
          const data = await api.get('/agency/ranking')
          set({ ranking: data.ranking || data })
        } catch {
          // handled
        }
      },

       addActivity: (activity) =>
         set((s) => ({
           activities: [activity, ...s.activities].slice(0, 200),
         })),

       fetchSubscription: async () => {
         set((s) => ({ loading: { ...s.loading, subscription: true } }))
         try {
           const data = await api.get('/billing/subscription')
           set({ subscription: data })
         } catch {
           set({ subscription: { planId: 'starter', planName: 'Starter', status: 'inactive' } })
         } finally {
           set((s) => ({ loading: { ...s.loading, subscription: false } }))
         }
       },

       fetchLimits: async () => {
         set((s) => ({ loading: { ...s.loading, limits: true } }))
         try {
           const data = await api.get('/billing/limits')
           set({ limits: data })
        } catch (e) {
          console.error('fetchProperties error:', e)
        } finally {
           set((s) => ({ loading: { ...s.loading, limits: false } }))
         }
       },

       getCurrentPlan: () => {
         const { subscription } = get()
         const planId = subscription?.planId || 'starter'
         return PLAN_CONFIG[planId] || PLAN_CONFIG.starter
       },

       canUseFeature: (feature) => {
         const plan = get().getCurrentPlan()
         return !!(plan?.features?.[feature])
       },

       isWithinLimit: (type) => {
         const { limits } = get()
         if (!limits) return true
         return limits.withinLimits !== false
       },

       reset: () => set(initialState),
     }),
    {
      name: 'crm-inmobiliario-store',
      partialize: (s) => ({
        user: s.user,
        agency: s.agency,
        sidebarOpen: s.sidebarOpen,
        darkMode: s.darkMode,
      }),
    }
  )
)

// Sincronizar headers de la API automáticamente ante cualquier cambio del usuario en el store (incluyendo la rehidratación)
useStore.subscribe((state) => {
  syncAuth(state.user)
})

// Ejecutar sincronización inicial para el estado ya cargado
if (typeof window !== 'undefined') {
  const initialUser = useStore.getState().user
  if (initialUser) syncAuth(initialUser)
}
