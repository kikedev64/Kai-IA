import json

from core.database import get_connection


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
