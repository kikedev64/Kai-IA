import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

contextBridge.exposeInMainWorld('electronAPI', {
  openGoogleOAuthPopup: (authUrl: string) =>
    ipcRenderer.invoke('oauth:open-google-popup', authUrl)
})

contextBridge.exposeInMainWorld('configApi', {
  isFirstRun: (): Promise<boolean> => ipcRenderer.invoke('config:is-first-run'),
  setFirstRun: (value: boolean): Promise<boolean> =>
    ipcRenderer.invoke('config:set-first-run', value),

  getServerUrl: (): Promise<string | null> =>
    ipcRenderer.invoke('config:get-server-url'),
  setServerUrl: (url: string): Promise<boolean> =>
    ipcRenderer.invoke('config:set-server-url', url),

  getServerPort: (): Promise<number | null> =>
    ipcRenderer.invoke('config:get-server-port'),
  setServerPort: (port: number): Promise<boolean> =>
    ipcRenderer.invoke('config:set-server-port', port),

  getUserProfileRaw: (): Promise<string | null> =>
    ipcRenderer.invoke('config:get-user-profile-raw'),
  setUserProfileRaw: (raw: string): Promise<boolean> =>
    ipcRenderer.invoke('config:set-user-profile-raw', raw),

  getUserProfileJson: (): Promise<Record<string, unknown> | null> =>
    ipcRenderer.invoke('config:get-user-profile-json'),

  setUserProfileJson: (profile: Record<string, unknown>): Promise<boolean> =>
    ipcRenderer.invoke('config:set-user-profile-json', profile),

  completeOnboarding: (): Promise<boolean> =>
    ipcRenderer.invoke('config:complete-onboarding'),

  getOnboardingCompleted: (): Promise<boolean> =>
    ipcRenderer.invoke('config:get-onboarding-completed'),

  setOnboardingCompleted: (value: boolean) =>
    ipcRenderer.invoke('config:set-onboarding-completed', value),
})