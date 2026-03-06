from __future__ import annotations
from googleapiclient.errors import HttpError
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
    items = res.get("items")
    return [
        {
            "id": item.get("id"),
            "summary": item.get("summary"),
            "start": item.get("start", {}).get("dateTime") or item.get("start", {}).get("date"),
            "end": item.get("end", {}).get("dateTime") or item.get("end", {}).get("date"),
            "creator": item.get("creator", {}).get("email"),
        }
        for item in items
    ]


def create_calendar_event( summary: str,
                          start_rfc3339: str, 
                          end_rfc3339: str, 
                          calendar_id: str = "primary", 
                          description: Optional[str] = None, 
                          location: Optional[str] = None, 
                          attendees: Optional[list[str]] = None, 
                          timezone: Optional[str] = None, 
                          reminders: Optional[dict[str, Any]] = None, 
                        ) -> dict[str, Any]:

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

def delete_calendar_event( event_id: str, calendar_id: str = "primary" ) -> dict[str, Any]:

    service = _calendar_service()

    try:
        event = service.events().get(
            calendarId=calendar_id,
            eventId=event_id
        ).execute()

        service.events().delete(
            calendarId=calendar_id,
            eventId=event_id
        ).execute()

        return {
            "deleted": True,
            "id": event.get("id"),
            "summary": event.get("summary"),
            "start": event.get("start"),
            "end": event.get("end")
        }

    except HttpError as e:
        if e.resp.status == 404:
            return {
                "deleted": False,
                "error": "Event not found",
                "id": event_id
            }
        else:
            raise

def freebusy_query(
    calendar_ids: list[str],
    time_min: str,
    time_max: str,
    time_zone: str = "Europe/Madrid",
) -> dict[str, Any]:
    svc = _calendar_service()

    body = {
        "timeMin": time_min,
        "timeMax": time_max,
        "timeZone": time_zone,
        "items": [{"id": cid} for cid in calendar_ids],
    }

    return svc.freebusy().query(body=body).execute()

def delete_calendar_events_by_conditions(
    calendar_id: str = "primary",
    query: Optional[str] = None,
    location: Optional[str] = None,
    summary: Optional[str] = None,
    description: Optional[str] = None,
    time_min: Optional[str] = None,
    time_max: Optional[str] = None,
    delete_all: bool = False,
    max_results: int = 250,
) -> dict[str, Any]:

    found = find_calendar_events(
        calendar_id=calendar_id,
        query=query,
        location=location,
        summary=summary,
        description=description,
        time_min=time_min,
        time_max=time_max,
        upcoming_days_default=365,
        max_results=max_results,
    )

    events = found["events"]
    if len(events) == 0:
        return {"status": "not_found", **found}

    if len(events) > 1 and not delete_all:
        return {"status": "ambiguous", **found, "candidates": events[:5]}

    deleted_items = []
    for e in events:
        deleted_items.append(delete_calendar_event(event_id=e["id"], calendar_id=calendar_id))

    return {
        "status": "deleted_many" if len(deleted_items) > 1 else "deleted",
        "matched_count": len(events),
        "deleted": deleted_items,
        "query_used": {"query": query, "location": location, "summary": summary, "description": description},
        "time_min": found["time_min"],
        "time_max": found["time_max"],
    }

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

def _utc_now_rfc3339() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def _utc_in_days_rfc3339(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def _norm(s: Optional[str]) -> str:
    return (s or "").strip().lower()

def find_calendar_events(
    calendar_id: str = "primary",
    query: Optional[str] = None,
    location: Optional[str] = None,
    summary: Optional[str] = None,
    description: Optional[str] = None,
    time_min: Optional[str] = None,
    time_max: Optional[str] = None,
    upcoming_days_default: int = 365,
    max_results: int = 250,
) -> dict[str, Any]:


    if time_min is None:
        time_min = _utc_now_rfc3339()
    if time_max is None:
        time_max = _utc_in_days_rfc3339(upcoming_days_default)

    events = list_calendar_events(
        calendar_id=calendar_id,
        max_results=max_results,
        time_min=time_min,
        time_max=time_max,
        q=None,
        single_events=True,
        order_by="startTime",
    )

    q = _norm(query)
    loc = _norm(location)
    summ = _norm(summary)
    desc = _norm(description)

    out = []
    for e in events or []:
        e_summary = _norm(e.get("summary"))
        e_location = _norm(e.get("location"))
        e_desc = _norm(e.get("description"))

        # filtros AND (si el filtro viene)
        if q and not (q in e_summary or q in e_location or q in e_desc):
            continue
        if loc and loc not in e_location:
            continue
        if summ and summ not in e_summary:
            continue
        if desc and desc not in e_desc:
            continue

        out.append({
            "id": e.get("id"),
            "summary": e.get("summary"),
            "start": e.get("start"),
            "end": e.get("end"),
            "location": e.get("location"),
            "description": e.get("description"),
        })

    return {
        "calendar_id": calendar_id,
        "time_min": time_min,
        "time_max": time_max,
        "count": len(out),
        "events": out,
    }