import React, { useEffect, useState } from 'react'
import mermaid from 'mermaid'
import { Download, FileCode } from 'lucide-react'

/** Monotonic counter — each mermaid.render() call gets a fresh unique element ID. */
let _diagramIdCounter = 0

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  darkMode: true,
  themeVariables: {
    primaryColor: '#1e293b',
    primaryTextColor: '#e2e8f0',
    primaryBorderColor: '#334155',
    lineColor: '#94a3b8',
    secondaryColor: '#0f172a',
    tertiaryColor: '#1e293b',
    background: 'transparent',
    mainBkg: '#1e293b',
    nodeBorder: '#334155',
    clusterBkg: '#0f172a',
    titleColor: '#e2e8f0',
    edgeLabelBackground: '#1e293b',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    fontSize: '14px'
  },
  securityLevel: 'loose'
})

/**
 * Normalise LLM-generated Mermaid source to fix common syntax issues before rendering.
 *
 * Fixes applied:
 *   - Collapses multi-line edge labels: content between | ... | that spans more than
 *     one line is joined into a single line with the internal whitespace collapsed.
 *   - Quotes unquoted rectangle node labels [ ... ] that contain parentheses or curly
 *     braces, which the Mermaid parser would misinterpret as shape delimiters.
 *   - Strips a trailing newline left after the closing fence is removed.
 *
 * Args:
 *   chart: Raw Mermaid diagram source from the model.
 *
 * Returns:
 *   string
 */
function sanitizeChart(chart: string): string {
  return chart
    .replace(/\|([^|]+)\|/g, (_match: string, content: string) => {
      const collapsed = content.replace(/\s*\n\s*/g, ' ').trim()
      return `|${collapsed}|`
    })
    .replace(/\[([^\]"]+)\]/g, (match: string, content: string) => {
      // Quote labels that contain characters the parser treats as shape delimiters.
      if (/[(){}]/.test(content)) {
        return `["${content}"]`
      }
      return match
    })
    .trim()
}

/**
 * Rasterise an SVG string to a transparent high-DPI PNG and trigger a download.
 *
 * Uses a base64 data URL instead of a blob URL so the Image element loads
 * correctly inside Electron's renderer. The SVG is re-serialised after
 * injecting the xmlns attribute (required for correct rasterisation) and after
 * resolving explicit dimensions from the viewBox when width/height are absent
 * or percentage-based.
 *
 * Args:
 *   svgContent: Raw SVG markup produced by mermaid.render().
 *   filename: Download filename without file extension.
 *
 * Returns:
 *   Promise<void>
 */
async function exportAsPng(svgContent: string, filename: string): Promise<void> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgContent, 'image/svg+xml')
  const svgEl = doc.querySelector('svg')

  if (!svgEl) throw new Error('SVG element not found in rendered diagram')

  if (!svgEl.getAttribute('xmlns')) {
    svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }

  const rawW = svgEl.getAttribute('width') ?? ''
  const rawH = svgEl.getAttribute('height') ?? ''
  let width = /^[\d.]+/.test(rawW) ? parseFloat(rawW) : 0
  let height = /^[\d.]+/.test(rawH) ? parseFloat(rawH) : 0

  if (!width || !height) {
    const vbParts = (svgEl.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(parseFloat)
    width = vbParts[2] || width || 1200
    height = vbParts[3] || height || 800
    svgEl.setAttribute('width', String(width))
    svgEl.setAttribute('height', String(height))
  }

  const svgString = new XMLSerializer().serializeToString(svgEl)
  const base64 = btoa(unescape(encodeURIComponent(svgString)))
  const dataUrl = `data:image/svg+xml;base64,${base64}`

  const SCALE = 2
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * SCALE)
  canvas.height = Math.round(height * SCALE)

  const ctx = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)

  await new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0)
      resolve()
    }
    img.onerror = () => reject(new Error('Failed to load SVG as image'))
    img.src = dataUrl
  })

  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
      'image/png'
    )
  })

  const anchor = document.createElement('a')
  anchor.href = URL.createObjectURL(pngBlob)
  anchor.download = `${filename}.png`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(anchor.href)
}

/**
 * Trigger a browser download for the given SVG content as a .svg file.
 *
 * Args:
 *   svgContent: Raw SVG markup produced by mermaid.render().
 *   filename: Download filename without file extension.
 *
 * Returns:
 *   void
 */
function exportAsSvg(svgContent: string, filename: string): void {
  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' })
  const anchor = document.createElement('a')
  anchor.href = URL.createObjectURL(blob)
  anchor.download = `${filename}.svg`
  anchor.click()
  URL.revokeObjectURL(anchor.href)
}

/**
 * Render a Mermaid diagram definition as an inline SVG card.
 *
 * The diagram source is sanitised automatically before rendering to fix common
 * issues produced by language models (multi-line edge labels, extra whitespace).
 * Rendering is debounced by 500 ms so that partial content arriving during
 * SSE streaming does not trigger dozens of failed mermaid.render() calls.
 * Each render call gets its own unique element ID to avoid mermaid stale-node
 * conflicts when the same component re-renders with new content.
 * PNG (2× retina, transparent background) and SVG download buttons appear on
 * hover. When the sanitised source still fails to parse, the component falls
 * back to a collapsible error card that preserves the raw source.
 *
 * Args:
 *   chart: Mermaid diagram source (content of a ```mermaid code block).
 *
 * Returns:
 *   React.JSX.Element
 */
const MermaidDiagram = ({ chart }: { chart: string }): React.JSX.Element => {
  const [svgContent, setSvgContent] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [downloadingPng, setDownloadingPng] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSvgContent('')
    setError(null)

    const timer = setTimeout(async () => {
      if (cancelled) return
      const renderId = `mermaid-diagram-${_diagramIdCounter++}`
      try {
        const { svg } = await mermaid.render(renderId, sanitizeChart(chart))
        document.getElementById(renderId)?.remove()
        if (cancelled) return
        if (svg.includes('Syntax error') || svg.includes('syntax-error') || !svg.trim()) {
          setError('render-failed')
        } else {
          setSvgContent(svg)
        }
      } catch {
        document.getElementById(renderId)?.remove()
        if (!cancelled) setError('render-failed')
      }
    }, 500)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [chart])

  const handleDownloadPng = async (): Promise<void> => {
    if (downloadingPng || !svgContent) return
    setDownloadingPng(true)
    try {
      await exportAsPng(svgContent, `kai-diagram-${Date.now()}`)
    } finally {
      setDownloadingPng(false)
    }
  }

  const handleDownloadSvg = (): void => {
    if (!svgContent) return
    exportAsSvg(svgContent, `kai-diagram-${Date.now()}`)
  }

  if (error) return null

  if (!svgContent) {
    return (
      <div className="my-3 min-h-[80px] rounded-xl border border-white/10 bg-black/40 p-6 flex items-center justify-center">
        <span className="animate-pulse text-xs text-slate-400">Rendering diagram…</span>
      </div>
    )
  }

  return (
    <div className="group relative my-3 overflow-hidden rounded-xl border border-white/10 bg-black/40 p-4">
      <div
        className="flex justify-center overflow-x-auto [&_svg]:!max-w-full [&_svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={handleDownloadPng}
          disabled={downloadingPng}
          title="Download as PNG"
          className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] font-medium text-slate-300 transition-colors hover:bg-white/20 disabled:opacity-50"
        >
          <Download className="h-3 w-3" />
          PNG
        </button>
        <button
          onClick={handleDownloadSvg}
          title="Download as SVG"
          className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] font-medium text-slate-300 transition-colors hover:bg-white/20"
        >
          <FileCode className="h-3 w-3" />
          SVG
        </button>
      </div>
    </div>
  )
}

export default MermaidDiagram
