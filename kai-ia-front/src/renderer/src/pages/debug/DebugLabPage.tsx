import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Activity,
  Braces,
  Cpu,
  Database,
  Download,
  GitBranch,
  MessageSquare,
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

const STAGE_LABELS: Record<DebugStage, string> = {
  backend_receive: 'Entrada recibida',
  tokenize: 'Tokenización',
  context: 'Contexto',
  lmstudio_request: 'Envío a LM Studio',
  lmstudio_response: 'Respuesta LM Studio',
  tool_selected: 'Tool elegida',
  tool_result: 'Resultado tool',
  token: 'Salida token',
  done: 'Finalizado',
  error: 'Error'
}

const STAGE_DESCRIPTIONS: Record<DebugStage, string> = {
  backend_receive: 'El backend recibe el prompt del chat real y empieza a medir.',
  tokenize: 'La entrada se parte en unidades aproximadas para ver tamaño y coste.',
  context: 'Kai junta system prompt, perfil, historial reciente y catálogo de tools.',
  lmstudio_request: 'El payload completo viaja a LM Studio con modelo, temperatura y tools.',
  lmstudio_response: 'LM Studio devuelve texto o una llamada estructurada a una tool.',
  tool_selected: 'El modelo decide qué herramienta usar y con qué argumentos.',
  tool_result: 'La tool ejecuta, tarda un tiempo concreto y devuelve datos al modelo.',
  token: 'La respuesta sale del backend hacia el renderer en tokens progresivos.',
  done: 'La petición acaba y el chat queda desbloqueado.',
  error: 'La petición ha fallado.'
}

type ToolTrace = {
  name: string
  arguments?: unknown
  result?: unknown
  durationMs?: number
  status?: string
}

type TreeNodeProps = {
  title: string
  subtitle: string
  active?: boolean
  icon: typeof MessageSquare
  children?: React.ReactNode
}

function formatMs(value?: number): string {
  if (typeof value !== 'number') return '-'
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`
  return `${Math.round(value)} ms`
}

function normalizeStage(event: DebugLabEvent): DebugStage {
  if (event.type === 'token') return 'token'
  if (event.type === 'done') return 'done'
  if (event.type === 'error') return 'error'
  return event.stage ?? 'context'
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function compactJson(value: unknown, maxLength = 900): string {
  if (value === undefined || value === null) return '-'
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
          <td>${escapeHtml(STAGE_LABELS[stage])}</td>
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
          .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 24px 0; }
          .metric { border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; }
          .metric span { display: block; color: #64748b; font-size: 12px; }
          .metric strong { font-size: 20px; }
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
          <div class="metric"><span>Tiempo total</span><strong>${escapeHtml(formatMs(metrics.totalMs))}</strong></div>
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

function buildMetrics(events: DebugLabEvent[]) {
  const done = events.findLast((event) => event.type === 'done')
  const tokenEvents = events.filter((event) => event.type === 'token')
  const tokenizeEvent = events.find((event) => event.stage === 'tokenize')
  const firstToken = tokenEvents[0]
  const lastToken = tokenEvents[tokenEvents.length - 1]
  const lmDurations = events
    .filter((event) => event.stage === 'lmstudio_response')
    .map((event) => event.duration_ms)
    .filter((value): value is number => typeof value === 'number')
  const toolDurations = events
    .filter((event) => event.stage === 'tool_result')
    .map((event) => event.duration_ms)
    .filter((value): value is number => typeof value === 'number')

  const firstTokenMs = firstToken?.elapsed_ms
  const lastTokenMs = lastToken?.elapsed_ms ?? done?.elapsed_ms
  const lmRequest = events.find((event) => event.stage === 'lmstudio_request')

  return {
    totalMs: done?.elapsed_ms,
    timeToLmMs: lmRequest?.elapsed_ms,
    inputTokens: tokenizeEvent?.prompt_tokens_estimate,
    inputMs: tokenizeEvent?.duration_ms,
    outputTokens: tokenEvents.length,
    outputMs:
      typeof firstTokenMs === 'number' && typeof lastTokenMs === 'number'
        ? Math.max(0, lastTokenMs - firstTokenMs)
        : undefined,
    lmMs: lmDurations.reduce((total, value) => total + value, 0),
    toolMs: toolDurations.reduce((total, value) => total + value, 0)
  }
}

export default function DebugLabPage() {
  const location = useLocation()
  const targetChatId = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('chatId') ?? ''
  }, [location.search])

  const [events, setEvents] = useState<DebugLabEvent[]>([])
  const [output, setOutput] = useState('')
  const [activeStage, setActiveStage] = useState<DebugStage>('backend_receive')
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    setEvents([])
    setOutput('')
    setActiveStage('backend_receive')
    setSelectedIndex(null)
    setLastMessageAt(null)
  }, [targetChatId])

  useEffect(() => {
    const channel = new BroadcastChannel(DEBUG_LAB_CHANNEL)

    channel.onmessage = (message: MessageEvent<DebugLabBroadcastMessage>) => {
      const payload = message.data

      if (!payload?.event) return
      if (targetChatId && payload.chatId !== targetChatId) return

      const stage = normalizeStage(payload.event)

      setEvents((current) => [...current, payload.event])
      setActiveStage(stage)
      setLastMessageAt(payload.createdAt)

      if (typeof payload.output === 'string') {
        setOutput(payload.output)
      }
    }

    return () => {
      channel.close()
    }
  }, [targetChatId])

  const metrics = useMemo(() => buildMetrics(events), [events])

  const tools = useMemo<ToolTrace[]>(() => {
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
  }, [events])

  const tokenPreview = useMemo(() => {
    const event = events.find((item) => item.stage === 'tokenize')
    return Array.isArray(event?.token_preview) ? event.token_preview : []
  }, [events])

  const lmRequest = events.findLast((event) => event.stage === 'lmstudio_request')
  const lmResponse = events.findLast((event) => event.stage === 'lmstudio_response')
  const running = events.length > 0 && !events.some((event) => event.type === 'done' || event.type === 'error')

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

  return (
    <div className="min-h-screen bg-[#05070c] text-white">
      <style>
        {`
          @keyframes flowNodePulse {
            0%, 100% { box-shadow: 0 0 0 rgba(34, 211, 238, 0); transform: translateY(0); }
            50% { box-shadow: 0 0 34px rgba(34, 211, 238, .22); transform: translateY(-3px); }
          }
          @keyframes flowLine {
            0% { stroke-dashoffset: 120; opacity: .35; }
            50% { opacity: 1; }
            100% { stroke-dashoffset: 0; opacity: .35; }
          }
        `}
      </style>

      <header className="border-b border-white/10 bg-white/[0.04] px-5 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Kai Debug Lab</h1>
            <p className="mt-1 text-sm text-slate-400">
              Árbol didáctico del chat real: entrada, tokenización, LM Studio, tools y salida.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void exportPdf()}
              disabled={events.length === 0 || exporting}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} />
              {exporting ? 'Exportando' : 'PDF'}
            </button>
            <div className="flex items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">
              <Activity size={16} />
              {running ? 'Trazando petición' : targetChatId ? 'Escuchando chat' : 'Escuchando todos'}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-5 py-5 xl:grid-cols-[300px_1fr_280px]">
        <section className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
            <h2 className="text-sm font-semibold">Chat conectado</h2>
            <p className="mt-3 break-all rounded-xl bg-black/25 p-3 text-xs leading-5 text-slate-300">
              {targetChatId || 'Todos los chats abiertos'}
            </p>
          </div>

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

          <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
            <h2 className="text-sm font-semibold">Lectura didáctica</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {STAGE_DESCRIPTIONS[activeStage]}
            </p>
            <div className="mt-4 rounded-xl bg-black/25 p-3 text-xs text-slate-400">
              Último evento: {lastMessageAt ? new Date(lastMessageAt).toLocaleTimeString() : '-'}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
            <div className="mb-4 flex items-center gap-2">
              <GitBranch size={18} className="text-cyan-200" />
              <h2 className="text-base font-semibold">Árbol del flujo</h2>
            </div>

            <div className="relative min-h-[560px] overflow-hidden rounded-2xl bg-black/20 p-5">
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 620" preserveAspectRatio="none">
                <path d="M160 80 C270 80 290 170 390 170" stroke="rgba(125,211,252,.36)" strokeWidth="2" fill="none" strokeDasharray="8 8" style={{ animation: running ? 'flowLine 1.8s linear infinite' : undefined }} />
                <path d="M390 170 C500 170 520 115 625 115" stroke="rgba(125,211,252,.36)" strokeWidth="2" fill="none" strokeDasharray="8 8" style={{ animation: running ? 'flowLine 1.8s linear infinite' : undefined }} />
                <path d="M625 115 C735 115 760 78 860 78" stroke="rgba(125,211,252,.36)" strokeWidth="2" fill="none" strokeDasharray="8 8" style={{ animation: running ? 'flowLine 1.8s linear infinite' : undefined }} />
                <path d="M625 115 C730 170 760 235 860 235" stroke="rgba(244,114,182,.34)" strokeWidth="2" fill="none" strokeDasharray="8 8" style={{ animation: running ? 'flowLine 1.8s linear infinite' : undefined }} />
                <path d="M860 235 C760 355 630 405 500 470" stroke="rgba(244,114,182,.34)" strokeWidth="2" fill="none" strokeDasharray="8 8" style={{ animation: running ? 'flowLine 1.8s linear infinite' : undefined }} />
                <path d="M860 78 C760 220 650 370 500 470" stroke="rgba(52,211,153,.34)" strokeWidth="2" fill="none" strokeDasharray="8 8" style={{ animation: running ? 'flowLine 1.8s linear infinite' : undefined }} />
              </svg>

              <div className="grid grid-cols-[1fr_1fr_1fr] gap-4">
                <TreeNode
                  title="Entrada del usuario"
                  subtitle={`${metrics.inputTokens ?? '-'} tokens · ${formatMs(metrics.inputMs)}`}
                  active={activeStage === 'backend_receive' || activeStage === 'tokenize'}
                  icon={MessageSquare}
                >
                  <div className="mt-3 flex max-h-24 flex-wrap gap-1 overflow-hidden">
                    {tokenPreview.length > 0 ? (
                      tokenPreview.slice(0, 24).map((token, index) => (
                        <span key={`${token}-${index}`} className="rounded-lg bg-cyan-300/10 px-2 py-1 text-[11px] text-cyan-100">
                          {token}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">Esperando entrada...</span>
                    )}
                  </div>
                </TreeNode>

                <TreeNode
                  title="Contexto preparado"
                  subtitle={`${String(lmRequest?.messages_count ?? '-')} mensajes · tools ${lmRequest?.tools_enabled ? 'ON' : 'OFF'}`}
                  active={activeStage === 'context'}
                  icon={Database}
                >
                  <p className="mt-3 text-xs leading-5 text-slate-400">
                    System prompt, hora actual, perfil persistente, historial y catálogo de tools.
                  </p>
                </TreeNode>

                <TreeNode
                  title="LM Studio"
                  subtitle={`${formatMs(lmResponse?.duration_ms)} · ${String(lmResponse?.content_chars ?? 0)} chars`}
                  active={activeStage === 'lmstudio_request' || activeStage === 'lmstudio_response'}
                  icon={Cpu}
                >
                  <pre className="mt-3 max-h-28 overflow-hidden whitespace-pre-wrap text-[11px] leading-4 text-slate-400">
                    {compactJson(lmResponse?.tool_calls?.length ? lmResponse.tool_calls : lmResponse?.content || lmRequest?.model, 500)}
                  </pre>
                </TreeNode>
              </div>

              <div className="mt-8 grid grid-cols-[1fr_1fr] gap-4">
                <div className="space-y-3">
                  <TreeNode
                    title="Rama de tools"
                    subtitle={`${tools.length} llamadas · ${formatMs(metrics.toolMs)}`}
                    active={activeStage === 'tool_selected' || activeStage === 'tool_result'}
                    icon={Wrench}
                  >
                    <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                      {tools.length === 0 ? (
                        <p className="text-xs text-slate-500">Sin tools por ahora.</p>
                      ) : (
                        tools.map((tool, index) => (
                          <div key={`${tool.name}-${index}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-fuchsia-100">{tool.name}</span>
                              <span className="text-xs text-slate-500">{formatMs(tool.durationMs)}</span>
                            </div>
                            <div className="mt-2 grid gap-2 text-[11px] leading-4 text-slate-300">
                              <pre className="max-h-20 overflow-auto rounded-lg bg-white/[0.05] p-2 whitespace-pre-wrap">
                                IN {compactJson(tool.arguments, 350)}
                              </pre>
                              <pre className="max-h-20 overflow-auto rounded-lg bg-white/[0.05] p-2 whitespace-pre-wrap">
                                OUT {compactJson(tool.result, 350)}
                              </pre>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </TreeNode>
                </div>

                <TreeNode
                  title="Salida al chat"
                  subtitle={`${metrics.outputTokens} tokens · ${formatMs(metrics.outputMs)}`}
                  active={activeStage === 'token' || activeStage === 'done'}
                  icon={Zap}
                >
                  <div className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/25 p-3 text-xs leading-5 text-slate-100">
                    {output || <span className="text-slate-500">La respuesta aparecerá aquí token a token.</span>}
                  </div>
                </TreeNode>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.055]">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Timeline</h2>
          </div>
          <div className="max-h-[780px] space-y-2 overflow-y-auto p-3">
            {events.length === 0 ? (
              <p className="p-2 text-sm text-slate-500">Envía un mensaje en el chat.</p>
            ) : (
              events.map((event, index) => {
                const stage = normalizeStage(event)
                const selected = selectedIndex === index
                return (
                  <button
                    key={`${stage}-${index}`}
                    onClick={() => setSelectedIndex(index)}
                    className={`w-full rounded-xl border p-2 text-left transition ${
                      selected
                        ? 'border-cyan-300/40 bg-cyan-300/10'
                        : 'border-white/10 bg-black/20 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-cyan-200">{STAGE_LABELS[stage]}</span>
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

function TreeNode({ title, subtitle, active = false, icon: Icon, children }: TreeNodeProps) {
  return (
    <div
      className={`relative rounded-2xl border p-4 transition ${
        active
          ? 'border-cyan-300/40 bg-cyan-300/10'
          : 'border-white/10 bg-white/[0.055]'
      }`}
      style={{ animation: active ? 'flowNodePulse 1.8s ease-in-out infinite' : undefined }}
    >
      <div className="flex items-start gap-3">
        <div className={`rounded-xl p-2 ${active ? 'bg-cyan-300/15 text-cyan-100' : 'bg-white/[0.08] text-slate-300'}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>
      {children}
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
