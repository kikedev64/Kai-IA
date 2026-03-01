from __future__ import annotations
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from googleapiclient.errors import HttpError
from api.schemas.gmail import GmailSendRequest, GmailSendResponse
from core.models.email import Email
from services.gmail.send import send_email,send_email_with_attachments
from core.config import EMAIL_MAX_TOTAL_SIZE_ATTACHMENT as MAX_TOTAL_SIZE

router = APIRouter(prefix="/gmail", tags=["Gmail"])


@router.post("/send", response_model=GmailSendResponse)
def api_send_email(req: GmailSendRequest):
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

@router.post("/send-with-attachment")
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
):
    try:
        attachments = []
        total_size = 0
        for file in files:
            content = await file.read()
            total_size += len(content)

            if total_size > MAX_TOTAL_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail="Total attachment size exceeds 25MB"
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
            email=email,
            attachments=attachments,
            as_html=as_html
        )

        return {
            "id": result["id"],
            "threadId": result["threadId"],
            "labelIds": result.get("labelIds"),
        }

    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))