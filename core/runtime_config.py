from __future__ import annotations

import json
from typing import Any

from core.database import get_connection


def get_runtime_config_value(key: str, default: Any = None) -> object:
    """Return the runtime config value.

    Args:
        key: Configuration key to read or write.
        default: Fallback value returned when no configured value exists.

    Returns:
        object
    """
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT value FROM app_config WHERE key = ?",
            (key,),
        ).fetchone()

        if row is None:
            return default

        return row["value"]
    finally:
        conn.close()


def _normalize_runtime_value(value: Any) -> str | None:
    """Convert a runtime configuration value into a storable string.

    Args:
        value: Value being processed.

    Returns:
        str | None
    """
    if value is None:
        return None

    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)

    if isinstance(value, bool):
        return "true" if value else "false"

    return str(value)


def set_runtime_config_value(key: str, value: Any) -> None:
    """Store the runtime config value.

    Args:
        key: Configuration key to read or write.
        value: Value being processed.

    Returns:
        None
    """
    normalized = _normalize_runtime_value(value)

    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO app_config (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
            """,
            (key, normalized),
        )
        conn.commit()
    finally:
        conn.close()


def set_runtime_config_values(values: dict[str, Any]) -> None:
    """Store the runtime config values.

    Args:
        values: Values to read, validate, or transform.

    Returns:
        None
    """
    conn = get_connection()
    try:
        conn.executemany(
            """
            INSERT INTO app_config (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
            """,
            [(key, _normalize_runtime_value(value)) for key, value in values.items()],
        )
        conn.commit()
    finally:
        conn.close()
