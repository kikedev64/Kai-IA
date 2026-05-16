from __future__ import annotations
from typing import List, Optional


class Email:
    """Domain model representing one email message.

    Stores Gmail identifiers, recipients, body content and threading
    headers used by send and reply workflows.
    """

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
    ) -> None:
        """Store the values needed by this object.

        Args:
            id: Email identifier.
            sender: Sender address used to filter email messages.
            to: Recipient address.
            subject: Subject text used by the message or filter.
            body: Body text used by the message.
            date: Message date.
            thread_id: Identifier of the email thread.
            snippet: Short message preview.
            cc: Carbon-copy recipients.
            bcc: Blind carbon-copy recipients.
            reply_to: Reply-To address.
            message_id: Identifier of the Gmail message.
            references: Thread reference header.
            in_reply_to: In Reply-To address.

        Returns:
            None
        """
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
        """Build the payload needed to reply to this email.

        Returns:
            dict
        """
        return {
            "thread_id": self.thread_id,
            "in_reply_to": self.in_reply_to,
            "references": self.references,
        }

    @classmethod
    def from_send_request(cls, req) -> "Email":
        """Create an Email model from a Gmail send request.

        Args:
            req: Request payload received by the endpoint.

        Returns:
            "Email"
        """

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
