import { app, shell, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import { registerConfigIpc } from './ipc/config.ipc'
import { resolveStartup } from './services/startup'
import { configRepository } from './db/config.repository'

let splashWindow: BrowserWindow | null = null
let mainWindow: BrowserWindow | null = null
let onboardingWindow: BrowserWindow | null = null

let currentStartupStatus = {
  step: 'starting',
  message: 'Iniciando Kai IA...'
}

function sendStartupStatus(step: string, message: string): void {
  currentStartupStatus = { step, message }

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('startup:status', currentStartupStatus)
  }
}

function createBaseWindow(
  options?: Electron.BrowserWindowConstructorOptions
): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    ...options
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  return win
}

function loadRendererRoute(win: BrowserWindow, route: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${route}`)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: route
    })
  }
}

function destroySplashWindow(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
  }
  splashWindow = null
}

function createSplashWindow(): void {
  splashWindow = createBaseWindow({
    width: 720,
    height: 220,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    frame: false,
    transparent: false,
    backgroundColor: '#020617',
    title: 'Kai IA'
  })

  splashWindow.on('ready-to-show', () => {
    splashWindow?.show()
  })

  splashWindow.on('closed', () => {
    splashWindow = null
  })

  loadRendererRoute(splashWindow, '/splash')
}

function createMainWindow(): void {
  mainWindow = createBaseWindow({
    width: 1200,
    height: 900,
    title: 'Kai IA'
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    destroySplashWindow()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  loadRendererRoute(mainWindow, '/')
}

function createOnboardingWindow(): void {
  onboardingWindow = createBaseWindow({
    width: 1200,
    height: 900,
    title: 'Kai IA - Configuración inicial'
  })

  onboardingWindow.on('ready-to-show', () => {
    onboardingWindow?.show()
    destroySplashWindow()
  })

  onboardingWindow.on('closed', () => {
    onboardingWindow = null
  })

  loadRendererRoute(onboardingWindow, '/onboarding')
}

async function runStartupFlow(): Promise<void> {
  createSplashWindow()

  if (!splashWindow) return

  splashWindow.webContents.once('did-finish-load', async () => {
    try {
      sendStartupStatus('local-config', 'Comprobando configuración local...')

      const result = await resolveStartup()

      if (result.route === 'onboarding') {
        sendStartupStatus(
          'onboarding',
          'Configuración inicial requerida. Abriendo onboarding...'
        )

        setTimeout(() => {
          createOnboardingWindow()
        }, 500)

        return
      }

      if (result.route === 'main') {
        sendStartupStatus(
          'bootstrap-ok',
          'Servicios comprobados correctamente. Abriendo Kai IA...'
        )

        setTimeout(() => {
          createMainWindow()
        }, 500)

        return
      }

      sendStartupStatus('error', `Error de arranque: ${result.error}`)
    } catch (error) {
      sendStartupStatus(
        'error',
        error instanceof Error ? error.message : 'Error desconocido durante el arranque'
      )
    }
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.kai.ia')

  registerConfigIpc()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('startup:get-current-status', () => {
    return currentStartupStatus
  })

  ipcMain.handle('startup:reset-and-open-onboarding', async () => {
  try {
    configRepository.setOnboardingCompleted(false)

    if (onboardingWindow && !onboardingWindow.isDestroyed()) {
      onboardingWindow.focus()
      return true
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide()
    }

    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.hide()
    }

    createOnboardingWindow()

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close()
      mainWindow = null
    }

    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close()
      splashWindow = null
    }

    return true
  } catch (error) {
    console.error('Error reseteando onboarding:', error)
    return false
  }
})

  ipcMain.handle('oauth:open-google-popup', async (_event, authUrl: string) => {
    return await new Promise<{ closed: true }>((resolve, reject) => {
      const parentWindow = mainWindow ?? onboardingWindow ?? splashWindow

      if (!parentWindow) {
        reject(new Error('No hay ventana principal disponible'))
        return
      }

      const authWindow = new BrowserWindow({
        width: 540,
        height: 720,
        parent: parentWindow,
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

      void authWindow.loadURL(authUrl).catch((err) => {
        reject(err)
      })
    })
  })

  runStartupFlow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      runStartupFlow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('startup:complete-onboarding-and-open-main', async () => {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.close()
    onboardingWindow = null
  }

  createMainWindow()
  return true
})