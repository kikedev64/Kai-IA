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

export function registerNotificationsIpc({
  getMainWindow
}: RegisterNotificationsIpcParams): void {
  let pendingEmailNotificationClick: EmailNotificationClickPayload | null = null

  const sendEmailNotificationClick = (
    mainWindow: BrowserWindow,
    payload: EmailNotificationClickPayload
  ): void => {
    pendingEmailNotificationClick = payload

    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', () => {
        if (pendingEmailNotificationClick) {
          mainWindow.webContents.send(
            'system-notifications:email-clicked',
            pendingEmailNotificationClick
          )
        }
      })
      return
    }

    mainWindow.webContents.send('system-notifications:email-clicked', payload)
  }

  ipcMain.handle('system-notifications:get-pending-email-click', async () => {
    const payload = pendingEmailNotificationClick
    pendingEmailNotificationClick = null
    return payload
  })

  ipcMain.handle(
    'system-notifications:clear-pending-email-click',
    async (_event, messageId?: string) => {
      if (!messageId || pendingEmailNotificationClick?.messageId === messageId) {
        pendingEmailNotificationClick = null
      }
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

        notification.on('click', () => {
          const mainWindow = getMainWindow()

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
