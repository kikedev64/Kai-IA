export {}

declare global {
  interface Window {
    electronAPI: {
      openGoogleOAuthPopup: (authUrl: string) => Promise<{ closed: true }>
    }
  }
}