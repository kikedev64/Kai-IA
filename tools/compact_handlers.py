from __future__ import annotations
from typing import Any

def compact_calendar_event(event: dict[str, Any]) -> dict[str, Any]:
    if not event:
        return {}

    return {
        "id": event.get("id"),
        "summary": event.get("summary"),
        "start": (
            event.get("start", {}).get("dateTime")
            or event.get("start", {}).get("date")
        ),
        "end": (
            event.get("end", {}).get("dateTime")
            or event.get("end", {}).get("date")
        ),
        "location": event.get("location"),
        "description": event.get("description"),
        "creator": event.get("creator", {}).get("email") if isinstance(event.get("creator"), dict) else None,
        "htmlLink": event.get("htmlLink"),
        "eventType": event.get("eventType"),
    }


def compact_calendar_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not events:
        return []
    return [compact_calendar_event(event) for event in events]


def compact_find_calendar_events_result(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "calendar_id": data.get("calendar_id"),
        "time_min": data.get("time_min"),
        "time_max": data.get("time_max"),
        "count": data.get("count", 0),
        "events": compact_calendar_events(data.get("events", [])),
    }


def compact_delete_calendar_event_result(data: dict[str, Any]) -> dict[str, Any]:
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
        "start": (
            data.get("start", {}).get("dateTime")
            or data.get("start", {}).get("date")
            if isinstance(data.get("start"), dict)
            else data.get("start")
        ),
        "end": (
            data.get("end", {}).get("dateTime")
            or data.get("end", {}).get("date")
            if isinstance(data.get("end"), dict)
            else data.get("end")
        ),
    }


def compact_delete_calendar_events_by_conditions_result(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": data.get("status"),
        "matched_count": data.get("matched_count"),
        "time_min": data.get("time_min"),
        "time_max": data.get("time_max"),
        "query_used": data.get("query_used"),
        "candidates": compact_calendar_events(data.get("candidates", [])),
        "deleted": [
            compact_delete_calendar_event_result(item)
            for item in data.get("deleted", [])
        ],
        "events": compact_calendar_events(data.get("events", [])),
        "count": data.get("count"),
        "calendar_id": data.get("calendar_id"),
    }


def compact_freebusy_result(data: dict[str, Any]) -> dict[str, Any]:
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

def _email_to_dict(email):
    return {
        "id": email.id,
        "thread_id": email.thread_id,
        "sender": email.sender,
        "to": email.to,
        "subject": email.subject,
        "date": email.date,
        "snippet": email.snippet,
        "body": email.body,
        "cc": email.cc,
        "bcc": email.bcc,
        "message_id": email.message_id,
        "references": email.references,
        "in_reply_to": email.in_reply_to,
    }


def _thread_to_dict(thread):
    return {
        "thread_id": thread.thread_id,
        "emails": [_email_to_dict(email) for email in thread.emails],
    }