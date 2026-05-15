import { getDatabase } from './database'

type UserProfileJson = Record<string, unknown>

function setConfigValue(key: string, value: string): void {
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

function getConfigValue(key: string): string | null {
  /**
   * Read one configuration key from the local database.
   *
   * Args:
   *   key: Configuration key to read.
   *
   * Returns:
   *   string | null
   */

  const db = getDatabase()

  const stmt = db.prepare(`
    SELECT value FROM app_config WHERE key = ?
  `)

  const row = stmt.get(key) as { value: string } | undefined
  return row?.value ?? null
}

export const configRepository = {
  isFirstRun(): boolean {
    /**
     * Check whether the application should still show first-run setup.
     *
     * Args:
     *   None.
     *
     * Returns:
     *   boolean
     */

    const value = getConfigValue('is_first_run')
    return value === null ? true : value === 'true'
  },

  setFirstRun(value: boolean): void {
    /**
     * Persist the first-run flag.
     *
     * Args:
     *   value: Next first-run state.
     *
     * Returns:
     *   void
     */

    setConfigValue('is_first_run', String(value))
  },

  getServerUrl(): string | null {
    /**
     * Read the configured backend host.
     *
     * Args:
     *   None.
     *
     * Returns:
     *   string | null
     */

    return getConfigValue('server_url')
  },

  setServerUrl(url: string): void {
    /**
     * Persist the configured backend host.
     *
     * Args:
     *   url: Backend host entered by the user.
     *
     * Returns:
     *   void
     */

    setConfigValue('server_url', url)
  },

  getServerPort(): number | null {
    /**
     * Read the configured backend port.
     *
     * Args:
     *   None.
     *
     * Returns:
     *   number | null
     */

    const value = getConfigValue('server_port')
    return value ? Number(value) : null
  },

  setServerPort(port: number): void {
    /**
     * Persist the configured backend port.
     *
     * Args:
     *   port: Backend port entered by the user.
     *
     * Returns:
     *   void
     */

    setConfigValue('server_port', String(port))
  },

  getUserProfileRaw(): string | null {
    /**
     * Read the raw user profile text.
     *
     * Args:
     *   None.
     *
     * Returns:
     *   string | null
     */

    return getConfigValue('user_profile_raw')
  },

  setUserProfileRaw(raw: string): void {
    /**
     * Persist the raw user profile text.
     *
     * Args:
     *   raw: Free-text profile written by the user.
     *
     * Returns:
     *   void
     */

    setConfigValue('user_profile_raw', raw)
  },

  getUserProfileJson(): UserProfileJson | null {
    /**
     * Read and parse the structured user profile.
     *
     * Args:
     *   None.
     *
     * Returns:
     *   UserProfileJson | null
     */

    const value = getConfigValue('user_profile_json')
    if (!value) return null

    try {
      return JSON.parse(value) as UserProfileJson
    } catch {
      return null
    }
  },

  setUserProfileJson(profile: UserProfileJson): void {
    /**
     * Persist the structured user profile.
     *
     * Args:
     *   profile: Structured profile object to save.
     *
     * Returns:
     *   void
     */

    setConfigValue('user_profile_json', JSON.stringify(profile))
  },

  markOnboardingCompleted(): void {
    /**
     * Mark onboarding as completed.
     *
     * Args:
     *   None.
     *
     * Returns:
     *   void
     */

    setConfigValue('onboarding_completed', 'true')
  },

  getOnboardingCompleted(): boolean {
    /**
     * Read whether onboarding has already been completed.
     *
     * Args:
     *   None.
     *
     * Returns:
     *   boolean
     */

    const value = getConfigValue('onboarding_completed')
    return value === 'true'
  },

  setOnboardingCompleted(value: boolean): void {
    /**
     * Persist the onboarding completion state.
     *
     * Args:
     *   value: Next onboarding completion state.
     *
     * Returns:
     *   void
     */

    setConfigValue('onboarding_completed', String(value))
  }
}
