"""Unit tests for core.database schema creation and seed data."""
import sqlite3
from pathlib import Path


def test_init_creates_db_file(isolated_db: Path) -> None:
    """Verify that database initialization creates the SQLite file."""
    assert isolated_db.exists()


def test_all_tables_exist(isolated_db: Path) -> None:
    """Verify that all required application tables are present."""
    conn = sqlite3.connect(isolated_db)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = {row[0] for row in cur.fetchall()}
    conn.close()

    assert {"chat_sessions", "chat_messages", "app_config", "user_profile", "chat_context"}.issubset(tables)


def test_app_config_seeded_with_required_keys(isolated_db: Path) -> None:
    """Verify that app_config is seeded with the required default keys."""
    conn = sqlite3.connect(isolated_db)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT key FROM app_config")
    keys = {row["key"] for row in cur.fetchall()}
    conn.close()

    required = {
        "model_name",
        "temperature",
        "google_scopes",
        "system_prompt_default",
        "tool_activation_keywords",
        "lmstudio_timeout",
        "tool_approval_timeout",
        "shell_command_timeout",
    }
    assert required.issubset(keys)


def test_get_connection_enables_row_factory(isolated_db: Path) -> None:
    """Verify that get_connection returns rows addressable by column name."""
    from core.database import get_connection

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT key, value FROM app_config LIMIT 1")
    row = cur.fetchone()
    conn.close()

    assert row is not None
    assert row["key"] is not None


def test_foreign_keys_are_enabled(isolated_db: Path) -> None:
    """Verify that SQLite foreign key enforcement is enabled."""
    from core.database import get_connection

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys")
    fk = cur.fetchone()[0]
    conn.close()

    assert fk == 1


def test_init_db_is_idempotent(isolated_db: Path) -> None:
    """Verify that repeated initialization does not duplicate seed rows."""
    from core.database import get_connection, init_db

    init_db()

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) AS cnt FROM app_config WHERE key = 'model_name'")
    row = cur.fetchone()
    conn.close()

    assert row["cnt"] == 1


def test_model_name_default_is_set(isolated_db: Path) -> None:
    """Verify that the default model_name setting has a non-empty value."""
    from core.database import get_connection

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT value FROM app_config WHERE key = 'model_name'")
    row = cur.fetchone()
    conn.close()

    assert row is not None
    assert row["value"]


def test_chat_messages_index_exists(isolated_db: Path) -> None:
    """Verify that the chat messages lookup index exists."""
    conn = sqlite3.connect(isolated_db)
    cur = conn.cursor()
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_chat_messages_chat_id_created_at'"
    )
    row = cur.fetchone()
    conn.close()

    assert row is not None
