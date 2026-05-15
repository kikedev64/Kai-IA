import { app, shell, BrowserWindow, ipcMain, dialog, screen } from 'electron'
import path from 'path'
import os from 'os'
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

type DebugLabHardwareInfo = {
  hostname: string
  platform: string
  arch: string
  cpuModel: string
  cpuCores: number
  totalMemoryBytes: number
  gpuDevices: string[]
}

type CpuTotals = {
  idle: number
  total: number
}

let previousCpuTotals: CpuTotals | null = null
let cachedDebugLabHardwareInfo: Promise<DebugLabHardwareInfo> | null = null

/**
 * Read aggregate CPU idle and total times from Node.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   CpuTotals
 */
function readCpuTotals(): CpuTotals {
  return os.cpus().reduce(
    (acc, cpu) => {
      const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0)

      return {
        idle: acc.idle + cpu.times.idle,
        total: acc.total + total
      }
    },
    { idle: 0, total: 0 }
  )
}

/**
 * Calculate system CPU usage since the previous sample.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   number
 */
function readCpuUsagePercent(): number {
  const current = readCpuTotals()
  const previous = previousCpuTotals
  previousCpuTotals = current

  if (!previous) return 0

  const idleDelta = current.idle - previous.idle
  const totalDelta = current.total - previous.total

  if (totalDelta <= 0) return 0

  return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100))
}

/**
 * Build the static hardware block used by Debug Lab reports.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   Promise<DebugLabHardwareInfo>
 */
async function getDebugLabHardwareInfo(): Promise<DebugLabHardwareInfo> {
  if (cachedDebugLabHardwareInfo) return cachedDebugLabHardwareInfo

  cachedDebugLabHardwareInfo = (async () => {
    const cpus = os.cpus()
    const gpuInfo = (await app.getGPUInfo('basic')) as {
      gpuDevice?: Array<{
        active?: boolean
        deviceString?: string
        vendorId?: number
        deviceId?: number
      }>
    }
    const gpuDevices = (gpuInfo.gpuDevice ?? [])
      .map((device) => {
        if (device.deviceString) return device.deviceString

        const ids = [device.vendorId, device.deviceId]
          .filter((value): value is number => typeof value === 'number')
          .map((value) => `0x${value.toString(16)}`)

        return ids.length > 0 ? ids.join(':') : ''
      })
      .filter((value) => value.trim().length > 0)

    return {
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cpuModel: cpus[0]?.model ?? 'CPU desconocida',
      cpuCores: cpus.length,
      totalMemoryBytes: os.totalmem(),
      gpuDevices: gpuDevices.length > 0 ? gpuDevices : ['GPU no detectada']
    }
  })()

  return cachedDebugLabHardwareInfo
}

/**
 * Capture one hardware and resource usage snapshot for Debug Lab.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   Promise<object>
 */
async function getDebugLabSystemSnapshot(): Promise<object> {
  const totalMemoryBytes = os.totalmem()
  const freeMemoryBytes = os.freemem()
  const usedMemoryBytes = totalMemoryBytes - freeMemoryBytes

  return {
    hardware: await getDebugLabHardwareInfo(),
    sample: {
      capturedAt: Date.now(),
      cpuPercent: Number(readCpuUsagePercent().toFixed(2)),
      memoryUsedBytes: usedMemoryBytes,
      memoryFreeBytes: freeMemoryBytes,
      memoryTotalBytes: totalMemoryBytes,
      memoryUsedPercent: Number(((usedMemoryBytes / totalMemoryBytes) * 100).toFixed(2))
    }
  }
}

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
function sendStartupStatus(step: string, message: string): void {
  currentStartupStatus = { step, message }

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('startup:status', currentStartupStatus)
  }
}

/**
 * Create a BrowserWindow with the shared app defaults.
 *
 * Args:
 *   options: Optional Electron window options merged into the defaults.
 *
 * Returns:
 *   BrowserWindow
 */
function createBaseWindow(options?: Electron.BrowserWindowConstructorOptions): BrowserWindow {
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
function loadRendererRoute(win: BrowserWindow, route: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${route}`)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: route
    })
  }
}

/**
 * Close and clear the splash window when startup finishes.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   void
 */
function destroySplashWindow(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
  }
  splashWindow = null
}

/**
 * Create the splash window shown during startup checks.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   void
 */
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

/**
 * Open or focus the settings window.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   void
 */
function createSettingsWindow(): void {
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

/**
 * Find the current window that should own the debug panel.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   BrowserWindow | null
 */
function getDebugParentWindow(): BrowserWindow | null {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  if (settingsWindow && !settingsWindow.isDestroyed()) return settingsWindow
  if (onboardingWindow && !onboardingWindow.isDestroyed()) return onboardingWindow
  return null
}

/**
 * Calculate the bounds used to dock Debug Lab next to its parent window.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   Electron.Rectangle | null
 */
function getDockedDebugBounds(): Electron.Rectangle | null {
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

/**
 * Move the debug window back to its docked position.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   void
 */
function syncDebugWindowBounds(): void {
  if (!debugWindow || debugWindow.isDestroyed()) return

  const bounds = getDockedDebugBounds()

  if (bounds) {
    debugWindow.setBounds(bounds, true)
  }
}

/**
 * Open or refresh the docked Debug Lab window for a chat.
 *
 * Args:
 *   chatId: Optional chat identifier passed to the debug route.
 *
 * Returns:
 *   void
 */
function createDebugWindow(chatId?: string): void {
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

/**
 * Create the main chat window.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   void
 */
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

/**
 * Create the onboarding window.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   void
 */
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

/**
 * Run the splash startup flow and open the correct next window.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   Promise<void>
 */
async function runStartupFlow(): Promise<void> {
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

  ipcMain.handle('debug-lab:get-system-snapshot', async () => {
    return getDebugLabSystemSnapshot()
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
