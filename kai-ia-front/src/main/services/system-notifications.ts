import { Notification, BrowserWindow } from 'electron'
import { join } from 'path'

type ShowSystemNotificationParams = {
  title: string
  body: string
  silent?: boolean
}

export function showSystemNotification(
  mainWindow: BrowserWindow | null,
  params: ShowSystemNotificationParams
): void {
  if (!Notification.isSupported()) {
    return
  }

  const notification = new Notification({
    title: params.title,
    body: params.body,
    silent: params.silent ?? false,
    icon: join(__dirname, '../../../resources/icon.png')
  })

  notification.on('click', () => {
    if (!mainWindow) return

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }

    mainWindow.show()
    mainWindow.focus()
  })

  notification.show()
}