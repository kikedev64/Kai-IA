export {}

declare global {
  interface Window {
    electronAPI: {
      openGoogleOAuthPopup: (authUrl: string) => Promise<{ closed: true }>
      closeApp: () => Promise<boolean>      
    }

    configApi: {
      isFirstRun: () => Promise<boolean>
      setFirstRun: (value: boolean) => Promise<boolean>

      getServerUrl: () => Promise<string | null>
      setServerUrl: (url: string) => Promise<boolean>

      getServerPort: () => Promise<number | null>
      setServerPort: (port: number) => Promise<boolean>

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
      onStatus: (
        callback: (payload: { step: string; message: string }) => void
      ) => () => void
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

      onEmailNotificationClick: (
        callback: (payload: { messageId: string }) => void
      ) => () => void
    }
  }
}