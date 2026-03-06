from typing import List

from core.models.email import Email
from core.models.email_thread import EmailThread
from services.gmail.html_formatter import clean_email_body
from services.gmail.utils import _get_service, _gmail_msg_to_email


def read_last_emails_full(max_results: int = 5, clean_body: bool = False) -> List[Email]:
    service = _get_service()

    res = service.users().messages().list(userId="me", maxResults=max_results).execute()
    msgs = res.get("messages", [])
    if not msgs:
        return []

    out: List[Email] = []
    for m in msgs:
        full_msg = service.users().messages().get(userId="me", id=m["id"], format="full").execute()
        email = _gmail_msg_to_email(full_msg)

        if clean_body:
            email.body = clean_email_body(email.body)

        out.append(email)

    return out


def read_last_emails_from_sender(sender: str, max_results: int = 5, clean_body: bool = False) -> List[Email]:
    service = _get_service()

    res = service.users().messages().list(
        userId="me",
        q=f"from:{sender}",
        maxResults=max_results
    ).execute()

    msgs = res.get("messages", [])
    if not msgs:
        return []

    out: List[Email] = []
    for m in msgs:
        full_msg = service.users().messages().get(userId="me", id=m["id"], format="full").execute()
        email = _gmail_msg_to_email(full_msg)

        if clean_body:
            email.body = clean_email_body(email.body)

        out.append(email)

    return out


def read_last_emails_by_subject(subject_text: str, max_results: int = 5, clean_body: bool = False) -> List[Email]:
    service = _get_service()

    query = f"subject:{subject_text}"

    res = service.users().messages().list(
        userId="me",
        q=query,
        maxResults=max_results
    ).execute()

    msgs = res.get("messages", [])
    if not msgs:
        return []

    out: List[Email] = []
    for m in msgs:
        full_msg = service.users().messages().get(userId="me", id=m["id"], format="full").execute()
        email = _gmail_msg_to_email(full_msg)

        if clean_body:
            email.body = clean_email_body(email.body)

        out.append(email)

    return out


def read_thread_from_message_id(message_id: str, clean_body: bool = False) -> EmailThread | None:
    service = _get_service()

    meta = service.users().messages().get(userId="me", id=message_id, format="metadata").execute()
    thread_id = meta.get("threadId")
    if not thread_id:
        return None

    thread = service.users().threads().get(userId="me", id=thread_id, format="full").execute()
    messages = thread.get("messages", [])
    if not messages:
        return EmailThread(thread_id, [])

    emails = [_gmail_msg_to_email(m) for m in messages]

    if clean_body:
        for email in emails:
            email.body = clean_email_body(email.body)

    emails.sort(
        key=lambda e: int(
            next((m.get("internalDate") for m in messages if m.get("id") == e.id), "0")
        )
    )

    return EmailThread(thread_id, emails)