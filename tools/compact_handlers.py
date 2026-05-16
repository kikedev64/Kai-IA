from __future__ import annotations
from typing import Any


def _compact_datetime(value: Any) -> object:
    """Reduce a Google date object to the most useful date value.

    Args:
        value: Value being processed.

    Returns:
        object
    """
    if value is None:
        return None

    if isinstance(value, dict):
        return value.get("dateTime") or value.get("date")

    return value


def compact_calendar_event(event: dict[str, Any]) -> dict:
    """Build a compact representation of the calendar event.

    Args:
        event: Calendar or debug event processed by the function.

    Returns:
        dict
    """
    if not event:
        return {}

    out = {
        "id": event.get("id"),
        "summary": event.get("summary"),
        "start": _compact_datetime(event.get("start")),
        "end": _compact_datetime(event.get("end")),
    }

    if event.get("location"):
        out["location"] = event.get("location")

    if event.get("description"):
        out["description"] = event.get("description")

    creator = event.get("creator")
    if isinstance(creator, dict) and creator.get("email"):
        out["creator"] = creator.get("email")
    elif event.get("creator"):
        out["creator"] = event.get("creator")

    if event.get("htmlLink"):
        out["htmlLink"] = event.get("htmlLink")

    if event.get("eventType"):
        out["eventType"] = event.get("eventType")

    return out


def compact_calendar_events(events: list[dict[str, Any]]) -> list[dict]:
    """Build a compact representation of the calendar events.

    Args:
        events: Events processed by the function.

    Returns:
        list[dict]
    """
    if not events:
        return []
    return [compact_calendar_event(event) for event in events]


def compact_find_calendar_events_result(data: dict[str, Any]) -> dict:
    """Build a compact representation of the find calendar events result.

    Args:
        data: Source data processed by the function.

    Returns:
        dict
    """
    return {
        "calendar_id": data.get("calendar_id"),
        "time_min": data.get("time_min"),
        "time_max": data.get("time_max"),
        "count": data.get("count", 0),
        "events": compact_calendar_events(data.get("events", [])),
    }


def compact_delete_calendar_event_result(data: dict[str, Any]) -> dict:
    """Build a compact representation of the delete calendar event result.

    Args:
        data: Source data processed by the function.

    Returns:
        dict
    """
    if not data:
        return {}

    if not data.get("deleted"):
        return {
            "deleted": False,
            "error": data.get("error"),
            "id": data.get("id"),
        }

    return {
        "deleted": True,
        "id": data.get("id"),
        "summary": data.get("summary"),
        "start": _compact_datetime(data.get("start")),
        "end": _compact_datetime(data.get("end")),
    }


def compact_delete_calendar_events_by_conditions_result(data: dict[str, Any]) -> dict:
    """Build a compact representation of the delete calendar events by conditions result.

    Args:
        data: Source data processed by the function.

    Returns:
        dict
    """
    out = {
        "status": data.get("status"),
        "time_min": data.get("time_min"),
        "time_max": data.get("time_max"),
    }

    if data.get("matched_count") is not None:
        out["matched_count"] = data.get("matched_count")

    if data.get("count") is not None:
        out["count"] = data.get("count")

    if data.get("calendar_id") is not None:
        out["calendar_id"] = data.get("calendar_id")

    if data.get("query_used") is not None:
        out["query_used"] = data.get("query_used")

    if data.get("events"):
        out["events"] = compact_calendar_events(data.get("events", []))

    if data.get("candidates"):
        out["candidates"] = compact_calendar_events(data.get("candidates", []))

    if data.get("deleted"):
        out["deleted"] = [
            compact_delete_calendar_event_result(item)
            for item in data.get("deleted", [])
        ]

    return out


def compact_freebusy_result(data: dict[str, Any]) -> dict:
    """Build a compact representation of the freebusy result.

    Args:
        data: Source data processed by the function.

    Returns:
        dict
    """
    calendars = data.get("calendars", {})
    compacted = {}

    for calendar_id, value in calendars.items():
        compacted[calendar_id] = {
            "busy": value.get("busy", []),
        }

    return {
        "timeMin": data.get("timeMin"),
        "timeMax": data.get("timeMax"),
        "calendars": compacted,
    }


def _email_to_dict(email) -> dict:
    """Convert an email model into a compact dictionary.

    Args:
        email: Email model processed by the function.

    Returns:
        dict
    """
    return {
        "id": email.id,
        "thread_id": email.thread_id,
        "sender": email.sender,
        "subject": email.subject,
        "date": email.date,
        "snippet": email.snippet,
    }


def _thread_to_dict(thread) -> dict:
    """Convert an email thread into a compact dictionary.

    Args:
        thread: Email thread processed by the function.

    Returns:
        dict
    """
    return {
        "thread_id": thread.thread_id,
        "emails": [_email_to_dict(email) for email in thread.emails],
    }
