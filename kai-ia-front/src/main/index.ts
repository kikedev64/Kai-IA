import { app, shell, BrowserWindow, ipcMain, dialog, screen } from 'electron'
import path from 'path'
import { writeFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import { registerConfigIpc } from './ipc/config.ipc'
import { resolveStartup } from './services/startup'
import { configRepository } from './db/config.repository'
import { registerNotificationsIpc } from './ipc/notifications.ipc'

let splashWindow: BrowserWindow | null = null
let mainWindow: BrowserWindow | null = null
let onboardingWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let debugWindow: BrowserWindow | null = null

const DEBUG_PANEL_WIDTH = 880
const DEBUG_PANEL_MIN_WIDTH = 700

let currentStartupStatus = {
  step: 'starting',
  message: 'Iniciando Kai IA...'
}

function sendStartupStatus(step: string, message: string): void {
  /**
   * Send a startup progress update to the splash window.
   *
   * Args:
   *   step: Machine-readable startup step.
   *   message: User-facing startup message.
   *
   * Returns:
   *   void
   */

  currentStartupStatus = { step, message }

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('startup:status', currentStartupStatus)
  }
}

function createBaseWindow(options?: Electron.BrowserWindowConstructorOptions): BrowserWindow {
  /**
   * Create a BrowserWindow with the shared app defaults.
   *
   * Args:
   *   options: Optional Electron window options merged into the defaults.
   *
   * Returns:
   *   BrowserWindow
   */

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
  /**
   * Load a renderer route in development or packaged mode.
   *
   * Args:
   *   win: Window that should load the route.
   *   route: Hash route opened in the renderer.
   *
   * Returns:
   *   void
   */

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${route}`)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: route
    })
  }
}

function destroySplashWindow(): void {
  /**
   * Close and clear the splash window when startup finishes.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   void
   */

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
  }
  splashWindow = null
}

function createSplashWindow(): void {
  /**
   * Create the splash window shown during startup checks.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   void
   */

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

function createSettingsWindow(): void {
  /**
   * Open or focus the settings window.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   void
   */

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }

  settingsWindow = createBaseWindow({
    width: 1180,
    height: 820,
    title: 'Configuración - Kai IA',
    resizable: true
  })

  settingsWindow.on('ready-to-show', () => {
    settingsWindow?.show()
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  loadRendererRoute(settingsWindow, '/settings')
}

function getDebugParentWindow(): BrowserWindow | null {
  /**
   * Find the current window that should own the debug panel.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   BrowserWindow | null
   */

  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  if (settingsWindow && !settingsWindow.isDestroyed()) return settingsWindow
  if (onboardingWindow && !onboardingWindow.isDestroyed()) return onboardingWindow
  return null
}

function getDockedDebugBounds(): Electron.Rectangle | null {
  /**
   * Calculate the bounds used to dock Debug Lab next to its parent window.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Electron.Rectangle | null
   */

  const parentWindow = getDebugParentWindow()

  if (!parentWindow) return null

  const parentBounds = parentWindow.getBounds()
  const display = screen.getDisplayMatching(parentBounds)
  const workArea = display.workArea
  const width = Math.min(
    DEBUG_PANEL_WIDTH,
    Math.max(DEBUG_PANEL_MIN_WIDTH, Math.floor(workArea.width * 0.48))
  )
  const height = Math.min(parentBounds.height, workArea.height)
  const maxX = workArea.x + workArea.width - width
  const preferredX = parentBounds.x + parentBounds.width
  const x = Math.max(workArea.x, Math.min(preferredX, maxX))
  const y = Math.max(workArea.y, Math.min(parentBounds.y, workArea.y + workArea.height - height))

  return { x, y, width, height }
}

function syncDebugWindowBounds(): void {
  /**
   * Move the debug window back to its docked position.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   void
   */

  if (!debugWindow || debugWindow.isDestroyed()) return

  const bounds = getDockedDebugBounds()

  if (bounds) {
    debugWindow.setBounds(bounds, true)
  }
}

function createDebugWindow(chatId?: string): void {
  /**
   * Open or refresh the docked Debug Lab window for a chat.
   *
   * Args:
   *   chatId: Optional chat identifier passed to the debug route.
   *
   * Returns:
   *   void
   */

  const route = chatId ? `/debug-lab?chatId=${encodeURIComponent(chatId)}` : '/debug-lab'

  if (debugWindow && !debugWindow.isDestroyed()) {
    loadRendererRoute(debugWindow, route)
    syncDebugWindowBounds()
    debugWindow.show()
    debugWindow.focus()
    return
  }

  const parentWindow = getDebugParentWindow()

  debugWindow = createBaseWindow({
    width: DEBUG_PANEL_WIDTH,
    height: parentWindow?.getBounds().height ?? 860,
    minWidth: DEBUG_PANEL_MIN_WIDTH,
    maxWidth: 1080,
    minHeight: 620,
    parent: parentWindow ?? undefined,
    skipTaskbar: true,
    title: 'Kai IA - Debug Lab',
    resizable: true,
    fullscreenable: false
  })

  const sync = () => syncDebugWindowBounds()

  parentWindow?.on('move', sync)
  parentWindow?.on('resize', sync)
  parentWindow?.on('restore', sync)
  parentWindow?.on('closed', () => {
    if (debugWindow && !debugWindow.isDestroyed()) {
      debugWindow.close()
    }
  })

  debugWindow.on('ready-to-show', () => {
    syncDebugWindowBounds()
    debugWindow?.show()
  })

  debugWindow.on('closed', () => {
    parentWindow?.removeListener('move', sync)
    parentWindow?.removeListener('resize', sync)
    parentWindow?.removeListener('restore', sync)
    debugWindow = null
  })

  syncDebugWindowBounds()
  loadRendererRoute(debugWindow, route)
}

function createMainWindow(): void {
  /**
   * Create the main chat window.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   void
   */

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
  /**
   * Create the onboarding window.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   void
   */

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
  /**
   * Run the splash startup flow and open the correct next window.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */

  createSplashWindow()

  if (!splashWindow) return

  splashWindow.webContents.once('did-finish-load', async () => {
    try {
      sendStartupStatus('local-config', 'Comprobando configuración local...')

      const result = await resolveStartup()

      if (result.route === 'onboarding') {
        sendStartupStatus('onboarding', 'Configuración inicial requerida. Abriendo onboarding...')

        setTimeout(() => {
          createOnboardingWindow()
        }, 500)

        return
      }

      if (result.route === 'main') {
        sendStartupStatus('bootstrap-ok', 'Servicios comprobados correctamente. Abriendo Kai IA...')

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
  registerNotificationsIpc({
    getMainWindow: () => mainWindow
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('window:open-settings', async () => {
    createSettingsWindow()
    return true
  })

  ipcMain.handle('window:open-debug-lab', async (_event, chatId?: string) => {
    createDebugWindow(chatId)
    return true
  })

  ipcMain.handle('debug-lab:export-pdf', async (_event, html: string) => {
    try {
      const saveDialogOptions = {
        title: 'Guardar informe de Debug Lab',
        defaultPath: `kai-debug-lab-${Date.now()}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      }
      const parentWindow = debugWindow ?? mainWindow
      const result = parentWindow
        ? await dialog.showSaveDialog(parentWindow, saveDialogOptions)
        : await dialog.showSaveDialog(saveDialogOptions)

      if (result.canceled || !result.filePath) {
        return { ok: false, cancelled: true }
      }

      const reportWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: false
        }
      })

      await reportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      const pdf = await reportWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: {
          marginType: 'default'
        }
      })

      reportWindow.close()
      await writeFile(result.filePath, pdf)

      return { ok: true, path: result.filePath }
    } catch (error) {
      console.error('Error exportando Debug Lab a PDF:', error)
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      }
    }
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
