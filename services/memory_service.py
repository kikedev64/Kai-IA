from typing import List
from core.database import get_connection

def get_user_profile() -> dict:
    """Return the user profile.

    Returns:
        dict
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT name, timezone FROM user_profile WHERE id = 1")
    row = cur.fetchone()

    conn.close()

    if not row:
        return {"name": None, "timezone": None}

    return dict(row)


def update_user_name(name: str) -> None:
    """Update the user name.

    Args:
        name: Name value processed by the function.

    Returns:
        None
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO user_profile (id, name)
        VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            updated_at = CURRENT_TIMESTAMP
    """, (name,))

    conn.commit()
    conn.close()

def add_memory(content: str) -> None:
    """Add a memory entry.

    Args:
        content: Message content stored in the database.

    Returns:
        None
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        "INSERT INTO memories (content) VALUES (?)",
        (content,)
    )

    conn.commit()
    conn.close()


def list_memories() -> List[str]:
    """Return the memories list.

    Returns:
        List[str]
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT content FROM memories ORDER BY created_at DESC")
    rows = cur.fetchall()

    conn.close()

    return [row["content"] for row in rows]