from __future__ import annotations

from typing import Optional, Any, Literal
from pydantic import BaseModel, Field, EmailStr


class CalendarEventTime(BaseModel):
    """Date or datetime block used by Google Calendar events.

    Supports both timed events and all-day events, including the
    timezone field returned by the Calendar API.
    """

    dateTime: Optional[str] = None
    date: Optional[str] = None
    timeZone: Optional[str] = None


class CalendarAttendee(BaseModel):
    """Attendee entry returned for a Calendar event.

    Keeps the attendee email and their current response status in
    the public API shape.
    """

    email: EmailStr
    responseStatus: Optional[
        Literal["needsAction", "declined", "tentative", "accepted"]
    ]


class CalendarEventOut(BaseModel):
    """Public representation of a Google Calendar event.

    Contains the fields needed by the frontend and assistant tools
    when displaying or updating calendar events.
    """

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
    """Response payload for Calendar event listing.

    Wraps the normalized event collection returned by the Calendar
    router.
    """

    items: list[CalendarEventOut] = Field(default_factory=list)


class CalendarCreateRequest(BaseModel):
    """Request payload used to create a Calendar event.

    Carries the required event times plus optional details such as
    attendees, reminders and location.
    """

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
    """Request payload used to patch a Calendar event.

    All mutable event fields are optional so callers can update only
    the values that changed.
    """

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
    """Response payload returned after deleting a Calendar event.

    Reports whether deletion succeeded and includes basic event
    metadata when it is available.
    """

    deleted: bool
    id: str
    summary: Optional[str] = None
    start: Optional[dict[str, Any]] = None
    end: Optional[dict[str, Any]] = None
    error: Optional[str] = None


class CalendarFreeBusyRequest(BaseModel):
    """Request payload used to query Calendar availability.

    Defines the calendars and time window sent to the Google
    free/busy endpoint.
    """

    calendar_ids: list[str] = Field(default_factory=lambda: ["primary"])
    time_min: str
    time_max: str
    time_zone: str = "Europe/Madrid"


class CalendarBusyPeriod(BaseModel):
    """Busy interval returned by Google Calendar.

    Represents a start and end RFC3339 timestamp where the calendar
    is already occupied.
    """

    start: str
    end: str


class CalendarFreeBusyCalendarOut(BaseModel):
    """Availability result for one calendar.

    Contains the busy intervals and any Google API errors associated
    with that calendar id.
    """

    busy: list[CalendarBusyPeriod] = Field(default_factory=list)
    errors: list[dict] = Field(default_factory=list)


class CalendarFreeBusyResponse(BaseModel):
    """Response payload returned by the free/busy endpoint.

    Groups the requested time window with availability data keyed by
    calendar id.
    """

    time_min: Optional[str] = None
    time_max: Optional[str] = None
    time_zone: Optional[str] = None
    calendars: dict[str, CalendarFreeBusyCalendarOut] = Field(default_factory=dict)


class CalendarMeetCreateRequest(BaseModel):
    """Request payload used to create a Google Meet event.

    Extends normal event creation data with the attendee notification
    mode used by Google Calendar.
    """

    summary: str
    start_rfc3339: str
    end_rfc3339: str
    calendar_id: str = "primary"
    description: Optional[str] = None
    location: Optional[str] = None
    attendees: list[EmailStr] = Field(default_factory=list)
    timezone: Optional[str] = None
    reminders: Optional[dict[str, Any]] = None
    send_updates: str = "all"


class CalendarMeetEventOut(CalendarEventOut):
    """Public representation of a Calendar event with a Meet link.

    Adds the generated video meeting URL to the standard event
    response shape.
    """

    meet_link: Optional[str] = None
