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