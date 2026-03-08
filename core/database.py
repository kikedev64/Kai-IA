from pathlib import Path
import sqlite3

DB_PATH = Path("data/kai.db")


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db() -> None:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS chat_sessions (
        chat_id TEXT PRIMARY KEY,
        title TEXT,
        description TEXT,
        system_prompt TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(chat_id) REFERENCES chat_sessions(chat_id) ON DELETE CASCADE
    )
    """)

    # FUTURA MIGRACIÓN
    cur.execute("""
    CREATE TABLE IF NOT EXISTS google_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_user_id TEXT,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT,
        access_token TEXT,
        refresh_token TEXT,
        token_expiry DATETIME,
        scopes TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS gmail_sync_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        google_account_id INTEGER NOT NULL UNIQUE,
        last_history_id TEXT,
        last_sync_at DATETIME,
        last_full_sync_at DATETIME,
        sync_error TEXT,
        watch_expiration DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(google_account_id) REFERENCES google_accounts(id) ON DELETE CASCADE
    )
    """)

    cur.execute("""
    CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id_created_at
    ON chat_messages(chat_id, created_at)
    """)

    cur.execute("""
    CREATE INDEX IF NOT EXISTS idx_google_accounts_email
    ON google_accounts(email)
    """)

    conn.commit()
    conn.close()