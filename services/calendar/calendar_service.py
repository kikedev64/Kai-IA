from __future__ import annotations

from datetime import datetime,timezone
from typing import Any, Optional, Literal
from services.calendar.client import _calendar_service


def list_calendar_events( calendar_id: str = "primary", max_results: int = 20, time_min: Optional[str] = None, time_max: Optional[str] = None, q: Optional[str] = None, single_events: bool = True, order_by: Literal["startTime", "updated"] = "startTime",
) -> list[dict[str, Any]]:

    service = _calendar_service()

    if time_min is None:
        time_min = (
            datetime.now(timezone.utc)
            .replace(tzinfo=timezone.utc)
            .isoformat(timespec="seconds")
            .replace("+00:00", "Z")
        )

    params: dict[str, Any] = {
        "calendarId": calendar_id,
        "maxResults": max_results,
        "singleEvents": single_events,
        "orderBy": order_by,
        "timeMin": time_min,
    }
    if time_max:
        params["timeMax"] = time_max
    if q:
        params["q"] = q

    res = service.events().list(**params).execute()
    return res.get("items", [])


def create_calendar_event( summary: str, start_rfc3339: str, end_rfc3339: str, calendar_id: str = "primary", description: Optional[str] = None, location: Optional[str] = None, attendees: Optional[list[str]] = None, timezone: Optional[str] = None, reminders: Optional[dict[str, Any]] = None, ) -> dict[str, Any]:

    service = _calendar_service()

    event: dict[str, Any] = {
        "summary": summary,
        "start": {"dateTime": start_rfc3339},
        "end": {"dateTime": end_rfc3339},
    }

    if timezone:
        event["start"]["timeZone"] = timezone
        event["end"]["timeZone"] = timezone
    if description:
        event["description"] = description
    if location:
        event["location"] = location
    if attendees:
        event["attendees"] = [{"email": e} for e in attendees]
    if reminders:
        event["reminders"] = reminders

    created = service.events().insert(calendarId=calendar_id, body=event).execute()
    return created


def update_calendar_event( event_id: str, calendar_id: str = "primary", summary: Optional[str] = None, start_rfc3339: Optional[str] = None, end_rfc3339: Optional[str] = None, description: Optional[str] = None, location: Optional[str] = None,attendees: Optional[list[str]] = None, timezone: Optional[str] = None, reminders: Optional[dict[str, Any]] = None, ) -> dict[str, Any]:

    service = _calendar_service()

    patch: dict[str, Any] = {}

    if summary is not None:
        patch["summary"] = summary
    if description is not None:
        patch["description"] = description
    if location is not None:
        patch["location"] = location
    if reminders is not None:
        patch["reminders"] = reminders

    if start_rfc3339 is not None:
        patch.setdefault("start", {})["dateTime"] = start_rfc3339
        if timezone:
            patch["start"]["timeZone"] = timezone
    if end_rfc3339 is not None:
        patch.setdefault("end", {})["dateTime"] = end_rfc3339
        if timezone:
            patch["end"]["timeZone"] = timezone

    if attendees is not None:
        patch["attendees"] = [{"email": e} for e in attendees]

    updated = service.events().patch(
        calendarId=calendar_id,
        eventId=event_id,
        body=patch
    ).execute()

    return updated


def get_calendar_event(event_id: str,calendar_id: str =  "primary", ) -> dict[str, Any]:
    service = _calendar_service()
    return service.events().get(calendarId=calendar_id, eventId=event_id).execute()
