import { BrowserWindow, ipcMain, Notification } from 'electron'
import path from 'path'

type RegisterNotificationsIpcParams = {
  getMainWindow: () => BrowserWindow | null
}

type NotificationPayloadData = {
  type?: 'email'
  messageId?: string
}

type ShowSystemNotificationPayload = {
  title: string
  body: string
  silent?: boolean
  data?: NotificationPayloadData
}

type EmailNotificationClickPayload = {
  messageId: string
}

/**
 * Register IPC handlers for desktop notifications and notification clicks.
 *
 * Args:
 *   options: Accessors used to send clicks back to the main window.
 *
 * Returns:
 *   void
 */
export function registerNotificationsIpc({ getMainWindow }: RegisterNotificationsIpcParams): void {

  let pendingEmailNotificationClicks: EmailNotificationClickPayload[] = []
  const activeNotifications = new Set<Notification>()

  /**
   * Keep a notification click available until the renderer acknowledges it.
   *
   * Args:
   *   payload: Email notification click payload.
   *
   * Returns:
   *   void
   */
  const addPendingEmailNotificationClick = (payload: EmailNotificationClickPayload): void => {

    if (
      pendingEmailNotificationClicks.some(
        (pendingPayload) => pendingPayload.messageId === payload.messageId
      )
    ) {
      return
    }

    pendingEmailNotificationClicks = [...pendingEmailNotificationClicks, payload]
  }

  /**
   * Remove acknowledged notification clicks from the pending queue.
   *
   * Args:
   *   messageId: Optional message id to clear. If omitted, the full queue is cleared.
   *
   * Returns:
   *   void
   */
  const clearPendingEmailNotificationClicks = (messageId?: string): void => {

    if (!messageId) {
      pendingEmailNotificationClicks = []
      return
    }

    pendingEmailNotificationClicks = pendingEmailNotificationClicks.filter(
      (payload) => payload.messageId !== messageId
    )
  }

  /**
   * Forward an email notification click to the renderer or keep it pending.
   *
   * Args:
   *   mainWindow: Main app window that should receive the event.
   *   payload: Email notification click payload.
   *
   * Returns:
   *   void
   */
  const sendEmailNotificationClick = (
    mainWindow: BrowserWindow,
    payload: EmailNotificationClickPayload
  ): void => {

    addPendingEmailNotificationClick(payload)

    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', () => {
        const stillPending = pendingEmailNotificationClicks.some(
          (pendingPayload) => pendingPayload.messageId === payload.messageId
        )

        if (stillPending) {
          mainWindow.webContents.send('system-notifications:email-clicked', payload)
        }
      })
      return
    }

    mainWindow.webContents.send('system-notifications:email-clicked', payload)
  }

  ipcMain.handle('system-notifications:get-pending-email-click', async () => {
    const payload = pendingEmailNotificationClicks[0] ?? null

    if (payload) {
      clearPendingEmailNotificationClicks(payload.messageId)
    }

    return payload
  })

  ipcMain.handle(
    'system-notifications:clear-pending-email-click',
    async (_event, messageId?: string) => {
      clearPendingEmailNotificationClicks(messageId)
      return true
    }
  )

  ipcMain.handle(
    'system-notifications:show',
    async (_event, payload: ShowSystemNotificationPayload) => {
      try {
        if (!Notification.isSupported()) {
          return {
            ok: false,
            error: 'Las notificaciones del sistema no están soportadas en este equipo.'
          }
        }

        const notification = new Notification({
          title: payload.title,
          body: payload.body,
          silent: payload.silent ?? false,
          icon: path.join(process.cwd(), 'resources', 'icon.png')
        })
        activeNotifications.add(notification)

        const releaseNotification = (): void => {

          activeNotifications.delete(notification)
        }

        notification.once('close', releaseNotification)
        notification.once('failed', releaseNotification)

        notification.on('click', () => {
          const mainWindow = getMainWindow()

          releaseNotification()

          if (!mainWindow || mainWindow.isDestroyed()) return

          if (mainWindow.isMinimized()) {
            mainWindow.restore()
          }

          mainWindow.show()
          mainWindow.setAlwaysOnTop(true)
          mainWindow.focus()
          mainWindow.setAlwaysOnTop(false)

          if (payload.data?.type === 'email' && payload.data.messageId) {
            sendEmailNotificationClick(mainWindow, {
              messageId: payload.data.messageId
            })
          }
        })

        notification.show()

        return { ok: true }
      } catch (error) {
        console.error('Error mostrando notificación del sistema:', error)

        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Error desconocido'
        }
      }
    }
  )
}
