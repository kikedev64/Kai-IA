import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Braces,
  CheckCircle2,
  Clock3,
  Cpu,
  Download,
  Gauge,
  MessageSquareText,
  RotateCcw,
  Timer,
  Wrench,
  Zap,
  type LucideIcon
} from 'lucide-react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  DEBUG_LAB_CHANNEL,
  type DebugLabBroadcastMessage,
  type DebugLabEvent,
  type DebugStage
} from '@renderer/services/debug_lab.service'

type StageConfig = {
  label: string
  color: string
  softColor: string
  short: string
  description: string
}

type FlowBranch = 'main' | 'tool'

type FlowNode = {
  id: string
  stage: DebugStage
  label: string
  branch: FlowBranch
  elapsedMs?: number
  durationMs?: number
  count: number
  firstIndex: number
  latestIndex: number
  step?: number
}

type ToolTrace = {
  name: string
  arguments?: unknown
  result?: unknown
  durationMs?: number
  status?: string
}

type GraphNodeData = {
  label: string
  short: string
  description: string
  color: string
  softColor: string
  count: number
  time: string
  branch: FlowBranch
  active: boolean
  selected: boolean
  step?: number
} & Record<string, unknown>

type DebugGraphNode = Node<GraphNodeData, 'debugNode'>
type DebugGraphEdge = Edge

const NODE_SIZE = 132
const MAIN_X = 280
const TOOL_X = 585
const START_Y = 40
const ROW_GAP = 190

const STAGE_CONFIG: Record<DebugStage, StageConfig> = {
  backend_receive: {
    label: 'Entrada',
    color: '#22d3ee',
    softColor: 'rgba(34, 211, 238, 0.12)',
    short: 'IN',
    description: 'FastAPI recibe el prompt del chat real y abre el trazado.'
  },
  tokenize: {
    label: 'Tokenización',
    color: '#67e8f9',
    softColor: 'rgba(103, 232, 249, 0.12)',
    short: 'TK',
    description: 'La entrada se divide en tokens aproximados y se mide el coste de preparación.'
  },
  context: {
    label: 'Contexto',
    color: '#60a5fa',
    softColor: 'rgba(96, 165, 250, 0.12)',
    short: 'CTX',
    description: 'Se construye el contexto con perfil, historial, mensajes y catálogo de tools.'
  },
  lmstudio_request: {
    label: 'Envío LM',
    color: '#38bdf8',
    softColor: 'rgba(56, 189, 248, 0.12)',
    short: 'LM+',
    description: 'El payload sale hacia LM Studio con modelo, temperatura, mensajes y tools.'
  },
  lmstudio_response: {
    label: 'Respuesta LM',
    color: '#06b6d4',
    softColor: 'rgba(6, 182, 212, 0.12)',
    short: 'LM-',
    description: 'LM Studio devuelve texto o una selección de tool con argumentos.'
  },
  tool_selected: {
    label: 'Tool entrada',
    color: '#e879f9',
    softColor: 'rgba(232, 121, 249, 0.12)',
    short: 'TIN',
    description: 'El modelo selecciona una tool y prepara los datos de entrada.'
  },
  tool_result: {
    label: 'Tool salida',
    color: '#c084fc',
    softColor: 'rgba(192, 132, 252, 0.12)',
    short: 'TOUT',
    description: 'La tool ejecuta la operación y devuelve el resultado al flujo.'
  },
  token: {
    label: 'Salida',
    color: '#34d399',
    softColor: 'rgba(52, 211, 153, 0.12)',
    short: 'OUT',
    description: 'La respuesta se emite progresivamente hacia el chat.'
  },
  done: {
    label: 'Fin',
    color: '#94a3b8',
    softColor: 'rgba(148, 163, 184, 0.12)',
    short: 'END',
    description: 'La petición termina y el chat recupera el flujo normal.'
  },
  error: {
    label: 'Error',
    color: '#fb7185',
    softColor: 'rgba(251, 113, 133, 0.12)',
    short: 'ERR',
    description: 'El flujo se ha detenido con un error.'
  }
}

const nodeTypes = {
  debugNode: DebugRoundNode
}

/**
 * Normalize a streamed debug event into one of the known pipeline stages.
 *
 * Args:
 *   event: Debug event received from the chat stream.
 *
 * Returns:
 *   DebugStage
 */
function normalizeStage(event: DebugLabEvent): DebugStage {
  if (event.type === 'token') return 'token'
  if (event.type === 'done') return 'done'
  if (event.type === 'error') return 'error'
  return event.stage ?? 'context'
}

/**
 * Map a pipeline stage to the main lane or the tool lane.
 *
 * Args:
 *   stage: Pipeline stage to place in the diagram.
 *
 * Returns:
 *   FlowBranch
 */
function getStageBranch(stage: DebugStage): FlowBranch {
  return stage === 'tool_selected' || stage === 'tool_result' ? 'tool' : 'main'
}

/**
 * Format milliseconds for compact UI and report labels.
 *
 * Args:
 *   value: Duration or elapsed time in milliseconds.
 *
 * Returns:
 *   string
 */
function formatMs(value?: number): string {
  if (typeof value !== 'number') return '-'
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`
  return `${Math.round(value)} ms`
}

/**
 * Format a numeric metric with Spanish grouping separators.
 *
 * Args:
 *   value: Numeric metric to display.
 *
 * Returns:
 *   string
 */
function formatNumber(value?: number): string {
  if (typeof value !== 'number') return '-'
  return new Intl.NumberFormat('es-ES').format(value)
}

/**
 * Convert unknown debug payloads into readable text.
 *
 * Args:
 *   value: Payload value from a debug event.
 *
 * Returns:
 *   string
 */
function toText(value: unknown): string {
  if (value === undefined || value === null) return '-'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

/**
 * Serialize a payload and trim it for dense previews.
 *
 * Args:
 *   value: Payload to serialize.
 *   maxLength: Maximum number of characters kept in the preview.
 *
 * Returns:
 *   string
 */
function compactJson(value: unknown, maxLength = 900): string {
  const text = toText(value)
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n...` : text
}

/**
 * Escape user and model content before embedding it in the generated report.
 *
 * Args:
 *   value: Raw text inserted into report HTML.
 *
 * Returns:
 *   string
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Read a string property from an unknown object.
 *
 * Args:
 *   value: Source object or primitive value.
 *
 * Returns:
 *   string | undefined
 */
function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

/**
 * Read a number property from an unknown object.
 *
 * Args:
 *   value: Source object or primitive value.
 *
 * Returns:
 *   number | undefined
 */
function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Parse stringified JSON when possible and keep plain text otherwise.
 *
 * Args:
 *   value: Value received from a tool call or debug event.
 *
 * Returns:
 *   unknown
 */
function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value

  const trimmed = value.trim()
  if (!trimmed) return value

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value

  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

/**
 * Calculate the benchmark metrics shown in the summary panel and PDF report.
 *
 * Args:
 *   events: Streamed debug events collected for the active chat.
 *
 * Returns:
 *   DebugMetrics
 */
function buildMetrics(events: DebugLabEvent[]) {
  const done = events.findLast((event) => event.type === 'done')
  const tokenEvents = events.filter((event) => event.type === 'token')
  const tokenizeEvent = events.find((event) => event.stage === 'tokenize')
  const contextEvent = events.find((event) => event.stage === 'context')
  const lmRequest = events.find((event) => event.stage === 'lmstudio_request')
  const firstToken = tokenEvents[0]
  const lastToken = tokenEvents[tokenEvents.length - 1]
  const currentStage =
    events.length > 0 ? normalizeStage(events[events.length - 1]) : 'backend_receive'
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
  const outputMs =
    typeof firstTokenMs === 'number' && typeof lastTokenMs === 'number'
      ? Math.max(0, lastTokenMs - firstTokenMs)
      : undefined
  const totalMs = done?.elapsed_ms
  const tokensPerSecond =
    typeof outputMs === 'number' && outputMs > 0
      ? tokenEvents.length / (outputMs / 1000)
      : undefined

  return {
    currentStage,
    totalMs,
    inputTokens: tokenizeEvent?.prompt_tokens_estimate,
    inputMs: tokenizeEvent?.duration_ms,
    outputTokens: tokenEvents.length,
    outputMs,
    timeToLmMs: lmRequest?.elapsed_ms,
    lmMs,
    toolMs,
    firstTokenMs,
    tokensPerSecond,
    promptChars: tokenizeEvent?.prompt_chars,
    messagesCount: numberField(contextEvent?.messages_count),
    historyMessages: numberField(contextEvent?.history_messages),
    toolsEnabled:
      typeof contextEvent?.tools_enabled === 'boolean' ? contextEvent.tools_enabled : undefined,
    model: stringField(lmRequest?.model),
    temperature: numberField(lmRequest?.temperature),
    requestId: stringField(events.find((event) => event.request_id)?.request_id),
    eventCount: events.length
  }
}

/**
 * Convert streamed events into ordered diagram nodes with timing metadata.
 *
 * Args:
 *   events: Streamed debug events collected for the active chat.
 *
 * Returns:
 *   FlowNode[]
 */
function buildFlowNodes(events: DebugLabEvent[]): FlowNode[] {
  const nodes: FlowNode[] = []

  events.forEach((event, index) => {
    const stage = normalizeStage(event)
    const latest = nodes[nodes.length - 1]

    if (stage === 'token' && latest?.stage === 'token') {
      latest.count += 1
      latest.latestIndex = index
      latest.elapsedMs = event.elapsed_ms
      latest.durationMs = event.output_elapsed_ms as number | undefined
      return
    }

    const step = typeof event.step === 'number' ? event.step : undefined

    nodes.push({
      id: `${stage}-${index}`,
      stage,
      label: step ? `${STAGE_CONFIG[stage].label} ${step}` : STAGE_CONFIG[stage].label,
      branch: getStageBranch(stage),
      elapsedMs: event.elapsed_ms,
      durationMs: event.duration_ms,
      count: 1,
      firstIndex: index,
      latestIndex: index,
      step
    })
  })

  return nodes
}

/**
 * Extract tool calls and tool results from the debug event list.
 *
 * Args:
 *   events: Streamed debug events collected for the active chat.
 *
 * Returns:
 *   ToolTrace[]
 */
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

/**
 * Create React Flow nodes and edges for the dynamic debug diagram.
 *
 * Args:
 *   flowNodes: Ordered pipeline nodes.
 *   activeStage: Stage currently receiving events.
 *   selectedNodeId: Node currently pinned by the user.
 *   running: Whether the request is still streaming.
 *
 * Returns:
 *   { nodes: DebugGraphNode[]; edges: DebugGraphEdge[] }
 */
function buildGraphElements(
  flowNodes: FlowNode[],
  activeStage: DebugStage,
  selectedNodeId: string | null,
  running: boolean
): { nodes: DebugGraphNode[]; edges: DebugGraphEdge[] } {
  const nodes: DebugGraphNode[] = flowNodes.map((node, index) => {
    const config = STAGE_CONFIG[node.stage]
    const x = node.branch === 'tool' ? TOOL_X : MAIN_X
    const y = START_Y + index * ROW_GAP

    return {
      id: node.id,
      type: 'debugNode',
      position: { x, y },
      data: {
        label: node.label,
        short: config.short,
        description: config.description,
        color: config.color,
        softColor: config.softColor,
        count: node.count,
        time: formatMs(node.durationMs ?? node.elapsedMs),
        branch: node.branch,
        active: activeStage === node.stage,
        selected: selectedNodeId === node.id,
        step: node.step
      },
      selectable: true,
      draggable: false
    }
  })

  const edges: DebugGraphEdge[] = flowNodes.slice(0, -1).map((node, index) => {
    const nextNode = flowNodes[index + 1]
    const color = STAGE_CONFIG[node.stage].color

    return {
      id: `${node.id}-${nextNode.id}`,
      source: node.id,
      target: nextNode.id,
      type: 'smoothstep',
      animated: running && nextNode.stage === activeStage,
      style: {
        stroke: color,
        strokeWidth: 3,
        opacity: 0.88,
        strokeLinecap: 'round'
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
        width: 18,
        height: 18
      },
      zIndex: 0
    }
  })

  return { nodes, edges }
}

/**
 * Build the static SVG version of the pipeline diagram used in PDF export.
 *
 * Args:
 *   flowNodes: Ordered pipeline nodes included in the report.
 *
 * Returns:
 *   string
 */
function buildReportFlowSvg(flowNodes: FlowNode[]): string {
  if (flowNodes.length === 0) return '<p class="muted">No hay diagrama disponible.</p>'

  const rowHeight = 86
  const height = Math.max(160, flowNodes.length * rowHeight + 60)
  const rows = flowNodes
    .map((node, index) => {
      const config = STAGE_CONFIG[node.stage]
      const y = 46 + index * rowHeight
      const branchOffset = node.branch === 'tool' ? 120 : 0
      const x = 70 + branchOffset
      const cardX = 122 + branchOffset
      const next = flowNodes[index + 1]
      const line = next
        ? `<path d="M ${x} ${y + 30} C ${x} ${y + 58}, ${next.branch === 'tool' ? 190 : 70} ${y + 58}, ${next.branch === 'tool' ? 190 : 70} ${y + rowHeight - 30}" fill="none" stroke="${config.color}" stroke-width="2.5" stroke-linecap="round" />`
        : ''

      return `
        ${line}
        <circle cx="${x}" cy="${y}" r="30" fill="${config.color}" fill-opacity="0.15" stroke="${config.color}" stroke-width="2.5" />
        <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10" fill="#0f172a" font-weight="700">${escapeHtml(config.short)}</text>
        <rect x="${cardX}" y="${y - 25}" width="${node.branch === 'tool' ? 250 : 330}" height="50" rx="14" fill="#f8fafc" stroke="#cbd5e1" />
        <text x="${cardX + 14}" y="${y - 4}" font-size="12" fill="#0f172a" font-weight="700">${escapeHtml(node.label)}</text>
        <text x="${cardX + 14}" y="${y + 15}" font-size="10" fill="#64748b">${escapeHtml(formatMs(node.durationMs ?? node.elapsedMs))} · ${node.count} evento(s)</text>
      `
    })
    .join('')

  return `
    <svg viewBox="0 0 620 ${height}" width="100%" height="${height}" role="img">
      <rect width="620" height="${height}" fill="#ffffff" />
      ${rows}
    </svg>
  `
}

/**
 * Build the printable benchmark report with metrics, diagram, tools and output.
 *
 * Args:
 *   chatId: Chat identifier for the report.
 *   metrics: Calculated benchmark metrics.
 *   events: Debug events included in the report.
 *   output: Assistant output produced by the request.
 *   tools: Tool traces extracted from the events.
 *   flowNodes: Ordered pipeline nodes for the report diagram.
 *
 * Returns:
 *   string
 */
function buildReportHtml({
  chatId,
  metrics,
  events,
  output,
  tools,
  flowNodes
}: {
  chatId: string
  metrics: ReturnType<typeof buildMetrics>
  events: DebugLabEvent[]
  output: string
  tools: ToolTrace[]
  flowNodes: FlowNode[]
}): string {
  const chartItems = [
    { label: 'Entrada', value: metrics.inputMs, color: '#22d3ee' },
    { label: 'Hasta LM', value: metrics.timeToLmMs, color: '#38bdf8' },
    { label: 'LM Studio', value: metrics.lmMs, color: '#06b6d4' },
    { label: 'Tools', value: metrics.toolMs, color: '#e879f9' },
    { label: 'Salida', value: metrics.outputMs, color: '#34d399' },
    { label: 'Total', value: metrics.totalMs, color: '#64748b' }
  ]
  const maxChartValue = Math.max(1, ...chartItems.map((item) => item.value ?? 0))
  const chartRows = chartItems
    .map((item) => {
      const width = Math.max(2, ((item.value ?? 0) / maxChartValue) * 100)
      return `
        <div class="bar-row">
          <span>${escapeHtml(item.label)}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width:${width}%;background:${item.color};"></div>
          </div>
          <strong>${escapeHtml(formatMs(item.value))}</strong>
        </div>
      `
    })
    .join('')
  const eventRows = events
    .map((event, index) => {
      const stage = normalizeStage(event)
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(STAGE_CONFIG[stage].label)}</td>
          <td>${escapeHtml(formatMs(event.elapsed_ms))}</td>
          <td>${escapeHtml(formatMs(event.duration_ms))}</td>
          <td>${escapeHtml(event.message || event.content || '')}</td>
        </tr>
      `
    })
    .join('')
  const toolBlocks = tools
    .map(
      (tool) => `
        <section class="tool-block">
          <h3>${escapeHtml(tool.name)}</h3>
          <div class="two-cols">
            <p><strong>Tiempo:</strong> ${escapeHtml(formatMs(tool.durationMs))}</p>
            <p><strong>Estado:</strong> ${escapeHtml(tool.status || '-')}</p>
          </div>
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
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #0f172a; margin: 28px; }
          h1 { margin: 0 0 4px; font-size: 26px; }
          h2 { margin: 26px 0 12px; font-size: 18px; }
          h3 { margin: 0 0 8px; font-size: 15px; }
          h4 { margin: 14px 0 6px; font-size: 12px; color: #475569; }
          .muted { color: #64748b; }
          .hero { border: 1px solid #cbd5e1; border-radius: 18px; padding: 18px; background: linear-gradient(135deg, #f8fafc, #ecfeff); }
          .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0 6px; }
          .metric { border: 1px solid #cbd5e1; border-radius: 12px; padding: 10px; background: white; }
          .metric span { display: block; color: #64748b; font-size: 11px; }
          .metric strong { display:block; margin-top: 4px; font-size: 17px; }
          .two-cols { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .bar-row { display: grid; grid-template-columns: 90px 1fr 72px; gap: 10px; align-items: center; margin: 8px 0; font-size: 12px; }
          .bar-track { height: 14px; border-radius: 999px; background: #e2e8f0; overflow: hidden; }
          .bar-fill { height: 100%; border-radius: 999px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 7px; font-size: 11px; vertical-align: top; }
          th { background: #f1f5f9; text-align: left; }
          pre { white-space: pre-wrap; word-break: break-word; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; font-size: 10px; }
          section { break-inside: avoid; margin-top: 18px; }
          .tool-block { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
        </style>
      </head>
      <body>
        <div class="hero">
          <h1>Informe Kai Debug Lab</h1>
          <p class="muted">Chat: ${escapeHtml(chatId || 'Todos')} · Request: ${escapeHtml(metrics.requestId || '-')} · ${new Date().toLocaleString()}</p>
          <div class="metrics">
            <div class="metric"><span>Modelo</span><strong>${escapeHtml(metrics.model || '-')}</strong></div>
            <div class="metric"><span>Fase final</span><strong>${escapeHtml(STAGE_CONFIG[metrics.currentStage].label)}</strong></div>
            <div class="metric"><span>Total</span><strong>${escapeHtml(formatMs(metrics.totalMs))}</strong></div>
            <div class="metric"><span>Tokens/s</span><strong>${metrics.tokensPerSecond ? metrics.tokensPerSecond.toFixed(2) : '-'}</strong></div>
            <div class="metric"><span>Tokens entrada</span><strong>${formatNumber(metrics.inputTokens)}</strong></div>
            <div class="metric"><span>Tiempo entrada</span><strong>${escapeHtml(formatMs(metrics.inputMs))}</strong></div>
            <div class="metric"><span>Tokens salida</span><strong>${formatNumber(metrics.outputTokens)}</strong></div>
            <div class="metric"><span>Tiempo salida</span><strong>${escapeHtml(formatMs(metrics.outputMs))}</strong></div>
          </div>
        </div>
        <section>
          <h2>Distribución temporal</h2>
          ${chartRows}
        </section>
        <section>
          <h2>Diagrama del flujo</h2>
          ${buildReportFlowSvg(flowNodes)}
        </section>
        <section>
          <h2>Tools</h2>
          ${toolBlocks || '<p class="muted">No se ejecutaron tools.</p>'}
        </section>
        <section>
          <h2>Salida acumulada</h2>
          <pre>${escapeHtml(output || '-')}</pre>
        </section>
        <section>
          <h2>Timeline técnico</h2>
          <table>
            <thead><tr><th>#</th><th>Fase</th><th>Acumulado</th><th>Duración</th><th>Resumen</th></tr></thead>
            <tbody>${eventRows}</tbody>
          </table>
        </section>
      </body>
    </html>
  `
}

/**
 * Render the docked debug lab for the currently active chat stream.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   React.JSX.Element
 */
export default function DebugLabPage() {
  const location = useLocation()
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

  const running =
    events.length > 0 && !events.some((event) => event.type === 'done' || event.type === 'error')
  const metrics = useMemo(() => buildMetrics(events), [events])
  const flowNodes = useMemo(() => buildFlowNodes(events), [events])
  const tools = useMemo(() => buildTools(events), [events])
  const activeStage = metrics.currentStage
  const selectedNode = selectedNodeId
    ? (flowNodes.find((node) => node.id === selectedNodeId) ?? null)
    : (flowNodes.at(-1) ?? null)
  const selectedNodeEvents = selectedNode
    ? events.slice(selectedNode.firstIndex, selectedNode.latestIndex + 1)
    : []
  const graphElements = useMemo(
    () => buildGraphElements(flowNodes, activeStage, selectedNodeId, running),
    [activeStage, flowNodes, running, selectedNodeId]
  )
  const statusConfig = events.some((event) => event.type === 'error')
    ? { label: 'Error', icon: AlertTriangle, color: 'text-rose-200', bg: 'bg-rose-500/10' }
    : running
      ? { label: 'Trazando', icon: Activity, color: 'text-cyan-100', bg: 'bg-cyan-400/10' }
      : events.length > 0
        ? {
            label: 'Completado',
            icon: CheckCircle2,
            color: 'text-emerald-100',
            bg: 'bg-emerald-400/10'
          }
        : { label: 'Escuchando', icon: Activity, color: 'text-slate-300', bg: 'bg-white/[0.06]' }

  /**
   * Open a printable benchmark report for the current debug trace.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   void
   */
  const exportPdf = async () => {
    if (events.length === 0 || exporting) return

    try {
      setExporting(true)
      const html = buildReportHtml({
        chatId: targetChatId,
        metrics,
        events,
        output,
        tools,
        flowNodes
      })
      const result = await window.electronAPI.exportDebugLabPdf(html)

      if (!result.ok && !result.cancelled) {
        console.error('No se pudo exportar el PDF:', result.error)
      }
    } finally {
      setExporting(false)
    }
  }

  /**
   * Clear the current debug trace and return the diagram to its empty state.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   void
   */
  const reset = () => {
    if (running) return
    setEvents([])
    setOutput('')
    setSelectedNodeId(null)
  }

  return (
    <div className="relative h-screen overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '34px 34px'
          }}
        />
      </div>

      <style>
        {`
          @keyframes nodeArrive {
            from { opacity: 0; transform: translateY(12px) scale(.92); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes nodeBreath {
            0%, 100% { box-shadow: 0 0 0 rgba(34, 211, 238, 0); }
            50% { box-shadow: 0 0 36px rgba(34, 211, 238, .28); }
          }
          .debug-flow .react-flow__renderer,
          .debug-flow .react-flow__pane,
          .debug-flow .react-flow__viewport {
            background: transparent;
          }
          .debug-flow .react-flow__node {
            background: transparent;
            border: 0;
            box-shadow: none;
          }
          .debug-flow .react-flow__edge-path {
            filter: drop-shadow(0 0 8px rgba(34, 211, 238, 0.12));
          }
          .debug-flow .react-flow__controls {
            overflow: hidden;
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 16px;
            background: rgba(15,23,42,.76);
            box-shadow: 0 12px 30px rgba(0,0,0,.22);
          }
          .debug-flow .react-flow__controls-button {
            border-bottom: 1px solid rgba(255,255,255,.08);
            background: transparent;
            color: #e2e8f0;
          }
          .debug-flow .react-flow__controls-button:hover {
            background: rgba(255,255,255,.12);
          }
          .debug-flow .react-flow__attribution {
            display: none;
          }
        `}
      </style>

      <header className="relative z-10 flex h-14 items-center justify-between border-b border-white/10 bg-white/[0.045] px-4 backdrop-blur-2xl">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">Kai Debug Lab</h1>
          <p className="truncate text-[11px] text-slate-400">
            {targetChatId || 'Todos los chats'} · {metrics.requestId || 'sin request activo'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <IconButton label="Limpiar" disabled={running || events.length === 0} onClick={reset}>
            <RotateCcw size={15} />
          </IconButton>
          <IconButton
            label={exporting ? 'Exportando' : 'PDF'}
            disabled={events.length === 0 || exporting}
            onClick={() => void exportPdf()}
          >
            <Download size={15} />
          </IconButton>
        </div>
      </header>

      <main className="relative z-10 grid h-[calc(100vh-56px)] min-h-0 gap-3 overflow-hidden p-3 grid-cols-[minmax(0,1fr)_390px]">
        <SectionGroup className="min-h-0 h-full" title="Diagrama de flujo">
          <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            {flowNodes.length === 0 ? (
              <EmptyState />
            ) : (
              <ReactFlowProvider>
                <FlowCanvas
                  nodes={graphElements.nodes}
                  edges={graphElements.edges}
                  onSelectNode={(nodeId) => {
                    setSelectedNodeId((current) => (current === nodeId ? null : nodeId))
                  }}
                />
              </ReactFlowProvider>
            )}
          </div>
        </SectionGroup>

        <aside className="min-h-0 h-full">
          <SectionGroup className="min-h-0 h-full overflow-hidden" title="Nodo actual">
            <div className="h-full min-h-0 overflow-y-auto pr-1">
              {selectedNode ? (
                <NodeDetails
                  node={selectedNode}
                  events={selectedNodeEvents}
                  tools={tools}
                  isPinned={selectedNodeId !== null}
                />
              ) : (
                <p className="text-sm text-slate-500">Esperando el primer evento del chat.</p>
              )}
            </div>
          </SectionGroup>
        </aside>
      </main>
    </div>
  )
}

function FlowCanvas({
  nodes,
  edges,
  onSelectNode
}: {
  nodes: DebugGraphNode[]
  edges: DebugGraphEdge[]
  /**
   * Render the interactive React Flow canvas and keep it fitted to new nodes.
   *
   * Args:
   *   nodes: Graph nodes rendered by React Flow.
   *   edges: Graph edges rendered by React Flow.
   *   onSelectNode: Stores the node selected by the user.
   *
   * Returns:
   *   React.JSX.Element
   */
  onSelectNode: (nodeId: string) => void
}) {
  const flow = useReactFlow<DebugGraphNode, DebugGraphEdge>()

  useEffect(() => {
    if (nodes.length === 0) return

    const timeout = window.setTimeout(() => {
      flow.fitView({
        padding: 0.2,
        duration: 360,
        maxZoom: 1.05
      })
    }, 50)

    return () => window.clearTimeout(timeout)
  }, [flow, nodes.length])

  return (
    <ReactFlow
      className="debug-flow"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      minZoom={0.45}
      maxZoom={1.25}
      fitView
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, node) => onSelectNode(node.id)}
    >
      <Background color="rgba(148,163,184,0.16)" gap={28} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

/**
 * Render one circular pipeline node inside the debug diagram.
 *
 * Args:
 *   data: Visual and timing data attached to the React Flow node.
 *
 * Returns:
 *   React.JSX.Element
 */
function DebugRoundNode({ data }: NodeProps<DebugGraphNode>) {
  const isActive = data.active
  const isSelected = data.selected

  return (
    <div
      className="relative flex flex-col items-center"
      style={{
        width: NODE_SIZE,
        animation: 'nodeArrive .32s ease-out both'
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        style={{ opacity: 0, top: 6, pointerEvents: 'none' }}
      />
      <div
        className={`flex items-center justify-center rounded-full border text-center transition ${
          isSelected ? 'bg-white text-black' : 'bg-[#020617]/95 text-white'
        }`}
        style={{
          width: NODE_SIZE,
          height: NODE_SIZE,
          borderColor: isSelected ? 'rgba(255,255,255,.75)' : `${data.color}88`,
          boxShadow: isSelected
            ? `0 0 0 5px ${data.color}22, 0 24px 55px rgba(0,0,0,.42)`
            : isActive
              ? `0 0 0 4px ${data.color}1f, 0 0 36px ${data.color}44`
              : '0 18px 42px rgba(0,0,0,.32)',
          background: isSelected
            ? '#ffffff'
            : `radial-gradient(circle at 40% 30%, ${data.softColor}, rgba(2,6,23,.96) 62%)`,
          animation: isActive ? 'nodeBreath 1.55s ease-in-out infinite' : undefined
        }}
      >
        <div className="px-3">
          <div
            className="text-[22px] font-black leading-none"
            style={{ color: isSelected ? '#020617' : data.color }}
          >
            {data.short}
          </div>
          <div className="mt-2 text-[12px] font-semibold leading-4">{data.label}</div>
          <div className={`mt-1 text-[10px] ${isSelected ? 'text-slate-600' : 'text-slate-400'}`}>
            {data.time}
          </div>
        </div>
      </div>
      <div
        className="mt-2 max-w-[160px] rounded-full border border-white/10 bg-black/35 px-2 py-1 text-center text-[10px] text-slate-300"
        style={{ color: isActive ? data.color : undefined }}
      >
        {data.count > 1
          ? `${data.count} eventos`
          : data.branch === 'tool'
            ? 'rama tool'
            : 'flujo principal'}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        style={{ opacity: 0, bottom: 38, pointerEvents: 'none' }}
      />
    </div>
  )
}

function getNodeMessage(node: FlowNode, latest?: DebugLabEvent): string | null {
  if (node.stage === 'token') return null

  const message = latest?.message || latest?.content

  if (!message || !message.trim() || message.trim() === '-') {
    return null
  }

  return message
}

/**
 * Render details for the active or selected pipeline node.
 *
 * Args:
 *   node: Flow node being inspected.
 *   events: Debug events used to populate the details.
 *   tools: Tool traces available for tool nodes.
 *   isPinned: Whether the user selected this node manually.
 *
 * Returns:
 *   React.JSX.Element
 */
function NodeDetails({
  node,
  events,
  tools,
  isPinned
}: {
  node: FlowNode
  events: DebugLabEvent[]
  tools: ToolTrace[]
  isPinned: boolean
}) {
  const latest = events[events.length - 1]
  const config = STAGE_CONFIG[node.stage]
  const nodeMessage = getNodeMessage(node, latest)
  const matchingToolName = stringField(latest?.tool_name)
  const matchingTools = matchingToolName
    ? tools.filter((tool) => tool.name === matchingToolName)
    : tools

  if (node.stage === 'tool_selected' || node.stage === 'tool_result') {
    return (
      <div className="space-y-3">
        <NodeHeader node={node} isPinned={isPinned} />
        <p className="text-sm leading-6 text-slate-300">{config.description}</p>

        {matchingTools.length === 0 ? (
          <p className="text-sm text-slate-500">No hay tools registradas todavía.</p>
        ) : (
          matchingTools.map((tool, index) => (
            <div
              key={`${tool.name}-${index}`}
              className="rounded-2xl border border-fuchsia-300/15 bg-fuchsia-400/[0.06] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-fuchsia-100">{tool.name}</span>
                <span className="shrink-0 text-xs text-slate-400">{formatMs(tool.durationMs)}</span>
              </div>

              <div className="mt-3 grid gap-2">
                <InfoLine label="Estado" value={tool.status || '-'} />
                <InfoLine label="Duración" value={formatMs(tool.durationMs)} />
              </div>
            </div>
          ))
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <NodeHeader node={node} isPinned={isPinned} />

      <p className="text-sm leading-6 text-slate-300">{config.description}</p>

      <div className="grid grid-cols-3 gap-2">
        <SmallStat label="Eventos" value={String(events.length)} />
        <SmallStat label="Duración" value={formatMs(node.durationMs)} />
        <SmallStat label="Acumulado" value={formatMs(node.elapsedMs)} />
      </div>

      <div className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-3">
        <InfoLine label="Fase" value={config.label} highlightColor={config.color} />
        <InfoLine label="Rama" value={node.branch === 'tool' ? 'Tool' : 'Principal'} />
        <InfoLine label="Tipo de evento" value={latest?.type || '-'} />

        {nodeMessage && <InfoLine label="Mensaje" value={nodeMessage} multiline />}
      </div>
    </div>
  )
}

/**
 * Render the title and timing strip for the selected node details panel.
 *
 * Args:
 *   node: Flow node being inspected.
 *   isPinned: Whether the node was manually selected.
 *
 * Returns:
 *   React.JSX.Element
 */
function NodeHeader({ node, isPinned }: { node: FlowNode; isPinned: boolean }) {
  const config = STAGE_CONFIG[node.stage]

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold"
          style={{
            borderColor: `${config.color}88`,
            backgroundColor: config.softColor,
            color: config.color
          }}
        >
          {config.short}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-white">{node.label}</h2>
          <p className="text-xs text-slate-500">{isPinned ? 'Nodo seleccionado' : 'Nodo actual'}</p>
        </div>
      </div>
      <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[11px] text-slate-300">
        {formatMs(node.durationMs ?? node.elapsedMs)}
      </span>
    </div>
  )
}

/**
 * Render a labelled block inside the node details panel.
 *
 * Args:
 *   title: Block heading.
 *   children: Block content.
 *   className: Optional extra layout classes.
 *
 * Returns:
 *   React.JSX.Element
 */
function SectionGroup({
  title,
  children,
  className = ''
}: {
  title: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.055] shadow-[0_12px_30px_rgba(0,0,0,0.2)] backdrop-blur-2xl ${className}`}
    >
      <div className="shrink-0 border-b border-white/10 px-4 py-3">
        <div className="pointer-events-none -mx-4 -mt-3 mb-3 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <div className="min-h-0 flex-1 p-3">{children}</div>
    </section>
  )
}

function InfoLine({
  label,
  value,
  highlightColor,
  multiline = false
}: {
  label: string
  value: string
  highlightColor?: string
  multiline?: boolean
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.08em] text-slate-500">{label}</div>
      <div
        className={`mt-1 text-sm font-medium text-slate-100 ${
          multiline ? 'whitespace-pre-wrap break-words leading-5' : 'truncate'
        }`}
        style={{ color: highlightColor }}
      >
        {value}
      </div>
    </div>
  )
}

function StatusPill({
  config
}: {
  /**
   * Render the current stage pill with its configured color.
   *
   * Args:
   *   config: Stage configuration for the current pipeline stage.
   *
   * Returns:
   *   React.JSX.Element
   */
  config: {
    label: string
    icon: LucideIcon
    color: string
    bg: string
  }
}) {
  const Icon = config.icon

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2 ${config.bg} ${config.color}`}
    >
      <Icon size={15} />
      <span className="text-sm font-semibold">{config.label}</span>
    </div>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children
}: {
  label: string
  disabled?: boolean
  /**
   * Render a compact icon button used by debug lab actions.
   *
   * Args:
   *   label: Accessible title and tooltip text.
   *   disabled: Whether the button is inactive.
   *   onClick: Action executed when the button is pressed.
   *   children: Icon rendered inside the button.
   *
   * Returns:
   *   React.JSX.Element
   */
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="flex h-9 min-w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.08] px-2 text-sm transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  )
}

/**
 * Render a JSON or text payload with structured formatting.
 *
 * Args:
 *   label: Payload label.
 *   value: Payload value to display.
 *   maxLength: Maximum text length before truncation.
 *
 * Returns:
 *   React.JSX.Element
 */
function DataBlock({
  label,
  value,
  maxLength = 1400
}: {
  label: string
  value: unknown
  maxLength?: number
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/25">
      <div className="border-b border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-slate-500">
        {label}
      </div>
      <div className="max-h-72 overflow-auto p-3">
        <StructuredValue value={parseMaybeJson(value)} maxLength={maxLength} />
      </div>
    </div>
  )
}

/**
 * Render nested arrays and objects as a readable debug payload.
 *
 * Args:
 *   value: Value to render.
 *   depth: Current nesting depth.
 *   maxLength: Maximum text length for scalar previews.
 *
 * Returns:
 *   React.JSX.Element
 */
function StructuredValue({
  value,
  depth = 0,
  maxLength = 1400
}: {
  value: unknown
  depth?: number
  maxLength?: number
}) {
  const parsedValue = parseMaybeJson(value)

  if (parsedValue === null || parsedValue === undefined) {
    return <span className="text-xs text-slate-500">null</span>
  }

  if (typeof parsedValue === 'string') {
    const trimmed =
      parsedValue.length > maxLength ? `${parsedValue.slice(0, maxLength)}...` : parsedValue
    return (
      <pre className="whitespace-pre-wrap break-words text-xs leading-5 text-slate-200">
        {trimmed}
      </pre>
    )
  }

  if (typeof parsedValue === 'number' || typeof parsedValue === 'boolean') {
    return (
      <span className="inline-flex rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2 py-1 text-xs text-cyan-100">
        {String(parsedValue)}
      </span>
    )
  }

  if (Array.isArray(parsedValue)) {
    const items = parsedValue.slice(0, 14)

    return (
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="rounded-xl border border-white/10 bg-white/[0.035] p-2">
            <div className="mb-1 text-[10px] uppercase text-slate-500">Item {index + 1}</div>
            <StructuredValue value={item} depth={depth + 1} maxLength={maxLength} />
          </div>
        ))}
        {parsedValue.length > items.length && (
          <div className="text-xs text-slate-500">
            +{parsedValue.length - items.length} elementos más
          </div>
        )}
      </div>
    )
  }

  if (typeof parsedValue === 'object') {
    const entries = Object.entries(parsedValue as Record<string, unknown>)
    const visibleEntries = entries.slice(0, depth > 2 ? 10 : 18)

    return (
      <div className="space-y-2">
        {visibleEntries.map(([key, item]) => (
          <div
            key={key}
            className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.035] p-2 sm:grid-cols-[120px_minmax(0,1fr)]"
          >
            <div className="break-words text-[11px] font-semibold text-cyan-200">{key}</div>
            <div className="min-w-0">
              <StructuredValue
                value={item}
                depth={depth + 1}
                maxLength={Math.max(260, maxLength - depth * 180)}
              />
            </div>
          </div>
        ))}
        {entries.length > visibleEntries.length && (
          <div className="text-xs text-slate-500">
            +{entries.length - visibleEntries.length} campos más
          </div>
        )}
      </div>
    )
  }

  return <span className="text-xs text-slate-300">{String(parsedValue)}</span>
}

/**
 * Render a small labelled statistic in the node details panel.
 *
 * Args:
 *   label: Statistic label.
 *   value: Statistic value.
 *
 * Returns:
 *   React.JSX.Element
 */
function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-black/25 p-2">
      <div className="truncate text-[10px] uppercase text-slate-500">{label}</div>
      <div className="mt-1 truncate text-xs font-semibold text-slate-100">{value}</div>
    </div>
  )
}

/**
 * Render the empty debug state before events arrive.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   React.JSX.Element
 */
function EmptyState() {
  return (
    <div className="flex h-full min-h-[480px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/15 px-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
        <MessageSquareText size={22} />
      </div>
      <p className="mt-3 text-sm font-medium text-slate-200">Esperando eventos del chat</p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
        El flujo se construirá en tiempo real cuando llegue la siguiente petición.
      </p>
    </div>
  )
}
