import json

from services.calendar.calendar_service import (
    create_calendar_event,
    delete_calendar_events_by_conditions,
    find_calendar_events,
    list_calendar_events,
    update_calendar_event,
    get_calendar_event,
    delete_calendar_event,
    freebusy_query,
)

def handle_tool_call(tool_call):

    fn = tool_call.function
    name = fn.name

    try:
        args = json.loads(fn.arguments or "{}")
    except json.JSONDecodeError:
        args = {}

    try:
        if name == "create_calendar_event":
            result = create_calendar_event(
                summary=args.get("summary"),
                start_rfc3339=args.get("start_rfc3339"),
                end_rfc3339=args.get("end_rfc3339"),
                calendar_id=args.get("calendar_id", "primary"),
                description=args.get("description"),
                location=args.get("location"),
                attendees=args.get("attendees"),
                timezone=args.get("timezone"),
                reminders=args.get("reminders"),
            )
            return {"status": "success", "data": result}

        if name == "list_calendar_events":
            result = list_calendar_events(
                calendar_id=args.get("calendar_id", "primary"),
                max_results=args.get("max_results", 5),
                time_min=args.get("time_min"),
                time_max=args.get("time_max"),
                q=args.get("q"),
                single_events=args.get("single_events", True),
                order_by=args.get("order_by", "startTime"),
            )
            return {"status": "success", "data": result}

        if name == "update_calendar_event":
            result = update_calendar_event(
                event_id=args.get("event_id"),
                calendar_id=args.get("calendar_id", "primary"),
                summary=args.get("summary"),
                start_rfc3339=args.get("start_rfc3339"),
                end_rfc3339=args.get("end_rfc3339"),
                description=args.get("description"),
                location=args.get("location"),
                attendees=args.get("attendees"),
                timezone=args.get("timezone"),
                reminders=args.get("reminders"),
            )
            return {"status": "success", "data": result}

        if name == "delete_calendar_event":
            result = delete_calendar_event(
                event_id=args.get("event_id"),
                calendar_id=args.get("calendar_id", "primary"),
            )
            return {"status": "success", "data": result}

        if name == "freebusy_query":
            result = freebusy_query(
                calendar_ids=args.get("calendar_ids", []),
                time_min=args.get("time_min"),
                time_max=args.get("time_max"),
                time_zone=args.get("time_zone", "Europe/Madrid"),
            )
            return {"status": "success", "data": result}

        if name == "delete_calendar_event_by_query":
            result = delete_calendar_events_by_conditions(
                query=args.get("query", ""),
                calendar_id=args.get("calendar_id", "primary"),
                time_min=args.get("time_min"),
                time_max=args.get("time_max"),
                max_results=args.get("max_results", 20),
            )
            return {"status": "success", "data": result}

        if name == "find_calendar_events":
            result = find_calendar_events(
                calendar_id=args.get("calendar_id", "primary"),
                query=args.get("query"),
                location=args.get("location"),
                summary=args.get("summary"),
                description=args.get("description"),
                time_min=args.get("time_min"),
                time_max=args.get("time_max"),
                max_results=args.get("max_results", 250),
            )
            return {"status": "success", "data": result}

        if name == "delete_calendar_events_by_conditions":
            result = delete_calendar_events_by_conditions(
                calendar_id=args.get("calendar_id", "primary"),
                query=args.get("query"),
                location=args.get("location"),
                summary=args.get("summary"),
                description=args.get("description"),
                time_min=args.get("time_min"),
                time_max=args.get("time_max"),
                delete_all=bool(args.get("delete_all", False)),
                max_results=args.get("max_results", 250),
            )
            return {"status": "success", "data": result}
        return {"status": "error", "message": f"Tool no encontrada: {name}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}