from __future__ import annotations
from core.database import get_connection

def get_all_config() -> list[dict]:
    """Return all config rows.

    Returns:
        list[dict]
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT key, value, updated_at
        FROM app_config
        ORDER BY key ASC
    """)
    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_config_value(key: str) -> dict | None:
    """Return the config value.

    Args:
        key: Configuration key to read or write.

    Returns:
        dict | None
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT key, value, updated_at
        FROM app_config
        WHERE key = ?
    """, (key,))
    row = cur.fetchone()
    conn.close()

    return dict(row) if row else None


def set_config_value(key: str, value: str) -> dict:
    """Store the config value.

    Args:
        key: Configuration key to read or write.
        value: Value being processed.

    Returns:
        dict
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO app_config (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP
    """, (key, value))

    conn.commit()

    cur.execute("""
        SELECT key, value, updated_at
        FROM app_config
        WHERE key = ?
    """, (key,))
    row = cur.fetchone()
    conn.close()

    return dict(row)