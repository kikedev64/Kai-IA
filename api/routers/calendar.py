from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from googleapiclient.errors import HttpError

from api.schemas.calendar import (
    CalendarFreeBusyRequest,
    CalendarFreeBusyResponse,
    CalendarListResponse,
    CalendarEventOut,
    CalendarCreateRequest,
    CalendarMeetCreateRequest,
    CalendarMeetEventOut,
    CalendarUpdateRequest,
    CalendarDeleteResponse,
)
from services.calendar.calendar_service import (
    create_meet_invitation,
    freebusy_query,
    list_calendar_events,
    create_calendar_event,
    update_calendar_event,
    get_calendar_event,
    delete_calendar_event,
)

router = APIRouter(prefix="/calendar", tags=["Calendar"])


def _event_to_api(e: dict) -> dict:
    """Map a Calendar event into the public API response shape.

    Args:
        e: Model object mapped into an API response.

    Returns:
        dict
    """
    attendees = e.get("attendees") or []
    return {
        "id": e.get("id", ""),
        "summary": e.get("summary"),
        "description": e.get("description"),
        "location": e.get("location"),
        "start": e.get("start"),
        "end": e.get("end"),
        "attendees": [
            {
                "email": a.get("email"),
                "responseStatus": a.get("responseStatus", "needsAction"),
            }
            for a in attendees
            if a.get("email")
        ],
        "status": e.get("status"),
        "htmlLink": e.get("htmlLink"),
        "updated": e.get("updated"),
    }


@router.get("/events", response_model=CalendarListResponse)
def api_list_events(
    calendar_id: str = "primary",
    max_results: int = Query(20, ge=1, le=250),
    time_min: str | None = None,
    time_max: str | None = None,
    q: str | None = None,
    single_events: bool = True,
    order_by: str = Query("startTime", pattern="^(startTime|updated)$"),
) -> dict:
    """Serve the list events endpoint.

    Args:
        calendar_id: Identifier of the calendar.
        max_results: Maximum number of items to return.
        time_min: Lower RFC3339 time bound.
        time_max: Upper RFC3339 time bound.
        q: Search query passed to the Google API.
        single_events: Whether recurring events should be expanded.
        order_by: Sort mode requested from Google Calendar.

    Returns:
        dict
    """
    try:
        items = list_calendar_events(
            calendar_id=calendar_id,
            max_results=max_results,
            time_min=time_min,
            time_max=time_max,
            q=q,
            single_events=single_events,
            order_by=order_by,
        )
        return {"items": [_event_to_api(e) for e in items]}
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.post("/events", response_model=CalendarEventOut)
def api_create_event(req: CalendarCreateRequest) -> dict:
    """Serve the create event endpoint.

    Args:
        req: Request payload received by the endpoint.

    Returns:
        dict
    """
    try:
        created = create_calendar_event(
            summary=req.summary,
            start_rfc3339=req.start_rfc3339,
            end_rfc3339=req.end_rfc3339,
            calendar_id=req.calendar_id,
            description=req.description,
            location=req.location,
            attendees=[str(x) for x in req.attendees] if req.attendees else None,
            timezone=req.timezone,
            reminders=req.reminders,
        )
        return _event_to_api(created)
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.get("/events/{event_id}", response_model=CalendarEventOut)
def api_get_event(event_id: str, calendar_id: str = "primary") -> dict:
    """Serve the get event endpoint.

    Args:
        event_id: Identifier of the calendar event.
        calendar_id: Identifier of the calendar.

    Returns:
        dict
    """
    try:
        e = get_calendar_event(event_id=event_id, calendar_id=calendar_id)
        return _event_to_api(e)
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.patch("/events/{event_id}", response_model=CalendarEventOut)
def api_update_event(event_id: str, req: CalendarUpdateRequest) -> dict:
    """Serve the update event endpoint.

    Args:
        event_id: Identifier of the calendar event.
        req: Request payload received by the endpoint.

    Returns:
        dict
    """
    try:
        updated = update_calendar_event(
            event_id=event_id,
            calendar_id=req.calendar_id,
            summary=req.summary,
            start_rfc3339=req.start_rfc3339,
            end_rfc3339=req.end_rfc3339,
            description=req.description,
            location=req.location,
            attendees=[str(x) for x in req.attendees]
            if req.attendees is not None
            else None,
            timezone=req.timezone,
            reminders=req.reminders,
        )
        return _event_to_api(updated)
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.delete("/events/{event_id}", response_model=CalendarDeleteResponse)
def api_delete_event(event_id: str, calendar_id: str = "primary") -> dict:
    """Serve the delete event endpoint.

    Args:
        event_id: Identifier of the calendar event.
        calendar_id: Identifier of the calendar.

    Returns:
        dict
    """
    try:
        res = delete_calendar_event(event_id=event_id, calendar_id=calendar_id)
        return {
            "deleted": bool(res.get("deleted")),
            "id": res.get("id", event_id),
            "summary": res.get("summary"),
            "start": res.get("start"),
            "end": res.get("end"),
            "error": res.get("error"),
        }
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.post("/freebusy", response_model=CalendarFreeBusyResponse)
def api_freebusy(req: CalendarFreeBusyRequest) -> dict:
    """Serve the freebusy endpoint.

    Args:
        req: Request payload received by the endpoint.

    Returns:
        dict
    """
    try:
        raw = freebusy_query(
            calendar_ids=req.calendar_ids,
            time_min=req.time_min,
            time_max=req.time_max,
            time_zone=req.time_zone,
        )

        calendars_out = {}
        for cal_id, info in (raw.get("calendars") or {}).items():
            calendars_out[cal_id] = {
                "busy": info.get("busy") or [],
                "errors": info.get("errors") or [],
            }

        return {
            "time_min": raw.get("timeMin"),
            "time_max": raw.get("timeMax"),
            "time_zone": raw.get("timeZone"),
            "calendars": calendars_out,
        }

    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.post("/events/meet", response_model=CalendarMeetEventOut)
def api_create_meet_event(req: CalendarMeetCreateRequest) -> dict:
    """Serve the create meet event endpoint.

    Args:
        req: Request payload received by the endpoint.

    Returns:
        dict
    """
    try:
        created = create_meet_invitation(
            summary=req.summary,
            start_rfc3339=req.start_rfc3339,
            end_rfc3339=req.end_rfc3339,
            calendar_id=req.calendar_id,
            description=req.description,
            location=req.location,
            attendees=[str(x) for x in req.attendees] if req.attendees else None,
            timezone=req.timezone,
            reminders=req.reminders,
            send_updates=req.send_updates,
        )

        raw_event = created["event"]
        event_out = _event_to_api(raw_event)
        event_out["meet_link"] = created.get("meet_link")

        return event_out

    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))
