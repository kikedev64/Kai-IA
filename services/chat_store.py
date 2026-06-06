from __future__ import annotations

from typing import Optional

from core.database import get_connection


def ensure_session(chat_id: str, system_prompt: str) -> None:
    """Ensure the session exists.

    Args:
        chat_id: Identifier of the chat session.
        system_prompt: System prompt stored for the chat session.

    Returns:
        None
    """
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
    """Add a message to a chat session.

    Args:
        chat_id: Identifier of the chat session.
        role: Message role stored in the chat history.
        content: Message content stored in the database.

    Returns:
        None
    """
    if role not in {"user", "assistant"}:
        return

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


def set_chat_context(chat_id: str, key: str, content: str) -> None:
    """Persist auxiliary context for a chat session.

    Args:
        chat_id: Identifier of the chat session.
        key: Context namespace.
        content: Context text stored for later turns.

    Returns:
        None
    """
    if not chat_id or not key or not content.strip():
        return

    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO chat_context (chat_id, key, content, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(chat_id, key) DO UPDATE SET
            content = excluded.content,
            updated_at = CURRENT_TIMESTAMP
        """,
        (chat_id, key, content),
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


def get_chat_context(chat_id: str, key: str) -> Optional[str]:
    """Return auxiliary context for a chat session.

    Args:
        chat_id: Identifier of the chat session.
        key: Context namespace.

    Returns:
        Optional[str]
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT content
        FROM chat_context
        WHERE chat_id = ? AND key = ?
        """,
        (chat_id, key),
    )

    row = cur.fetchone()
    conn.close()

    return row["content"] if row else None


def get_messages(chat_id: str, limit: int = 50) -> list[dict]:
    """Return the messages.

    Args:
        chat_id: Identifier of the chat session.
        limit: Maximum number of records to return.

    Returns:
        list[dict]
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT role, content
        FROM chat_messages
        WHERE chat_id = ?
          AND role IN ('user', 'assistant')
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
    """Return the system prompt.

    Args:
        chat_id: Identifier of the chat session.

    Returns:
        Optional[str]
    """
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
    """Return the chat title.

    Args:
        chat_id: Identifier of the chat session.

    Returns:
        Optional[str]
    """
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
    """Update the chat title.

    Args:
        chat_id: Identifier of the chat session.
        title: Task or chat title processed by the function.

    Returns:
        None
    """
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
    """Count user messages in a chat session.

    Args:
        chat_id: Identifier of the chat session.

    Returns:
        int
    """
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


def list_chat_sessions() -> list[dict]:
    """Return the chat sessions list.

    Returns:
        list[dict]
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            chat_id,
            COALESCE(title, 'Nuevo chat') AS title,
            created_at,
            updated_at
        FROM chat_sessions
        ORDER BY updated_at DESC
        """
    )

    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def delete_chat(chat_id: str) -> bool:
    """Delete a chat session and all its associated data.

    Args:
        chat_id: Identifier of the chat session to delete.

    Returns:
        bool: True if the session existed and was deleted, False otherwise.
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("DELETE FROM chat_messages WHERE chat_id = ?", (chat_id,))
    cur.execute("DELETE FROM chat_context WHERE chat_id = ?", (chat_id,))
    cur.execute("DELETE FROM chat_sessions WHERE chat_id = ?", (chat_id,))

    deleted = cur.rowcount > 0
    conn.commit()
    conn.close()

    return deleted


def get_full_chat_by_id(chat_id: str) -> dict | None:
    """Return the full chat by id.

    Args:
        chat_id: Identifier of the chat session.

    Returns:
        dict | None
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            chat_id,
            COALESCE(title, 'Nuevo chat') AS title,
            created_at,
            updated_at
        FROM chat_sessions
        WHERE chat_id = ?
        """,
        (chat_id,),
    )
    chat_row = cur.fetchone()

    if not chat_row:
        conn.close()
        return None

    cur.execute(
        """
        SELECT
            id,
            role,
            content,
            created_at
        FROM chat_messages
        WHERE chat_id = ?
          AND role IN ('user', 'assistant')
        ORDER BY id ASC
        """,
        (chat_id,),
    )
    message_rows = cur.fetchall()

    conn.close()

    return {
        "chat_id": chat_row["chat_id"],
        "title": chat_row["title"],
        "created_at": chat_row["created_at"],
        "updated_at": chat_row["updated_at"],
        "messages": [dict(row) for row in message_rows],
    }
