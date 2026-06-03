import { app, shell, BrowserWindow, ipcMain, dialog, screen } from 'electron'
import path from 'path'
import os from 'os'
import { writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import { registerConfigIpc } from './ipc/config.ipc'
import { resolveStartup } from './services/startup'
import { configRepository } from './db/config.repository'
import { registerNotificationsIpc } from './ipc/notifications.ipc'

const execFileAsync = promisify(execFile)

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
  primaryGpuName?: string
  vramTotalBytes?: number
}

type CpuTotals = {
  idle: number
  total: number
}

type DebugLabGpuDevice = {
  name: string
  vramTotalBytes?: number
  dedicated: boolean
}

type NvidiaSmiGpuSample = {
  name: string
  vramTotalBytes: number
  vramUsedBytes: number
  gpuPercent: number
}

type DebugLabCsvFile = {
  filename: string
  content: string
}

type DebugLabReportExportPayload = {
  html: string
  dashboardHtml: string
  csvFiles: DebugLabCsvFile[]
}

let previousCpuTotals: CpuTotals | null = null
let cachedDebugLabHardwareInfo: Promise<DebugLabHardwareInfo> | null = null
let crc32Table: number[] | null = null

/**
 * Run a PowerShell command and parse its JSON output.
 *
 * Args:
 *   command: PowerShell command that emits JSON.
 *
 * Returns:
 *   Promise<unknown>
 */
async function readPowerShellJson(command: string): Promise<unknown> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
    {
      timeout: 2500,
      windowsHide: true
    }
  )
  const text = stdout.trim()

  if (!text) return null

  return JSON.parse(text)
}

/**
 * Normalize the Windows edition name used in the report.
 *
 * Args:
 *   edition: Raw Windows edition returned by the registry.
 *
 * Returns:
 *   string
 */
function normalizeWindowsEdition(edition: string): string {
  const normalized = edition.trim()

  if (/^(professional|pro)$/i.test(normalized)) return 'Profesional'
  if (/^enterprise$/i.test(normalized)) return 'Enterprise'
  if (/^education$/i.test(normalized)) return 'Education'
  if (/^home$/i.test(normalized)) return 'Home'

  return normalized.replace(/\bProfessional\b/i, 'Profesional').replace(/\bPro\b/i, 'Profesional')
}

/**
 * Read the visible Windows name and display version.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   Promise<string | undefined>
 */
async function readWindowsPlatformName(): Promise<string | undefined> {
  if (process.platform !== 'win32') return undefined

  try {
    const raw = await readPowerShellJson(`
      $cv = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
      [pscustomobject]@{
        productName = $cv.ProductName
        editionId = $cv.EditionID
        currentBuild = $cv.CurrentBuild
        ubr = $cv.UBR
        displayVersion = $cv.DisplayVersion
        releaseId = $cv.ReleaseId
      } | ConvertTo-Json -Compress
    `)

    if (!raw || typeof raw !== 'object') return undefined

    const build = 'currentBuild' in raw ? Number(raw.currentBuild) : undefined
    const productName = 'productName' in raw ? String(raw.productName) : ''
    const windowsName =
      Number.isFinite(build) && Number(build) >= 22000 ? 'Windows 11' : productName
    const edition =
      'editionId' in raw && raw.editionId ? normalizeWindowsEdition(String(raw.editionId)) : ''
    const displayVersion =
      'displayVersion' in raw && raw.displayVersion ? String(raw.displayVersion) : undefined
    const releaseId = 'releaseId' in raw && raw.releaseId ? String(raw.releaseId) : undefined
    const buildText =
      'currentBuild' in raw && raw.currentBuild
        ? ['Build', raw.currentBuild, 'ubr' in raw && raw.ubr ? `.${raw.ubr}` : ''].join('')
        : undefined
    const suffix = displayVersion ?? releaseId ?? buildText

    return [windowsName || 'Windows', edition, suffix].filter(Boolean).join(' ')
  } catch {
    return undefined
  }
}

/**
 * Identify integrated GPU names that should not drive the report when a discrete GPU exists.
 *
 * Args:
 *   name: GPU display name.
 *
 * Returns:
 *   boolean
 */
function isIntegratedGpuName(name: string): boolean {
  return /\b(intel|uhd|iris|integrated|microsoft basic|radeon graphics)\b/i.test(name)
}

/**
 * Read NVIDIA GPU usage and VRAM with nvidia-smi when it is available.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   Promise<NvidiaSmiGpuSample[]>
 */
async function readNvidiaSmiGpus(): Promise<NvidiaSmiGpuSample[]> {
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      [
        '--query-gpu=name,memory.total,memory.used,utilization.gpu',
        '--format=csv,noheader,nounits'
      ],
      {
        timeout: 2500,
        windowsHide: true
      }
    )

    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name = '', total = '0', used = '0', usage = '0'] = line
          .split(',')
          .map((part) => part.trim())

        return {
          name,
          vramTotalBytes: Number(total) * 1024 * 1024,
          vramUsedBytes: Number(used) * 1024 * 1024,
          gpuPercent: Number(usage)
        }
      })
      .filter(
        (gpu) =>
          gpu.name.length > 0 &&
          Number.isFinite(gpu.vramTotalBytes) &&
          Number.isFinite(gpu.vramUsedBytes) &&
          Number.isFinite(gpu.gpuPercent)
      )
  } catch {
    return []
  }
}

/**
 * Read GPU names and total VRAM from Windows CIM data.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   Promise<{ devices: DebugLabGpuDevice[]; vramTotalBytes?: number }>
 */
async function readWindowsGpuHardware(): Promise<{
  devices: DebugLabGpuDevice[]
  vramTotalBytes?: number
}> {
  const nvidiaGpus = await readNvidiaSmiGpus()

  if (nvidiaGpus.length > 0) {
    const vramTotalBytes = nvidiaGpus.reduce((total, gpu) => total + gpu.vramTotalBytes, 0)

    return {
      devices: nvidiaGpus.map((gpu) => ({
        name: gpu.name,
        vramTotalBytes: gpu.vramTotalBytes,
        dedicated: true
      })),
      vramTotalBytes
    }
  }

  if (process.platform !== 'win32') return { devices: [] }

  try {
    const raw = await readPowerShellJson(
      'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress'
    )
    const devices = Array.isArray(raw) ? raw : raw ? [raw] : []
    const parsedDevices = devices
      .map<DebugLabGpuDevice | null>((device) => {
        if (!device || typeof device !== 'object' || !('Name' in device)) return null

        const name = String(device.Name).trim()
        const adapterRam =
          'AdapterRAM' in device && Number.isFinite(Number(device.AdapterRAM))
            ? Number(device.AdapterRAM)
            : undefined

        if (!name) return null

        return {
          name,
          vramTotalBytes: adapterRam && adapterRam > 0 ? adapterRam : undefined,
          dedicated: !isIntegratedGpuName(name)
        }
      })
      .filter((device): device is DebugLabGpuDevice => device !== null)
    const selectedDevices = parsedDevices.some((device) => device.dedicated)
      ? parsedDevices.filter((device) => device.dedicated)
      : parsedDevices
    const vramTotalBytes = selectedDevices
      .map((device) => device.vramTotalBytes ?? 0)
      .filter((value) => value > 0)
      .reduce((total, value) => total + value, 0)

    return {
      devices: selectedDevices,
      vramTotalBytes: vramTotalBytes > 0 ? vramTotalBytes : undefined
    }
  } catch {
    return { devices: [] }
  }
}

/**
 * Read Windows GPU and VRAM usage counters.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   Promise<{ gpuPercent?: number; vramUsedBytes?: number }>
 */
async function readWindowsGpuUsage(): Promise<{ gpuPercent?: number; vramUsedBytes?: number }> {
  const nvidiaGpus = await readNvidiaSmiGpus()

  if (nvidiaGpus.length > 0) {
    return {
      gpuPercent: nvidiaGpus.reduce((total, gpu) => total + gpu.gpuPercent, 0) / nvidiaGpus.length,
      vramUsedBytes: nvidiaGpus.reduce((total, gpu) => total + gpu.vramUsedBytes, 0)
    }
  }

  if (process.platform !== 'win32') return {}

  try {
    const raw = await readPowerShellJson(`
      $gpu = (Get-Counter '\\GPU Engine(*)\\Utilization Percentage').CounterSamples |
        Where-Object { $_.InstanceName -match 'engtype_3d|engtype_compute|engtype_copy|engtype_video' } |
        Measure-Object -Property CookedValue -Sum
      $vram = (Get-Counter '\\GPU Adapter Memory(*)\\Dedicated Usage').CounterSamples |
        Measure-Object -Property CookedValue -Sum
      [pscustomobject]@{
        gpuPercent = [math]::Min(100, [math]::Max(0, [double]$gpu.Sum))
        vramUsedBytes = [double]$vram.Sum
      } | ConvertTo-Json -Compress
    `)

    if (!raw || typeof raw !== 'object') return {}

    const gpuPercent = 'gpuPercent' in raw ? Number(raw.gpuPercent) : undefined
    const vramUsedBytes = 'vramUsedBytes' in raw ? Number(raw.vramUsedBytes) : undefined

    return {
      gpuPercent:
        typeof gpuPercent === 'number' && Number.isFinite(gpuPercent) ? gpuPercent : undefined,
      vramUsedBytes:
        typeof vramUsedBytes === 'number' && Number.isFinite(vramUsedBytes)
          ? vramUsedBytes
          : undefined
    }
  } catch {
    return {}
  }
}

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
    const totalMemoryBytes = os.totalmem()
    const platformName = await readWindowsPlatformName()
    const windowsGpu = await readWindowsGpuHardware()
    let electronGpuDevices: string[] = []

    try {
      const gpuInfo = (await app.getGPUInfo('basic')) as {
        gpuDevice?: Array<{
          active?: boolean
          deviceString?: string
          vendorId?: number
          deviceId?: number
        }>
      }
      electronGpuDevices = (gpuInfo.gpuDevice ?? [])
        .map((device) => {
          if (device.deviceString) return device.deviceString

          const ids = [device.vendorId, device.deviceId]
            .filter((value): value is number => typeof value === 'number')
            .map((value) => `0x${value.toString(16)}`)

          return ids.length > 0 ? ids.join(':') : ''
        })
        .filter((value) => value.trim().length > 0)
    } catch {
      electronGpuDevices = []
    }

    const selectedGpuDevices = windowsGpu.devices.map((device) => device.name)
    const gpuDevices = Array.from(
      new Set(selectedGpuDevices.length > 0 ? selectedGpuDevices : electronGpuDevices)
    )

    return {
      hostname: os.hostname(),
      platform: platformName ?? `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cpuModel: cpus[0]?.model ?? 'CPU desconocida',
      cpuCores: cpus.length,
      totalMemoryBytes,
      gpuDevices: gpuDevices.length > 0 ? gpuDevices : ['GPU no detectada'],
      primaryGpuName: gpuDevices[0],
      vramTotalBytes: windowsGpu.vramTotalBytes
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
  const hardware = await getDebugLabHardwareInfo()
  const gpuUsage = await readWindowsGpuUsage()
  const vramTotalBytes = hardware.vramTotalBytes
  const vramUsedBytes = gpuUsage.vramUsedBytes

  return {
    hardware,
    sample: {
      capturedAt: Date.now(),
      cpuPercent: Number(readCpuUsagePercent().toFixed(2)),
      memoryUsedBytes: usedMemoryBytes,
      memoryFreeBytes: freeMemoryBytes,
      memoryTotalBytes: totalMemoryBytes,
      memoryUsedPercent: Number(((usedMemoryBytes / totalMemoryBytes) * 100).toFixed(2)),
      gpuPercent:
        typeof gpuUsage.gpuPercent === 'number' ? Number(gpuUsage.gpuPercent.toFixed(2)) : null,
      vramUsedBytes: typeof vramUsedBytes === 'number' ? vramUsedBytes : null,
      vramTotalBytes: typeof vramTotalBytes === 'number' ? vramTotalBytes : null,
      vramUsedPercent:
        typeof vramUsedBytes === 'number' &&
        typeof vramTotalBytes === 'number' &&
        vramTotalBytes > 0
          ? Number(((vramUsedBytes / vramTotalBytes) * 100).toFixed(2))
          : null
    }
  }
}

/**
 * Build the CRC32 lookup table used by ZIP entries.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   number[]
 */
function getCrc32Table(): number[] {
  if (crc32Table) return crc32Table

  crc32Table = Array.from({ length: 256 }, (_, index) => {
    let value = index

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }

    return value >>> 0
  })

  return crc32Table
}

/**
 * Calculate a CRC32 checksum for a ZIP file entry.
 *
 * Args:
 *   buffer: Entry bytes.
 *
 * Returns:
 *   number
 */
function calculateCrc32(buffer: Buffer): number {
  const table = getCrc32Table()
  let crc = 0xffffffff

  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Convert a date into DOS date and time values used by ZIP headers.
 *
 * Args:
 *   date: Timestamp written into the archive.
 *
 * Returns:
 *   { date: number; time: number }
 */
function toDosDateTime(date: Date): { date: number; time: number } {
  const year = Math.max(1980, date.getFullYear())

  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  }
}

/**
 * Keep generated archive paths inside the ZIP root.
 *
 * Args:
 *   filename: Requested archive filename.
 *
 * Returns:
 *   string
 */
function sanitizeZipFilename(filename: string): string {
  return filename.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.\./g, '').trim()
}

/**
 * Create a small uncompressed ZIP archive without external dependencies.
 *
 * Args:
 *   files: Files included in the archive.
 *
 * Returns:
 *   Buffer
 */
function createZipArchive(files: Array<{ filename: string; content: Buffer | string }>): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  const now = toDosDateTime(new Date())
  let offset = 0

  for (const file of files) {
    const filename = sanitizeZipFilename(file.filename)
    if (!filename) continue

    const nameBuffer = Buffer.from(filename, 'utf8')
    const contentBuffer = Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content, 'utf8')
    const crc = calculateCrc32(contentBuffer)
    const localHeader = Buffer.alloc(30)

    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(now.time, 10)
    localHeader.writeUInt16LE(now.date, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(contentBuffer.length, 18)
    localHeader.writeUInt32LE(contentBuffer.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localHeader.writeUInt16LE(0, 28)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt16LE(now.time, 12)
    centralHeader.writeUInt16LE(now.date, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(contentBuffer.length, 20)
    centralHeader.writeUInt32LE(contentBuffer.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)

    localParts.push(localHeader, nameBuffer, contentBuffer)
    centralParts.push(centralHeader, nameBuffer)
    offset += localHeader.length + nameBuffer.length + contentBuffer.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const centralDirectoryOffset = offset
  const endOfCentralDirectory = Buffer.alloc(22)

  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0)
  endOfCentralDirectory.writeUInt16LE(0, 4)
  endOfCentralDirectory.writeUInt16LE(0, 6)
  endOfCentralDirectory.writeUInt16LE(centralParts.length / 2, 8)
  endOfCentralDirectory.writeUInt16LE(centralParts.length / 2, 10)
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12)
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16)
  endOfCentralDirectory.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory])
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
    icon,
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

// Prevents Chromium from locking the cookie database when OS-level DPAPI
// decryption of the Local State key fails (Windows-specific 0x8009000B error).
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-features', 'LockProfileCookieDatabase')
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

  ipcMain.handle(
    'debug-lab:export-report',
    async (_event, payload: DebugLabReportExportPayload) => {
      try {
        const saveDialogOptions = {
          title: 'Guardar informe de Debug Lab',
          defaultPath: `kai-debug-lab-${Date.now()}.zip`,
          filters: [{ name: 'ZIP', extensions: ['zip'] }]
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

        await reportWindow.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(payload.html)}`
        )
        const pdf = await reportWindow.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: {
            marginType: 'default'
          }
        })

        reportWindow.close()
        const archive = createZipArchive([
          { filename: 'informe-debug-lab.pdf', content: pdf },
          { filename: 'dashboard.html', content: payload.dashboardHtml },
          ...payload.csvFiles.map((file) => ({
            filename: `csv/${file.filename}`,
            content: file.content
          }))
        ])

        await writeFile(result.filePath, archive)

        return { ok: true, path: result.filePath }
      } catch (error) {
        console.error('Error exportando Debug Lab:', error)
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Error desconocido'
        }
      }
    }
  )

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
        icon,
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
