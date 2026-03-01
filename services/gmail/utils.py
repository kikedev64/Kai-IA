import base64
from typing import Any, Dict, Optional
from core.auth import get_creds
from googleapiclient.discovery import build
from core.models.email import Email 
from email.message import EmailMessage
from fastapi import HTTPException,status

def _b64url_decode(data: str) -> str:
    return base64.urlsafe_b64decode(data.encode("utf-8")).decode("utf-8", errors="replace")


def _headers_to_dict(payload: Dict[str, Any]) -> Dict[str, str]:
    return {h["name"]: h["value"] for h in payload.get("headers", [])}


def _extract_bodies(payload: Dict[str, Any]) -> Dict[str, Optional[str]]:
    text_plain = None
    text_html = None

    def walk(part: Dict[str, Any]):
        nonlocal text_plain, text_html

        mime_type = part.get("mimeType")
        body = part.get("body", {})
        data = body.get("data")

        if mime_type == "text/plain" and data and text_plain is None:
            text_plain = _b64url_decode(data)
            return
        if mime_type == "text/html" and data and text_html is None:
            text_html = _b64url_decode(data)
            return

        for p in part.get("parts", []) or []:
            walk(p)

    walk(payload)
    return {"text_plain": text_plain, "text_html": text_html}

def _gmail_msg_to_email(msg: dict) -> Email:
    payload = msg.get("payload", {})
    headers = _headers_to_dict(payload)
    bodies = _extract_bodies(payload)

    return Email(
        id=msg.get("id"),
        thread_id=msg.get("threadId"),
        sender=headers.get("From"),
        to=headers.get("To"),
        subject=headers.get("Subject"),
        date=headers.get("Date"),
        snippet=msg.get("snippet"),
        body_text=bodies["text_plain"],
        body_html=bodies["text_html"],
    )


def _get_service():
    creds = get_creds()
    if "creds" in creds:
        return build("gmail", "v1", credentials=creds["creds"])
    
    if "auth_url" in creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "message":"Google authentication required",
                "auth_url":creds["auth_url"]
            }
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "error":creds["error"]
        }
    )

def _apply_thread_headers(message: EmailMessage, email: Email) -> None:
    if getattr(email, "in_reply_to", None):
        message["In-Reply-To"] = email.in_reply_to
    if getattr(email, "references", None):
        message["References"] = email.references

