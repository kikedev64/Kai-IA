# services/config_loader.py
from __future__ import annotations

import json
from pathlib import Path
import sqlite3

DB_PATH = Path("data/kai.db")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_config_value(key: str, default=None):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT value FROM app_config WHERE key = ?",
        (key,)
    )
    row = cur.fetchone()
    conn.close()

    if not row:
        return default

    return row["value"]


def get_config_json(key: str, default=None):
    raw = get_config_value(key)
    if raw is None:
        return default
    return json.loads(raw)


def get_config_int(key: str, default: int | None = None):
    raw = get_config_value(key)
    if raw is None:
        return default
    return int(raw)


def get_config_float(key: str, default: float | None = None):
    raw = get_config_value(key)
    if raw is None:
        return default
    return float(raw)

def count_chats() -> int:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) AS total FROM chat_sessions")
    row = cur.fetchone()

    conn.close()
    return int(row["total"] if row else 0)


def create_initial_chat_summary(chat_id: str, short_summary: str) -> None:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
    INSERT OR REPLACE INTO chat_summaries (chat_id, short_summary, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    """, (chat_id, short_summary))

    conn.commit()
    conn.close()


def update_chat_summary(chat_id: str, short_summary: str) -> None:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
    INSERT INTO chat_summaries (chat_id, short_summary, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(chat_id) DO UPDATE SET
        short_summary = excluded.short_summary,
        updated_at = CURRENT_TIMESTAMP
    """, (chat_id, short_summary))

    conn.commit()
    conn.close()


def get_chat_summary(chat_id: str) -> str | None:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
    SELECT short_summary
    FROM chat_summaries
    WHERE chat_id = ?
    """, (chat_id,))

    row = cur.fetchone()
    conn.close()

    return row["short_summary"] if row else None


def count_user_messages(chat_id: str) -> int:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
    SELECT COUNT(*) AS total
    FROM chat_messages
    WHERE chat_id = ? AND role = 'user'
    """, (chat_id,))

    row = cur.fetchone()
    conn.close()

    return int(row["total"] if row else 0)

def get_all_config_as_dict() -> dict[str, str]:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT key, value FROM app_config")
    rows = cur.fetchall()

    conn.close()

    return {row["key"]: row["value"] for row in rows}


def get_config_value_from_db(key: str, default=None):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT value FROM app_config WHERE key = ?", (key,))
    row = cur.fetchone()

    conn.close()
    return row["value"] if row else default


def get_config_json_from_db(key: str, default=None):
    raw = get_config_value_from_db(key)
    if raw is None:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default