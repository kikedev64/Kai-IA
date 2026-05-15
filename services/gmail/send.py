import base64
import mimetypes
from email.message import EmailMessage
from core.models.email import Email
from services.gmail.utils import _get_service,_apply_thread_headers
from core.config import get_email_max_total_size_attachment

def send_email(email: Email, as_html: bool = False) -> dict:
    """Send the email.

    Args:
        email: Email model processed by the function.
        as_html: Whether the email body should be sent as HTML.

    Returns:
        dict
    """
    service = _get_service()

    message = EmailMessage()
    message["To"] = email.to
    message["From"] = "me"
    message["Subject"] = email.subject

    if getattr(email, "thread_id", None):
        _apply_thread_headers(message, email)

    message.set_content(email.body or "")
    if as_html:
        message.add_alternative(email.body, subtype="html")

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

    body = {"raw": raw}

    if getattr(email, "thread_id", None):
        body["threadId"] = email.thread_id

    return service.users().messages().send(
        userId="me",
        body=body
    ).execute()

def send_email_with_attachments(
    email: Email,
    attachments: list[tuple[str, bytes]],
    as_html: bool = False,
) -> dict:
    """Send the email with attachments.

    Args:
        email: Email model processed by the function.
        attachments: Attachment payloads included in the email.
        as_html: Whether the email body should be sent as HTML.

    Returns:
        dict
    """
    service = _get_service()

    message = EmailMessage()
    message["To"] = email.to
    message["From"] = "me"
    message["Subject"] = email.subject

    if getattr(email, "thread_id", None):
        _apply_thread_headers(message, email)

    if as_html:
        message.set_content("Este correo contiene HTML.")
        message.add_alternative(email.body or "", subtype="html")
    else:
        message.set_content(email.body or "")

    total_size = 0

    for filename, file_bytes in attachments:
        total_size += len(file_bytes)

        if total_size > get_email_max_total_size_attachment():
            raise ValueError("Total attachment size exceeds 25 MB")

        mime_type, _ = mimetypes.guess_type(filename)
        if mime_type:
            maintype, subtype = mime_type.split("/", 1)
        else:
            maintype, subtype = "application", "octet-stream"

        message.add_attachment(
            file_bytes,
            maintype=maintype,
            subtype=subtype,
            filename=filename,
        )

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

    body = {"raw": raw}

    if getattr(email, "thread_id", None):
        body["threadId"] = email.thread_id

    return service.users().messages().send(
        userId="me",
        body=body,
    ).execute()
