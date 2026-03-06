import json
from api.schemas.chat import AskRequest
from core.config import DEFAULT_PROMPTS
from llm.lmstudio_client import ask_wiouth_context
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
from services.gmail.full_read import read_email_by_id, read_last_emails_by_subject, read_last_emails_from_sender, read_last_emails_full, read_thread_from_message_id
from tools.compact_handlers import _email_to_dict, _thread_to_dict, compact_calendar_event, compact_calendar_events, compact_delete_calendar_event_result, compact_delete_calendar_events_by_conditions_result, compact_find_calendar_events_result, compact_freebusy_result

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
            return {"status": "success", "data": compact_calendar_event(result)}

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
            return {"status": "success", "data": compact_calendar_events(result)}

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
            return {"status": "success", "data": compact_calendar_event(result)}

        if name == "delete_calendar_event":
            result = delete_calendar_event(
                event_id=args.get("event_id"),
                calendar_id=args.get("calendar_id", "primary"),
            )
            return {"status": "success", "data": compact_delete_calendar_event_result(result)}

        if name == "freebusy_query":
            result = freebusy_query(
                calendar_ids=args.get("calendar_ids", []),
                time_min=args.get("time_min"),
                time_max=args.get("time_max"),
                time_zone=args.get("time_zone", "Europe/Madrid"),
            )
            return {"status": "success", "data": compact_freebusy_result(result)}

        if name == "delete_calendar_event_by_query":
            result = delete_calendar_events_by_conditions(
                query=args.get("query", ""),
                calendar_id=args.get("calendar_id", "primary"),
                time_min=args.get("time_min"),
                time_max=args.get("time_max"),
                max_results=args.get("max_results", 20),
            )
            return {"status": "success", "data": compact_delete_calendar_events_by_conditions_result(result)}

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
            return {"status": "success", "data": compact_find_calendar_events_result(result)}

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
            return {
                "status": "success",
                "data": compact_delete_calendar_events_by_conditions_result(result),
            }
    
        if name == "read_last_emails_full":
            emails = read_last_emails_full(
                max_results=args.get("max_results", 5), clean_body=True
            )
        
            return {
                "status": "success",
                "data": {
                    "count": len(emails),
                    "emails": [_email_to_dict(email) for email in emails],
                },
            }

        if name == "read_last_emails_from_sender":
            emails = read_last_emails_from_sender(
                sender=args.get("sender"),
                max_results=args.get("max_results", 5),
                clean_body=True
            )
            return {
                "status": "success",
                "data": {
                    "sender": args.get("sender"),
                    "count": len(emails),
                    "emails": [_email_to_dict(email) for email in emails],
                },
            }

        if name == "read_last_emails_by_subject":
            emails = read_last_emails_by_subject(
                subject_text=args.get("subject_text"),
                max_results=args.get("max_results", 5),
                clean_body=True
            )
            return {
                "status": "success",
                "data": {
                    "subject_text": args.get("subject_text"),
                    "count": len(emails),
                    "emails": [_email_to_dict(email) for email in emails],
                },
            }

        if name == "read_thread_from_message_id":
            thread = read_thread_from_message_id(
                message_id=args.get("message_id"),
                clean_body=True
            )

            if thread is None:
                return {
                    "status": "success",
                    "data": {
                        "found": False,
                        "message_id": args.get("message_id"),
                    },
                }

            return {
                "status": "success",
                "data": {
                    "found": True,
                    "thread": _thread_to_dict(thread),
                },
            }
        
        if name == "get_full_email":
            email = read_email_by_id(args.get("id"), clean_body=True)

            if not email:
                return {
                    "status": "error",
                    "message": "Email no encontrado"
                }

            body = (email.body or "").strip()
            if not body:
                return {
                    "status": "error",
                    "message": "El email existe pero el body está vacío"
                }

            prompt = f"""
            Remitente: {email.sender}
            Asunto: {email.subject}

            Contenido:
            {body}
            """

            data_mail = AskRequest(
                prompt=prompt,
                system_prompt=DEFAULT_PROMPTS.RESUME_MAIL
            )

            summary = ask_wiouth_context(data_mail)

            return {
                "status": "success",
                "data": {
                    "email": email.model_dump() if hasattr(email, "model_dump") else email.__dict__,
                    "summary": summary if summary is not None else ""
                }
            }
        return {"status": "warning", "message": f"Tool no encontrada: {name}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}