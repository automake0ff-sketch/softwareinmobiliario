// Pruebas de interfaz de InmoFollow: clics y flujos reales sobre un DOM simulado (jsdom).
// No comprueban el aspecto visual (eso requiere un navegador), sino que cada botón hace lo que dice.
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockApi = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('../src/lib/api', () => ({ default: mockApi, api: mockApi }))
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

import toast from 'react-hot-toast'
import FollowUpPage from '../src/pages/FollowUpPage'
import LogContactModal from '../src/components/followup/LogContactModal'
import MessageDrawer from '../src/components/followup/MessageDrawer'
import SummaryModal from '../src/components/followup/SummaryModal'
import LeadPicker from '../src/components/followup/LeadPicker'
import SettingsModal from '../src/components/followup/SettingsModal'
import LeadFollowUpCard from '../src/components/followup/LeadFollowUpCard'
import PropertyActivityPanel from '../src/components/followup/PropertyActivityPanel'

const lead = (o = {}) => ({ id: 'l1', name: 'Marcos Vencido', phone: '600112233', email: 'm@x.es', status: 'interesado', status_label: 'Interesado', has_whatsapp: true, whatsapp_opt_out: false, ...o })
const item = (o = {}) => ({ kind: 'followup', followup_id: 'f1', lead: lead(), property: { id: 'p1', title: 'Piso en Triana', photo: 'https://fotos.test/triana.jpg' }, due_at: new Date(Date.now() - 2 * 86400000).toISOString(), channel: 'whatsapp', goal: 'follow_up', note: null, days_overdue: 2, days_since_contact: 8, priority: 80, reasons: ['Seguimiento vencido hace 2 días'], alert_class: 'inmediata', rule: 'seguimiento_vencido_2d', facts: ['Estado: Interesado', 'Último contacto: hace 8 días', 'Seguimiento vencido hace 2 días'], recommendation: { text: 'Retoma la conversación y deja programado el siguiente paso.', goal: 'follow_up' }, last_interaction: null, ...o })
const settings = { stale_days: { nuevo: 1, contactado: 4, interesado: 5, visita_agendada: 3, negociacion: 3, reserva: 2 }, inactive_days: 30, visit_followup_days: 1 }
const today = (o = {}) => ({
  summary: { overdue: 1, today: 1, abandoned: 1, upcoming_week: 3, visits_no_followup: 1, visits_unconfirmed: 1, attention_total: 4 },
  kpis: { active_contacts: 12, new_week: 3, to_contact: 2, overdue: 1, today: 1, visits_pending: 2, visits_no_followup: 1, inactive: 1, priority_opportunities: 2 },
  alert_counts: { inmediata: 2, recomendada: 1, pendiente_confirmar: 1, sin_actividad: 1 },
  settings,
  overdue: [item()],
  today: [item({ followup_id: 'f2', lead: lead({ id: 'l2', name: 'Elena Hoy' }), due_at: new Date().toISOString(), days_overdue: 0, alert_class: 'recomendada', facts: ['Estado: Interesado', 'Seguimiento programado para hoy'], reasons: ['Seguimiento programado para hoy'] })],
  abandoned: [item({ kind: 'abandoned', followup_id: null, due_at: null, alert_class: 'sin_actividad', lead: lead({ id: 'l3', name: 'Lucía Abandonada', status: 'nuevo', status_label: 'Nuevo' }), facts: ['Estado: Nuevo', 'Sin próxima acción programada'], reasons: ['Sin contacto desde hace 40 días'] })],
  visits_no_followup: [item({ kind: 'visit_no_followup', followup_id: null, appointment_id: 'a1', visit_at: new Date(Date.now() - 3 * 86400000).toISOString(), due_at: null, lead: lead({ id: 'l4', name: 'María Visitó' }), goal: 'post_visit', alert_class: 'inmediata', facts: ['Estado: Visita agendada', 'Visita del 29 oct sin contacto posterior registrado'], recommendation: { text: 'Contacta para conocer su opinión sobre la visita y resolver dudas.', goal: 'post_visit' } })],
  visits_unconfirmed: [item({ kind: 'visit_unconfirmed', followup_id: null, appointment_id: 'a2', visit_at: new Date(Date.now() + 20 * 3600000).toISOString(), due_at: null, lead: lead({ id: 'l5', name: 'Pedro Sin Confirmar' }), alert_class: 'pendiente_confirmar', facts: ['Estado: Visita agendada'], recommendation: { text: 'Confirma la visita con el cliente.', goal: 'follow_up' } })],
  abandoned_hidden: 0, truncated: false, ai_available: false, ...o,
})
const agendaItem = (o = {}) => ({ followup_id: 'u1', due_at: new Date(Date.now() + 3 * 86400000).toISOString(), status: 'pending', channel: 'whatsapp', goal: 'follow_up', lead: lead({ id: 'l6', name: 'Próximo Cliente' }), property: null, assigned_name: 'Laura', ...o })
const renderPage = () => render(<MemoryRouter><FollowUpPage /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.get.mockImplementation(async (url, params) => {
    if (url === '/followup/today') return today()
    if (url === '/followup/digest') return { enabled: true, delivery_configured: true }
    if (url === '/followup/leads/search') return [{ id: 'l9', name: 'Ana López', phone: '611223344', status: 'nuevo' }]
    if (url === '/followup/settings') return { settings, can_edit: true }
    if (url === '/followup/agenda') {
      if (params?.view === 'upcoming') return { items: [agendaItem()] }
      if (params?.view === 'completed') return { items: [agendaItem({ followup_id: 'c1', status: 'done', completed_at: new Date().toISOString(), lead: lead({ id: 'l7', name: 'Ya Completado' }) })] }
      if (params?.view === 'agents') return { agents: [{ user_id: 'u1', name: 'Laura Gómez', overdue: 2, today: 1, upcoming: 4, open_contacts: 9 }] }
      if (params?.view === 'day') return { items: [agendaItem({ lead: lead({ id: 'l8', name: 'Cliente del día' }) })], visits: [{ id: 'v1', starts_at: new Date().toISOString(), name: 'Visita Día', property_title: 'Ático', status: 'scheduled' }] }
    }
    if (url === '/followup/calendar') return { month: params.month, days: { [`${params.month}-15`]: { pending: 2, done: 1, visits: 1 } } }
    if (/^\/followup\/leads\/l\d+$/.test(url)) return { lead: lead({ id: url.split('/').pop(), priority: 'media', client_type: null, budget: null }), timeline: [{ id: 't1', type: 'contact', description: 'Llamada · Habló con el cliente', created_at: new Date().toISOString() }], pending_followups: [{ id: 'pf', due_at: new Date(Date.now() + 86400000).toISOString(), channel: 'whatsapp' }], appointments: [] }
    if (/^\/followup\/property\//.test(url)) return { property: { id: 'p1', title: 'Piso' }, counts: { interested: 3, consultations: 3, visits_done: 2, visits_upcoming: 1, pending_followups: 1 }, interested: [], visits: [], pending_followups: [{ id: 'x', due_at: new Date().toISOString(), lead_id: 'l1', name: 'Marcos Vencido' }], last_interactions: [{ lead_id: 'l1', name: 'Marcos Vencido', description: 'Llamada realizada', created_at: new Date().toISOString() }] }
    return {}
  })
  mockApi.post.mockResolvedValue({ ok: true })
  mockApi.patch.mockResolvedValue({ ok: true })
  mockApi.put.mockResolvedValue({ enabled: false })
})

describe('Pantalla Seguimiento de hoy', () => {
  it('muestra los KPIs reales y las secciones con sus tarjetas', async () => {
    renderPage()
    expect(await screen.findByText('Marcos Vencido')).toBeInTheDocument()
    expect(screen.getByText('Seguimientos vencidos')).toBeInTheDocument(); expect(screen.getByText('Visitas sin seguimiento', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Resumen de contactos' })).toHaveTextContent('12 contactos activos')
    expect(screen.getByText('Elena Hoy')).toBeInTheDocument(); expect(screen.getByText('Lucía Abandonada')).toBeInTheDocument()
    expect(screen.getByText('María Visitó')).toBeInTheDocument(); expect(screen.getByText('Pedro Sin Confirmar')).toBeInTheDocument()
  })

  it('la tarjeta separa hechos de recomendación y enseña la foto del inmueble', async () => {
    renderPage(); await screen.findByText('Marcos Vencido')
    const card = screen.getByText('Marcos Vencido').closest('article')
    expect(within(card).getByText('Hechos')).toBeInTheDocument(); expect(within(card).getByText(/Seguimiento vencido hace 2 días/)).toBeInTheDocument()
    expect(within(card).getByText(/Recomendación:/)).toBeInTheDocument(); expect(within(card).getByText('Atención inmediata')).toBeInTheDocument()
    expect(card.querySelector('img')).toHaveAttribute('src', 'https://fotos.test/triana.jpg')
  })

  it('las visitas sin seguimiento recomiendan contactar y permiten programar el siguiente paso', async () => {
    renderPage(); await screen.findByText('María Visitó')
    const card = screen.getByText('María Visitó').closest('article')
    expect(within(card).getByText(/Contacta para conocer su opinión sobre la visita/)).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: /Programar/ })); await userEvent.click(within(card).getByRole('button', { name: 'En 3 días' }))
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/followup/followups', expect.objectContaining({ lead_id: 'l4', in_days: 3, goal: 'post_visit', property_id: 'p1' })))
  })

  it('una visita por confirmar no ofrece "Programar" (solo mensaje y registro)', async () => {
    renderPage(); await screen.findByText('Pedro Sin Confirmar')
    const card = screen.getByText('Pedro Sin Confirmar').closest('article')
    expect(within(card).queryByRole('button', { name: /Programar/ })).not.toBeInTheDocument(); expect(within(card).getByText('Pendiente de confirmar')).toBeInTheDocument()
  })

  it('"Hecho" marca el seguimiento y recarga con datos frescos', async () => {
    renderPage(); await screen.findByText('Marcos Vencido')
    await userEvent.click(screen.getAllByRole('button', { name: /Hecho/ })[0])
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('/followup/followups/f1', { action: 'done' }))
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/followup/today', expect.objectContaining({ fresh: 1 })))
  })

  it('"Posponer > Mañana" pospone 1 día', async () => {
    renderPage(); await screen.findByText('Marcos Vencido')
    await userEvent.click(screen.getAllByRole('button', { name: /Posponer/ })[0]); await userEvent.click(screen.getByRole('button', { name: 'Mañana' }))
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('/followup/followups/f1', { action: 'snooze', days: 1 }))
  })

  it('"Solo mis contactos" vuelve a pedir la lista con mine=1', async () => {
    renderPage(); await screen.findByText('Marcos Vencido')
    await userEvent.click(screen.getByRole('button', { name: 'Solo mis contactos' }))
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/followup/today', expect.objectContaining({ mine: 1 })))
  })

  it('con todo al día muestra el estado vacío con salida clara', async () => {
    mockApi.get.mockImplementation(async (url) => (url === '/followup/today' ? today({ summary: { overdue: 0, today: 0, abandoned: 0, upcoming_week: 2, visits_no_followup: 0, visits_unconfirmed: 0, attention_total: 0 }, overdue: [], today: [], abandoned: [], visits_no_followup: [], visits_unconfirmed: [] }) : url === '/followup/digest' ? { enabled: true, delivery_configured: false } : {}))
    renderPage()
    expect(await screen.findByText('Todo al día')).toBeInTheDocument(); expect(screen.getByText(/2 seguimientos programados/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver leads' })).toHaveAttribute('href', '/leads')
  })

  it('el interruptor del resumen por email solo aparece si el servidor puede enviar correos, y guarda el cambio', async () => {
    renderPage(); const chip = await screen.findByRole('button', { name: 'Resumen diario por email' })
    await userEvent.click(chip)
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith('/followup/digest', { enabled: false }))
    expect(toast.success).toHaveBeenCalledWith('Resumen diario desactivado')
  })

  it('sin proveedor de correo no ofrece el resumen por email', async () => {
    mockApi.get.mockImplementation(async (url) => (url === '/followup/today' ? today() : url === '/followup/digest' ? { enabled: true, delivery_configured: false } : {}))
    renderPage(); await screen.findByText('Marcos Vencido')
    expect(screen.queryByRole('button', { name: 'Resumen diario por email' })).not.toBeInTheDocument()
  })

  it('"Registrar" abre el modal y guardar manda canal, resultado y siguiente paso', async () => {
    renderPage(); await screen.findByText('Marcos Vencido')
    await userEvent.click(screen.getAllByRole('button', { name: /Registrar/ })[0])
    expect(screen.getByRole('dialog', { name: 'Registrar contacto' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/followup/leads/l1/log', expect.objectContaining({ channel: 'whatsapp', outcome: 'answered', followup_id: 'f1', property_id: 'p1', next: expect.objectContaining({ in_days: 3 }) })))
  })
})

describe('Pestañas de la agenda', () => {
  it('"En riesgo" agrupa por clase de alerta con reglas objetivas', async () => {
    renderPage(); await screen.findByText('Marcos Vencido')
    await userEvent.click(screen.getByRole('tab', { name: /En riesgo/ }))
    for (const t of ['Atención inmediata', 'Seguimiento recomendado', 'Pendiente de confirmar', 'Sin actividad']) expect(screen.getAllByText(t).length).toBeGreaterThan(0)
    expect(screen.getByText(/reglas objetivas/)).toBeInTheDocument()
  })

  it('"Próximos" y "Completados" piden su vista a la agenda', async () => {
    renderPage(); await screen.findByText('Marcos Vencido')
    await userEvent.click(screen.getByRole('tab', { name: 'Próximos' })); expect(await screen.findByText('Próximo Cliente')).toBeInTheDocument()
    expect(mockApi.get).toHaveBeenCalledWith('/followup/agenda', expect.objectContaining({ view: 'upcoming' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Completados' })); expect(await screen.findByText('Ya Completado')).toBeInTheDocument()
  })

  it('"Equipo" muestra la carga por agente', async () => {
    renderPage(); await screen.findByText('Marcos Vencido'); await userEvent.click(screen.getByRole('tab', { name: 'Equipo' }))
    const row = (await screen.findByText('Laura Gómez')).closest('tr'); expect(within(row).getByText('9')).toBeInTheDocument()
  })

  it('"Calendario" muestra el mes con conteos y al pulsar un día lista sus elementos', async () => {
    renderPage(); await screen.findByText('Marcos Vencido'); await userEvent.click(screen.getByRole('tab', { name: 'Calendario' }))
    const day = await screen.findByRole('button', { name: 'Día 15' }); expect(day).toHaveTextContent('2'); expect(day).toHaveTextContent('1v')
    await userEvent.click(day)
    expect(await screen.findByText('Cliente del día')).toBeInTheDocument(); expect(screen.getByText(/Visita Día/)).toBeInTheDocument()
    expect(mockApi.get).toHaveBeenCalledWith('/followup/agenda', expect.objectContaining({ view: 'day' }))
  })

  it('"Buscar cliente" abre su ficha con historial y permite cambiar la prioridad', async () => {
    renderPage(); await screen.findByText('Marcos Vencido')
    await userEvent.click(screen.getByRole('button', { name: /Buscar cliente/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Ana López/ }))
    expect(await screen.findByText('Llamada · Habló con el cliente')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Prioridad'), 'alta')
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('/followup/leads/l9/meta', { priority: 'alta' }))
  })

  it('"Reglas" abre los ajustes, deja guardar cambios y se refresca la agenda', async () => {
    renderPage(); await screen.findByText('Marcos Vencido'); await userEvent.click(screen.getByRole('button', { name: /Reglas/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Reglas de alerta' })
    const inputs = within(dlg).getAllByRole('spinbutton'); expect(inputs).toHaveLength(8)
    await userEvent.clear(inputs[1]); await userEvent.type(inputs[1], '2')
    mockApi.put.mockResolvedValueOnce({ settings: { ...settings, stale_days: { ...settings.stale_days, contactado: 2 } } })
    await userEvent.click(within(dlg).getByRole('button', { name: 'Guardar reglas' }))
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith('/followup/settings', expect.objectContaining({ stale_days: expect.objectContaining({ contactado: 2 }) })))
  })
})

describe('Ajustes de reglas', () => {
  it('un usuario sin permisos ve las reglas pero no puede editarlas', async () => {
    mockApi.get.mockImplementation(async (url) => (url === '/followup/settings' ? { settings, can_edit: false } : {}))
    render(<SettingsModal onClose={() => {}} />)
    const inputs = await screen.findAllByRole('spinbutton'); inputs.forEach((i) => expect(i).toBeDisabled())
    expect(screen.getByText(/Solo un administrador/)).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Guardar reglas' })).not.toBeInTheDocument()
  })
})

describe('Integración en las fichas existentes', () => {
  it('la ficha del contacto muestra prioridad, tipo, próximo seguimiento y guarda cambios', async () => {
    mockApi.get.mockImplementation(async () => ({ lead: lead({ priority: 'media', client_type: null }), timeline: [{ id: 't', type: 'contact', description: 'Llamada previa' }], pending_followups: [], appointments: [] }))
    render(<MemoryRouter><LeadFollowUpCard leadId="l1" /></MemoryRouter>)
    expect(await screen.findByText('Sin próxima acción')).toBeInTheDocument(); expect(screen.getByText('Llamada previa')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Tipo de cliente'), 'propietario')
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('/followup/leads/l1/meta', { client_type: 'propietario' }))
    expect(screen.getByRole('link', { name: 'Preparar mensaje' })).toHaveAttribute('href', '/seguimiento?lead=l1')
  })

  it('la ficha del inmueble muestra interesados, visitas y seguimientos reales', async () => {
    render(<MemoryRouter><PropertyActivityPanel propertyId="p1" /></MemoryRouter>)
    const panel = await screen.findByTestId('property-activity')
    expect(within(panel).getByText('Interesados').previousSibling).toHaveTextContent('3'); expect(within(panel).getByText('Visitas realizadas').previousSibling).toHaveTextContent('2')
    expect(within(panel).getAllByText('Marcos Vencido').length).toBeGreaterThan(0); expect(within(panel).getByText('Llamada realizada')).toBeInTheDocument()
  })
})

describe('Registrar contacto', () => {
  it('cada resultado propone su siguiente paso y se puede quitar', async () => {
    const onDone = vi.fn(); render(<LogContactModal item={item()} onClose={() => {}} onDone={onDone} />)
    await userEvent.click(screen.getByRole('button', { name: 'No contestó' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(mockApi.post).toHaveBeenLastCalledWith('/followup/leads/l1/log', expect.objectContaining({ outcome: 'no_answer', next: expect.objectContaining({ in_days: 1 }) })))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('button', { name: 'No le interesa' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(mockApi.post).toHaveBeenLastCalledWith('/followup/leads/l1/log', expect.objectContaining({ outcome: 'not_interested', next: null })))
  })

  it('"Sin seguimiento" envía next=null y la nota se recorta', async () => {
    render(<LogContactModal item={item()} onClose={() => {}} onDone={() => {}} />)
    await userEvent.type(screen.getByPlaceholderText(/Quiere verlo el viernes/), '  Quiere verlo el viernes  ')
    await userEvent.click(screen.getByRole('button', { name: 'Sin seguimiento' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/followup/leads/l1/log', expect.objectContaining({ note: 'Quiere verlo el viernes', next: null })))
  })

  it('si el servidor falla no se cierra ni se pierde lo escrito', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('boom')); const onDone = vi.fn()
    render(<LogContactModal item={item()} onClose={() => {}} onDone={onDone} />)
    await userEvent.type(screen.getByPlaceholderText(/Quiere verlo el viernes/), 'nota importante')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(mockApi.post).toHaveBeenCalled())
    expect(onDone).not.toHaveBeenCalled(); expect(screen.getByPlaceholderText(/Quiere verlo el viernes/)).toHaveValue('nota importante')
  })
})

describe('Mensaje para enviar', () => {
  const draft = (o = {}) => ({ message: 'Hola Marcos, ¿qué te pareció el piso?', subject: null, source: 'template', goal: 'follow_up', channel: 'whatsapp', variant: 0, variants: 3, wa_phone: '34600112233', warnings: [], ai_available: false, ...o })

  it('muestra el borrador y el botón de WhatsApp apunta al teléfono con el texto codificado', async () => {
    mockApi.post.mockResolvedValue(draft())
    render(<MessageDrawer item={item()} onClose={() => {}} />)
    const box = await screen.findByDisplayValue('Hola Marcos, ¿qué te pareció el piso?')
    const link = screen.getByRole('link', { name: /Abrir WhatsApp/ })
    expect(link).toHaveAttribute('href', `https://wa.me/34600112233?text=${encodeURIComponent('Hola Marcos, ¿qué te pareció el piso?')}`)
    await userEvent.clear(box); await userEvent.type(box, 'Texto editado & listo')
    expect(link).toHaveAttribute('href', `https://wa.me/34600112233?text=${encodeURIComponent('Texto editado & listo')}`)
    expect(screen.getByText(/plantilla/i)).toBeInTheDocument()
  })

  it('contacto que no quiere WhatsApp: sin enlace y con el aviso', async () => {
    mockApi.post.mockResolvedValue(draft({ wa_phone: null, warnings: ['Este contacto pidió no recibir WhatsApp. Usa llamada o email.'] }))
    render(<MessageDrawer item={item({ lead: lead({ whatsapp_opt_out: true }) })} onClose={() => {}} />)
    expect(await screen.findByText(/pidió no recibir WhatsApp/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Abrir WhatsApp/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'WhatsApp no disponible' })).toBeDisabled()
  })

  it('"Otra versión" pide la siguiente variante y "Ya lo envié" avisa para registrar', async () => {
    mockApi.post.mockResolvedValue(draft()); const onSent = vi.fn()
    render(<MessageDrawer item={item()} onClose={() => {}} onSent={onSent} />)
    await screen.findByDisplayValue(/Hola Marcos/)
    await userEvent.click(screen.getByRole('button', { name: /Otra versión/ }))
    await waitFor(() => expect(mockApi.post).toHaveBeenLastCalledWith('/followup/ai/message', expect.objectContaining({ variant: 1, lead_id: 'l1' })))
    await userEvent.click(screen.getByRole('button', { name: /Ya lo envié/ }))
    expect(onSent).toHaveBeenCalledWith('whatsapp')
  })

  it('"Redactar con IA" solo existe si el servidor la tiene y pide use_ai', async () => {
    mockApi.post.mockResolvedValue(draft({ ai_available: true })); render(<MessageDrawer item={item()} onClose={() => {}} />)
    await screen.findByDisplayValue(/Hola Marcos/)
    await userEvent.click(screen.getByRole('button', { name: /Redactar con IA/ }))
    await waitFor(() => expect(mockApi.post).toHaveBeenLastCalledWith('/followup/ai/message', expect.objectContaining({ use_ai: true })))
  })

  it('cambiar el objetivo regenera el mensaje con ese objetivo', async () => {
    mockApi.post.mockResolvedValue(draft()); render(<MessageDrawer item={item()} onClose={() => {}} />)
    await screen.findByDisplayValue(/Hola Marcos/)
    await userEvent.click(screen.getByRole('button', { name: 'Proponer visita' }))
    await waitFor(() => expect(mockApi.post).toHaveBeenLastCalledWith('/followup/ai/message', expect.objectContaining({ goal: 'visit_proposal' })))
  })
})

describe('Resumir conversación', () => {
  it('el botón está desactivado hasta pegar texto suficiente y luego muestra el resultado', async () => {
    mockApi.post.mockResolvedValue({ summary: 'El cliente quiere visitar el piso.', next_steps: ['Proponer dos horarios'], signals: { interest: 'alto', objections: ['precio'] }, suggested_followup: { due_at: new Date(Date.now() + 86400000).toISOString(), goal: 'visit_proposal', reason: 'Hay interés' }, source: 'basic', warnings: [], saved: false })
    render(<SummaryModal aiAvailable={false} onClose={() => {}} />)
    const btn = screen.getByRole('button', { name: 'Resumir' }); expect(btn).toBeDisabled()
    await userEvent.type(screen.getByPlaceholderText(/Pega aquí la conversación/), 'Me interesa el piso, ¿lo vemos mañana?')
    expect(btn).toBeEnabled(); await userEvent.click(btn)
    expect(await screen.findByText('El cliente quiere visitar el piso.')).toBeInTheDocument()
    expect(screen.getByText('Proponer dos horarios')).toBeInTheDocument(); expect(screen.getByText('Interés alto')).toBeInTheDocument(); expect(screen.getByText('Precio')).toBeInTheDocument()
    expect(mockApi.post).toHaveBeenCalledWith('/followup/ai/summarize', expect.objectContaining({ use_ai: false, save: false, create_followup: false }))
  })

  it('con un contacto elegido, guarda el resumen y crea el seguimiento', async () => {
    mockApi.post.mockResolvedValue({ summary: 'Resumen.', next_steps: ['x'], signals: { interest: 'neutro', objections: [] }, suggested_followup: { due_at: new Date().toISOString(), goal: 'follow_up', reason: 'r' }, source: 'basic', warnings: [], saved: true, followup_id: 'f9' })
    const onDone = vi.fn(); render(<SummaryModal aiAvailable={false} onClose={() => {}} onDone={onDone} />)
    await userEvent.type(screen.getByPlaceholderText(/Pega aquí la conversación/), 'Una conversación suficientemente larga para resumir.')
    await userEvent.click(await screen.findByRole('button', { name: /Ana López/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Resumir' }))
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/followup/ai/summarize', expect.objectContaining({ lead_id: 'l9', save: true, create_followup: true })))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })
})

describe('Buscador de contactos', () => {
  it('busca mientras se escribe y devuelve el elegido', async () => {
    const onChange = vi.fn(); render(<LeadPicker value={null} onChange={onChange} />)
    await userEvent.type(screen.getByPlaceholderText(/Busca por nombre/), 'Ana')
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/followup/leads/search', { q: 'Ana' }))
    await userEvent.click(await screen.findByRole('button', { name: /Ana López/ }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'l9' }))
  })
})
