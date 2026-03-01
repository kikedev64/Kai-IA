import base64
from typing import Any, Dict, Optional

from core.auth import get_creds
from googleapiclient.discovery import build
from core.models.email import Email
from email.message import EmailMessage
from fastapi import HTTPException, status


def _b64url_decode(data: str) -> str:
    return base64.urlsafe_b64decode(data.encode("utf-8")).decode("utf-8", errors="replace")


def _headers_to_dict(payload: Dict[str, Any]) -> Dict[str, str]:
    return {h.get("name", ""): h.get("value", "") for h in payload.get("headers", [])}


def _extract_bodies(payload: Dict[str, Any]) -> Dict[str, Optional[str]]:
    text_plain: Optional[str] = None
    text_html: Optional[str] = None

    def walk(part: Dict[str, Any]):
        nonlocal text_plain, text_html

        mime_type = part.get("mimeType")
        body = part.get("body", {}) or {}
        data = body.get("data")

        if mime_type == "text/plain" and data and text_plain is None:
            text_plain = _b64url_decode(data)
            return

        if mime_type == "text/html" and data and text_html is None:
            text_html = _b64url_decode(data)
            return

        for p in (part.get("parts") or []):
            walk(p)

    walk(payload)
    return {"text_plain": text_plain, "text_html": text_html}


def _gmail_msg_to_email(msg: dict) -> Email:
    payload = msg.get("payload", {}) or {}
    headers = _headers_to_dict(payload)
    bodies = _extract_bodies(payload)
    body = bodies.get("text_html") or bodies.get("text_plain") or ""

    return Email(
        id=str(msg.get("id") or ""),
        thread_id=str(msg.get("threadId") or ""),
        sender=headers.get("From") or "",
        to=headers.get("To") or "",
        subject=headers.get("Subject") or "",
        body=body,
        date=headers.get("Date") or "",
        snippet=str(msg.get("snippet") or ""),
        reply_to=headers.get("Reply-To"),
        message_id=headers.get("Message-ID"),
        references=headers.get("References"),
        in_reply_to=headers.get("In-Reply-To"),
        cc=[],
        bcc=[],
    )


def _get_service():
    creds = get_creds()

    if "creds" in creds:
        return build("gmail", "v1", credentials=creds["creds"])

    if "auth_url" in creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"message": "Google authentication required", "auth_url": creds["auth_url"]},
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"error": creds.get("error", "Unknown error")},
    )


def _apply_thread_headers(message: EmailMessage, email: Email) -> None:
    if getattr(email, "in_reply_to", None):
        message["In-Reply-To"] = email.in_reply_to
    if getattr(email, "references", None):
        message["References"] = email.references