export type GmailHistoryCheckRequest = {
  start_history_id: string
  label_id?: string
}

export type GmailHistoryReadRequest = {
  start_history_id: string
  label_id?: string
}

export type LatestHistoryIdResponse = {
  ok: boolean
  history_id: string
}

export type GmailHistoryMessage = {
  id?: string
  threadId?: string
  labelIds?: string[]
  [key: string]: unknown
}

export type GmailHistoryMessageAdded = {
  message?: GmailHistoryMessage
  [key: string]: unknown
}

export type GmailHistoryEntry = {
  id?: string
  messages?: GmailHistoryMessage[]
  messagesAdded?: GmailHistoryMessageAdded[]
  [key: string]: unknown
}

export type CheckHistoryChangesResponse = {
  ok: boolean
  has_changes?: boolean
  changed?: boolean
  count_changes?: number
  needs_rebootstrap?: boolean
  message_ids?: string[]
  latest_history_id?: string
  history_id?: string
  history?: GmailHistoryEntry[]
  [key: string]: unknown
}

export type ReadHistoryResponse = {
  ok: boolean
  changed?: boolean
  needs_rebootstrap?: boolean
  message_ids?: string[]
  latest_history_id?: string
  history_id?: string
  history?: GmailHistoryEntry[]
  [key: string]: unknown
}

const DEFAULT_LABEL_ID = 'INBOX'

/**
 * Build the backend base URL from saved local configuration.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   string
 */
async function getBackendBaseUrl(): Promise<string> {

  const backendUrl = await window.configApi.getServerUrl()
  const backendPort = await window.configApi.getServerPort()

  if (!backendUrl || !backendPort) {
    throw new Error('Backend URL o puerto no configurados')
  }

  return `${backendUrl}:${backendPort}`
}

async function parseJsonOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || fallbackMessage)
  }

  return response.json() as Promise<T>
}

/**
 * Load the latest Gmail history id used as watcher baseline.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   Promise<string>
 */
export async function getLatestHistoryId(): Promise<string> {

  const baseUrl = await getBackendBaseUrl()

  const response = await fetch(`${baseUrl}/gmail/history/latest-history-id`, {
    method: 'GET'
  })

  const data = await parseJsonOrThrow<LatestHistoryIdResponse>(
    response,
    'No se pudo obtener latest_history_id'
  )

  if (!data.ok || !data.history_id) {
    throw new Error('Respuesta inválida al obtener latest_history_id')
  }

  return data.history_id
}

/**
 * Check whether Gmail history changed since a known id.
 *
 * Args:
 *   payload: Gmail history check request.
 *
 * Returns:
 *   Promise<CheckHistoryChangesResponse>
 */
export async function checkHistoryChanges(
  payload: GmailHistoryCheckRequest
): Promise<CheckHistoryChangesResponse> {

  const baseUrl = await getBackendBaseUrl()

  const response = await fetch(`${baseUrl}/gmail/history/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      start_history_id: payload.start_history_id,
      label_id: payload.label_id ?? DEFAULT_LABEL_ID
    })
  })

  return parseJsonOrThrow<CheckHistoryChangesResponse>(
    response,
    'No se pudo comprobar si hay cambios en Gmail'
  )
}

/**
 * Read Gmail history entries since a known id.
 *
 * Args:
 *   payload: Gmail history read request.
 *
 * Returns:
 *   Promise<ReadHistoryResponse>
 */
export async function readHistorySince(
  payload: GmailHistoryReadRequest
): Promise<ReadHistoryResponse> {

  const baseUrl = await getBackendBaseUrl()

  const response = await fetch(`${baseUrl}/gmail/history/read`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      start_history_id: payload.start_history_id,
      label_id: payload.label_id ?? DEFAULT_LABEL_ID
    })
  })

  return parseJsonOrThrow<ReadHistoryResponse>(response, 'No se pudo leer el historial de Gmail')
}

/**
 * Determine whether a Gmail history check contains new changes.
 *
 * Args:
 *   data: Gmail history check response.
 *
 * Returns:
 *   boolean
 */
export function hasHistoryChanges(data: CheckHistoryChangesResponse): boolean {

  if (data.has_changes === true) return true
  if (data.changed === true) return true

  if (typeof data.count_changes === 'number' && data.count_changes > 0) {
    return true
  }

  if (Array.isArray(data.history) && data.history.length > 0) {
    return true
  }

  return false
}

/**
 * Extract the newest usable Gmail history id from a response.
 *
 * Args:
 *   data: Gmail history response.
 *
 * Returns:
 *   string | null
 */
export function extractNewestHistoryId(
  data: Partial<CheckHistoryChangesResponse & ReadHistoryResponse> | null | undefined
): string | null {

  if (!data) return null

  const candidates = [data.latest_history_id, data.history_id]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate
    }
  }

  return null
}

/**
 * Collect Gmail message ids added in a history response.
 *
 * Args:
 *   data: Gmail history read response.
 *
 * Returns:
 *   string[]
 */
export function extractAddedMessageIds(
  data: ReadHistoryResponse | CheckHistoryChangesResponse
): string[] {

  const ids = new Set<string>()
  const directMessageIds = Array.isArray(data.message_ids) ? data.message_ids : []

  for (const messageId of directMessageIds) {
    if (typeof messageId === 'string' && messageId.trim()) {
      ids.add(messageId)
    }
  }

  const historyEntries = Array.isArray(data.history) ? data.history : []

  for (const entry of historyEntries) {
    const messagesAdded = Array.isArray(entry.messagesAdded) ? entry.messagesAdded : []

    for (const item of messagesAdded) {
      const messageId = item?.message?.id

      if (typeof messageId === 'string' && messageId.trim()) {
        ids.add(messageId)
      }
    }
  }

  return Array.from(ids)
}
