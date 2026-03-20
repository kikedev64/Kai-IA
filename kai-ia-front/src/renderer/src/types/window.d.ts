export { }

declare global {
  interface Window {
    electronAPI: {
      openGoogleOAuthPopup: (authUrl: string) => Promise<{ closed: true }>

    },
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

      setServerUrl: (url: string) => Promise<boolean>
      setServerPort: (port: number) => Promise<boolean>
    }
  }
}