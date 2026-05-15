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

function loadProcessedIds(): Set<string> {
  /**
   * Load message ids that have already triggered notifications.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Set<string>
   */

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

function saveProcessedIds(ids: Set<string>): void {
  /**
   * Persist the bounded set of processed message ids.
   *
   * Args:
   *   ids: Message ids that should not trigger duplicate notifications.
   *
   * Returns:
   *   void
   */

  try {
    const trimmed = Array.from(ids).slice(-MAX_PROCESSED_IDS)
    localStorage.setItem(STORAGE_PROCESSED_IDS_KEY, JSON.stringify(trimmed))
  } catch {}
}

function buildNotificationBody(email: GmailApiEmail): string {
  /**
   * Build the body text for a new email desktop notification.
   *
   * Args:
   *   email: Gmail message used by the notification.
   *
   * Returns:
   *   string
   */

  const sender = email.sender?.trim() || 'Remitente desconocido'
  const subject = email.subject?.trim() || '(sin asunto)'
  return `${sender}\n${subject}`
}

export function createNewEmailWatcher(
  options: NewEmailWatcherOptions = {}
): NewEmailWatcherController {
  /**
   * Create a session-scoped Gmail watcher for newly arrived inbox messages.
   *
   * Args:
   *   options: Watch interval and callbacks for new mail or errors.
   *
   * Returns:
   *   NewEmailWatcherController
   */

  const intervalMs = options.intervalMs ?? 20000

  let intervalId: number | null = null
  let running = false
  let polling = false
  let currentHistoryId: string | null = null
  const processedIds = loadProcessedIds()

  const sessionNotifiedIds = new Set<string>()

  const notifyNewEmail = async (email: GmailApiEmail): Promise<void> => {
    /**
     * Run the new-email callback and show the desktop notification.
     *
     * Args:
     *   email: Gmail message that arrived during this app session.
     *
     * Returns:
     *   Promise<void>
     */

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

  const poll = async (): Promise<void> => {
    /**
     * Check Gmail history once and notify for unseen session messages.
     *
     * Args:
     *   None.
     *
     * Returns:
     *   Promise<void>
     */

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
    start: async () => {
      /**
       * Start the watcher and establish the current session baseline.
       *
       * Args:
       *   None.
       *
       * Returns:
       *   Promise<void>
       */

      if (running) return
      running = true

      await poll()

      intervalId = window.setInterval(() => {
        void poll()
      }, intervalMs)
    },

    stop: () => {
      /**
       * Stop polling and clear the active interval.
       *
       * Args:
       *   None.
       *
       * Returns:
       *   void
       */

      running = false

      if (intervalId !== null) {
        window.clearInterval(intervalId)
        intervalId = null
      }
    },

    isRunning: () => {
      /**
       * Read whether the watcher is currently polling.
       *
       * Args:
       *   None.
       *
       * Returns:
       *   boolean
       */

      return running
    }
  }
}
