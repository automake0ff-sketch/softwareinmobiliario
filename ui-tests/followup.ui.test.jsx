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

const lead = (o = {}) => ({ id: 'l1', name: 'Marcos Vencido', phone: '600112233', email: 'm@x.es', status: 'interesado', status_label: 'Interesado', has_whatsapp: true, whatsapp_opt_out: false, ...o })
const item = (o = {}) => ({ kind: 'followup', followup_id: 'f1', lead: lead(), property: { id: 'p1', title: 'Piso en Triana' }, due_at: new Date(Date.now() - 2 * 86400000).toISOString(), channel: 'whatsapp', goal: 'follow_up', note: null, days_overdue: 2, days_since_contact: 8, priority: 80, reasons: ['Seguimiento vencido hace 2 días'], last_interaction: null, ...o })
const today = (o = {}) => ({
  summary: { overdue: 1, today: 1, abandoned: 1, upcoming_week: 3, attention_total: 3 },
  overdue: [item()],
  today: [item({ followup_id: 'f2', lead: lead({ id: 'l2', name: 'Elena Hoy' }), due_at: new Date().toISOString(), days_overdue: 0, reasons: ['Seguimiento programado para hoy'] })],
  abandoned: [item({ kind: 'abandoned', followup_id: null, due_at: null, lead: lead({ id: 'l3', name: 'Lucía Abandonada', status: 'nuevo', status_label: 'Nuevo' }), reasons: ['Sin contacto desde hace 3 días y sin próximo paso'] })],
  abandoned_hidden: 0, truncated: false, ai_available: false, ...o,
})
const renderPage = () => render(<MemoryRouter><FollowUpPage /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.get.mockImplementation(async (url) => {
    if (url === '/followup/today') return today()
    if (url === '/followup/digest') return { enabled: true, delivery_configured: true }
    if (url === '/followup/leads/search') return [{ id: 'l9', name: 'Ana López', phone: '611223344', status: 'nuevo' }]
    return {}
  })
  mockApi.post.mockResolvedValue({ ok: true })
  mockApi.patch.mockResolvedValue({ ok: true })
  mockApi.put.mockResolvedValue({ enabled: false })
})

describe('Pantalla Seguimiento de hoy', () => {
  it('muestra vencidos, hoy y abandonados con sus motivos y contadores', async () => {
    renderPage()
    expect(await screen.findByText('Marcos Vencido')).toBeInTheDocument()
    expect(screen.getByText('Elena Hoy')).toBeInTheDocument()
    expect(screen.getByText('Lucía Abandonada')).toBeInTheDocument()
    expect(screen.getAllByText(/Seguimiento vencido hace 2 días/).length).toBeGreaterThan(0)
    expect(screen.getByText('1 vencidos')).toBeInTheDocument(); expect(screen.getByText('3 próximos 7 días')).toBeInTheDocument()
    expect(screen.getAllByText('Piso en Triana').length).toBeGreaterThanOrEqual(2)
  })

  it('"Hecho" marca el seguimiento y recarga con datos frescos', async () => {
    renderPage(); await screen.findByText('Marcos Vencido')
    await userEvent.click(screen.getAllByRole('button', { name: /Hecho/ })[0])
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('/followup/followups/f1', { action: 'done' }))
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/followup/today', expect.objectContaining({ fresh: 1 })))
  })

  it('"Posponer > Mañana" pospone 1 día', async () => {
    renderPage(); await screen.findByText('Marcos Vencido')
    await userEvent.click(screen.getAllByRole('button', { name: /Posponer/ })[0])
    await userEvent.click(screen.getByRole('button', { name: 'Mañana' }))
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('/followup/followups/f1', { action: 'snooze', days: 1 }))
  })

  it('en un abandonado, "Programar > En 3 días" crea el seguimiento', async () => {
    renderPage(); await screen.findByText('Lucía Abandonada')
    const card = screen.getByText('Lucía Abandonada').closest('article')
    await userEvent.click(within(card).getByRole('button', { name: /Programar/ }))
    await userEvent.click(within(card).getByRole('button', { name: 'En 3 días' }))
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/followup/followups', expect.objectContaining({ lead_id: 'l3', in_days: 3 })))
  })

  it('"Solo mis contactos" vuelve a pedir la lista con mine=1', async () => {
    renderPage(); await screen.findByText('Marcos Vencido')
    await userEvent.click(screen.getByRole('button', { name: 'Solo mis contactos' }))
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/followup/today', expect.objectContaining({ mine: 1 })))
  })

  it('con todo al día muestra el estado vacío con salida clara', async () => {
    mockApi.get.mockImplementation(async (url) => (url === '/followup/today' ? today({ summary: { overdue: 0, today: 0, abandoned: 0, upcoming_week: 2, attention_total: 0 }, overdue: [], today: [], abandoned: [] }) : url === '/followup/digest' ? { enabled: true, delivery_configured: false } : {}))
    renderPage()
    expect(await screen.findByText('Todo al día')).toBeInTheDocument()
    expect(screen.getByText(/2 seguimientos programados/)).toBeInTheDocument()
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
