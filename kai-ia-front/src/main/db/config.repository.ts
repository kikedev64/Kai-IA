import { getDatabase } from './database'

type UserProfileJson = Record<string, unknown>

/**
 * Store one configuration key in the local database.
 *
 * Args:
 *   key: Configuration key to write.
 *   value: String value persisted for that key.
 *
 * Returns:
 *   void
 */
function setConfigValue(key: string, value: string): void {

  const db = getDatabase()

  const stmt = db.prepare(`
    INSERT INTO app_config (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `)

  stmt.run(key, value)
}

/**
 * Read one configuration key from the local database.
 *
 * Args:
 *   key: Configuration key to read.
 *
 * Returns:
 *   string | null
 */
function getConfigValue(key: string): string | null {

  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT value FROM app_config WHERE key = ?
  `)

  const row = stmt.get(key) as { value: string } | undefined
  return row?.value ?? null
}

/**
 * Check whether the application should still show first-run setup.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   boolean
 */
export const configRepository = {
  isFirstRun(): boolean {

    const value = getConfigValue('is_first_run')
    return value === null ? true : value === 'true'
  },

  /**
   * Persist the first-run flag.
   *
   * Args:
   *   value: Next first-run state.
   *
   * Returns:
   *   void
   */
  setFirstRun(value: boolean): void {

    setConfigValue('is_first_run', String(value))
  },

  /**
   * Read the configured backend host.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   string | null
   */
  getServerUrl(): string | null {

    return getConfigValue('server_url')
  },

  /**
   * Persist the configured backend host.
   *
   * Args:
   *   url: Backend host entered by the user.
   *
   * Returns:
   *   void
   */
  setServerUrl(url: string): void {

    setConfigValue('server_url', url)
  },

  /**
   * Read the configured backend port.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   number | null
   */
  getServerPort(): number | null {

    const value = getConfigValue('server_port')
    return value ? Number(value) : null
  },

  /**
   * Persist the configured backend port.
   *
   * Args:
   *   port: Backend port entered by the user.
   *
   * Returns:
   *   void
   */
  setServerPort(port: number): void {

    setConfigValue('server_port', String(port))
  },

  /**
   * Read the Gmail watcher polling interval in milliseconds.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   number
   */
  getGmailWatchIntervalMs(): number {

    const value = getConfigValue('gmail_watch_interval_ms')
    const intervalMs = value ? Number(value) : 20000

    return Number.isFinite(intervalMs) ? intervalMs : 20000
  },

  /**
   * Persist the Gmail watcher polling interval in milliseconds.
   *
   * Args:
   *   intervalMs: Polling interval selected by the user.
   *
   * Returns:
   *   void
   */
  setGmailWatchIntervalMs(intervalMs: number): void {

    setConfigValue('gmail_watch_interval_ms', String(intervalMs))
  },

  /**
   * Read the raw user profile text.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   string | null
   */
  getUserProfileRaw(): string | null {

    return getConfigValue('user_profile_raw')
  },

  /**
   * Persist the raw user profile text.
   *
   * Args:
   *   raw: Free-text profile written by the user.
   *
   * Returns:
   *   void
   */
  setUserProfileRaw(raw: string): void {

    setConfigValue('user_profile_raw', raw)
  },

  /**
   * Read and parse the structured user profile.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   UserProfileJson | null
   */
  getUserProfileJson(): UserProfileJson | null {

    const value = getConfigValue('user_profile_json')
    if (!value) return null

    try {
      return JSON.parse(value) as UserProfileJson
    } catch {
      return null
    }
  },

  /**
   * Persist the structured user profile.
   *
   * Args:
   *   profile: Structured profile object to save.
   *
   * Returns:
   *   void
   */
  setUserProfileJson(profile: UserProfileJson): void {

    setConfigValue('user_profile_json', JSON.stringify(profile))
  },

  /**
   * Mark onboarding as completed.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   void
   */
  markOnboardingCompleted(): void {

    setConfigValue('onboarding_completed', 'true')
  },

  /**
   * Read whether onboarding has already been completed.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   boolean
   */
  getOnboardingCompleted(): boolean {

    const value = getConfigValue('onboarding_completed')
    return value === 'true'
  },

  /**
   * Persist the onboarding completion state.
   *
   * Args:
   *   value: Next onboarding completion state.
   *
   * Returns:
   *   void
   */
  setOnboardingCompleted(value: boolean): void {

    setConfigValue('onboarding_completed', String(value))
  }
}
