import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  /**
   * Open or reuse the local SQLite database.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Database.Database
   */

  if (db) return db

  const dbPath = path.join(app.getPath('userData'), 'kai-ia-config.db')
  db = new Database(dbPath)

  db.exec(`
        CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `)

  db.exec(`
    INSERT OR IGNORE INTO app_config (key, value) VALUES
    ('onboarding_completed', 'false');
    `)

  return db
}

export function getConfigValue(key: string): string | null {
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

  const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(key) as
    | { value: string }
    | undefined

  return row?.value ?? null
}

export function setConfigValue(key: string, value: string): void {
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

  db.prepare(
    `
    INSERT INTO app_config (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `
  ).run(key, value)
}

export function getOnboardingCompleted(): boolean {
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

  if (!value) return false

  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1'
}

export function getBackendBaseUrl(): string {
  /**
   * Build the backend base URL from saved local configuration.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   string
   */

  const serverUrl = getConfigValue('server_url') ?? 'http://localhost'
  const serverPort = getConfigValue('server_port') ?? '8000'
  return `${serverUrl}:${serverPort}`
}
