from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field, EmailStr, field_validator


class GmailThread(BaseModel):
    id: str
    threadId: str


class GmailListThreadsResponse(BaseModel):
    items: list[GmailThread] = Field(default_factory=list)
    nextPageToken: Optional[str] = None
    resultSizeEstimate: Optional[int] = None


class GmailSendRequest(BaseModel):
    to: EmailStr
    subject: str
    body: str

    cc: list[EmailStr] = Field(default_factory=list)
    bcc: list[EmailStr] = Field(default_factory=list)

    reply_to: EmailStr | None = None

    # hilo opcional
    thread_id: Optional[str] = None
    in_reply_to: Optional[str] = None
    references: Optional[str] = None

    as_html: bool = False

    @field_validator("reply_to", mode="before")
    @classmethod
    def empty_reply_to_to_none(cls, v):
        return None if v == "" else v


class GmailSendResponse(BaseModel):
    id: str
    threadId: str
    labelIds: Optional[list[str]] = None

class GmailEmail(BaseModel):
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
    items: list[GmailEmail] = Field(default_factory=list)


class GmailThreadResponse(BaseModel):
    thread_id: str
    emails: list[GmailEmail] = Field(default_factory=list)