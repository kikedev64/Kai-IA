import { getBackendBaseUrl, getOnboardingCompleted } from '../db/database'

export type BootstrapResponse = {
  ok: boolean
  checks: {
    backend: boolean
    database: boolean
    config: boolean
    llm_service: boolean
  }
  version: string
}

export type StartupResult =
  | { route: 'onboarding' }
  | { route: 'main'; bootstrap: BootstrapResponse }
  | { route: 'error'; error: string; bootstrap?: BootstrapResponse }

export async function checkBootstrap(): Promise<BootstrapResponse> {
  /**
   * Ask the backend whether the application can start normally.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<BootstrapResponse>
   */

  const baseUrl = getBackendBaseUrl()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const res = await fetch(`${baseUrl}/app/bootstrap`, {
      method: 'GET',
      signal: controller.signal
    })

    if (!res.ok) {
      throw new Error(`El backend respondió con estado ${res.status}`)
    }

    return (await res.json()) as BootstrapResponse
  } finally {
    clearTimeout(timeout)
  }
}

export async function resolveStartup(): Promise<StartupResult> {
  /**
   * Decide which window should open after the splash screen.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<StartupResult>
   */

  const onboardingCompleted = getOnboardingCompleted()

  if (!onboardingCompleted) {
    return { route: 'onboarding' }
  }

  try {
    const bootstrap = await checkBootstrap()

    if (bootstrap.ok) {
      return { route: 'main', bootstrap }
    }

    return {
      route: 'error',
      error: 'Los servicios críticos no están disponibles.',
      bootstrap
    }
  } catch (error) {
    return {
      route: 'error',
      error: error instanceof Error ? error.message : 'Error desconocido al iniciar'
    }
  }
}
