# api/services/user_profile_service.py
from __future__ import annotations

import json
from core.database import get_connection


def get_all_user_profile() -> list[dict]:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT key, value, updated_at
        FROM user_profile
        ORDER BY key ASC
    """)
    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_user_profile_value(key: str) -> dict | None:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT key, value, updated_at
        FROM user_profile
        WHERE key = ?
    """, (key,))
    row = cur.fetchone()
    conn.close()

    return dict(row) if row else None


def upsert_user_profile_values(data: dict[str, object]) -> list[dict]:
    conn = get_connection()
    cur = conn.cursor()

    out: list[dict] = []

    for key, value in data.items():
        if isinstance(value, (dict, list)):
            stored_value = json.dumps(value, ensure_ascii=False)
        else:
            stored_value = str(value)

        cur.execute("""
            INSERT INTO user_profile (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
        """, (key, stored_value))

    conn.commit()

    cur.execute("""
        SELECT key, value, updated_at
        FROM user_profile
        ORDER BY key ASC
    """)
    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]

def parse_llm_profile_output(raw_text: str) -> dict[str, object]:
    """
    Espera un JSON válido producido por el LLM.
    """
    data = json.loads(raw_text)

    if not isinstance(data, dict):
        raise ValueError("El resultado del LLM debe ser un objeto JSON")

    clean_data: dict[str, object] = {}

    for key, value in data.items():
        if not isinstance(key, str):
            continue
        clean_data[key.strip()] = value

    return clean_data

def get_all_user_profile() -> list[dict]:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT key, value, updated_at
        FROM user_profile
        ORDER BY key ASC
    """)
    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_user_profile_as_dict() -> dict[str, object]:
    items = get_all_user_profile()
    out: dict[str, object] = {}

    for item in items:
        key = item["key"]
        value = item["value"]

        # intenta parsear JSON si aplica
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                out[key] = parsed
                continue
            except Exception:
                pass

        out[key] = value

    return out