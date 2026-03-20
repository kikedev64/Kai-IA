from __future__ import annotations

from typing import Any, Optional

from core.database import get_connection


def ensure_session(chat_id: str, system_prompt: str) -> None:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO chat_sessions (chat_id, title, system_prompt, created_at, updated_at)
        VALUES (?, NULL, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(chat_id) DO NOTHING
        """,
        (chat_id, system_prompt),
    )

    conn.commit()
    conn.close()


def add_message(chat_id: str, role: str, content: str) -> None:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO chat_messages (chat_id, role, content)
        VALUES (?, ?, ?)
        """,
        (chat_id, role, content),
    )

    cur.execute(
        """
        UPDATE chat_sessions
        SET updated_at = CURRENT_TIMESTAMP
        WHERE chat_id = ?
        """,
        (chat_id,),
    )

    conn.commit()
    conn.close()


def get_messages(chat_id: str, limit: int = 50) -> list[dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT role, content
        FROM chat_messages
        WHERE chat_id = ?
        ORDER BY id DESC
        LIMIT ?
        """,
        (chat_id, limit),
    )

    rows = cur.fetchall()
    conn.close()

    rows = list(reversed(rows))
    return [{"role": r["role"], "content": r["content"]} for r in rows]


def get_system_prompt(chat_id: str) -> Optional[str]:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT system_prompt
        FROM chat_sessions
        WHERE chat_id = ?
        """,
        (chat_id,),
    )

    row = cur.fetchone()
    conn.close()

    return row["system_prompt"] if row else None


def get_chat_title(chat_id: str) -> Optional[str]:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT title
        FROM chat_sessions
        WHERE chat_id = ?
        """,
        (chat_id,),
    )

    row = cur.fetchone()
    conn.close()

    return row["title"] if row else None


def update_chat_title(chat_id: str, title: str) -> None:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        UPDATE chat_sessions
        SET title = ?, updated_at = CURRENT_TIMESTAMP
        WHERE chat_id = ?
        """,
        (title, chat_id),
    )

    conn.commit()
    conn.close()


def count_user_messages(chat_id: str) -> int:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT COUNT(*) AS total
        FROM chat_messages
        WHERE chat_id = ? AND role = 'user'
        """,
        (chat_id,),
    )

    row = cur.fetchone()
    conn.close()

    return int(row["total"] if row else 0)