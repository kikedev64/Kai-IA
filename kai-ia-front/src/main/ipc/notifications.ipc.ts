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

export function registerNotificationsIpc({
  getMainWindow
}: RegisterNotificationsIpcParams): void {
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
            mainWindow.webContents.send('system-notifications:email-clicked', {
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