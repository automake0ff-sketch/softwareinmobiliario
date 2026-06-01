import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { getAgent, isValidAgentType } from '../../../../lib/agents/definitions'
import { AgentOrchestrator } from '../../../../lib/agents/orchestrator'
import { streamAI } from '../../../../lib/openrouter/client'
import { z } from 'zod'

export const runtime = 'nodejs'

const Body = z.object({
  message:  z.string().min(1).max(15000),
  stream:   z.boolean().default(false),
  context:  z.object({
    leadId:   z.string().uuid().optional(),
    history:  z.array(z.object({
      role: z.enum(['user','assistant']), content: z.string()
    })).optional(),
  }).optional(),
})

export async function POST(req: NextRequest, { params }: { params: { type: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  if (!isValidAgentType(params.type)) {
    return NextResponse.json({
      error: `Agente "${params.type}" no reconocido`,
      valid_types: ['captador','vendedor','coordinador','copywriter','tasador','analista','agendador','nurturing','documentador','seo','financiero','notificador']
    }, { status: 404 })
  }

  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { message, stream, context } = parsed.data
  const { data: userData } = await supabase.from('users').select('agency_id').eq('id', user.id).single()
  const agencyId = userData?.agency_id
  if (!agencyId) return NextResponse.json({ error: 'Agencia no encontrada' }, { status: 404 })

  const def = getAgent(params.type)!
  const orchestrator = new AgentOrchestrator(supabase, agencyId)

  // Construir system prompt con contexto real del lead
  let systemPrompt = def.systemPrompt
  if (context?.leadId) {
    const { data: lead } = await supabase.from('leads').select('*').eq('id', context.leadId).eq('agency_id', agencyId).single()
    const { data: agency } = await supabase.from('agencies').select('name,city').eq('id', agencyId).single()
    if (lead && agency) {
      const score = lead.ia_score ?? 0
      systemPrompt += `\n\n═══ CONTEXTO ACTUAL ═══\nAgencia: ${agency.name}, ${agency.city}\nLead: ${lead.name} | Score: ${score}/100 (${score>75?'caliente':score>40?'templado':'frío'})\nEtapa: ${lead.pipeline_stage} | Zona: ${lead.zones?.[0]??''} | Presupuesto: ${lead.budget_max?new Intl.NumberFormat('es-ES').format(lead.budget_max)+'€':'no especificado'}\n${lead.ia_summary?`Perfil: ${lead.ia_summary}`:''}`
    }
  }

  // MODO STREAMING — para la consola en tiempo real
  if (stream) {
    const encoder = new TextEncoder()
    return new Response(new ReadableStream({
      async start(ctrl) {
        let fullResponse = ''
        try {
          for await (const chunk of streamAI({
            system: systemPrompt,
            messages: context?.history ?? [],
            userMessage: message,
            model: def.model,
            temperature: def.temperature,
            maxTokens: def.maxTokens,
          })) {
            fullResponse += chunk
            ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`))
          }
          ctrl.enqueue(encoder.encode('data: [DONE]\n\n'))

          // Después del streaming → ejecutar acciones reales en background
          if (context?.leadId) {
            const { parseAgentReply } = await import('../../../../lib/openrouter/client')
            const { message: agentMsg, data: agentData } = parseAgentReply(fullResponse)
            const { ActionExecutor } = await import('../../../../lib/actions/executor')
            const executor = new ActionExecutor(supabase, agencyId)

            // Cargar contexto para las acciones
            const { data: agency } = await supabase.from('agencies').select('*').eq('id', agencyId).single()
            const { data: lead } = await supabase.from('leads').select('*').eq('id', context.leadId).single()
            if (agency && lead) {
              const ctx = (orchestrator as any).buildContext(lead, agency, 'manual')
              await executor.executeFromAgentData(params.type as any, context.leadId, ctx, agentMsg || fullResponse, agentData)
            }
          }

          // Registrar actividad
          supabase.from('activities').insert({
            agency_id: agencyId, lead_id: context?.leadId ?? null,
            type: 'ia_action', title: `${def.name} ejecutado (consola)`,
            description: message.slice(0, 300), agent_type: params.type,
          }).then(() => {}).catch(console.error)

        } catch (e) {
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(e) })}\n\n`))
        } finally {
          ctrl.close()
        }
      }
    }), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' }
    })
  }

  // MODO NORMAL — con ejecución de acciones reales
  const results = context?.leadId
    ? await orchestrator.runAgent(params.type as any, {}, {})
    : null

  // Fallback: si no hay leadId, solo llamar a la IA
  const { askAI: ask, parseAgentReply: parse } = await import('../../../../lib/openrouter/client')
  const raw = await ask({ system: systemPrompt, messages: context?.history, userMessage: message, model: def.model, temperature: def.temperature, maxTokens: def.maxTokens })
  const { message: agentMsg, data: agentData } = parse(raw)

  return NextResponse.json({
    agent:     params.type,
    agentName: def.name,
    model:     def.model,
    message:   agentMsg || raw,
    data:      agentData,
    actions:   results?.actionsExecuted ?? [],
    timestamp: new Date().toISOString(),
  })
}
