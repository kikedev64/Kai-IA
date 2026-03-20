import { getDatabase } from './database'

type UserProfileJson = Record<string, unknown>

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

function getConfigValue(key: string): string | null {
    const db = getDatabase()

    const stmt = db.prepare(`
    SELECT value FROM app_config WHERE key = ?
  `)

    const row = stmt.get(key) as { value: string } | undefined
    return row?.value ?? null
}

export const configRepository = {
    isFirstRun(): boolean {
        const value = getConfigValue('is_first_run')
        return value === null ? true : value === 'true'
    },

    setFirstRun(value: boolean): void {
        setConfigValue('is_first_run', String(value))
    },

    getServerUrl(): string | null {
        return getConfigValue('server_url')
    },

    setServerUrl(url: string): void {
        setConfigValue('server_url', url)
    },

    getServerPort(): number | null {
        const value = getConfigValue('server_port')
        return value ? Number(value) : null
    },

    setServerPort(port: number): void {
        setConfigValue('server_port', String(port))
    },

    getUserProfileRaw(): string | null {
        return getConfigValue('user_profile_raw')
    },

    setUserProfileRaw(raw: string): void {
        setConfigValue('user_profile_raw', raw)
    },

    getUserProfileJson(): UserProfileJson | null {
        const value = getConfigValue('user_profile_json')
        if (!value) return null

        try {
            return JSON.parse(value) as UserProfileJson
        } catch {
            return null
        }
    },

    setUserProfileJson(profile: UserProfileJson): void {
        setConfigValue('user_profile_json', JSON.stringify(profile))
    },

    markOnboardingCompleted(): void {
        setConfigValue('onboarding_completed', 'true')
    },

    getOnboardingCompleted(): boolean {
        const value = getConfigValue('onboarding_completed')
        return value === 'true'
    },

    setOnboardingCompleted(value: boolean): void {
        setConfigValue('onboarding_completed', String(value))
    }
}