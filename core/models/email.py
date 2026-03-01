from __future__ import annotations
from typing import List, Optional

class Email:
    def __init__(
        self,
        id: str,
        sender: str,
        to: str,
        subject: str,
        body: str,
        date: str,
        thread_id: str,
        snippet: str | None = None,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        reply_to: Optional[str] = None,
        message_id: Optional[str] = None,
        references: Optional[str] = None,
        in_reply_to: Optional[str] = None,
    ):
        self.id = id
        self.thread_id = thread_id
        self.sender = sender
        self.to = to
        self.subject = subject
        self.date = date
        self.snippet = snippet
        self.body = body

        self.cc = cc or []
        self.bcc = bcc or []
        self.reply_to = reply_to

        self.message_id = message_id
        self.references = references
        self.in_reply_to = in_reply_to

    def to_reply_payload(self) -> dict:
        return {
            "thread_id": self.thread_id,
            "in_reply_to": self.in_reply_to,
            "references": self.references,
        }

    @classmethod
    def from_send_request(cls, req) -> "Email":

        return cls(
            id="",
            thread_id=req.thread_id or "",
            sender="me",
            to=str(req.to),
            subject=req.subject,
            date="",
            snippet="",
            body=req.body,
            cc=[str(x) for x in (req.cc or [])],
            bcc=[str(x) for x in (req.bcc or [])],
            reply_to=str(req.reply_to) if req.reply_to else None,
            references=req.references,
            in_reply_to=req.in_reply_to,
            message_id=None,
        )