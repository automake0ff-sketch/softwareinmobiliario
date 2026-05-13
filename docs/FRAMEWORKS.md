# PropIA — Frameworks y Patrones de Código

## Stack Técnico Actual

| Capa | Framework | Versión | Uso |
|------|-----------|---------|-----|
| Frontend | React + Vite | 18.x / 5.x | SPA con routing client-side |
| UI | Tailwind CSS | 3.x | Estilos utilitarios |
| Animaciones | Framer Motion | 11.x | Micro-interacciones |
| Drag & Drop | @hello-pangea/dnd | 16.x | Pipeline Kanban |
| Estado global | Zustand | 4.x | Store del cliente con persist |
| Backend | Express.js | 4.x | API REST |
| Base de datos | SQLite (via sql.js) | 1.x | DB embebida en servidor |
| Tiempo real | ws (WebSockets) | 8.x | Notificaciones live |
| IA | @anthropic-ai/sdk | latest | Agentes Claude |
| Embeddings | OpenRouter API | — | RAG semántico (text-embedding-3-small) |
| WhatsApp | Meta Graph API + mock | v18 | Mensajería con fallback mock |
| Email | SendGrid/SMTP + mock | — | Email transaccional con fallback mock |
| Calendario | Google Calendar API + mock | — | Disponibilidad comercial |
| Pagos | Stripe + mock | — | Suscripciones con fallback mock |
| Llamadas | Twilio + mock | — | Voz con fallback mock |
| Cola | In-process EventEmitter | — | Job queue ligera (sin Redis) |

## Estructura del Proyecto

```
/
├── src/                          # Frontend React + Vite
│   ├── agents/                   # Audit agents (frontend-side)
│   ├── components/               # Componentes React
│   │   ├── Agency/               ─── Settings de agencia
│   │   ├── AgentsIA/             ─── UI de agentes IA
│   │   ├── Analytics/            ─── Dashboard analítico
│   │   ├── Automations/          ─── Reglas de automatización
│   │   ├── Common/               ─── Componentes compartidos
│   │   ├── Conversations/        ─── Burbujas de conversación
│   │   ├── Dashboard/            ─── Widgets del dashboard
│   │   ├── Layout/               ─── Shell (Sidebar, Topbar)
│   │   └── Properties/           ─── Fichas de propiedad
│   ├── lib/                      ─── Utilidades frontend
│   │   ├── api.js                ─── Cliente HTTP con auth headers
│   │   ├── store.js              ─── Zustand store global
│   │   ├── rag.js                ─── Cliente API RAG
│   │   ├── tools.js              ─── Cliente API Tool Use
│   │   └── mcp.js                ─── Cliente API MCP
│   ├── pages/                    ─── Páginas del dashboard
│   ├── utils/                    ─── Formateadores, helpers
│   ├── App.jsx                   ─── Router principal
│   └── main.jsx                  ─── Entry point con hydratación
│
├── server/                       # Backend Express.js
│   ├── agents/                   ─── 12 agentes IA (cada uno en su archivo)
│   ├── db/
│   │   ├── db.js                 ─── Wrapper SQLite (all, get, run, transaction)
│   │   └── schema.sql            ─── DDL completo del CRM
│   ├── mcp/                      ─── Servidores MCP
│   ├── middleware/
│   │   └── auth.js               ─── Auth por headers
│   ├── rag/                      ─── Indexadores y retriever RAG
│   ├── routes/                   ─── Rutas Express
│   ├── services/                 ─── Servicios externos (todos con mock)
│   ├── tools/                    ─── Tool definitions y executor
│   ├── webhooks/                 ─── Meta Ads + WhatsApp webhooks
│   └── index.js                  ─── Entry point + queue + seed data
│
└── data/
    └── crm.db                    ─── Base de datos SQLite (autogenerada)
```

## Patrón de Agente IA (server/agents/)

Cada agente sigue esta estructura:

```javascript
// server/agents/miagente.js
import { askClaude, isClientAvailable } from '../services/claude.js';
// Importar herramientas si usa tool use:
import { runAgentWithTools } from '../tools/agent-runner.js';

const SYSTEM_PROMPT = `Eres el Agente X de PropIA...`;

// --- Fallbacks ---
function fallbackAction(data) { ... }

// --- Funciones principales ---
export async function primaryAction(payload) {
  const errors = [];

  if (isClientAvailable()) {
    try {
      const text = await askClaude(SYSTEM_PROMPT, `Prompt...`);
      const parsed = JSON.parse(text);
      return { success: true, result: parsed, insight: '...' };
    } catch (err) { errors.push(err.message); }
  }

  const result = fallbackAction(payload);
  return { success: true, result, insight: errors.length ? `Modo fallback: ...` : '...' };
}

// --- Execute ---
export async function execute(context) {
  const { action, payload } = context;
  switch (action) {
    case 'primaryAction': return primaryAction(payload);
    default: return { success: false, result: null, insight: `Acción desconocida: ${action}` };
  }
}

// --- System prompt getter ---
export function getSystemPrompt() { return SYSTEM_PROMPT; }
```

### Reglas del patrón agente:
1. **Primero intentar Claude**: usar `askClaude()` con `SYSTEM_PROMPT`
2. **Fallback siempre disponible**: función `*Fallback()` para cuando Claude no responde
3. **Retorno unificado**: `{ success, result, insight }`
4. **JSON en respuestas Claude**: pedir siempre JSON, parsear con `JSON.parse()`
5. **No bloquear**: si Claude falla, capturar error y usar fallback

## Patrón de API Route (server/routes/)

```javascript
// server/routes/entidad.js
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../db/db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

router.get('/', (req, res) => {
  try {
    const { filter1, filter2 } = req.query;
    let sql = 'SELECT * FROM tabla WHERE 1=1';
    const params = {};
    if (filter1) { sql += ' AND campo = @f1'; params.f1 = filter1; }
    sql += ' ORDER BY created_at DESC';
    const rows = all(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: '...' });
  }
});

router.get('/:id', (req, res) => {
  // GET /api/entidad/:id → objeto único + relaciones
});

router.post('/', (req, res) => {
  // POST /api/entidad → crear + logActivity + devolver registro
});

router.patch('/:id', (req, res) => {
  // PATCH /api/entidad/:id → actualizar campos permitidos
});

router.delete('/:id', (req, res) => {
  // DELETE /api/entidad/:id → borrar + logActivity
});

function logActivity(agencyId, leadId, userId, type, description, metadata) { ... }

export default router;
```

### Reglas de rutas:
1. **Siempre try/catch** con error 500
2. **Params con @nombre** para SQLite (el wrapper normaliza)
3. **Crear actividad** en operaciones de escritura vía `logActivity()`
4. **Validar existencia** antes de update/delete
5. **Auth middleware** aplicado a todo el router

## Patrón de DB (server/db/db.js)

```javascript
import { all, get, run } from '../db/db.js';

// SELECT múltiple → array de objetos
const leads = all('SELECT * FROM leads WHERE status = @status', { status: 'nuevo' });

// SELECT uno → objeto o null
const lead = get('SELECT * FROM leads WHERE id = @id', { id: leadId });

// INSERT/UPDATE/DELETE → { changes: N }
run('UPDATE leads SET status = @s WHERE id = @id', { s: 'contactado', id: leadId });

// Transacciones
const result = transaction(() => {
  run('INSERT ...');
  run('UPDATE ...');
})();

// Params: se normalizan automáticamente (añade @ si no tiene prefijo)
run('INSERT INTO t (id, name) VALUES (@id, @name)', { id: uuidv4(), name: 'Test' });
```

### Convenciones SQLite:
- **Todas las tablas** tienen `id TEXT PRIMARY KEY` (UUIDs, no autoincrement)
- **Timestamps**: `datetime('now')` en formato ISO
- **JSON** en columnas TEXT: guardar con `JSON.stringify()`, recuperar con `JSON.parse()`
- **Parámetros** siempre nombrados (`@nombre`), nunca posicionales (`?`)
- **Foreign keys**: `ON DELETE CASCADE` o `SET NULL`
- **Check constraints** para enums en la tabla

## Patrón de Store (Zustand)

```javascript
// src/lib/miStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from './api';

export const useMiStore = create(
  persist(
    (set, get) => ({
      // Estado plano
      items: [],
      loading: false,
      selectedId: null,

      // Acciones
      fetchItems: async (filters) => {
        set({ loading: true });
        try {
          const data = await api.get('/api/entidad', filters);
          set({ items: data, loading: false });
        } catch {
          set({ loading: false });
        }
      },

      updateItem: (id, data) => {
        // Optimistic update
        const prev = get().items;
        set(state => ({
          items: state.items.map(i => i.id === id ? { ...i, ...data } : i),
        }));
        api.patch(`/api/entidad/${id}`, data).catch(() => set({ items: prev }));
      },
    }),
    { name: 'store-key' }  // Persist en localStorage
  )
);
```

## Patrón de Servicio Externo (server/services/)

Todos los servicios tienen fallback mock:

```javascript
export class MiServicio {
  constructor(config = {}) {
    this.config = config;
  }

  async algunaAccion(params) {
    // Si no está configurado → mock
    if (!this.config.apiKey) {
      return { mock: true, result: '...', timestamp: new Date().toISOString() };
    }

    try {
      // Llamada real a API externa
      const res = await fetch('https://api.example.com/endpoint', { ... });
      return await res.json();
    } catch (err) {
      console.error('[MI_SERVICIO] Error:', err.message);
      // Fallback a mock en caso de error
      return { mock: true, error: err.message, fallback: true };
    }
  }
}
```

## Agentes IA — Mapa de Acciones

| Agente | Archivo | Acciones principales |
|--------|---------|---------------------|
| captador | `agents/captador.js` | `processIncomingLead`, `classifyBySource`, `generateFirstMessage`, `captureLeadWithTools` |
| vendedor | `agents/vendedor.js` | `handleObjection`, `generateFollowUp`, `generateUrgencyMessage`, `suggestClosingStrategy`, `runVendedorWithRag`, `handleObjectionWithRag` |
| coordinador | `agents/coordinador.js` | `assignLead`, `prioritizeTasks`, `detectHotLead`, `suggestAutomations`, `generateCoordinationSummary`, `orchestrateWithTools` |
| agendador | `agents/agendador.js` | `suggestTimeSlots`, `confirmVisit`, `sendReminder`, `rescheduleVisit`, `generateVisitBriefing`, `registerVisitResult`, `scheduleVisitWithTools` |
| tasador | `agents/tasador.js` | `estimatePrice`, `estimateRent`, `analyzeMarketTrends`, `generateValuationReport`, `comparablesAnalysis`, `appraiseWithTools` |
| copywriter | `agents/copywriter.js` | `generateListingAd`, `generateEmail`, `generateSocialPost`, `improveDescription` |
| analista | `agents/analista.js` | `analyzePipeline`, `analyzeAgentPerformance`, `detectOpportunities`, `generateWeeklyReport`, `predictConversion` |
| nurturing | `agents/nurturing.js` | `generateSequence`, `createMessage`, `detectReactivationMoment`, `segmentByProfile`, `generateValueContent` |
| documentador | `agents/documentador.js` | `generateChecklist`, `requestDocument`, `generatePropertyPDF`, `generateDraftContract`, `trackPendingDocuments`, `organizeDocuments` |
| seo | `agents/seo.js` | `optimizePropertySEO`, `generateLocalContent`, `suggestKeywords`, `generateMetaData`, `generateBlogPost` |
| financiero | `agents/financiero.js` | `calculateMortgage`, `prequalifyLead`, `compareMarketConditions`, `estimateTotalCosts`, `checkBudgetViability` |
| notificador | `agents/notificador.js` | `generateDailyBriefing`, `alertHotLead`, `sendMultiChannel`, `generateEndOfDayReport`, `checkSLAViolations`, `notifyNewPropertyMatch` |

## Extensiones recién añadidas

| Sistema | Ubicación | Propósito |
|---------|-----------|-----------|
| RAG | `server/services/rag.js`, `server/rag/` | Embeddings + búsqueda semántica + knowledge base |
| Tool Use | `server/tools/` | Function calling para agentes (definiciones + executor + runner) |
| MCP | `server/mcp/` | Servidores de contexto (CRM, WhatsApp, Calendar, Market) |

## Convenciones de Nomenclatura

| Elemento | Convención | Ejemplo |
|----------|-----------|---------|
| Componentes React | PascalCase | `LeadCard.jsx` |
| Hooks | camelCase | `useStore.js` |
| Páginas | PascalCase + Page | `LeadsPage.jsx` |
| Agentes IA | camelCase | `vendedor.js` |
| Routes Express | plural kebab-case | `/api/leads/[id]/score` |
| DB tablas | snake_case | `property_embeddings` |
| DB columnas | snake_case | `ia_score`, `assigned_to` |
| Variables JS | camelCase | `agencyId`, `leadData` |
| Constantes | UPPER_SNAKE | `SYSTEM_PROMPT`, `API_TOKEN` |
| Archivos server | camelCase | `claude.js`, `rag-client.js` |
| Archivos frontend | camelCase | `store.js`, `api.js` |
| Archivos React | PascalCase | `LeadCard.jsx` |
| Estilos CSS modules | camelCase + .module | `AuditForm.module.css` |
| ENV vars | UPPER_SNAKE | `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` |

## Colores del Sistema (Tailwind)

```css
/* Definidos en tailwind.config.js y src/index.css */
--bg-primary: #080811;       /* Fondo principal oscuro */
--bg-secondary: #0F0F1A;     /* Fondo secundario */
--bg-card: #13131F;          /* Fondo de tarjetas */
--accent: #6366F1;           /* Violeta IA (indigo-500) */
--score-hot: #10B981;        /* Verde para score >= 75 */
--score-warm: #F59E0B;       /* Ámbar para score 40-74 */
--score-cold: #6B7280;       /* Gris para score < 40 */
--text-primary: #F1F5F9;     /* Texto principal */
--text-secondary: #94A3B8;   /* Texto secundario */
--border: rgba(255,255,255,0.06);  /* Bordes sutiles */
```

## Errores comunes a evitar

1. **No asumir que hay API keys configuradas** → Siempre verificar con `isClientAvailable()` o chequear `process.env.VAR`
2. **No bloquear el event loop** → Operaciones lentas (Claude, embeddings, etc.) van a la cola (`services/queue.js`)
3. **No hardcodear agency/user IDs** → Siempre de headers de auth (`req.headers['x-auth-agency']`)
4. **No dejar columnas JSON como string** → Parsear con `JSON.parse()` al leer, `JSON.stringify()` al escribir
5. **No ignorar errores de parseo JSON** → Claude puede devolver texto no-JSON, siempre try/catch el `JSON.parse()`
6. **No mezclar async/sync** → `db.js` tiene `all/get/run` síncronos, pero las llamadas API son async
7. **No olvidar el fallback** → Cada función de agente debe funcionar sin Claude (modo degradado)
8. **No crear jobs sin rate limiting** → Respetar límites de API de WhatsApp/embeddings
9. **No compartir instancias de servicios entre requests** → Crear nuevas en cada handler o usar factories
10. **No hardcodear endpoints de API externa** → Usar variables de entorno
