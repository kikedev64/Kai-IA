from __future__ import annotations

from typing import Optional, Any, Literal
from pydantic import BaseModel, Field, EmailStr
class CalendarEventTime(BaseModel):
    dateTime: Optional[str] = None
    date: Optional[str] = None
    timeZone: Optional[str] = None

class CalendarAttendee(BaseModel):
    email: EmailStr
    responseStatus: Optional[Literal["needsAction","declined","tentative","accepted"]]

class CalendarEventOut(BaseModel):
    id: str
    summary: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    start: Optional[CalendarEventTime] = None
    end: Optional[CalendarEventTime] = None
    attendees: list[CalendarAttendee] = Field(default_factory=list)
    status: Optional[str] = None
    htmlLink: Optional[str] = None
    updated: Optional[str] = None


class CalendarListResponse(BaseModel):
    items: list[CalendarEventOut] = Field(default_factory=list)


class CalendarCreateRequest(BaseModel):
    summary: str
    start_rfc3339: str
    end_rfc3339: str
    calendar_id: str = "primary"
    description: Optional[str] = None
    location: Optional[str] = None
    attendees: list[EmailStr] = Field(default_factory=list)
    timezone: Optional[str] = None
    reminders: Optional[dict[str, Any]] = None


class CalendarUpdateRequest(BaseModel):
    calendar_id: str = "primary"
    summary: Optional[str] = None
    start_rfc3339: Optional[str] = None
    end_rfc3339: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    attendees: Optional[list[EmailStr]] = None
    timezone: Optional[str] = None
    reminders: Optional[dict[str, Any]] = None


class CalendarDeleteResponse(BaseModel):
    deleted: bool
    id: str
    summary: Optional[str] = None
    start: Optional[dict[str, Any]] = None
    end: Optional[dict[str, Any]] = None
    error: Optional[str] = None

class CalendarFreeBusyRequest(BaseModel):
    calendar_ids: list[str] = Field(default_factory=lambda: ["primary"])
    time_min: str  # RFC3339
    time_max: str  # RFC3339
    time_zone: str = "Europe/Madrid"


class CalendarBusyPeriod(BaseModel):
    start: str  # RFC3339
    end: str    # RFC3339


class CalendarFreeBusyCalendarOut(BaseModel):
    busy: list[CalendarBusyPeriod] = Field(default_factory=list)
    errors: list[dict] = Field(default_factory=list)


class CalendarFreeBusyResponse(BaseModel):
    time_min: Optional[str] = None
    time_max: Optional[str] = None
    time_zone: Optional[str] = None
    calendars: dict[str, CalendarFreeBusyCalendarOut] = Field(default_factory=dict)