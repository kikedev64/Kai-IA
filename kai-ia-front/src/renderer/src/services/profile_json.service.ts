/**
 * Check that a parsed value is a plain JSON object.
 *
 * Args:
 *   value: Value returned by JSON parsing.
 *
 * Returns:
 *   value is Record<string, unknown>
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Extract the first balanced JSON object from a model response.
 *
 * Args:
 *   text: Raw model response text.
 *
 * Returns:
 *   string | null
 */
function extractBalancedObject(text: string): string | null {
  const start = text.indexOf('{')

  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < text.length; index += 1) {
    const char = text[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = inString
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char === '{') {
      depth += 1
    }

    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return text.slice(start, index + 1)
      }
    }
  }

  return null
}

/**
 * Build parse candidates from common LLM response shapes.
 *
 * Args:
 *   reply: Raw model response text.
 *
 * Returns:
 *   string[]
 */
function buildJsonCandidates(reply: string): string[] {
  const normalized = reply
    .replace(/^\uFEFF/, '')
    .replace(/[\u201c\u201d]/g, '"')
    .trim()

  const candidates = new Set<string>()
  candidates.add(normalized)

  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi
  let match: RegExpExecArray | null

  while ((match = fencePattern.exec(normalized)) !== null) {
    candidates.add(match[1].trim())
  }

  for (const candidate of [...candidates]) {
    const balanced = extractBalancedObject(candidate)
    if (balanced) {
      candidates.add(balanced)
    }
  }

  return [...candidates]
    .map((candidate) =>
      candidate
        .replace(/^json\s*/i, '')
        .replace(/,\s*([}\]])/g, '$1')
        .trim()
    )
    .filter(Boolean)
}

/**
 * Parse a JSON object returned by the model.
 *
 * Args:
 *   reply: Raw model response text.
 *
 * Returns:
 *   Record<string, unknown>
 */
export function parseProfileJsonReply(reply: string): Record<string, unknown> {
  for (const candidate of buildJsonCandidates(reply)) {
    try {
      const parsed: unknown = JSON.parse(candidate)

      if (typeof parsed === 'string') {
        const nested = JSON.parse(parsed)
        if (isPlainObject(nested)) return nested
      }

      if (isPlainObject(parsed)) return parsed
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error('El modelo no devolvio un JSON valido')
}
