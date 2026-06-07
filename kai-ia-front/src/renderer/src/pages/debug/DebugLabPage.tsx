import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Download, MessageSquareText, RotateCcw } from 'lucide-react'
import Chart from 'chart.js/auto'
import type { ChartConfiguration, ChartDataset } from 'chart.js'
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
  step?: number
  arguments?: unknown
  result?: unknown
  durationMs?: number
  status?: string
}

type DebugLabHardwareInfo = {
  hostname: string
  platform: string
  arch: string
  cpuModel: string
  cpuCores: number
  totalMemoryBytes: number
  gpuDevices: string[]
  primaryGpuName?: string
  vramTotalBytes?: number
}

type ResourceUsageSample = {
  capturedAt: number
  elapsedMs: number
  cpuPercent: number
  memoryUsedBytes: number
  memoryFreeBytes: number
  memoryTotalBytes: number
  memoryUsedPercent: number
  gpuPercent: number | null
  vramUsedBytes: number | null
  vramTotalBytes: number | null
  vramUsedPercent: number | null
}

type NodeResourceUsageSample = ResourceUsageSample & {
  nodeId: string
  nodeLabel: string
  phase: 'start' | 'end'
}

type DebugLabCsvFile = {
  filename: string
  content: string
}

type TemporalDistributionItem = {
  label: string
  value?: number
  color: string
}

type UsageChartField = 'cpuPercent' | 'memoryUsedBytes' | 'gpuPercent' | 'vramUsedBytes'

type UsageChartUnit = 'percent' | 'gb'

type ReportChartImages = {
  temporal?: string
  cpu?: string
  ram?: string
  gpu?: string
  vram?: string
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
const NODE_HANDLE_GAP = 26
const MAIN_X = 280
const TOOL_X = 585
const START_Y = 40
const ROW_GAP = 220

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
 * Format a byte count into a compact storage value.
 *
 * Args:
 *   value: Number of bytes to format.
 *
 * Returns:
 *   string
 */
function formatBytes(value?: number): string {
  if (typeof value !== 'number') return '-'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

/**
 * Calculate the average of a list of numeric values.
 *
 * Args:
 *   values: Numeric values to average.
 *
 * Returns:
 *   number | undefined
 */
function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  return values.reduce((total, value) => total + value, 0) / values.length
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
 * Convert escaped control sequences into readable multiline text.
 *
 * Args:
 *   value: Text shown in debug message panels.
 *
 * Returns:
 *   string
 */
function formatEscapedMessage(value: string): string {
  return value
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '  ')
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
  const backendReceiveEvent = events.find((event) => event.stage === 'backend_receive')
  const contextEvent = events.find((event) => event.stage === 'context')
  const lmRequest = events.find((event) => event.stage === 'lmstudio_request')
  const firstToken = tokenEvents[0]
  const lastToken = tokenEvents[tokenEvents.length - 1]
  const promptPreview = stringField(backendReceiveEvent?.prompt_preview)
  const promptChars =
    numberField(tokenizeEvent?.prompt_chars) ??
    numberField(backendReceiveEvent?.prompt_chars) ??
    promptPreview?.length
  const inputTokens =
    numberField(tokenizeEvent?.prompt_tokens_estimate) ??
    (typeof promptChars === 'number' ? Math.max(1, Math.ceil(promptChars / 4)) : undefined)
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
    inputTokens,
    inputMs: tokenizeEvent?.duration_ms,
    outputTokens: tokenEvents.length,
    outputMs,
    timeToLmMs: lmRequest?.elapsed_ms,
    lmMs,
    toolMs,
    firstTokenMs,
    tokensPerSecond,
    promptChars,
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
        step: typeof event.step === 'number' ? event.step : undefined,
        arguments: event.parsed_arguments ?? event.arguments
      })
    }

    if (event.stage === 'tool_result') {
      const last = traces[traces.length - 1]
      if (last && (!event.tool_name || last.name === event.tool_name)) {
        last.result = event.result
        last.durationMs = event.duration_ms
        last.status = typeof event.status === 'string' ? event.status : undefined
        last.step = typeof event.step === 'number' ? event.step : last.step
      } else {
        traces.push({
          name: String(event.tool_name || `tool_${traces.length + 1}`),
          step: typeof event.step === 'number' ? event.step : undefined,
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
        width: 14,
        height: 14
      },
      zIndex: 0
    }
  })

  return { nodes, edges }
}

/**
 * Build the temporal distribution bars used in the report.
 *
 * Args:
 *   metrics: Calculated report metrics.
 *
 * Returns:
 *   TemporalDistributionItem[]
 */
function buildTemporalDistributionItems(
  metrics: ReturnType<typeof buildMetrics>
): TemporalDistributionItem[] {
  return [
    { label: 'Entrada', value: metrics.inputMs, color: '#22d3ee' },
    { label: 'Hasta LM', value: metrics.timeToLmMs, color: '#38bdf8' },
    { label: 'LM Studio', value: metrics.lmMs, color: '#06b6d4' },
    { label: 'Tools', value: metrics.toolMs, color: '#e879f9' },
    { label: 'Salida', value: metrics.outputMs, color: '#34d399' },
    { label: 'Total', value: metrics.totalMs, color: '#64748b' }
  ]
}

/**
 * Convert a resource sample value into the chart unit.
 *
 * Args:
 *   sample: Node-level resource sample.
 *   field: Resource field read from the sample.
 *   unit: Unit rendered by the chart.
 *
 * Returns:
 *   number | null
 */
function readChartValue(
  sample: NodeResourceUsageSample,
  field: UsageChartField,
  unit: UsageChartUnit
): number | null {
  const value = sample[field]

  if (typeof value !== 'number') return null

  return unit === 'gb' ? Number((value / 1024 / 1024 / 1024).toFixed(4)) : Number(value.toFixed(2))
}

/**
 * Render a Chart.js configuration into a PNG data URL for the PDF report.
 *
 * Args:
 *   config: Chart.js configuration.
 *   width: Canvas width in pixels.
 *   height: Canvas height in pixels.
 *
 * Returns:
 *   Promise<string>
 */
async function renderChartImage(
  config: ChartConfiguration,
  width = 980,
  height = 320
): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const chart = new Chart(canvas, {
    ...config,
    options: {
      ...config.options,
      animation: false,
      responsive: false,
      maintainAspectRatio: false,
      devicePixelRatio: 2
    }
  })

  chart.update()
  await new Promise((resolve) => window.requestAnimationFrame(resolve))

  const image = canvas.toDataURL('image/png')
  chart.destroy()

  return image
}

/**
 * Build a line chart image for a resource metric.
 *
 * Args:
 *   samples: Node-level resource samples.
 *   title: Dataset title.
 *   field: Resource field rendered by the chart.
 *   color: Dataset color.
 *   unit: Unit rendered by the chart.
 *
 * Returns:
 *   Promise<string | undefined>
 */
async function buildResourceChartImage(
  samples: NodeResourceUsageSample[],
  title: string,
  field: UsageChartField,
  color: string,
  unit: UsageChartUnit
): Promise<string | undefined> {
  const points = samples
    .map((sample) => ({
      label: `${sample.nodeLabel} ${sample.phase === 'start' ? 'inicio' : 'fin'}`,
      value: readChartValue(sample, field, unit)
    }))
    .filter((point): point is { label: string; value: number } => typeof point.value === 'number')

  if (points.length === 0) return undefined

  const unitLabel = unit === 'gb' ? 'GB en uso' : '% de uso'

  return renderChartImage(
    {
      type: 'line',
      data: {
        labels: points.map((_, index) => `${index + 1}`),
        datasets: [
          {
            label: title,
            data: points.map((point) => point.value),
            borderColor: color,
            backgroundColor: `${color}22`,
            pointBackgroundColor: color,
            pointBorderColor: '#ffffff',
            pointRadius: 5,
            pointHoverRadius: 5,
            borderWidth: 4,
            tension: 0.35,
            fill: true
          } satisfies ChartDataset<'line', number[]>
        ]
      },
      options: {
        layout: {
          padding: 18
        },
        plugins: {
          legend: {
            display: true,
            align: 'start',
            labels: {
              color: '#334155',
              boxWidth: 14,
              boxHeight: 14,
              font: {
                size: 15,
                weight: 'bold'
              }
            }
          },
          tooltip: {
            callbacks: {
              title: (items) => points[items[0]?.dataIndex ?? 0]?.label ?? '',
              label: (item) => `${title}: ${item.formattedValue} ${unit === 'gb' ? 'GB' : '%'}`
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Muestras por nodo',
              color: '#64748b',
              font: {
                size: 13
              }
            },
            grid: {
              color: '#e2e8f0'
            },
            ticks: {
              color: '#64748b',
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 14,
              font: {
                size: 12
              }
            }
          },
          y: {
            beginAtZero: true,
            max: unit === 'percent' ? 100 : undefined,
            title: {
              display: true,
              text: unitLabel,
              color: '#64748b',
              font: {
                size: 13
              }
            },
            grid: {
              color: '#e2e8f0'
            },
            ticks: {
              color: '#64748b',
              font: {
                size: 12
              }
            }
          }
        }
      }
    },
    1200,
    520
  )
}

/**
 * Build a bar chart image for the temporal distribution.
 *
 * Args:
 *   metrics: Calculated report metrics.
 *
 * Returns:
 *   Promise<string | undefined>
 */
async function buildTemporalChartImage(
  metrics: ReturnType<typeof buildMetrics>
): Promise<string | undefined> {
  const items = buildTemporalDistributionItems(metrics).filter(
    (item) => typeof item.value === 'number'
  )

  if (items.length === 0) return undefined

  return renderChartImage(
    {
      type: 'bar',
      data: {
        labels: items.map((item) => item.label),
        datasets: [
          {
            label: 'Duración en ms',
            data: items.map((item) => item.value ?? 0),
            backgroundColor: items.map((item) => item.color),
            borderRadius: 8
          } satisfies ChartDataset<'bar', number[]>
        ]
      },
      options: {
        layout: {
          padding: 12
        },
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: '#475569',
              font: {
                size: 12
              }
            }
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Milisegundos',
              color: '#64748b'
            },
            grid: {
              color: '#e2e8f0'
            },
            ticks: {
              color: '#64748b'
            }
          }
        }
      }
    },
    1200,
    420
  )
}

/**
 * Build resource samples located at the start and end of every flow node.
 *
 * Args:
 *   flowNodes: Ordered flow nodes from the debug timeline.
 *   samples: Resource samples captured during execution.
 *
 * Returns:
 *   NodeResourceUsageSample[]
 */
function buildNodeResourceSamples(
  flowNodes: FlowNode[],
  samples: ResourceUsageSample[]
): NodeResourceUsageSample[] {
  if (flowNodes.length === 0 || samples.length === 0) return []

  const closestSample = (targetMs?: number): ResourceUsageSample | null => {
    if (typeof targetMs !== 'number') return null

    return samples.reduce<ResourceUsageSample | null>((closest, sample) => {
      if (!closest) return sample

      const currentDistance = Math.abs(sample.elapsedMs - targetMs)
      const closestDistance = Math.abs(closest.elapsedMs - targetMs)

      return currentDistance < closestDistance ? sample : closest
    }, null)
  }

  return flowNodes.flatMap((node) => {
    const start = closestSample(node.elapsedMs)
    const end = closestSample((node.elapsedMs ?? 0) + (node.durationMs ?? 0))

    return [
      start
        ? {
            ...start,
            nodeId: node.id,
            nodeLabel: node.label,
            phase: 'start' as const
          }
        : null,
      end
        ? {
            ...end,
            nodeId: node.id,
            nodeLabel: node.label,
            phase: 'end' as const
          }
        : null
    ].filter((sample): sample is NodeResourceUsageSample => sample !== null)
  })
}

/**
 * Escape one value for a CSV cell.
 *
 * Args:
 *   value: Cell value.
 *
 * Returns:
 *   string
 */
function csvCell(value: unknown): string {
  if (value === undefined || value === null) return ''

  const text = String(value)

  if (!/[",\n\r]/.test(text)) return text

  return `"${text.replace(/"/g, '""')}"`
}

/**
 * Build a CSV document from headers and rows.
 *
 * Args:
 *   headers: CSV header names.
 *   rows: CSV rows.
 *
 * Returns:
 *   string
 */
function buildCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))].join(
    '\r\n'
  )
}

/**
 * Export one resource chart as CSV rows.
 *
 * Args:
 *   samples: Node-level samples rendered in the report.
 *   field: Resource field exported.
 *   unit: Unit name written in the CSV.
 *
 * Returns:
 *   string
 */
function buildResourceCsv(
  samples: NodeResourceUsageSample[],
  field: UsageChartField,
  unit: UsageChartUnit
): string {
  return buildCsv(
    ['node_id', 'node_label', 'phase', 'elapsed_ms', 'captured_at', 'value', 'unit'],
    samples.map((sample) => {
      const rawValue = sample[field]
      const value =
        typeof rawValue === 'number' && unit === 'gb'
          ? rawValue / 1024 / 1024 / 1024
          : typeof rawValue === 'number'
            ? rawValue
            : ''

      return [
        sample.nodeId,
        sample.nodeLabel,
        sample.phase,
        sample.elapsedMs,
        new Date(sample.capturedAt).toISOString(),
        typeof value === 'number' ? Number(value.toFixed(unit === 'gb' ? 4 : 2)) : value,
        unit === 'gb' ? 'GB' : '%'
      ]
    })
  )
}

/**
 * Build the CSV files that accompany the exported report.
 *
 * Args:
 *   metrics: Calculated report metrics.
 *   flowNodes: Ordered pipeline nodes.
 *   resourceSamples: System samples captured during the trace.
 *
 * Returns:
 *   DebugLabCsvFile[]
 */
function buildReportCsvFiles(
  metrics: ReturnType<typeof buildMetrics>,
  flowNodes: FlowNode[],
  resourceSamples: ResourceUsageSample[]
): DebugLabCsvFile[] {
  const nodeResourceSamples = buildNodeResourceSamples(flowNodes, resourceSamples)
  const temporalRows = buildTemporalDistributionItems(metrics).map((item) => [
    item.label,
    item.value ?? '',
    'ms'
  ])

  return [
    {
      filename: 'distribucion-temporal.csv',
      content: buildCsv(['fase', 'valor', 'unidad'], temporalRows)
    },
    {
      filename: 'uso-cpu.csv',
      content: buildResourceCsv(nodeResourceSamples, 'cpuPercent', 'percent')
    },
    {
      filename: 'uso-ram.csv',
      content: buildResourceCsv(nodeResourceSamples, 'memoryUsedBytes', 'gb')
    },
    {
      filename: 'uso-gpu.csv',
      content: buildResourceCsv(nodeResourceSamples, 'gpuPercent', 'percent')
    },
    {
      filename: 'uso-vram.csv',
      content: buildResourceCsv(nodeResourceSamples, 'vramUsedBytes', 'gb')
    }
  ]
}

/**
 * Build every chart image used by the PDF report.
 *
 * Args:
 *   metrics: Calculated report metrics.
 *   flowNodes: Ordered pipeline nodes.
 *   resourceSamples: System samples captured during the trace.
 *
 * Returns:
 *   Promise<ReportChartImages>
 */
async function buildReportChartImages(
  metrics: ReturnType<typeof buildMetrics>,
  flowNodes: FlowNode[],
  resourceSamples: ResourceUsageSample[]
): Promise<ReportChartImages> {
  const nodeResourceSamples = buildNodeResourceSamples(flowNodes, resourceSamples)
  const [temporal, cpu, ram, gpu, vram] = await Promise.all([
    buildTemporalChartImage(metrics),
    buildResourceChartImage(nodeResourceSamples, 'Uso de CPU', 'cpuPercent', '#0ea5e9', 'percent'),
    buildResourceChartImage(nodeResourceSamples, 'Uso de RAM', 'memoryUsedBytes', '#10b981', 'gb'),
    buildResourceChartImage(nodeResourceSamples, 'Uso de GPU', 'gpuPercent', '#a855f7', 'percent'),
    buildResourceChartImage(nodeResourceSamples, 'Uso de VRAM', 'vramUsedBytes', '#f97316', 'gb')
  ])

  return { temporal, cpu, ram, gpu, vram }
}

/**
 * Build the printable benchmark report with cover, prompt, hardware and chart pages.
 *
 * Args:
 *   chatId: Chat identifier for the report.
 *   metrics: Calculated benchmark metrics.
 *   events: Debug events included in the report.
 *   outputContentLength: Number of characters generated by the assistant.
 *   tools: Tool traces extracted from the events.
 *   flowNodes: Ordered pipeline nodes for resource sampling.
 *   systemInfo: Hardware information captured from Electron.
 *   resourceSamples: Resource usage samples captured during execution.
 *   chartImages: Pre-rendered Chart.js images embedded in the PDF.
 *
 * Returns:
 *   string
 */
function buildReportHtml({
  chatId,
  metrics,
  events,
  outputContentLength,
  tools,
  flowNodes,
  systemInfo,
  resourceSamples,
  chartImages
}: {
  chatId: string
  metrics: ReturnType<typeof buildMetrics>
  events: DebugLabEvent[]
  outputContentLength: number
  tools: ToolTrace[]
  flowNodes: FlowNode[]
  systemInfo: DebugLabHardwareInfo | null
  resourceSamples: ResourceUsageSample[]
  chartImages: ReportChartImages
}): string {
  const nodeResourceSamples = buildNodeResourceSamples(flowNodes, resourceSamples)
  const lastResourceSample = resourceSamples.at(-1)
  const cpuValues = nodeResourceSamples.map((sample) => sample.cpuPercent)
  const ramValues = nodeResourceSamples.map((sample) => sample.memoryUsedBytes / 1024 / 1024 / 1024)
  const gpuValues = nodeResourceSamples
    .map((sample) => sample.gpuPercent)
    .filter((value): value is number => typeof value === 'number')
  const vramValues = nodeResourceSamples
    .map((sample) =>
      typeof sample.vramUsedBytes === 'number' ? sample.vramUsedBytes / 1024 / 1024 / 1024 : null
    )
    .filter((value): value is number => typeof value === 'number')
  const cpuAverage = average(cpuValues)
  const ramAverage = average(ramValues)
  const gpuAverage = average(gpuValues)
  const vramAverage = average(vramValues)
  const cpuMax = cpuValues.length > 0 ? Math.max(...cpuValues) : undefined
  const ramMax = ramValues.length > 0 ? Math.max(...ramValues) : undefined
  const gpuMax = gpuValues.length > 0 ? Math.max(...gpuValues) : undefined
  const vramMax = vramValues.length > 0 ? Math.max(...vramValues) : undefined
  const backendReceiveEvent = events.find((event) => event.stage === 'backend_receive')
  const promptPreview = toText(backendReceiveEvent?.prompt ?? backendReceiveEvent?.prompt_preview)
  const toolRows = tools
    .map(
      (tool, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(tool.name)}</td>
          <td>${escapeHtml(tool.status || '-')}</td>
          <td>${escapeHtml(formatMs(tool.durationMs))}</td>
        </tr>
      `
    )
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
  const gpuText = systemInfo?.primaryGpuName || systemInfo?.gpuDevices.join(', ') || '-'
  const chartImage = (src: string | undefined, label: string) =>
    src
      ? `<img class="chart-image" src="${src}" alt="${escapeHtml(label)}" />`
      : '<p class="muted tiny">Sin datos disponibles.</p>'

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Informe Kai Debug Lab</title>
        <style>
          @page { size: A4; margin: 14mm 12mm 14mm 16mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; padding-left: 2mm; }
          h1 { margin: 0 0 4px; font-size: 23px; }
          h2 { margin: 14px 0 8px; font-size: 15px; }
          h3 { margin: 0 0 8px; font-size: 15px; }
          h4 { margin: 14px 0 6px; font-size: 12px; color: #475569; }
          .muted { color: #64748b; }
          .tiny { font-size: 10px; }
          .page { page-break-after: always; }
          .hero { border: 1px solid #cbd5e1; border-radius: 14px; padding: 14px; background: linear-gradient(135deg, #f8fafc, #ecfeff); }
          .prompt-section { page-break-after: always; break-inside: auto; page-break-inside: auto; border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; background: white; }
          .prompt-section h2 { margin-top: 0; }
          .prompt-preview { margin: 8px 0 0; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; background: #f8fafc; font-size: 10.5px; line-height: 1.45; color: #334155; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; break-inside: auto; page-break-inside: auto; }
          .cover-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0; }
          .cover-meta .metric { min-height: 54px; }
          .metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; margin: 10px 0; }
          .metric { border: 1px solid #cbd5e1; border-radius: 10px; padding: 7px; background: white; min-height: 48px; }
          .metric span { display: block; color: #64748b; font-size: 9px; text-transform: uppercase; }
          .metric strong { display:block; margin-top: 3px; font-size: 13px; }
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
          .panel { border: 1px solid #cbd5e1; border-radius: 12px; padding: 9px; background: white; }
          .kv { display: grid; grid-template-columns: 108px 1fr; gap: 5px; font-size: 10px; margin: 4px 0; }
          .kv span { color: #64748b; }
          .two-cols { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .bar-row { display: grid; grid-template-columns: 76px 1fr 62px; gap: 8px; align-items: center; margin: 5px 0; font-size: 10px; }
          .bar-track { height: 10px; border-radius: 999px; background: #e2e8f0; overflow: hidden; }
          .bar-fill { height: 100%; border-radius: 999px; }
          .analytics-grid { display: block; margin-top: 10px; }
          .analytics-grid .panel { margin-top: 14px; page-break-inside: avoid; break-inside: avoid; }
          .chart-image { display: block; width: 100%; height: 330px; object-fit: contain; }
          .chart-wide { margin-top: 12px; }
          .chart-wide .chart-image { height: 340px; }
          .chart-full .chart-image { height: 430px; }
          .chart-full { min-height: 520px; page-break-inside: avoid; break-inside: avoid; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 7px; font-size: 11px; vertical-align: top; }
          th { background: #f1f5f9; text-align: left; }
          pre { white-space: pre-wrap; word-break: break-word; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; font-size: 10px; }
          section { break-inside: avoid; margin-top: 14px; }
          .tool-block { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
          .chart-title { display:flex; justify-content:space-between; align-items:center; font-size: 10px; color:#475569; margin-bottom: 5px; }
        </style>
      </head>
      <body>
        <main class="page">
          <div class="hero">
            <h1>Informe Kai Debug Lab</h1>
            <p class="muted tiny">Informe de trazabilidad de una petición ejecutada en Kai IA.</p>
          </div>

          <div class="cover-meta">
            <div class="metric"><span>ID chat</span><strong>${escapeHtml(chatId || 'Todos')}</strong></div>
            <div class="metric"><span>Request</span><strong>${escapeHtml(metrics.requestId || '-')}</strong></div>
            <div class="metric"><span>Fecha</span><strong>${escapeHtml(new Date().toLocaleString())}</strong></div>
          </div>

          <div class="metrics">
            <div class="metric"><span>Modelo</span><strong>${escapeHtml(metrics.model || '-')}</strong></div>
            <div class="metric"><span>Temperatura</span><strong>${formatNumber(metrics.temperature)}</strong></div>
            <div class="metric"><span>Primer token</span><strong>${escapeHtml(formatMs(metrics.firstTokenMs))}</strong></div>
            <div class="metric"><span>Total respuesta</span><strong>${escapeHtml(formatMs(metrics.totalMs))}</strong></div>
            <div class="metric"><span>Tools usadas</span><strong>${tools.length}</strong></div>
            <div class="metric"><span>Tokens entrada</span><strong>${formatNumber(metrics.inputTokens)}</strong></div>
            <div class="metric"><span>Tokens generados</span><strong>${formatNumber(metrics.outputTokens)}</strong></div>
            <div class="metric"><span>Prompt length</span><strong>${formatNumber(metrics.promptChars)}</strong></div>
            <div class="metric"><span>Content length</span><strong>${formatNumber(outputContentLength)}</strong></div>
            <div class="metric"><span>Tokens/s</span><strong>${metrics.tokensPerSecond ? metrics.tokensPerSecond.toFixed(2) : '-'}</strong></div>
          </div>
        </main>

        <section class="prompt-section">
          <h2>Petición y mensaje inicial</h2>
          <div class="prompt-preview">${escapeHtml(promptPreview)}</div>
        </section>

        <main class="page">
          <div class="grid-2">
            <section class="panel">
              <h2>Hardware</h2>
              <div class="kv"><span>Equipo</span><strong>${escapeHtml(systemInfo?.hostname || '-')}</strong></div>
              <div class="kv"><span>Sistema</span><strong>${escapeHtml(systemInfo?.platform || '-')} ${escapeHtml(systemInfo?.arch || '')}</strong></div>
              <div class="kv"><span>Procesador</span><strong>${escapeHtml(systemInfo?.cpuModel || '-')}</strong></div>
              <div class="kv"><span>Núcleos</span><strong>${formatNumber(systemInfo?.cpuCores)}</strong></div>
              <div class="kv"><span>RAM disponible</span><strong>${escapeHtml(formatBytes(lastResourceSample?.memoryFreeBytes))}</strong></div>
              <div class="kv"><span>GPU</span><strong>${escapeHtml(gpuText)}</strong></div>
              <div class="kv"><span>VRAM disponible</span><strong>${escapeHtml(formatBytes(systemInfo?.vramTotalBytes))}</strong></div>
            </section>

            <section class="panel">
              <h2>Tiempos principales</h2>
              <div class="kv"><span>Tokenización</span><strong>${escapeHtml(formatMs(metrics.inputMs))}</strong></div>
              <div class="kv"><span>Hasta LM</span><strong>${escapeHtml(formatMs(metrics.timeToLmMs))}</strong></div>
              <div class="kv"><span>LM Studio</span><strong>${escapeHtml(formatMs(metrics.lmMs))}</strong></div>
              <div class="kv"><span>Tools total</span><strong>${escapeHtml(formatMs(metrics.toolMs))}</strong></div>
              <div class="kv"><span>Salida</span><strong>${escapeHtml(formatMs(metrics.outputMs))}</strong></div>
              <div class="kv"><span>Eventos debug</span><strong>${formatNumber(metrics.eventCount)}</strong></div>
            </section>
          </div>

          <section class="panel chart-wide">
            <h2>Distribución temporal</h2>
            ${chartImage(chartImages.temporal, 'Distribución temporal')}
          </section>

        </main>

        <main class="page">
          <div class="analytics-grid">
            <section class="panel">
              <div class="chart-title"><strong>Uso de CPU</strong><span>media ${cpuAverage?.toFixed(1) ?? '-'}% · máx ${cpuMax?.toFixed(1) ?? '-'}%</span></div>
              ${chartImage(chartImages.cpu, 'Uso de CPU')}
            </section>
            <section class="panel">
              <div class="chart-title"><strong>Uso de RAM</strong><span>media ${ramAverage?.toFixed(2) ?? '-'} GB · máx ${ramMax?.toFixed(2) ?? '-'} GB</span></div>
              ${chartImage(chartImages.ram, 'Uso de RAM')}
            </section>
            <section class="panel">
              <div class="chart-title"><strong>Uso de GPU</strong><span>media ${gpuAverage?.toFixed(1) ?? '-'}% · máx ${gpuMax?.toFixed(1) ?? '-'}%</span></div>
              ${chartImage(chartImages.gpu, 'Uso de GPU')}
            </section>
            <section class="panel">
              <div class="chart-title"><strong>Uso de VRAM</strong><span>media ${vramAverage?.toFixed(2) ?? '-'} GB · máx ${vramMax?.toFixed(2) ?? '-'} GB</span></div>
              ${chartImage(chartImages.vram, 'Uso de VRAM')}
            </section>
          </div>

        </main>

        <section>
          <h2>Resumen de tools</h2>
          <table>
            <thead><tr><th></th><th>Tool</th><th>Estado</th><th>Duración</th></tr></thead>
            <tbody>${toolRows || '<tr><td colspan="4">No se ejecutaron tools.</td></tr>'}</tbody>
          </table>
          <h2>Tools</h2>
          ${toolBlocks || '<p class="muted">No se ejecutaron tools.</p>'}
        </section>
      </body>
    </html>
  `
}

/**
 * Build a self-contained interactive HTML dashboard for the debug trace.
 *
 * Args:
 *   chatId: Chat identifier.
 *   metrics: Calculated benchmark metrics.
 *   events: All debug events captured during the trace.
 *   outputContentLength: Characters generated by the assistant.
 *   tools: Tool traces extracted from the events.
 *   flowNodes: Ordered pipeline nodes.
 *   systemInfo: Hardware information.
 *   resourceSamples: Resource usage samples.
 *
 * Returns:
 *   string — standalone HTML that opens in any browser.
 */
function buildDashboardHtml({
  chatId,
  metrics,
  events,
  outputContentLength,
  tools,
  flowNodes,
  systemInfo,
  resourceSamples
}: {
  chatId: string
  metrics: ReturnType<typeof buildMetrics>
  events: DebugLabEvent[]
  outputContentLength: number
  tools: ToolTrace[]
  flowNodes: FlowNode[]
  systemInfo: DebugLabHardwareInfo | null
  resourceSamples: ResourceUsageSample[]
}): string {
  const nodeResourceSamples = buildNodeResourceSamples(flowNodes, resourceSamples)
  const temporalItems = buildTemporalDistributionItems(metrics)
  const backendReceiveEvent = events.find((e) => e.stage === 'backend_receive')
  const promptPreview = toText(backendReceiveEvent?.prompt ?? backendReceiveEvent?.prompt_preview)
  const lastSample = resourceSamples.at(-1)
  const gpuText = systemInfo?.primaryGpuName || (systemInfo?.gpuDevices ?? []).join(', ') || '-'
  const now = new Date().toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'medium' })

  const serJ = (d: unknown): string =>
    JSON.stringify(d).replace(/<\/script>/gi, '<\\/script>')

  const chartLabels = nodeResourceSamples.map((_, i) => String(i + 1))
  const chartTooltips = nodeResourceSamples.map(
    (s) => `${s.nodeLabel} (${s.phase === 'start' ? 'inicio' : 'fin'})`
  )
  const cpuD = nodeResourceSamples.map((s) => +s.cpuPercent.toFixed(2))
  const ramD = nodeResourceSamples.map((s) => +(s.memoryUsedBytes / 1073741824).toFixed(3))
  const gpuD = nodeResourceSamples.map((s) =>
    typeof s.gpuPercent === 'number' ? +s.gpuPercent.toFixed(2) : null
  )
  const vrmD = nodeResourceSamples.map((s) =>
    typeof s.vramUsedBytes === 'number' ? +(s.vramUsedBytes / 1073741824).toFixed(3) : null
  )

  const cpuVals = nodeResourceSamples.map((s) => s.cpuPercent)
  const ramVals = nodeResourceSamples.map((s) => s.memoryUsedBytes / 1073741824)
  const gpuVals = nodeResourceSamples
    .map((s) => s.gpuPercent)
    .filter((v): v is number => typeof v === 'number')
  const vrmVals = nodeResourceSamples
    .map((s) => (typeof s.vramUsedBytes === 'number' ? s.vramUsedBytes / 1073741824 : null))
    .filter((v): v is number => typeof v === 'number')
  const cpuAvg = average(cpuVals)
  const ramAvg = average(ramVals)
  const gpuAvg = average(gpuVals)
  const vrmAvg = average(vrmVals)
  const cpuMax = cpuVals.length > 0 ? Math.max(...cpuVals) : undefined
  const ramMax = ramVals.length > 0 ? Math.max(...ramVals) : undefined
  const gpuMax = gpuVals.length > 0 ? Math.max(...gpuVals) : undefined
  const vrmMax = vrmVals.length > 0 ? Math.max(...vrmVals) : undefined

  const tmpItems = temporalItems.filter((item) => typeof item.value === 'number')
  const tmpLabels = tmpItems.map((item) => item.label)
  const tmpData = tmpItems.map((item) => item.value as number)
  const tmpColors = tmpItems.map((item) => item.color)

  const evLog = events.map((e, i) => ({
    n: i + 1,
    tp: String(e.type ?? ''),
    st: String(e.stage ?? ''),
    el: typeof e.elapsed_ms === 'number' ? e.elapsed_ms : null,
    du: typeof e.duration_ms === 'number' ? e.duration_ms : null
  }))

  const toolRows = tools
    .map(
      (t, i) =>
        `<tr>
          <td class="muted">${i + 1}</td>
          <td><strong>${escapeHtml(t.name)}</strong></td>
          <td><span class="chip chip-${t.status === 'success' ? 's' : t.status === 'error' ? 'e' : 'n'}">${escapeHtml(t.status || '-')}</span></td>
          <td>${escapeHtml(formatMs(t.durationMs))}</td>
        </tr>`
    )
    .join('')

  const toolCards = tools
    .map(
      (t, i) =>
        `<div class="tool-card">
          <div class="tc-hdr" data-toggle="tb-${i}">
            <div class="tool-badge">T${i + 1}</div>
            <div class="tool-info">
              <h3>${escapeHtml(t.name)}</h3>
              <div class="tool-meta">
                <span class="chip chip-${t.status === 'success' ? 's' : t.status === 'error' ? 'e' : 'n'}">${escapeHtml(t.status || '-')}</span>
                <span class="muted">${escapeHtml(formatMs(t.durationMs))}</span>
              </div>
            </div>
            <span class="tog">&#9660;</span>
          </div>
          <div class="tool-body" id="tb-${i}">
            <div class="ts"><h4>Entrada</h4><pre>${escapeHtml(compactJson(t.arguments, 8000))}</pre></div>
            <div class="ts"><h4>Salida</h4><pre>${escapeHtml(compactJson(t.result, 8000))}</pre></div>
          </div>
        </div>`
    )
    .join('')

  const inlineJs = `
var SC={backend_receive:'#22d3ee',tokenize:'#67e8f9',context:'#60a5fa',lmstudio_request:'#38bdf8',lmstudio_response:'#06b6d4',tool_selected:'#e879f9',tool_result:'#c084fc',token:'#34d399',done:'#94a3b8',error:'#fb7185'};
var M=${serJ(metrics)};
var SYS=${serJ(systemInfo)};
var LAST=${serJ(lastSample)};
var GPU_TXT=${serJ(gpuText)};
var OUT_LEN=${outputContentLength};
var TL=${serJ(tmpLabels)};
var TD=${serJ(tmpData)};
var TC=${serJ(tmpColors)};
var CHL=${serJ(chartLabels)};
var CHTP=${serJ(chartTooltips)};
var CPU_D=${serJ(cpuD)};
var RAM_D=${serJ(ramD)};
var GPU_D=${serJ(gpuD)};
var VRM_D=${serJ(vrmD)};
var CPU_AVG=${cpuAvg !== undefined ? cpuAvg.toFixed(2) : 'null'};
var RAM_AVG=${ramAvg !== undefined ? ramAvg.toFixed(3) : 'null'};
var GPU_AVG=${gpuAvg !== undefined ? gpuAvg.toFixed(2) : 'null'};
var VRM_AVG=${vrmAvg !== undefined ? vrmAvg.toFixed(3) : 'null'};
var CPU_MAX=${cpuMax !== undefined ? cpuMax.toFixed(2) : 'null'};
var RAM_MAX=${ramMax !== undefined ? ramMax.toFixed(3) : 'null'};
var GPU_MAX=${gpuMax !== undefined ? gpuMax.toFixed(2) : 'null'};
var VRM_MAX=${vrmMax !== undefined ? vrmMax.toFixed(3) : 'null'};
var EVLOG=${serJ(evLog)};
var logFilter='all';
var sortCol=null;
var sortAsc=true;
var temporalChart=null;

function fMs(ms){if(ms==null)return'—';return ms>=1000?(ms/1000).toFixed(2)+' s':Math.round(ms)+' ms';}
function fN(n){if(n==null)return'—';return new Intl.NumberFormat('es-ES').format(n);}
function kpi(lbl,val,sub,col){return'<div class="kpi" style="border-left-color:'+(col||'#22d3ee')+'"><div class="kpi-label">'+lbl+'</div><div class="kpi-val">'+val+'</div>'+(sub?'<div class="kpi-sub">'+sub+'</div>':'')+'</div>';}
function kv(lbl,val){return'<div class="kv-row"><span class="kv-lbl">'+lbl+'</span><span class="kv-val">'+val+'</span></div>';}
function dg(){return{grid:{color:'rgba(255,255,255,0.06)'},ticks:{color:'#64748b',font:{size:11}}};}

document.addEventListener('DOMContentLoaded',function(){
  document.getElementById('kpi-perf').innerHTML=
    kpi('Tiempo total',fMs(M.totalMs),'tiempo de respuesta completo','#22d3ee')+
    kpi('Primer token',fMs(M.firstTokenMs),'latencia hasta 1er token','#60a5fa')+
    kpi('Tokens / s',M.tokensPerSecond?M.tokensPerSecond.toFixed(2):'—','velocidad de generación','#38bdf8');
  document.getElementById('kpi-model').innerHTML=
    kpi('Modelo',M.model||'—','LLM utilizado','#94a3b8')+
    kpi('Temperatura',M.temperature!=null?M.temperature:'—','parámetro de sampling','#64748b')+
    kpi('Tools usadas',${tools.length},'herramientas invocadas','#e879f9')+
    kpi('Mensajes ctx',fN(M.messagesCount),'contexto enviado al modelo','#60a5fa')+
    kpi('Eventos debug',fN(M.eventCount),'eventos capturados','#94a3b8');
  document.getElementById('kpi-tokens').innerHTML=
    kpi('Tokens entrada',fN(M.inputTokens),'tokens del prompt','#67e8f9')+
    kpi('Tokens generados',fN(M.outputTokens),'tokens en la respuesta','#34d399')+
    kpi('Prompt length',(M.promptChars!=null?fN(M.promptChars)+' chars':'—'),'caracteres del prompt','#06b6d4')+
    kpi('Content length',fN(OUT_LEN)+' chars','caracteres generados','#34d399');

  var freeRam=LAST?(LAST.memoryFreeBytes/1073741824).toFixed(1)+' GB libres':'—';
  var vramT=SYS&&SYS.vramTotalBytes?(SYS.vramTotalBytes/1073741824).toFixed(1)+' GB':'—';
  document.getElementById('hw-kv').innerHTML=
    kv('Equipo',SYS?SYS.hostname:'—')+
    kv('Sistema',SYS?SYS.platform+' '+SYS.arch:'—')+
    kv('Procesador',SYS?SYS.cpuModel:'—')+
    kv('Núcleos',fN(SYS?SYS.cpuCores:null))+
    kv('RAM libre',freeRam)+
    kv('GPU',GPU_TXT)+
    kv('VRAM total',vramT);
  document.getElementById('timing-kv').innerHTML=
    kv('Tokenización',fMs(M.inputMs))+
    kv('Hasta LM Studio',fMs(M.timeToLmMs))+
    kv('LM Studio total',fMs(M.lmMs))+
    kv('Tools total',fMs(M.toolMs))+
    kv('Salida streaming',fMs(M.outputMs))+
    kv('Modelo',M.model||'—')+
    kv('Mensajes ctx',fN(M.messagesCount));

  var maxV=Math.max.apply(null,TD.filter(function(v){return v>0;}).concat([1]));
  var pbHtml='';
  for(var pi=0;pi<TL.length;pi++){
    var pv=TD[pi],pc=TC[pi],pp=Math.min(100,(pv/maxV)*100);
    pbHtml+='<div class="phase-row"><span class="phase-lbl">'+TL[pi]+'</span><div class="bar-track"><div class="bar-fill" style="width:'+pp+'%;background:'+pc+'"></div></div><span class="phase-val" style="color:'+pc+'">'+fMs(pv)+'</span></div>';
  }
  document.getElementById('phase-bars').innerHTML=pbHtml||'<p style="color:#64748b;padding:12px 0">Sin datos de temporalidad.</p>';

  if(TL.length){
    temporalChart=new Chart(document.getElementById('chart-temporal'),{
      type:'bar',
      data:{labels:TL,datasets:[{data:TD,backgroundColor:TC,borderRadius:7,borderSkipped:false}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#1e293b',titleColor:'#e2e8f0',bodyColor:'#94a3b8',borderColor:'rgba(255,255,255,0.12)',borderWidth:1,callbacks:{label:function(i){return'Duración: '+fMs(i.raw);}}}},scales:{x:{grid:{display:false},ticks:{color:'#64748b',font:{size:11}}},y:{beginAtZero:true,grid:dg().grid,ticks:dg().ticks,title:{display:true,text:'Milisegundos',color:'#64748b',font:{size:11}}}}}
    });
  }

  function mkLine(id,data,color,unit){
    var el=document.getElementById(id);if(!el)return;
    var valid=data.filter(function(v){return v!==null;});
    if(!valid.length){el.parentElement.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;font-size:12px">Sin datos disponibles</div>';return;}
    new Chart(el,{type:'line',data:{labels:CHL,datasets:[{data:data,borderColor:color,backgroundColor:color+'18',pointBackgroundColor:color,pointBorderColor:'#020617',pointBorderWidth:2,pointRadius:4,pointHoverRadius:6,borderWidth:2,tension:0.35,fill:true,spanGaps:true}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{backgroundColor:'#1e293b',titleColor:'#e2e8f0',bodyColor:'#94a3b8',borderColor:'rgba(255,255,255,0.12)',borderWidth:1,padding:10,callbacks:{title:function(items){return CHTP[items[0]?items[0].dataIndex:0]||'';},label:function(item){return unit+': '+item.formattedValue;}}}},scales:{x:{grid:dg().grid,ticks:Object.assign({maxTicksLimit:12,autoSkip:true},dg().ticks)},y:{beginAtZero:true,grid:dg().grid,ticks:dg().ticks,title:{display:true,text:unit,color:'#64748b',font:{size:11}}}}}});
  }
  mkLine('chart-cpu',CPU_D,'#0ea5e9','% CPU');
  mkLine('chart-ram',RAM_D,'#10b981','GB RAM');
  mkLine('chart-gpu',GPU_D,'#a855f7','% GPU');
  mkLine('chart-vram',VRM_D,'#f97316','GB VRAM');

  function sEl(id,v){var e=document.getElementById(id);if(e)e.textContent=v;}
  sEl('cpu-stats',CPU_AVG!==null?'media '+CPU_AVG+'% · máx '+CPU_MAX+'%':'sin datos');
  sEl('ram-stats',RAM_AVG!==null?'media '+RAM_AVG+' GB · máx '+RAM_MAX+' GB':'sin datos');
  sEl('gpu-stats',GPU_AVG!==null?'media '+GPU_AVG+'% · máx '+GPU_MAX+'%':'sin datos');
  sEl('vram-stats',VRM_AVG!==null?'media '+VRM_AVG+' GB · máx '+VRM_MAX+' GB':'sin datos');

  renderLog();
  renderTmpTable();

  document.querySelectorAll('.tc-hdr').forEach(function(h){
    h.addEventListener('click',function(){
      var id=h.getAttribute('data-toggle');
      var body=document.getElementById(id);
      var tog=h.querySelector('.tog');
      if(body)body.classList.toggle('open');
      if(tog)tog.classList.toggle('open');
    });
  });

  document.querySelectorAll('th[data-sort]').forEach(function(th){
    th.addEventListener('click',function(){
      var col=th.getAttribute('data-sort');
      if(sortCol===col){sortAsc=!sortAsc;}else{sortCol=col;sortAsc=true;}
      document.querySelectorAll('th[data-sort]').forEach(function(t){t.classList.remove('sort-asc','sort-desc');});
      th.classList.add(sortAsc?'sort-asc':'sort-desc');
      renderTmpTable();
      renderLog();
    });
  });
});

function switchTab(name,btn){
  document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active');});
  document.querySelectorAll('.tab-panel').forEach(function(p){p.classList.remove('active');});
  if(btn)btn.classList.add('active');
  var p=document.getElementById('tab-'+name);if(p)p.classList.add('active');
}

function renderTmpTable(){
  var rows=TL.map(function(lbl,i){return{label:lbl,value:TD[i],color:TC[i]};});
  if(sortCol==='fase')rows.sort(function(a,b){return sortAsc?a.label.localeCompare(b.label):b.label.localeCompare(a.label);});
  if(sortCol==='valor')rows.sort(function(a,b){return sortAsc?a.value-b.value:b.value-a.value;});
  var html='';
  for(var i=0;i<rows.length;i++){
    var r=rows[i];
    html+='<tr><td><span class="dot" style="background:'+r.color+'"></span>'+r.label+'</td><td>'+fMs(r.value)+'</td></tr>';
  }
  var tb=document.getElementById('tmp-tbody');if(tb)tb.innerHTML=html||'<tr><td colspan="2" style="color:#64748b;text-align:center;padding:20px">Sin datos</td></tr>';
}

function renderLog(){
  var q=(document.getElementById('log-search').value||'').toLowerCase();
  var rows=EVLOG.filter(function(r){
    if(logFilter!=='all'&&r.tp!==logFilter)return false;
    if(q)return r.st.toLowerCase().indexOf(q)>-1||r.tp.toLowerCase().indexOf(q)>-1;
    return true;
  });
  if(sortCol==='elapsed')rows.sort(function(a,b){var av=a.el||0,bv=b.el||0;return sortAsc?av-bv:bv-av;});
  if(sortCol==='duration')rows.sort(function(a,b){var av=a.du||0,bv=b.du||0;return sortAsc?av-bv:bv-av;});
  var html='';
  var shown=rows.slice(0,500);
  for(var li=0;li<shown.length;li++){
    var r=shown[li],c=SC[r.st]||'#94a3b8';
    html+='<tr><td class="muted">'+r.n+'</td><td><code style="font-size:11px;color:#67e8f9">'+r.tp+'</code></td><td><span class="stage-dot" style="background:'+c+'"></span>'+r.st+'</td><td>'+fMs(r.el)+'</td><td class="muted">'+fMs(r.du)+'</td></tr>';
  }
  var cnt=document.getElementById('log-count');if(cnt)cnt.textContent='('+rows.length+' eventos)';
  document.getElementById('log-tbody').innerHTML=html||'<tr><td colspan="5" style="text-align:center;padding:24px;color:#64748b">Sin eventos para los filtros seleccionados.</td></tr>';
}

function setFilter(f,btn){
  logFilter=f;
  document.querySelectorAll('.filter-btn').forEach(function(b){b.classList.remove('on');});
  if(btn)btn.classList.add('on');
  renderLog();
}

function toggleChart(type){
  document.querySelectorAll('.chart-toggle-btn').forEach(function(b){b.classList.remove('on');});
  var btn=document.querySelector('.chart-toggle-btn[data-type="'+type+'"]');
  if(btn)btn.classList.add('on');
  if(temporalChart){
    var ds=temporalChart.data.datasets[0];
    if(type==='line'){
      ds.borderColor='#22d3ee';
      ds.borderWidth=2;
      ds.pointBackgroundColor=TC;
      ds.pointBorderColor='transparent';
      ds.pointRadius=5;
      ds.pointHoverRadius=7;
      ds.tension=0.35;
      ds.fill=false;
    } else {
      ds.borderColor=undefined;
      ds.borderWidth=undefined;
      ds.pointBackgroundColor=undefined;
      ds.pointBorderColor=undefined;
      ds.pointRadius=undefined;
      ds.pointHoverRadius=undefined;
      ds.tension=undefined;
      ds.fill=undefined;
    }
    temporalChart.config.type=type;
    temporalChart.update();
  }
}
`

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kai Debug Lab &#8212; Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"><\/script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#020617;--sf:#0f172a;--sf2:#1e293b;--bd:rgba(255,255,255,.08);--bdh:rgba(255,255,255,.14);--tx:#e2e8f0;--mu:#94a3b8;--mu2:#64748b;--cy:#22d3ee;--r:12px;--rsm:8px}
html,body{height:100%;scroll-behavior:smooth}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--tx);font-size:14px;line-height:1.5;overflow-x:hidden}
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background-image:linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);background-size:34px 34px}
.hdr{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 24px;height:58px;background:rgba(2,6,23,.95);border-bottom:1px solid var(--bd);backdrop-filter:blur(20px)}
.brand{display:flex;align-items:center;gap:10px}
.logo{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#22d3ee,#60a5fa);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#020617;flex-shrink:0;letter-spacing:-.5px}
.brand-name{font-size:14px;font-weight:700}
.brand-sub{font-size:11px;color:var(--mu)}
.meta-row{display:flex;gap:20px}
@media(max-width:860px){.meta-row{display:none}}
.mi{text-align:right}
.mi-lbl{font-size:10px;color:var(--mu2);text-transform:uppercase;letter-spacing:.05em}
.mi-val{font-size:12px;font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tabs{display:flex;gap:2px;padding:0 24px;background:var(--bg);border-bottom:1px solid var(--bd);position:sticky;top:58px;z-index:99;overflow-x:auto}
.tab-btn{padding:10px 16px;border:none;background:transparent;color:var(--mu);font-size:13px;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;white-space:nowrap;margin-bottom:-1px}
.tab-btn:hover{color:var(--tx);background:rgba(255,255,255,.03)}
.tab-btn.active{color:var(--cy);border-bottom-color:var(--cy)}
.content{position:relative;z-index:1}
.tab-panel{display:none;padding:24px;max-width:1600px;margin:0 auto}
.tab-panel.active{display:block}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:12px;margin-bottom:4px}
.kpi-hero{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:4px}
.kpi{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);padding:14px 16px;border-left:3px solid var(--cy);transition:background .15s,transform .15s}
.kpi:hover{background:rgba(26,39,68,.9);transform:translateY(-1px)}
.kpi-hero .kpi{padding:20px 22px}
.kpi-hero .kpi-val{font-size:30px}
.kpi-label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--mu2);margin-bottom:5px}
.kpi-val{font-size:20px;font-weight:800;line-height:1.1}
.kpi-sub{font-size:11px;color:var(--mu);margin-top:3px}
.sec-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--mu2);margin:14px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--bd)}
.g3{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:16px}
@media(max-width:1100px){.kpi-hero{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:1fr 1fr}}
@media(max-width:700px){.kpi-hero{grid-template-columns:1fr}.g3{grid-template-columns:1fr}}
.card{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);padding:18px;margin-bottom:14px}
.card-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px}
.card-ttl{font-size:13px;font-weight:600}
.card-stats{font-size:11px;color:var(--mu)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.g4{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:1000px){.g2,.g4{grid-template-columns:1fr}}
.kv{display:grid;gap:7px}
.kv-row{display:grid;grid-template-columns:124px 1fr;gap:8px;font-size:13px;align-items:start}
.kv-lbl{color:var(--mu)}
.kv-val{font-weight:500;word-break:break-word}
.prompt-pre{background:var(--sf2);border:1px solid var(--bd);border-radius:var(--rsm);padding:14px;font-size:12px;line-height:1.7;color:#cbd5e1;white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto}
.cw{position:relative;height:268px}
.cw-lg{position:relative;height:340px}
.phase-row{display:grid;grid-template-columns:96px 1fr 76px;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.phase-row:last-child{border-bottom:none}
.phase-lbl{font-size:12px;color:var(--mu)}
.bar-track{height:8px;background:rgba(255,255,255,.06);border-radius:999px;overflow:hidden}
.bar-fill{height:100%;border-radius:999px}
.phase-val{font-size:12px;font-weight:700;text-align:right}
.tool-card{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);margin-bottom:10px;overflow:hidden}
.tc-hdr{display:flex;align-items:flex-start;gap:14px;padding:16px;cursor:pointer;user-select:none;transition:background .12s}
.tc-hdr:hover{background:rgba(255,255,255,.025)}
.tool-badge{width:32px;height:32px;border-radius:8px;flex-shrink:0;background:rgba(232,121,249,.12);border:1px solid rgba(232,121,249,.25);color:#e879f9;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}
.tool-info{flex:1;min-width:0}
.tool-info h3{font-size:14px;font-weight:600}
.tool-meta{display:flex;gap:10px;align-items:center;margin-top:4px}
.tog{color:var(--mu2);font-size:11px;transition:transform .2s;flex-shrink:0;margin-top:3px}
.tog.open{transform:rotate(180deg)}
.tool-body{display:none;padding:16px;border-top:1px solid var(--bd);grid-template-columns:1fr 1fr;gap:16px}
.tool-body.open{display:grid}
@media(max-width:700px){.tool-body.open{grid-template-columns:1fr}}
.ts h4{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--mu2);margin-bottom:8px}
pre{background:var(--sf2);border:1px solid var(--bd);border-radius:var(--rsm);padding:12px;font-size:11.5px;color:#cbd5e1;white-space:pre-wrap;word-break:break-all;overflow-y:auto;max-height:340px;font-family:'Cascadia Code','JetBrains Mono','Fira Code',monospace}
.chip{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:600}
.chip-s{background:rgba(52,211,153,.12);color:#34d399;border:1px solid rgba(52,211,153,.22)}
.chip-e{background:rgba(251,113,133,.12);color:#fb7185;border:1px solid rgba(251,113,133,.22)}
.chip-n{background:rgba(148,163,184,.12);color:#94a3b8;border:1px solid rgba(148,163,184,.22)}
.log-bar{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center}
.log-search{padding:6px 12px;background:var(--sf);border:1px solid var(--bd);border-radius:var(--rsm);color:var(--tx);font-size:12px;min-width:200px}
.log-search:focus{outline:none;border-color:var(--cy)}
.filter-btn,.chart-toggle-btn{padding:4px 12px;border-radius:999px;border:1px solid var(--bd);background:transparent;color:var(--mu);font-size:12px;cursor:pointer;transition:all .12s}
.filter-btn:hover,.filter-btn.on,.chart-toggle-btn:hover,.chart-toggle-btn.on{background:rgba(34,211,238,.1);border-color:rgba(34,211,238,.35);color:var(--cy)}
.log-wrap{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden}
.log-tbl,.data-tbl{width:100%;border-collapse:collapse}
.log-tbl th,.data-tbl th{text-align:left;padding:9px 14px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--mu2);border-bottom:1px solid var(--bd);background:var(--sf2);white-space:nowrap}
th[data-sort]{cursor:pointer;user-select:none}
th[data-sort]:hover{color:var(--tx)}
th[data-sort]::after{content:' ⇅';opacity:.4}
th.sort-asc::after{content:' ↑';opacity:1;color:var(--cy)}
th.sort-desc::after{content:' ↓';opacity:1;color:var(--cy)}
.log-tbl td,.data-tbl td{padding:7px 14px;font-size:12px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:top}
.log-tbl tr:last-child td,.data-tbl tr:last-child td{border-bottom:none}
.log-tbl tr:hover td,.data-tbl tr:hover td{background:rgba(255,255,255,.025)}
.stage-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:middle}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
.empty{padding:48px;text-align:center;color:var(--mu);font-size:13px}
.muted{color:var(--mu)}
.badge-count{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:rgba(34,211,238,.15);color:var(--cy);font-size:10px;font-weight:700;margin-left:6px}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.18)}
</style>
</head>
<body>
<header class="hdr">
  <div class="brand">
    <div class="logo">KI</div>
    <div>
      <div class="brand-name">Kai Debug Lab</div>
      <div class="brand-sub">Dashboard interactivo de trazabilidad</div>
    </div>
  </div>
  <div class="meta-row">
    <div class="mi"><div class="mi-lbl">Chat ID</div><div class="mi-val">${escapeHtml(chatId || 'Todos')}</div></div>
    <div class="mi"><div class="mi-lbl">Request</div><div class="mi-val">${escapeHtml(metrics.requestId || '-')}</div></div>
    <div class="mi"><div class="mi-lbl">Modelo</div><div class="mi-val">${escapeHtml(metrics.model || '-')}</div></div>
    <div class="mi"><div class="mi-lbl">Generado</div><div class="mi-val">${escapeHtml(now)}</div></div>
  </div>
</header>
<nav class="tabs">
  <button class="tab-btn active" onclick="switchTab('resumen',this)">Resumen</button>
  <button class="tab-btn" onclick="switchTab('temporal',this)">Distribuci&#243;n temporal</button>
  <button class="tab-btn" onclick="switchTab('recursos',this)">Recursos del sistema</button>
  <button class="tab-btn" onclick="switchTab('tools',this)">Tools<span class="badge-count">${tools.length}</span></button>
  <button class="tab-btn" onclick="switchTab('log',this)">Log de eventos<span class="badge-count">${events.length}</span></button>
</nav>
<div class="content">
  <!-- RESUMEN -->
  <div id="tab-resumen" class="tab-panel active">
    <div class="sec-lbl">Rendimiento</div>
    <div class="kpi-hero" id="kpi-perf"></div>
    <div class="sec-lbl">Modelo y contexto</div>
    <div class="kpi-grid" id="kpi-model"></div>
    <div class="sec-lbl">Volumen de tokens</div>
    <div class="kpi-grid" id="kpi-tokens"></div>
    <div class="sec-lbl">Detalle</div>
    <div class="g3">
      <div class="card" style="margin-bottom:0">
        <div class="card-hdr"><span class="card-ttl">Petici&#243;n enviada</span></div>
        <div class="prompt-pre">${escapeHtml(promptPreview)}</div>
      </div>
      <div class="card" style="margin-bottom:0"><div class="card-hdr"><span class="card-ttl">Hardware del sistema</span></div><div class="kv" id="hw-kv"></div></div>
      <div class="card" style="margin-bottom:0"><div class="card-hdr"><span class="card-ttl">Tiempos del pipeline</span></div><div class="kv" id="timing-kv"></div></div>
    </div>
  </div>
  <!-- TEMPORAL -->
  <div id="tab-temporal" class="tab-panel">
    <div class="card">
      <div class="card-hdr">
        <span class="card-ttl">Distribuci&#243;n temporal del pipeline</span>
        <div style="display:flex;gap:6px">
          <button class="chart-toggle-btn on" data-type="bar" onclick="toggleChart('bar')">Barras</button>
          <button class="chart-toggle-btn" data-type="line" onclick="toggleChart('line')">L&#237;nea</button>
        </div>
      </div>
      <div class="cw-lg"><canvas id="chart-temporal"></canvas></div>
    </div>
    <div class="g2">
      <div class="card">
        <div class="card-hdr"><span class="card-ttl">Desglose por fase</span></div>
        <div id="phase-bars"></div>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <table class="data-tbl">
          <thead><tr><th data-sort="fase">Fase</th><th data-sort="valor">Duraci&#243;n</th></tr></thead>
          <tbody id="tmp-tbody"></tbody>
        </table>
      </div>
    </div>
  </div>
  <!-- RECURSOS -->
  <div id="tab-recursos" class="tab-panel">
    <div class="g4">
      <div class="card"><div class="card-hdr"><span class="card-ttl">Uso de CPU</span><span class="card-stats" id="cpu-stats"></span></div><div class="cw"><canvas id="chart-cpu"></canvas></div></div>
      <div class="card"><div class="card-hdr"><span class="card-ttl">Uso de RAM</span><span class="card-stats" id="ram-stats"></span></div><div class="cw"><canvas id="chart-ram"></canvas></div></div>
      <div class="card"><div class="card-hdr"><span class="card-ttl">Uso de GPU</span><span class="card-stats" id="gpu-stats"></span></div><div class="cw"><canvas id="chart-gpu"></canvas></div></div>
      <div class="card"><div class="card-hdr"><span class="card-ttl">Uso de VRAM</span><span class="card-stats" id="vram-stats"></span></div><div class="cw"><canvas id="chart-vram"></canvas></div></div>
    </div>
  </div>
  <!-- TOOLS -->
  <div id="tab-tools" class="tab-panel">
    ${tools.length > 0 ? `<div class="card" style="padding:0;overflow:hidden"><table class="data-tbl"><thead><tr><th>#</th><th>Tool</th><th>Estado</th><th>Duraci&#243;n</th></tr></thead><tbody>${toolRows}</tbody></table></div><div style="margin-top:16px">${toolCards}</div>` : '<div class="empty">No se ejecutaron tools en esta petici&#243;n.</div>'}
  </div>
  <!-- LOG -->
  <div id="tab-log" class="tab-panel">
    <div class="log-bar">
      <input class="log-search" id="log-search" type="text" placeholder="Filtrar por stage o tipo..." oninput="renderLog()">
      <button class="filter-btn on" onclick="setFilter('all',this)">Todos</button>
      <button class="filter-btn" onclick="setFilter('debug',this)">debug</button>
      <button class="filter-btn" onclick="setFilter('token',this)">token</button>
      <button class="filter-btn" onclick="setFilter('done',this)">done</button>
      <button class="filter-btn" onclick="setFilter('error',this)">error</button>
      <span class="muted" id="log-count" style="font-size:12px;margin-left:4px"></span>
    </div>
    <div class="log-wrap">
      <table class="log-tbl">
        <thead><tr><th>#</th><th>Tipo</th><th>Stage</th><th data-sort="elapsed">Elapsed</th><th data-sort="duration">Duration</th></tr></thead>
        <tbody id="log-tbody"></tbody>
      </table>
    </div>
  </div>
</div>
<script>${inlineJs}<\/script>
</body>
</html>`
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
  const [systemInfo, setSystemInfo] = useState<DebugLabHardwareInfo | null>(null)
  const [resourceSamples, setResourceSamples] = useState<ResourceUsageSample[]>([])
  const previousLatestNodeId = useRef<string | null>(null)
  const traceStartedAt = useRef<number | null>(null)
  const sampledNodeMarks = useRef<Set<string>>(new Set())

  useEffect(() => {
    previousLatestNodeId.current = null
    traceStartedAt.current = null
    sampledNodeMarks.current = new Set()
    setEvents([])
    setOutput('')
    setSelectedNodeId(null)
    setSystemInfo(null)
    setResourceSamples([])
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
  const hasEvents = events.length > 0
  const firstEventElapsedMs = numberField(events[0]?.elapsed_ms) ?? 0
  const metrics = useMemo(() => buildMetrics(events), [events])
  const flowNodes = useMemo(() => buildFlowNodes(events), [events])
  const tools = useMemo(() => buildTools(events), [events])
  const latestNodeId = flowNodes.at(-1)?.id ?? null
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
  useEffect(() => {
    if (!latestNodeId || previousLatestNodeId.current === latestNodeId) return

    previousLatestNodeId.current = latestNodeId
    setSelectedNodeId(null)
  }, [latestNodeId])

  useEffect(() => {
    if (!hasEvents) return

    let cancelled = false

    if (traceStartedAt.current === null) {
      traceStartedAt.current = Date.now() - firstEventElapsedMs
    }

    /**
     * Capture one system usage sample for the current debug trace.
     *
     * Args:
     *   elapsedOverride: Optional trace elapsed time assigned to the sample.
     *
     * Returns:
     *   Promise<void>
     */
    const captureSystemSample = async (elapsedOverride?: number): Promise<void> => {
      try {
        const snapshot = await window.electronAPI.getDebugLabSystemSnapshot()

        if (cancelled) return

        const elapsedMs =
          typeof elapsedOverride === 'number'
            ? elapsedOverride
            : Math.max(0, Date.now() - (traceStartedAt.current ?? Date.now()))
        setSystemInfo(snapshot.hardware)
        setResourceSamples((current) =>
          [
            ...current,
            {
              ...snapshot.sample,
              elapsedMs
            }
          ].slice(-300)
        )
      } catch (error) {
        console.error('No se pudo capturar uso del sistema:', error)
      }
    }

    const marks = flowNodes.flatMap((node) => [
      { key: `${node.id}:start`, elapsedMs: node.elapsedMs },
      {
        key: `${node.id}:end`,
        elapsedMs:
          typeof node.elapsedMs === 'number'
            ? node.elapsedMs + (typeof node.durationMs === 'number' ? node.durationMs : 0)
            : undefined
      }
    ])

    for (const mark of marks) {
      if (typeof mark.elapsedMs !== 'number' || sampledNodeMarks.current.has(mark.key)) continue

      sampledNodeMarks.current.add(mark.key)
      void captureSystemSample(mark.elapsedMs)
    }

    if (!running) {
      return () => {
        cancelled = true
      }
    }

    return () => {
      cancelled = true
    }
  }, [firstEventElapsedMs, flowNodes, hasEvents, running])

  /**
   * Export a ZIP report for the current debug trace.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   void
   */
  const exportReport = async () => {
    if (events.length === 0 || exporting || running) return

    try {
      setExporting(true)
      let reportSystemInfo = systemInfo
      let reportResourceSamples = resourceSamples

      try {
        const snapshot = await window.electronAPI.getDebugLabSystemSnapshot()
        const elapsedMs = Math.max(0, Date.now() - (traceStartedAt.current ?? Date.now()))
        reportSystemInfo = snapshot.hardware
        reportResourceSamples = [
          ...reportResourceSamples,
          {
            ...snapshot.sample,
            elapsedMs
          }
        ]
      } catch (error) {
        console.error('No se pudo preparar el snapshot del informe:', error)
      }

      const chartImages = await buildReportChartImages(metrics, flowNodes, reportResourceSamples)
      const html = buildReportHtml({
        chatId: targetChatId,
        metrics,
        events,
        outputContentLength: output.length,
        tools,
        flowNodes,
        systemInfo: reportSystemInfo,
        resourceSamples: reportResourceSamples,
        chartImages
      })
      const dashboardHtml = buildDashboardHtml({
        chatId: targetChatId,
        metrics,
        events,
        outputContentLength: output.length,
        tools,
        flowNodes,
        systemInfo: reportSystemInfo,
        resourceSamples: reportResourceSamples
      })
      const csvFiles = buildReportCsvFiles(metrics, flowNodes, reportResourceSamples)
      const result = await window.electronAPI.exportDebugLabReport({
        html,
        dashboardHtml,
        csvFiles,
        modelOutput: output
      })

      if (!result.ok && !result.cancelled) {
        console.error('No se pudo exportar el informe:', result.error)
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
    previousLatestNodeId.current = null
    traceStartedAt.current = null
    sampledNodeMarks.current = new Set()
    setEvents([])
    setOutput('')
    setSelectedNodeId(null)
    setSystemInfo(null)
    setResourceSamples([])
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
            label={exporting ? 'Exportando' : 'ZIP'}
            disabled={events.length === 0 || exporting || running}
            onClick={() => void exportReport()}
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
                  focusedNodeId={selectedNodeId ?? latestNodeId}
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

/**
 * Render the interactive React Flow canvas and keep the focused node centered.
 *
 * Args:
 *   nodes: Graph nodes rendered by React Flow.
 *   edges: Graph edges rendered by React Flow.
 *   focusedNodeId: Node that should own the viewport focus.
 *   onSelectNode: Stores the node selected by the user.
 *
 * Returns:
 *   React.JSX.Element
 */
function FlowCanvas({
  nodes,
  edges,
  focusedNodeId,
  onSelectNode
}: {
  nodes: DebugGraphNode[]
  edges: DebugGraphEdge[]
  focusedNodeId: string | null
  onSelectNode: (nodeId: string) => void
}) {
  const flow = useReactFlow<DebugGraphNode, DebugGraphEdge>()

  useEffect(() => {
    if (!focusedNodeId) return

    const focusedNode = nodes.find((node) => node.id === focusedNodeId)
    if (!focusedNode) return

    const timeout = window.setTimeout(() => {
      flow.setCenter(
        focusedNode.position.x + NODE_SIZE / 2,
        focusedNode.position.y + NODE_SIZE / 2,
        {
          duration: 360,
          zoom: 0.95
        }
      )
    }, 50)

    return () => window.clearTimeout(timeout)
  }, [flow, focusedNodeId, nodes])

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
        style={{ opacity: 0, top: -NODE_HANDLE_GAP, pointerEvents: 'none' }}
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
            : `radial-gradient(circle at 40% 30%, ${data.softColor}, #020617 62%)`,
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
            ? 'Rama tool'
            : 'Flujo principal'}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        style={{
          opacity: 0,
          top: NODE_SIZE + NODE_HANDLE_GAP,
          bottom: 'auto',
          pointerEvents: 'none'
        }}
      />
    </div>
  )
}

/**
 * Return the latest displayable message attached to a flow node.
 *
 * Args:
 *   node: Flow node being inspected.
 *   latest: Most recent debug event associated with the node.
 *
 * Returns:
 *   string | null
 */
function getNodeMessage(node: FlowNode, latest?: DebugLabEvent): string | null {
  if (node.stage === 'token') return null

  const message = latest?.message || latest?.content

  if (!message || !message.trim() || message.trim() === '-') {
    return null
  }

  return formatEscapedMessage(message)
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
  const matchingToolStep = typeof latest?.step === 'number' ? latest.step : undefined
  const matchingTools = tools.filter((tool) => {
    const sameName = matchingToolName ? tool.name === matchingToolName : true
    const sameStep = typeof matchingToolStep === 'number' ? tool.step === matchingToolStep : true
    return sameName && sameStep
  })
  const matchingTool = matchingTools.at(-1)
  const toolName = matchingToolName || matchingTool?.name || '-'
  const inputPayload =
    latest?.parsed_arguments ?? latest?.arguments ?? matchingTool?.arguments ?? '-'
  const outputPayload = latest?.result ?? matchingTool?.result ?? '-'
  const toolStatus = stringField(latest?.status) || matchingTool?.status || '-'
  const toolDurationMs =
    typeof latest?.duration_ms === 'number' ? latest.duration_ms : matchingTool?.durationMs

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
                <InfoLine label="Tool" value={toolName} highlightColor={config.color} />
                <InfoLine label="Estado" value={toolStatus} />
                <InfoLine label="Duracion real" value={formatMs(toolDurationMs)} />
                {node.stage === 'tool_selected' ? (
                  <>
                    <InfoLine label="Entrada parseada" value={compactJson(inputPayload)} multiline />
                    <InfoLine label="Entrada raw" value={compactJson(latest?.arguments ?? '-')} multiline />
                  </>
                ) : (
                  <>
                    <InfoLine label="Entrada usada" value={compactJson(inputPayload)} multiline />
                    <InfoLine label="Respuesta de la tool" value={compactJson(outputPayload)} multiline />
                  </>
                )}
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
function IconButton({
  label,
  disabled,
  onClick,
  children
}: {
  label: string
  disabled?: boolean
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
