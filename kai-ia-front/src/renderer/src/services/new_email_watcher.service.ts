import {
  checkHistoryChanges,
  extractAddedMessageIds,
  extractNewestHistoryId,
  getLatestHistoryId,
  hasHistoryChanges,
  readHistorySince
} from './gmail_history.service'
import { readEmailById, type GmailApiEmail } from './gmail_email.service'
import { showSystemNotification } from './notifications.service'

type NewEmailWatcherOptions = {
  intervalMs?: number
  onNewEmail?: (email: GmailApiEmail) => void | Promise<void>
  onError?: (error: unknown) => void
}

type NewEmailWatcherController = {
  start: () => Promise<void>
  stop: () => void
  isRunning: () => boolean
}

const STORAGE_PROCESSED_IDS_KEY = 'kai_processed_email_ids'
const MAX_PROCESSED_IDS = 300
const MAX_NOTIFICATION_PREVIEW_LENGTH = 220

/**
 * Load message ids that have already triggered notifications.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   Set<string>
 */
function loadProcessedIds(): Set<string> {

  try {
    const raw = localStorage.getItem(STORAGE_PROCESSED_IDS_KEY)
    if (!raw) return new Set<string>()

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set<string>()

    return new Set(parsed.filter((value) => typeof value === 'string'))
  } catch {
    return new Set<string>()
  }
}

/**
 * Persist the bounded set of processed message ids.
 *
 * Args:
 *   ids: Message ids that should not trigger duplicate notifications.
 *
 * Returns:
 *   void
 */
function saveProcessedIds(ids: Set<string>): void {

  try {
    const trimmed = Array.from(ids).slice(-MAX_PROCESSED_IDS)
    localStorage.setItem(STORAGE_PROCESSED_IDS_KEY, JSON.stringify(trimmed))
  } catch {}
}

/**
 * Decode HTML entities into readable text.
 *
 * Args:
 *   value: Text that may contain escaped HTML entities.
 *
 * Returns:
 *   string
 */
function decodeHtmlEntities(value: string): string {

  const textarea = document.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value
}

/**
 * Convert HTML fragments into notification-friendly plain text.
 *
 * Args:
 *   value: Email body or snippet that may contain HTML markup.
 *
 * Returns:
 *   string
 */
function htmlToPreviewText(value: string): string {

  return decodeHtmlEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<(br|hr)\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|td|th|h[1-6]|section|article|blockquote)>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
}

/**
 * Convert common Markdown syntax into readable plain text.
 *
 * Args:
 *   value: Email body or snippet that may contain Markdown.
 *
 * Returns:
 *   string
 */
function markdownToPreviewText(value: string): string {

  return value
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```[a-zA-Z0-9_-]*\s?|```/g, ' '))
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~`]+/g, '')
}

/**
 * Normalize text spacing and trim it for native desktop notifications.
 *
 * Args:
 *   value: Raw preview text.
 *
 * Returns:
 *   string
 */
function compactNotificationPreview(value: string): string {

  const compacted = value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .replace(/[ \t]*\n[ \t]*/g, ' - ')
    .trim()

  if (compacted.length <= MAX_NOTIFICATION_PREVIEW_LENGTH) return compacted

  return `${compacted.slice(0, MAX_NOTIFICATION_PREVIEW_LENGTH - 3).trimEnd()}...`
}

/**
 * Build a plain-text preview from HTML, Markdown or raw email text.
 *
 * Args:
 *   email: Gmail message used by the notification.
 *
 * Returns:
 *   string
 */
function buildNotificationPreview(email: GmailApiEmail): string {

  const source = [email.body, email.snippet]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value))

  if (!source) return ''

  const textFromHtml = htmlToPreviewText(source)
  const textFromMarkdown = markdownToPreviewText(textFromHtml)

  return compactNotificationPreview(textFromMarkdown)
}

/**
 * Build the body text for a new email desktop notification.
 *
 * Args:
 *   email: Gmail message used by the notification.
 *
 * Returns:
 *   string
 */
function buildNotificationBody(email: GmailApiEmail): string {

  const sender = email.sender?.trim() || 'Remitente desconocido'
  const subject = email.subject?.trim() || '(sin asunto)'
  const preview = buildNotificationPreview(email)
  return [sender, subject, preview].filter(Boolean).join('\n')
}

/**
 * Create a session-scoped Gmail watcher for newly arrived inbox messages.
 *
 * Args:
 *   options: Watch interval and callbacks for new mail or errors.
 *
 * Returns:
 *   NewEmailWatcherController
 */
export function createNewEmailWatcher(
  options: NewEmailWatcherOptions = {}
): NewEmailWatcherController {

  const intervalMs = options.intervalMs ?? 20000

  let intervalId: number | null = null
  let running = false
  let polling = false
  let currentHistoryId: string | null = null
  const processedIds = loadProcessedIds()

  const sessionNotifiedIds = new Set<string>()

  /**
   * Run the new-email callback and show the desktop notification.
   *
   * Args:
   *   email: Gmail message that arrived during this app session.
   *
   * Returns:
   *   Promise<void>
   */
  const notifyNewEmail = async (email: GmailApiEmail): Promise<void> => {

    if (options.onNewEmail) {
      await options.onNewEmail(email)
    }

    await showSystemNotification({
      title: 'Nuevo correo recibido',
      body: buildNotificationBody(email),
      silent: false,
      data: {
        type: 'email',
        messageId: email.id
      }
    })
  }

  /**
   * Check Gmail history once and notify for unseen session messages.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
  const poll = async (): Promise<void> => {

    if (!running || polling) return
    polling = true

    try {
      if (!currentHistoryId) {
        currentHistoryId = await getLatestHistoryId()
        return
      }

      const checkResult = await checkHistoryChanges({
        start_history_id: currentHistoryId,
        label_id: 'INBOX'
      })

      const nextFromCheck = extractNewestHistoryId(checkResult)
      const changed = hasHistoryChanges(checkResult)

      if (checkResult.needs_rebootstrap) {
        currentHistoryId = await getLatestHistoryId()
        return
      }

      if (!changed) {
        if (nextFromCheck) {
          currentHistoryId = nextFromCheck
        }
        return
      }

      const readResult = await readHistorySince({
        start_history_id: currentHistoryId,
        label_id: 'INBOX'
      })

      const messageIds = extractAddedMessageIds(readResult)
      const nextHistoryId = extractNewestHistoryId(readResult) ?? nextFromCheck ?? currentHistoryId

      if (readResult.needs_rebootstrap) {
        currentHistoryId = await getLatestHistoryId()
        return
      }
      for (const messageId of messageIds) {
        if (!messageId) continue
        if (processedIds.has(messageId)) continue
        if (sessionNotifiedIds.has(messageId)) continue

        try {
          const email = await readEmailById(messageId)

          sessionNotifiedIds.add(messageId)
          processedIds.add(messageId)
          saveProcessedIds(processedIds)

          await notifyNewEmail(email)
        } catch (error) {
          options.onError?.(error)
        }
      }

      currentHistoryId = nextHistoryId
    } catch (error) {
      options.onError?.(error)
    } finally {
      polling = false
    }
  }

  return {
    /**
     * Start the watcher and establish the current session baseline.
     *
     * Args:
     *   None.
     *
     * Returns:
     *   Promise<void>
     */
    start: async () => {

      if (running) return
      running = true

      await poll()

      intervalId = window.setInterval(() => {
        void poll()
      }, intervalMs)
    },

    /**
     * Stop polling and clear the active interval.
     *
     * Args:
     *   None.
     *
     * Returns:
     *   void
     */
    stop: () => {

      running = false

      if (intervalId !== null) {
        window.clearInterval(intervalId)
        intervalId = null
      }
    },

    /**
     * Read whether the watcher is currently polling.
     *
     * Args:
     *   None.
     *
     * Returns:
     *   boolean
     */
    isRunning: () => {

      return running
    }
  }
}
