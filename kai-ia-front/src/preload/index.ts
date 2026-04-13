import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)

    contextBridge.exposeInMainWorld('electronAPI', {
      openGoogleOAuthPopup: (authUrl: string) =>
        ipcRenderer.invoke('oauth:open-google-popup', authUrl),
      closeApp: () => ipcRenderer.invoke('app:quit'),
      openSettingsWindow: () => ipcRenderer.invoke('window:open-settings')
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

      setOnboardingCompleted: (value: boolean): Promise<boolean> =>
        ipcRenderer.invoke('config:set-onboarding-completed', value),

      resetOnboardingState: (): Promise<boolean> =>
        ipcRenderer.invoke('config:reset-onboarding-state')
    })

    contextBridge.exposeInMainWorld('startupApi', {
      onStatus: (callback: (payload: { step: string; message: string }) => void) => {
        const listener = (
          _event: Electron.IpcRendererEvent,
          payload: { step: string; message: string }
        ) => callback(payload)

        ipcRenderer.on('startup:status', listener)

        return () => {
          ipcRenderer.removeListener('startup:status', listener)
        }
      },

      getCurrentStatus: (): Promise<{ step: string; message: string }> =>
        ipcRenderer.invoke('startup:get-current-status'),

      resetAndOpenOnboarding: (): Promise<boolean> =>
        ipcRenderer.invoke('startup:reset-and-open-onboarding'),

      completeOnboardingAndOpenMain: (): Promise<boolean> =>
        ipcRenderer.invoke('startup:complete-onboarding-and-open-main'),

      getServerUrl: () => ipcRenderer.invoke('config:getServerUrl'),
      getServerPort: () => ipcRenderer.invoke('config:getServerPort')
    })

    contextBridge.exposeInMainWorld('systemNotificationsApi', {
      show: async (payload: {
        title: string
        body: string
        silent?: boolean
        data?: {
          type?: 'email'
          messageId?: string
        }
      }) => ipcRenderer.invoke('system-notifications:show', payload),

      onEmailNotificationClick: (
        callback: (payload: { messageId: string }) => void
      ) => {
        const listener = (
          _event: Electron.IpcRendererEvent,
          payload: { messageId: string }
        ) => {
          callback(payload)
        }

        ipcRenderer.on('system-notifications:email-clicked', listener)

        return () => {
          ipcRenderer.removeListener('system-notifications:email-clicked', listener)
        }
      }
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}