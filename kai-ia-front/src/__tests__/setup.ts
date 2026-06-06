import { vi } from 'vitest'

/**
 * Registers Electron preload globals that are unavailable in the jsdom test environment.
 */
vi.stubGlobal('configApi', {
  getServerUrl: vi.fn().mockResolvedValue('http://localhost'),
  getServerPort: vi.fn().mockResolvedValue(8000),
  getGmailWatchIntervalMs: vi.fn().mockResolvedValue(20000),
  getUserProfileRaw: vi.fn().mockResolvedValue(''),
  getUserProfileJson: vi.fn().mockResolvedValue(null),
  setServerUrl: vi.fn().mockResolvedValue(true),
  setServerPort: vi.fn().mockResolvedValue(true),
  setGmailWatchIntervalMs: vi.fn().mockResolvedValue(true),
  setUserProfileRaw: vi.fn().mockResolvedValue(true),
  setUserProfileJson: vi.fn().mockResolvedValue(true),
  isFirstRun: vi.fn().mockResolvedValue(false),
  setFirstRun: vi.fn().mockResolvedValue(true),
  completeOnboarding: vi.fn().mockResolvedValue(true),
  getOnboardingCompleted: vi.fn().mockResolvedValue(true),
})

vi.stubGlobal('electronAPI', {
  openGoogleOAuthPopup: vi.fn(),
  closeApp: vi.fn(),
  openSettingsWindow: vi.fn(),
  openDebugLabWindow: vi.fn(),
  exportDebugLabReport: vi.fn().mockResolvedValue({ ok: true }),
  getDebugLabSystemSnapshot: vi.fn().mockResolvedValue({ hardware: null, sample: {} }),
})
