// main/index.ts
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.kai.ia')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('oauth:open-google-popup', async (_event, authUrl: string) => {
    return await new Promise<{ closed: true }>((resolve, reject) => {
      if (!mainWindow) {
        reject(new Error('Main window no disponible'))
        return
      }

      const authWindow = new BrowserWindow({
        width: 540,
        height: 720,
        parent: mainWindow,
        modal: false,
        autoHideMenuBar: true,
        resizable: true,
        minimizable: false,
        maximizable: false,
        show: false,
        title: 'Conectar Google',
        webPreferences: {
          sandbox: false
        }
      })

      authWindow.once('ready-to-show', () => {
        authWindow.show()
      })

      authWindow.on('closed', () => {
        resolve({ closed: true })
      })

      authWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url)
        return { action: 'deny' }
      })

      authWindow.loadURL(authUrl).catch((err) => {
        reject(err)
      })
    })
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})