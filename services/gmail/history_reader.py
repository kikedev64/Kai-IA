from __future__ import annotations
from typing import Any
from googleapiclient.errors import HttpError
from core.database import get_connection
from services.gmail.utils import _get_service

def get_latest_history_id() -> str | None:
    service = _get_service()

    profile = service.users().getProfile(userId="me").execute()
    if profile.get("historyId"):
        return profile.get("historyId")

    res = service.users().messages().list(
        userId="me",
        labelIds=["INBOX"],
        maxResults=1
    ).execute()

    messages = res.get("messages", [])
    if not messages:
        return None

    msg_id = messages[0]["id"]

    msg = service.users().messages().get(
        userId="me",
        id=msg_id,
        format="minimal"
    ).execute()

    return msg.get("historyId")


def read_history_since(
    start_history_id: str,
    label_id: str = "INBOX",
) -> dict[str, Any]:
    
    service = _get_service()

    page_token = None
    latest_history_id: str | None = None
    message_ids: list[str] = []
    history_rows: list[dict[str, Any]] = []

    try:
        while True:
            response = service.users().history().list(
                userId="me",
                startHistoryId=start_history_id,
                historyTypes=["messageAdded"],
                labelId=label_id,
                pageToken=page_token,
            ).execute()

            latest_history_id = response.get("historyId", latest_history_id)

            for row in response.get("history", []):
                history_rows.append(row)

                for item in row.get("messagesAdded", []):
                    message = item.get("message", {})
                    msg_id = message.get("id")
                    if msg_id:
                        message_ids.append(msg_id)

            page_token = response.get("nextPageToken")
            if not page_token:
                break

        seen = set()
        unique_ids: list[str] = []
        for msg_id in message_ids:
            if msg_id not in seen:
                seen.add(msg_id)
                unique_ids.append(msg_id)

        return {
            "history_id": latest_history_id or start_history_id,
            "changed": len(unique_ids) > 0,
            "message_ids": unique_ids,
            "history": history_rows,
            "needs_rebootstrap": False,
        }

    except HttpError as e:
        if getattr(e.resp, "status", None) == 404:
            return {
                "history_id": None,
                "changed": False,
                "message_ids": [],
                "history": [],
                "needs_rebootstrap": True,
            }
        raise


def check_history_changes(
    start_history_id: str,
    label_id: str = "INBOX",
) -> dict[str, Any]:

    result = read_history_since(
        start_history_id=start_history_id,
        label_id=label_id,
    )

    return {
        "changed": result["changed"],
        "message_ids": result["message_ids"],
        "latest_history_id": result["history_id"],
        "needs_rebootstrap": result["needs_rebootstrap"],
    }

def get_history_ids(only_latest: bool = False) -> list[dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()

    base_query = """
        SELECT
            gss.id,
            gss.google_account_id,
            ga.email,
            gss.last_history_id,
            gss.last_sync_at,
            gss.last_full_sync_at,
            gss.sync_error,
            gss.watch_expiration,
            gss.created_at,
            gss.updated_at
        FROM gmail_sync_state gss
        JOIN google_accounts ga
            ON ga.id = gss.google_account_id
        WHERE gss.last_history_id IS NOT NULL
    """

    if only_latest:
        query = base_query + """
            ORDER BY
                COALESCE(gss.updated_at, gss.created_at) DESC,
                gss.id DESC
            LIMIT 1
        """
    else:
        query = base_query + """
            ORDER BY
                COALESCE(gss.updated_at, gss.created_at) DESC,
                gss.id DESC
        """

    cur.execute(query)
    rows = cur.fetchall()
    conn.close()

    return [dict(row) for row in rows]
