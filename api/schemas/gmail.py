from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field, EmailStr, field_validator


class GmailThread(BaseModel):
    """Minimal Gmail thread reference.

    Holds the message and thread identifiers returned by list-style
    Gmail API calls.
    """

    id: str
    threadId: str


class GmailListThreadsResponse(BaseModel):
    """Response payload for Gmail thread listings.

    Includes the current thread page, pagination token and result
    estimate from Gmail.
    """

    items: list[GmailThread] = Field(default_factory=list)
    nextPageToken: Optional[str] = None
    resultSizeEstimate: Optional[int] = None


class GmailSendRequest(BaseModel):
    """Request payload used to send a Gmail message.

    Supports new emails and threaded replies, including optional
    CC/BCC recipients and HTML mode.
    """

    to: EmailStr
    subject: str
    body: str

    cc: list[EmailStr] = Field(default_factory=list)
    bcc: list[EmailStr] = Field(default_factory=list)

    reply_to: EmailStr | None = None

    thread_id: Optional[str] = None
    in_reply_to: Optional[str] = None
    references: Optional[str] = None

    as_html: bool = False

    @field_validator("reply_to", mode="before")
    @classmethod
    def empty_reply_to_to_none(cls, v: object) -> object:
        """Normalize an empty reply-to value to None.

        Args:
            v: Validator input value.

        Returns:
        object
        """
        return None if v == "" else v


class GmailSendResponse(BaseModel):
    """Response payload returned after sending a Gmail message.

    Mirrors the core identifiers and labels returned by the Gmail
    send API.
    """

    id: str
    threadId: str
    labelIds: Optional[list[str]] = None

class GmailEmail(BaseModel):
    """Public representation of a Gmail email.

    Normalizes message metadata, body content and threading headers
    for API responses and assistant tools.
    """

    id: str
    thread_id: str = ""
    sender: str = ""
    to: str = ""
    subject: str = ""
    date: str = ""
    snippet: str = ""
    body: str = ""

    cc: list[str] = Field(default_factory=list)
    bcc: list[str] = Field(default_factory=list)

    reply_to: Optional[str] = None
    message_id: Optional[str] = None
    references: Optional[str] = None
    in_reply_to: Optional[str] = None


class GmailReadEmailsResponse(BaseModel):
    """Response payload for Gmail email reads.

    Wraps the collection of normalized email messages returned by
    read endpoints.
    """

    items: list[GmailEmail] = Field(default_factory=list)


class GmailThreadResponse(BaseModel):
    """Response payload for a Gmail thread read.

    Contains the thread identifier and the ordered emails that belong
    to that conversation.
    """

    thread_id: str
    emails: list[GmailEmail] = Field(default_factory=list)
