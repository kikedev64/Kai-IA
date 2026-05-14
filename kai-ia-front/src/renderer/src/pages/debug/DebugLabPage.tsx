import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Activity,
  Braces,
  Cpu,
  Download,
  GitBranch,
  RotateCcw,
  Timer,
  Wrench,
  Zap
} from 'lucide-react'
import {
  DEBUG_LAB_CHANNEL,
  type DebugLabBroadcastMessage,
  type DebugLabEvent,
  type DebugStage
} from '@renderer/services/debug_lab.service'

type StageConfig = {
  label: string
  color: string
  short: string
  description: string
}

type FlowNode = {
  id: string
  stage: DebugStage
  label: string
  x: number
  y: number
  elapsedMs?: number
  durationMs?: number
  count: number
}

type ToolTrace = {
  name: string
  arguments?: unknown
  result?: unknown
  durationMs?: number
  status?: string
}

const STAGE_CONFIG: Record<DebugStage, StageConfig> = {
  backend_receive: {
    label: 'Entrada',
    color: '#60a5fa',
    short: 'IN',
    description: 'FastAPI recibe el prompt del chat real y abre el trazado.'
  },
  tokenize: {
    label: 'Tokeniza',
    color: '#22d3ee',
    short: 'TK',
    description: 'La entrada se parte en unidades aproximadas y se mide ese paso.'
  },
  context: {
    label: 'Contexto',
    color: '#a78bfa',
    short: 'CTX',
    description: 'Se juntan system prompt, perfil, memoria reciente y catálogo de tools.'
  },
  lmstudio_request: {
    label: 'A LM Studio',
    color: '#f59e0b',
    short: 'LM→',
    description: 'El payload completo viaja hacia LM Studio con modelo, temperatura y tools.'
  },
  lmstudio_response: {
    label: 'Respuesta LM',
    color: '#fbbf24',
    short: 'LM←',
    description: 'LM Studio devuelve texto o una propuesta de llamada a tool.'
  },
  tool_selected: {
    label: 'Tool IN',
    color: '#f472b6',
    short: 'TIN',
    description: 'El modelo elige una tool y genera argumentos estructurados.'
  },
  tool_result: {
    label: 'Tool OUT',
    color: '#fb7185',
    short: 'TOUT',
    description: 'La tool ejecuta, tarda un tiempo y devuelve datos al modelo.'
  },
  token: {
    label: 'Salida',
    color: '#34d399',
    short: 'OUT',
    description: 'La respuesta vuelve al chat como tokens progresivos.'
  },
  done: {
    label: 'Fin',
    color: '#94a3b8',
    short: 'END',
    description: 'La petición termina y el chat recupera el flujo normal.'
  },
  error: {
    label: 'Error',
    color: '#ef4444',
    short: 'ERR',
    description: 'El flujo se ha detenido con un error.'
  }
}

const FLOW_ORDER: DebugStage[] = [
  'backend_receive',
  'tokenize',
  'context',
  'lmstudio_request',
  'lmstudio_response',
  'tool_selected',
  'tool_result',
  'token',
  'done',
  'error'
]

function normalizeStage(event: DebugLabEvent): DebugStage {
  if (event.type === 'token') return 'token'
  if (event.type === 'done') return 'done'
  if (event.type === 'error') return 'error'
  return event.stage ?? 'context'
}

function formatMs(value?: number): string {
  if (typeof value !== 'number') return '-'
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`
  return `${Math.round(value)} ms`
}

function toText(value: unknown): string {
  if (value === undefined || value === null) return '-'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function compactJson(value: unknown, maxLength = 900): string {
  const text = toText(value)
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n...` : text
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function buildMetrics(events: DebugLabEvent[]) {
  const done = events.findLast((event) => event.type === 'done')
  const tokenEvents = events.filter((event) => event.type === 'token')
  const tokenizeEvent = events.find((event) => event.stage === 'tokenize')
  const lmRequest = events.find((event) => event.stage === 'lmstudio_request')
  const firstToken = tokenEvents[0]
  const lastToken = tokenEvents[tokenEvents.length - 1]
  const lmMs = events
    .filter((event) => event.stage === 'lmstudio_response')
    .map((event) => event.duration_ms)
    .filter((value): value is number => typeof value === 'number')
    .reduce((total, value) => total + value, 0)
  const toolMs = events
    .filter((event) => event.stage === 'tool_result')
    .map((event) => event.duration_ms)
    .filter((value): value is number => typeof value === 'number')
    .reduce((total, value) => total + value, 0)

  const firstTokenMs = firstToken?.elapsed_ms
  const lastTokenMs = lastToken?.elapsed_ms ?? done?.elapsed_ms

  return {
    totalMs: done?.elapsed_ms,
    inputTokens: tokenizeEvent?.prompt_tokens_estimate,
    inputMs: tokenizeEvent?.duration_ms,
    outputTokens: tokenEvents.length,
    outputMs:
      typeof firstTokenMs === 'number' && typeof lastTokenMs === 'number'
        ? Math.max(0, lastTokenMs - firstTokenMs)
        : undefined,
    timeToLmMs: lmRequest?.elapsed_ms,
    lmMs,
    toolMs
  }
}

function buildFlowNodes(events: DebugLabEvent[]): FlowNode[] {
  const grouped = new Map<DebugStage, DebugLabEvent[]>()

  for (const event of events) {
    const stage = normalizeStage(event)
    grouped.set(stage, [...(grouped.get(stage) ?? []), event])
  }

  return FLOW_ORDER.filter((stage) => grouped.has(stage)).map((stage, order) => {
    const stageEvents = grouped.get(stage) ?? []
    const latest = stageEvents[stageEvents.length - 1]
    const row = stage === 'tool_selected' || stage === 'tool_result' ? 210 : 110

    return {
      id: `${stage}-${order}`,
      stage,
      label: STAGE_CONFIG[stage].label,
      x: 90 + order * 155,
      y: row,
      elapsedMs: latest?.elapsed_ms,
      durationMs: latest?.duration_ms,
      count: stageEvents.length
    }
  })
}

function buildTools(events: DebugLabEvent[]): ToolTrace[] {
  const traces: ToolTrace[] = []

  for (const event of events) {
    if (event.stage === 'tool_selected') {
      traces.push({
        name: String(event.tool_name || `tool_${traces.length + 1}`),
        arguments: event.parsed_arguments ?? event.arguments
      })
    }

    if (event.stage === 'tool_result') {
      const last = traces[traces.length - 1]
      if (last && (!event.tool_name || last.name === event.tool_name)) {
        last.result = event.result
        last.durationMs = event.duration_ms
        last.status = typeof event.status === 'string' ? event.status : undefined
      } else {
        traces.push({
          name: String(event.tool_name || `tool_${traces.length + 1}`),
          result: event.result,
          durationMs: event.duration_ms,
          status: typeof event.status === 'string' ? event.status : undefined
        })
      }
    }
  }

  return traces
}

function buildReportHtml({
  chatId,
  metrics,
  events,
  output,
  tools
}: {
  chatId: string
  metrics: ReturnType<typeof buildMetrics>
  events: DebugLabEvent[]
  output: string
  tools: ToolTrace[]
}): string {
  const eventRows = events
    .map((event, index) => {
      const stage = normalizeStage(event)
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(STAGE_CONFIG[stage].label)}</td>
          <td>${escapeHtml(formatMs(event.elapsed_ms))}</td>
          <td>${escapeHtml(event.message || event.content || '')}</td>
        </tr>
      `
    })
    .join('')

  const toolBlocks = tools
    .map(
      (tool) => `
        <section>
          <h3>${escapeHtml(tool.name)}</h3>
          <p><strong>Tiempo:</strong> ${escapeHtml(formatMs(tool.durationMs))}</p>
          <p><strong>Estado:</strong> ${escapeHtml(tool.status || '-')}</p>
          <h4>Entrada</h4>
          <pre>${escapeHtml(compactJson(tool.arguments, 5000))}</pre>
          <h4>Salida</h4>
          <pre>${escapeHtml(compactJson(tool.result, 5000))}</pre>
        </section>
      `
    )
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Informe Kai Debug Lab</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
          h1 { margin-bottom: 4px; }
          .muted { color: #64748b; }
          .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 24px 0; }
          .metric { border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; }
          .metric span { display: block; color: #64748b; font-size: 12px; }
          .metric strong { font-size: 18px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 12px; vertical-align: top; }
          th { background: #f1f5f9; text-align: left; }
          pre { white-space: pre-wrap; word-break: break-word; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; font-size: 11px; }
          section { break-inside: avoid; margin-top: 20px; }
        </style>
      </head>
      <body>
        <h1>Informe Kai Debug Lab</h1>
        <p class="muted">Chat: ${escapeHtml(chatId || 'Todos')} · ${new Date().toLocaleString()}</p>
        <div class="metrics">
          <div class="metric"><span>Tokens entrada</span><strong>${metrics.inputTokens ?? '-'}</strong></div>
          <div class="metric"><span>Tiempo entrada</span><strong>${escapeHtml(formatMs(metrics.inputMs))}</strong></div>
          <div class="metric"><span>Tokens salida</span><strong>${metrics.outputTokens}</strong></div>
          <div class="metric"><span>Tiempo salida</span><strong>${escapeHtml(formatMs(metrics.outputMs))}</strong></div>
          <div class="metric"><span>Hasta LM Studio</span><strong>${escapeHtml(formatMs(metrics.timeToLmMs))}</strong></div>
          <div class="metric"><span>LM Studio</span><strong>${escapeHtml(formatMs(metrics.lmMs))}</strong></div>
          <div class="metric"><span>Tools</span><strong>${escapeHtml(formatMs(metrics.toolMs))}</strong></div>
          <div class="metric"><span>Total</span><strong>${escapeHtml(formatMs(metrics.totalMs))}</strong></div>
        </div>
        <section>
          <h2>Salida acumulada</h2>
          <pre>${escapeHtml(output || '-')}</pre>
        </section>
        <section>
          <h2>Tools</h2>
          ${toolBlocks || '<p class="muted">No se ejecutaron tools.</p>'}
        </section>
        <section>
          <h2>Timeline</h2>
          <table>
            <thead><tr><th>#</th><th>Fase</th><th>Tiempo</th><th>Resumen</th></tr></thead>
            <tbody>${eventRows}</tbody>
          </table>
        </section>
      </body>
    </html>
  `
}

export default function DebugLabPage() {
  const location = useLocation()
  const svgScrollRef = useRef<HTMLDivElement>(null)
  const targetChatId = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('chatId') ?? ''
  }, [location.search])

  const [events, setEvents] = useState<DebugLabEvent[]>([])
  const [output, setOutput] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    setEvents([])
    setOutput('')
    setSelectedNodeId(null)
  }, [targetChatId])

  useEffect(() => {
    const channel = new BroadcastChannel(DEBUG_LAB_CHANNEL)

    channel.onmessage = (message: MessageEvent<DebugLabBroadcastMessage>) => {
      const payload = message.data

      if (!payload?.event) return
      if (targetChatId && payload.chatId !== targetChatId) return

      setEvents((current) => [...current, payload.event])

      if (typeof payload.output === 'string') {
        setOutput(payload.output)
      }
    }

    return () => {
      channel.close()
    }
  }, [targetChatId])

  const running = events.length > 0 && !events.some((event) => event.type === 'done' || event.type === 'error')
  const metrics = useMemo(() => buildMetrics(events), [events])
  const flowNodes = useMemo(() => buildFlowNodes(events), [events])
  const tools = useMemo(() => buildTools(events), [events])
  const activeStage = events.length > 0 ? normalizeStage(events[events.length - 1]) : 'backend_receive'
  const selectedNode = selectedNodeId
    ? flowNodes.find((node) => node.id === selectedNodeId) ?? null
    : flowNodes.at(-1) ?? null
  const selectedStageEvents = selectedNode
    ? events.filter((event) => normalizeStage(event) === selectedNode.stage)
    : []
  const viewBoxWidth = Math.max(920, flowNodes.length * 155 + 120)

  useEffect(() => {
    if (!svgScrollRef.current || !running) return
    svgScrollRef.current.scrollLeft = svgScrollRef.current.scrollWidth
  }, [flowNodes.length, running])

  const exportPdf = async () => {
    if (events.length === 0 || exporting) return

    try {
      setExporting(true)
      const html = buildReportHtml({
        chatId: targetChatId,
        metrics,
        events,
        output,
        tools
      })
      const result = await window.electronAPI.exportDebugLabPdf(html)

      if (!result.ok && !result.cancelled) {
        console.error('No se pudo exportar el PDF:', result.error)
      }
    } finally {
      setExporting(false)
    }
  }

  const reset = () => {
    if (running) return
    setEvents([])
    setOutput('')
    setSelectedNodeId(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-cyan-950/20 to-slate-950 text-white">
      <style>
        {`
          @keyframes nodePulse {
            0%, 100% { filter: drop-shadow(0 0 0 rgba(34, 211, 238, 0)); transform: scale(1); }
            50% { filter: drop-shadow(0 0 18px rgba(34, 211, 238, .65)); transform: scale(1.04); }
          }
          @keyframes lineFlow {
            from { stroke-dashoffset: 48; }
            to { stroke-dashoffset: 0; }
          }
          @keyframes nodeEnter {
            from { opacity: 0; transform: translateY(18px) scale(.9); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}
      </style>

      <header className="border-b border-white/10 bg-black/20 px-5 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Kai Debug Lab</h1>
            <p className="mt-1 text-sm text-slate-400">
              Diagrama dinámico del flujo real del chat: entrada, tokens, LM Studio, tools y salida.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={reset}
              disabled={running || events.length === 0}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-sm transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw size={15} />
              Limpiar
            </button>
            <button
              onClick={() => void exportPdf()}
              disabled={events.length === 0 || exporting}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-sm transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={15} />
              {exporting ? 'Exportando' : 'PDF'}
            </button>
            <div className="flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100">
              <Activity size={15} />
              {running ? 'Trazando' : targetChatId ? 'Escuchando chat' : 'Escuchando todos'}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-5 py-5 xl:grid-cols-[260px_1fr_270px]">
        <section className="space-y-3">
          <Panel title="Chat conectado">
            <p className="break-all rounded-xl bg-black/25 p-3 text-xs leading-5 text-slate-300">
              {targetChatId || 'Todos los chats abiertos'}
            </p>
          </Panel>

          <div className="grid grid-cols-2 gap-3">
            <Metric icon={Braces} label="Tokens entrada" value={String(metrics.inputTokens ?? '-')} />
            <Metric icon={Timer} label="Tiempo entrada" value={formatMs(metrics.inputMs)} />
            <Metric icon={Zap} label="Tokens salida" value={String(metrics.outputTokens)} />
            <Metric icon={Timer} label="Tiempo salida" value={formatMs(metrics.outputMs)} />
            <Metric icon={Cpu} label="Hasta LM" value={formatMs(metrics.timeToLmMs)} />
            <Metric icon={Cpu} label="LM Studio" value={formatMs(metrics.lmMs)} />
            <Metric icon={Wrench} label="Tools" value={formatMs(metrics.toolMs)} />
            <Metric icon={Timer} label="Total" value={formatMs(metrics.totalMs)} />
          </div>

          <Panel title="Fase actual">
            <p className="text-sm leading-6 text-slate-300">
              {STAGE_CONFIG[activeStage].description}
            </p>
          </Panel>
        </section>

        <section className="space-y-4">
          <Panel
            title={
              <span className="flex items-center gap-2">
                <GitBranch size={17} className="text-cyan-200" />
                Diagrama de flujo dinámico
              </span>
            }
          >
            <div ref={svgScrollRef} className="overflow-x-auto rounded-2xl bg-black/25 p-4">
              {flowNodes.length === 0 ? (
                <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
                  Envía un mensaje desde el chat para generar el diagrama.
                </div>
              ) : (
                <svg
                  width={viewBoxWidth}
                  height="330"
                  viewBox={`0 0 ${viewBoxWidth} 330`}
                  className="block"
                >
                  <defs>
                    {flowNodes.slice(0, -1).map((node, index) => {
                      const nextNode = flowNodes[index + 1]
                      return (
                        <linearGradient key={`gradient-${node.id}`} id={`flow-gradient-${index}`} x1="0%" x2="100%">
                          <stop offset="0%" stopColor={STAGE_CONFIG[node.stage].color} />
                          <stop offset="100%" stopColor={STAGE_CONFIG[nextNode.stage].color} />
                        </linearGradient>
                      )
                    })}
                  </defs>

                  {flowNodes.slice(0, -1).map((node, index) => {
                    const nextNode = flowNodes[index + 1]
                    const midX = (node.x + nextNode.x) / 2
                    const controlY = node.y === nextNode.y ? node.y : (node.y + nextNode.y) / 2
                    return (
                      <path
                        key={`line-${node.id}`}
                        d={`M ${node.x + 42} ${node.y} C ${midX} ${node.y}, ${midX} ${controlY}, ${nextNode.x - 42} ${nextNode.y}`}
                        fill="none"
                        stroke={`url(#flow-gradient-${index})`}
                        strokeWidth="3"
                        strokeDasharray="10 8"
                        opacity="0.86"
                        style={{ animation: running ? 'lineFlow 1.3s linear infinite' : undefined }}
                      />
                    )
                  })}

                  {flowNodes.map((node) => {
                    const config = STAGE_CONFIG[node.stage]
                    const isSelected = selectedNodeId === node.id
                    const isActive = activeStage === node.stage
                    return (
                      <g
                        key={node.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                        style={{
                          cursor: 'pointer',
                          animation: 'nodeEnter .32s ease-out both',
                          transformOrigin: `${node.x}px ${node.y}px`
                        }}
                      >
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={isSelected ? 47 : 42}
                          fill={config.color}
                          opacity={isSelected ? 0.2 : 0.1}
                          stroke={config.color}
                          strokeWidth={isSelected ? 3 : 1.8}
                          style={{
                            animation: isActive && running ? 'nodePulse 1.4s ease-in-out infinite' : undefined,
                            transformOrigin: `${node.x}px ${node.y}px`
                          }}
                        />
                        <circle cx={node.x} cy={node.y} r="26" fill="rgba(2,6,23,.78)" stroke="rgba(255,255,255,.1)" />
                        <text x={node.x} y={node.y - 2} textAnchor="middle" fontSize="12" fontWeight="700" fill="#e2e8f0">
                          {config.short}
                        </text>
                        <text x={node.x} y={node.y + 57} textAnchor="middle" fontSize="12" fontWeight="600" fill="#f8fafc">
                          {node.label}
                        </text>
                        <text x={node.x} y={node.y + 75} textAnchor="middle" fontSize="11" fill="#94a3b8">
                          {formatMs(node.durationMs ?? node.elapsedMs)}
                        </text>
                        {node.count > 1 && (
                          <g>
                            <circle cx={node.x + 34} cy={node.y - 34} r="13" fill="#0f172a" stroke={config.color} />
                            <text x={node.x + 34} y={node.y - 30} textAnchor="middle" fontSize="10" fill="#e2e8f0">
                              {node.count}
                            </text>
                          </g>
                        )}
                      </g>
                    )
                  })}
                </svg>
              )}
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
            <Panel title="Detalle del nodo">
              {selectedNode ? (
                <NodeDetails node={selectedNode} events={selectedStageEvents} tools={tools} />
              ) : (
                <p className="text-sm text-slate-500">Selecciona un nodo del diagrama.</p>
              )}
            </Panel>

            <Panel title="Salida al chat">
              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/25 p-3 text-sm leading-6 text-slate-100">
                {output || <span className="text-slate-500">La respuesta aparecerá aquí token a token.</span>}
              </div>
            </Panel>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.055]">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Timeline</h2>
          </div>
          <div className="max-h-[760px] space-y-2 overflow-y-auto p-3">
            {events.length === 0 ? (
              <p className="p-2 text-sm text-slate-500">Esperando eventos.</p>
            ) : (
              events.map((event, index) => {
                const stage = normalizeStage(event)
                return (
                  <button
                    key={`${stage}-${index}`}
                    onClick={() => {
                      const node = flowNodes.find((item) => item.stage === stage)
                      setSelectedNodeId(node?.id ?? null)
                    }}
                    className="w-full rounded-xl border border-white/10 bg-black/20 p-2 text-left transition hover:border-white/20"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-cyan-200">{STAGE_CONFIG[stage].label}</span>
                      <span className="text-[11px] text-slate-500">{formatMs(event.elapsed_ms)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-300">
                      {event.message || event.content || 'Evento recibido'}
                    </p>
                  </button>
                )
              })
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

function NodeDetails({
  node,
  events,
  tools
}: {
  node: FlowNode
  events: DebugLabEvent[]
  tools: ToolTrace[]
}) {
  const latest = events[events.length - 1]

  if (node.stage === 'tool_selected' || node.stage === 'tool_result') {
    return (
      <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
        {tools.length === 0 ? (
          <p className="text-sm text-slate-500">No hay tools registradas todavía.</p>
        ) : (
          tools.map((tool, index) => (
            <div key={`${tool.name}-${index}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-fuchsia-100">{tool.name}</span>
                <span className="text-xs text-slate-500">{formatMs(tool.durationMs)}</span>
              </div>
              <div className="mt-3 grid gap-2 text-[11px] leading-4 text-slate-300">
                <pre className="max-h-28 overflow-auto rounded-lg bg-white/[0.05] p-2 whitespace-pre-wrap">
                  IN {compactJson(tool.arguments, 850)}
                </pre>
                <pre className="max-h-28 overflow-auto rounded-lg bg-white/[0.05] p-2 whitespace-pre-wrap">
                  OUT {compactJson(tool.result, 850)}
                </pre>
              </div>
            </div>
          ))
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-slate-300">{STAGE_CONFIG[node.stage].description}</p>
      <div className="grid grid-cols-3 gap-2">
        <SmallStat label="Eventos" value={String(events.length)} />
        <SmallStat label="Duración" value={formatMs(node.durationMs)} />
        <SmallStat label="Acumulado" value={formatMs(node.elapsedMs)} />
      </div>
      <pre className="max-h-44 overflow-auto rounded-xl bg-black/25 p-3 text-[11px] leading-4 text-slate-300">
        {compactJson(latest, 1800)}
      </pre>
    </div>
  )
}

function Panel({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Timer
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon size={14} />
        <span className="text-[11px]">{label}</span>
      </div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  )
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/25 p-2">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-xs font-semibold text-slate-100">{value}</div>
    </div>
  )
}
