from __future__ import annotations

import json
from pathlib import Path
import sqlite3

DB_PATH = Path("data/kai.db")


def get_connection() -> sqlite3.Connection:
    """Return the connection.

    Returns:
        sqlite3.Connection
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_config_value(key: str, default=None) -> str | None:
    """Return the config value.

    Args:
        key: Configuration key to read or write.
        default: Fallback value returned when no configured value exists.

    Returns:
        object
    """
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


def get_config_json(key: str, default=None) -> object:
    """Return the config json.

    Args:
        key: Configuration key to read or write.
        default: Fallback value returned when no configured value exists.

    Returns:
        object
    """
    raw = get_config_value(key)
    if raw is None:
        return default
    return json.loads(raw)


def get_config_int(key: str, default: int | None = None) -> int | None:
    """Return the config int.

    Args:
        key: Configuration key to read or write.
        default: Fallback value returned when no configured value exists.

    Returns:
        object
    """
    raw = get_config_value(key)
    if raw is None:
        return default
    return int(raw)


def get_config_float(key: str, default: float | None = None) -> float | None:
    """Return the config float.

    Args:
        key: Configuration key to read or write.
        default: Fallback value returned when no configured value exists.

    Returns:
        object
    """
    raw = get_config_value(key)
    if raw is None:
        return default
    return float(raw)

def count_chats() -> int:
    """Count stored chats.

    Returns:
        int
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) AS total FROM chat_sessions")
    row = cur.fetchone()

    conn.close()
    return int(row["total"] if row else 0)


def create_initial_chat_summary(chat_id: str, short_summary: str) -> None:
    """Create the initial chat summary.

    Args:
        chat_id: Identifier of the chat session.
        short_summary: Short Event title or summary.

    Returns:
        None
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
    INSERT OR REPLACE INTO chat_summaries (chat_id, short_summary, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    """, (chat_id, short_summary))

    conn.commit()
    conn.close()


def update_chat_summary(chat_id: str, short_summary: str) -> None:
    """Update the chat summary.

    Args:
        chat_id: Identifier of the chat session.
        short_summary: Short Event title or summary.

    Returns:
        None
    """
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
    """Return the chat summary.

    Args:
        chat_id: Identifier of the chat session.

    Returns:
        str | None
    """
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
    """Count user messages in a chat session.

    Args:
        chat_id: Identifier of the chat session.

    Returns:
        int
    """
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
    """Return all config values as a dictionary.

    Returns:
        dict[str, str]
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT key, value FROM app_config")
    rows = cur.fetchall()

    conn.close()

    return {row["key"]: row["value"] for row in rows}


def get_config_value_from_db(key: str, default=None) -> str | None:
    """Return a config value from the database.

    Args:
        key: Configuration key to read or write.
        default: Fallback value returned when no configured value exists.

    Returns:
        object
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT value FROM app_config WHERE key = ?", (key,))
    row = cur.fetchone()

    conn.close()
    return row["value"] if row else default


def get_config_json_from_db(key: str, default=None) -> object:
    """Return a JSON config value from the database.

    Args:
        key: Configuration key to read or write.
        default: Fallback value returned when no configured value exists.

    Returns:
        object
    """
    raw = get_config_value_from_db(key)
    if raw is None:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default