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

  // Persistidos entre sesiones
  const processedIds = loadProcessedIds()

  // Solo en memoria de esta sesión
  const sessionNotifiedIds = new Set<string>()

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

  const poll = async (): Promise<void> => {
    if (!running || polling) return
    polling = true

    try {
      if (!currentHistoryId) {
        // Cada apertura fija un baseline nuevo para no notificar correos antiguos.
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

      // Notificamos solo correos nuevos desde que la app esta abierta.
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
