export {}

declare global {
  interface Window {
    electronAPI: {
      openGoogleOAuthPopup: (authUrl: string) => Promise<{ closed: true }>
      closeApp: () => Promise<boolean>
      openSettingsWindow: () => Promise<boolean>
      openDebugLabWindow: (chatId?: string) => Promise<boolean>
      exportDebugLabReport: (payload: {
        html: string
        csvFiles: Array<{ filename: string; content: string }>
      }) => Promise<{ ok: boolean; path?: string; cancelled?: boolean; error?: string }>
      getDebugLabSystemSnapshot: () => Promise<{
        hardware: {
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
        sample: {
          capturedAt: number
          cpuPercent: number
          memoryUsedBytes: number
          memoryFreeBytes: number
          memoryTotalBytes: number
          memoryUsedPercent: number
          gpuPercent: number | null
          vramUsedBytes: number | null
          vramTotalBytes: number | null
          vramUsedPercent: number | null
        }
      }>
    }

    configApi: {
      isFirstRun: () => Promise<boolean>
      setFirstRun: (value: boolean) => Promise<boolean>

      getServerUrl: () => Promise<string | null>
      setServerUrl: (url: string) => Promise<boolean>

      getServerPort: () => Promise<number | null>
      setServerPort: (port: number) => Promise<boolean>

      getGmailWatchIntervalMs: () => Promise<number>
      setGmailWatchIntervalMs: (intervalMs: number) => Promise<boolean>

      getUserProfileRaw: () => Promise<string | null>
      setUserProfileRaw: (raw: string) => Promise<boolean>

      getUserProfileJson: () => Promise<Record<string, unknown> | null>
      setUserProfileJson: (profile: Record<string, unknown>) => Promise<boolean>

      completeOnboarding: () => Promise<boolean>
      getOnboardingCompleted: () => Promise<boolean>
      setOnboardingCompleted: (value: boolean) => Promise<boolean>
      resetOnboardingState: () => Promise<boolean>
    }

    startupApi: {
      onStatus: (callback: (payload: { step: string; message: string }) => void) => () => void
      getCurrentStatus: () => Promise<{ step: string; message: string }>
      resetAndOpenOnboarding: () => Promise<boolean>
      completeOnboardingAndOpenMain: () => Promise<boolean>
    }

    systemNotificationsApi: {
      show: (payload: {
        title: string
        body: string
        silent?: boolean
        data?: {
          type?: 'email'
          messageId?: string
        }
      }) => Promise<{ ok: boolean; error?: string }>

      getPendingEmailNotificationClick: () => Promise<{ messageId: string } | null>
      clearPendingEmailNotificationClick: (messageId?: string) => Promise<boolean>

      onEmailNotificationClick: (callback: (payload: { messageId: string }) => void) => () => void
    }
  }
}
