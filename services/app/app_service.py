from pathlib import Path

from core.database import get_connection
from llm.lmstudio_client import check_llm_service


def check_backend() -> bool:
    """Check whether the backend process is alive.

    Returns:
        bool
    """
    return True


def check_database() -> bool:
    """Check whether the local database can be reached.

    Returns:
        bool
    """
    required_tables = {
        "chat_sessions",
        "chat_messages",
        "app_config",
        "user_profile",
    }

    conn = None

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT 1")
        cur.fetchone()

        cur.execute("""
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
        """)
        existing_tables = {row["name"] for row in cur.fetchall()}

        return required_tables.issubset(existing_tables)

    except Exception:
        return False

    finally:
        if conn is not None:
            conn.close()


def check_config() -> bool:
    """Check whether required configuration is available.

    Returns:
        bool
    """
    REQUIRED_CONFIG_KEYS = {
        "google_credentials_file",
        "google_token_file",
        "model_name",
        "system_prompt_default",
    }

    conn = None

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT key, value FROM app_config")
        rows = cur.fetchall()

        config = {row["key"]: row["value"] for row in rows}

        if not REQUIRED_CONFIG_KEYS.issubset(config.keys()):
            return False

        credentials_path = Path(config["google_credentials_file"])
        if not credentials_path.exists():
            return False

        if not config["model_name"].strip():
            return False

        if not config["system_prompt_default"].strip():
            return False

        return True

    except Exception:
        return False

    finally:
        if conn is not None:
            conn.close()


def get_bootstrap_status() -> dict:
    """Collect the startup checks required by the frontend.

    Returns:
        dict
    """
    checks = {
        "backend": check_backend(),
        "database": check_database(),
        "config": check_config(),
        "llm_service": check_llm_service(),
    }

    critical_keys = ["backend", "database", "config", "llm_service"]

    critical_ok = all(checks[key] for key in critical_keys)

    return {
        "ok": critical_ok,
        "checks": checks,
        "version": "0.1.0",
    }
