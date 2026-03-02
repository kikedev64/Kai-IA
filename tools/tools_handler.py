import json
from services.calendar.calendar_service import create_calendar_event

def handle_tool_call(tool_call):
    """
    tool_call: objeto de message.tool_calls[i]
    """
    fn = tool_call.function
    name = fn.name
    args = json.loads(fn.arguments or "{}")

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

        return {"status": "error", "message": f"Tool no encontrada: {name}"}

    except Exception as e:
        return {"status": "error", "message": str(e)}