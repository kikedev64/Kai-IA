import base64
import mimetypes
from email.message import EmailMessage
from core.auth import get_creds
from core.models.email import Email
from services.gmail.utils import _get_service

def send_email(email: Email, as_html: bool = False):

    creds = get_creds()
    service = _get_service()

    message = EmailMessage()
    message["To"] = email.to
    message["From"] = "me"
    message["Subject"] = email.subject

    if as_html:
        html_content = email.body_html or email.body_text or ""
        text_fallback = email.body_text or "Este correo contiene contenido HTML."

        message.set_content(text_fallback)
        message.add_alternative(html_content, subtype="html")
    else:
        message.set_content(email.body_text or "")

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

    return service.users().messages().send(
        userId="me",
        body={"raw": raw}
    ).execute()

def send_email_with_attachments( email: Email, file_paths: list[str], as_html: bool = False ):

    creds = get_creds()
    service = _get_service()

    message = EmailMessage()
    message["To"] = email.to
    message["From"] = "me"
    message["Subject"] = email.subject

    # --- Body ---
    if as_html:
        html_content = email.body_html or email.body_text or ""
        text_fallback = email.body_text or "Este correo contiene contenido HTML."
        message.set_content(text_fallback)
        message.add_alternative(html_content, subtype="html")
    else:
        message.set_content(email.body_text or "")

    # --- Adjuntos ---
    for path in file_paths:
        with open(path, "rb") as f:
            file_data = f.read()

        mime_type, _ = mimetypes.guess_type(path)
        if mime_type:
            maintype, subtype = mime_type.split("/", 1)
        else:
            maintype, subtype = "application", "octet-stream"

        filename = path.split("\\")[-1].split("/")[-1]

        message.add_attachment(
            file_data,
            maintype=maintype,
            subtype=subtype,
            filename=filename
        )

    # --- Envío ---
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

    return service.users().messages().send(
        userId="me",
        body={"raw": raw}
    ).execute()