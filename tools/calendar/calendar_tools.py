from __future__ import annotations
from typing import Annotated, Optional, Literal
from pydantic import BaseModel, Field, EmailStr

OrderBy = Literal["startTime", "updated"]

class ToolCalendarListEventsArgs(BaseModel):
    calendar_id: str = "primary"
    max_results: Annotated[int, Field(ge=1,le=250)] = 20
    time_min: Optional[str] = None   # RFC3339
    time_max: Optional[str] = None   # RFC3339
    q: Optional[str] = None
    single_events: bool = True
    order_by: OrderBy = "startTime"

class ToolCalendarGetEventArgs(BaseModel):
    event_id: str
    calendar_id: str = "primary"

class ToolCalendarCreateEventArgs(BaseModel):
    summary: str
    start_rfc3339: str
    end_rfc3339: str
    calendar_id: str = "primary"
    description: Optional[str] = None
    location: Optional[str] = None
    attendees: list[EmailStr] = Field(default_factory=list)
    timezone: str = "Europe/Madrid"
    reminders: Optional[dict] = None  # lo que ya estés usando internamente

class ToolCalendarUpdateEventArgs(BaseModel):
    event_id: str
    calendar_id: str = "primary"
    summary: Optional[str] = None
    start_rfc3339: Optional[str] = None
    end_rfc3339: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    attendees: Optional[list[EmailStr]] = None
    timezone: str = "Europe/Madrid"
    reminders: Optional[dict] = None

class ToolCalendarDeleteEventArgs(BaseModel):
    event_id: str
    calendar_id: str = "primary"