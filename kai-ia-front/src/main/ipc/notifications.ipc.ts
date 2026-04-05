import { ipcMain, BrowserWindow } from 'electron'
import { showSystemNotification } from '../services/system-notifications'

type RegisterNotificationsIpcParams = {
  getMainWindow: () => BrowserWindow | null
}

export function registerNotificationsIpc({
  getMainWindow
}: RegisterNotificationsIpcParams): void {
  ipcMain.handle(
    'system-notifications:show',
    async (
      _event,
      payload: {
        title: string
        body: string
        silent?: boolean
      }
    ) => {
      const mainWindow = getMainWindow()

      showSystemNotification(mainWindow, {
        title: payload.title,
        body: payload.body,
        silent: payload.silent
      })

      return { ok: true }
    }
  )
}