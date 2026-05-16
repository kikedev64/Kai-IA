from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from googleapiclient.errors import HttpError
from api.schemas.gmail import (
    GmailSendRequest,
    GmailSendResponse,
    GmailReadEmailsResponse,
    GmailThreadResponse,
)
from core.models.email import Email
from services.gmail.send import send_email, send_email_with_attachments
from services.gmail.full_read import (
    read_email_by_id,
    read_last_emails_by_subject,
    read_last_emails_full,
    read_last_emails_from_sender,
    read_thread_from_message_id,
)
from core.config import get_email_max_total_size_attachment
from api.routers.service_exposure import require_service_endpoints_exposed

router = APIRouter(prefix="/email-request", tags=["Email Requests"])


@router.post(
    "/send",
    response_model=GmailSendResponse,
    dependencies=[Depends(require_service_endpoints_exposed)],
)
def api_send_email(req: GmailSendRequest) -> dict:
    """Serve the send email endpoint.

    Args:
        req: Request payload received by the endpoint.

    Returns:
        dict
    """
    try:
        email = Email.from_send_request(req)
        result = send_email(email=email, as_html=req.as_html)

        return {
            "id": result["id"],
            "threadId": result["threadId"],
            "labelIds": result.get("labelIds"),
        }

    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.post(
    "/send-with-attachment",
    dependencies=[Depends(require_service_endpoints_exposed)],
)
async def send_email_with_attachment(
    to: str = Form(...),
    subject: str = Form(...),
    body: str = Form(...),
    cc: list[str] = Form(default=[]),
    bcc: list[str] = Form(default=[]),
    reply_to: str | None = Form(default=None),
    thread_id: str | None = Form(default=None),
    in_reply_to: str | None = Form(default=None),
    references: str | None = Form(default=None),
    as_html: bool = Form(False),
    files: list[UploadFile] = File(default=[]),
) -> dict:
    """Send the email with attachment.

    Args:
        to: Recipient address.
        subject: Subject text used by the message or filter.
        body: Body text used by the message.
        cc: Carbon-copy recipients.
        bcc: Blind carbon-copy recipients.
        reply_to: Reply-To address.
        thread_id: Identifier of the email thread.
        in_reply_to: In Reply-To address.
        references: Thread reference header.
        as_html: Whether the email body should be sent as HTML.
        files: Uploaded files received by the endpoint.

    Returns:
        dict
    """
    try:
        attachments = []
        total_size = 0
        for file in files:
            content = await file.read()
            total_size += len(content)

            if total_size > get_email_max_total_size_attachment():
                raise HTTPException(
                    status_code=400, detail="Total attachment size exceeds 25MB"
                )

            attachments.append((file.filename, content))

        email = Email(
            id="",
            thread_id=thread_id or "",
            sender="me",
            to=to,
            subject=subject,
            date="",
            snippet="",
            body=body,
            cc=cc,
            bcc=bcc,
            reply_to=reply_to,
            references=references,
            in_reply_to=in_reply_to,
        )

        result = send_email_with_attachments(
            email=email, attachments=attachments, as_html=as_html
        )

        return {
            "id": result["id"],
            "threadId": result["threadId"],
            "labelIds": result.get("labelIds"),
        }

    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


def _email_to_api(e: Email) -> dict:
    """Map an email model into the public API response shape.

    Args:
        e: Model object mapped into an API response.

    Returns:
        dict
    """
    return {
        "id": getattr(e, "id", ""),
        "thread_id": getattr(e, "thread_id", "") or "",
        "sender": getattr(e, "sender", "") or "",
        "to": getattr(e, "to", "") or "",
        "subject": getattr(e, "subject", "") or "",
        "date": getattr(e, "date", "") or "",
        "snippet": getattr(e, "snippet", "") or "",
        "body": getattr(e, "body", "") or "",
        "cc": getattr(e, "cc", []) or [],
        "bcc": getattr(e, "bcc", []) or [],
        "reply_to": getattr(e, "reply_to", None),
        "message_id": getattr(e, "message_id", None),
        "references": getattr(e, "references", None),
        "in_reply_to": getattr(e, "in_reply_to", None),
    }


@router.get(
    "/read/last",
    response_model=GmailReadEmailsResponse,
    dependencies=[Depends(require_service_endpoints_exposed)],
)
def api_read_last_emails(
    max_results: int = Query(5, ge=1, le=50),
) -> dict:
    """Serve the read last emails endpoint.

    Args:
        max_results: Maximum number of items to return.

    Returns:
        dict
    """
    try:
        emails = read_last_emails_full(max_results=max_results)
        return {"items": [_email_to_api(e) for e in emails]}
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.get(
    "/read/from",
    response_model=GmailReadEmailsResponse,
    dependencies=[Depends(require_service_endpoints_exposed)],
)
def api_read_last_emails_from_sender(
    sender: str = Query(..., min_length=1),
    max_results: int = Query(5, ge=1, le=50),
) -> dict:
    """Serve the read last emails from sender endpoint.

    Args:
        sender: Sender address used to filter email messages.
        max_results: Maximum number of items to return.

    Returns:
        dict
    """
    try:
        emails = read_last_emails_from_sender(sender=sender, max_results=max_results)
        return {"items": [_email_to_api(e) for e in emails]}
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.get(
    "/read/subject",
    response_model=GmailReadEmailsResponse,
    dependencies=[Depends(require_service_endpoints_exposed)],
)
def api_read_last_emails_by_subject(
    subject: str = Query(..., min_length=1),
    max_results: int = Query(5, ge=1, le=50),
) -> dict:
    """Serve the read last emails by subject endpoint.

    Args:
        subject: Subject text used by the message or filter.
        max_results: Maximum number of items to return.

    Returns:
        dict
    """
    try:
        emails = read_last_emails_by_subject(
            subject_text=subject, max_results=max_results
        )
        return {"items": [_email_to_api(e) for e in emails]}
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.get(
    "/thread/from-message/{message_id}",
    response_model=GmailThreadResponse,
    dependencies=[Depends(require_service_endpoints_exposed)],
)
def api_read_thread_from_message_id(message_id: str) -> dict:
    """Serve the read thread from message id endpoint.

    Args:
        message_id: Identifier of the Gmail message.

    Returns:
        dict
    """
    try:
        thread = read_thread_from_message_id(message_id=message_id)
        if thread is None:
            raise HTTPException(status_code=404, detail="Thread not found")

        return {
            "thread_id": thread.thread_id,
            "emails": [_email_to_api(e) for e in thread.messages],
        }

    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.get("/email")
def get_email_by_id(
    message_id: str = Query(..., min_length=1, description="ID del mensaje de Gmail"),
    clean_body: bool = Query(
        True, description="Si true, limpia el body HTML/CSS y ruido"
    ),
) -> dict:
    """Return the email by id.

    Args:
        message_id: Identifier of the Gmail message.
        clean_body: Whether the email body should be normalized before returning it.

    Returns:
        dict
    """
    email = read_email_by_id(message_id=message_id, clean_body=clean_body)

    if email is None:
        raise HTTPException(status_code=404, detail="Correo no encontrado")

    return {
        "status": "success",
        "data": {
            "id": email.id,
            "thread_id": email.thread_id,
            "sender": email.sender,
            "to": email.to,
            "subject": email.subject,
            "date": email.date,
            "snippet": email.snippet,
            "body": email.body,
            "cc": email.cc,
            "bcc": email.bcc,
            "message_id": email.message_id,
            "references": email.references,
            "in_reply_to": email.in_reply_to,
        },
    }
