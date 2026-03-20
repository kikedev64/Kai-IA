import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
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