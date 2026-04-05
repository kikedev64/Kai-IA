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

const STORAGE_HISTORY_ID_KEY = 'kai_gmail_history_id'
const STORAGE_PROCESSED_IDS_KEY = 'kai_processed_email_ids'
const MAX_PROCESSED_IDS = 300

function loadStoredHistoryId(): string | null {
  try {
    return localStorage.getItem(STORAGE_HISTORY_ID_KEY)
  } catch {
    return null
  }
}

function saveStoredHistoryId(historyId: string): void {
  try {
    localStorage.setItem(STORAGE_HISTORY_ID_KEY, historyId)
  } catch {
    // noop
  }
}

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

function saveProcessedIds(ids: Set<string>): void {
  try {
    const trimmed = Array.from(ids).slice(-MAX_PROCESSED_IDS)
    localStorage.setItem(STORAGE_PROCESSED_IDS_KEY, JSON.stringify(trimmed))
  } catch {
    // noop
  }
}

function buildNotificationBody(email: GmailApiEmail): string {
  const sender = email.sender?.trim() || 'Remitente desconocido'
  const subject = email.subject?.trim() || '(sin asunto)'
  return `${sender}\n${subject}`
}

export function createNewEmailWatcher(
  options: NewEmailWatcherOptions = {}
): NewEmailWatcherController {
  const intervalMs = options.intervalMs ?? 20000

  let intervalId: number | null = null
  let running = false
  let polling = false
  let currentHistoryId: string | null = null
  const processedIds = loadProcessedIds()

  const notifyNewEmail = async (email: GmailApiEmail): Promise<void> => {
    await showSystemNotification({
      title: 'Nuevo correo recibido',
      body: buildNotificationBody(email),
      silent: false
    })

    if (options.onNewEmail) {
      await options.onNewEmail(email)
    }
  }

  const poll = async (): Promise<void> => {
    if (!running || polling) return
    polling = true

    try {
      if (!currentHistoryId) {
        currentHistoryId = loadStoredHistoryId()
      }

      if (!currentHistoryId) {
        currentHistoryId = await getLatestHistoryId()
        saveStoredHistoryId(currentHistoryId)
        polling = false
        return
      }

      const checkResult = await checkHistoryChanges({
        start_history_id: currentHistoryId,
        label_id: 'INBOX'
      })

      const nextFromCheck = extractNewestHistoryId(checkResult)
      const changed = hasHistoryChanges(checkResult)

      if (!changed) {
        if (nextFromCheck) {
          currentHistoryId = nextFromCheck
          saveStoredHistoryId(currentHistoryId)
        }
        polling = false
        return
      }

      const readResult = await readHistorySince({
        start_history_id: currentHistoryId,
        label_id: 'INBOX'
      })

      const messageIds = extractAddedMessageIds(readResult)
      const nextHistoryId =
        extractNewestHistoryId(readResult) ??
        nextFromCheck ??
        currentHistoryId

      for (const messageId of messageIds) {
        if (processedIds.has(messageId)) {
          continue
        }

        try {
          const email = await readEmailById(messageId)
          await notifyNewEmail(email)

          processedIds.add(messageId)
          saveProcessedIds(processedIds)
        } catch (error) {
          options.onError?.(error)
        }
      }

      currentHistoryId = nextHistoryId
      saveStoredHistoryId(currentHistoryId)
    } catch (error) {
      options.onError?.(error)
    } finally {
      polling = false
    }
  }

  return {
    start: async () => {
      if (running) return
      running = true

      await poll()

      intervalId = window.setInterval(() => {
        void poll()
      }, intervalMs)
    },

    stop: () => {
      running = false

      if (intervalId !== null) {
        window.clearInterval(intervalId)
        intervalId = null
      }
    },

    isRunning: () => running
  }
}