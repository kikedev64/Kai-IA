import json
from api.schemas.chat import AskRequest
from core.config import DEFAULT_PROMPTS
from core.models.email import Email
from llm.lmstudio_client import ask_wiouth_context
from services.calendar.calendar_service import (
    create_calendar_event,
    create_meet_invitation,
    delete_calendar_events_by_conditions,
    find_calendar_events,
    list_calendar_events,
    update_calendar_event,
    get_calendar_event,
    delete_calendar_event,
    freebusy_query,
)
from services.gmail.full_read import read_email_by_id, read_last_emails_by_subject, read_last_emails_from_sender, read_last_emails_full, read_thread_from_message_id
from services.gmail.send import send_email
from tools.compact_handlers import _email_to_dict, _thread_to_dict, compact_calendar_event, compact_calendar_events, compact_delete_calendar_event_result, compact_delete_calendar_events_by_conditions_result, compact_find_calendar_events_result, compact_freebusy_result

def handle_tool_call(tool_call):

    fn = tool_call.function
    name = fn.name

    try:
        args = json.loads(fn.arguments or "{}")

        if isinstance(args, dict) and "arguments" in args:
            args = args["arguments"]

        if not isinstance(args, dict):
            args = {}
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
        
        if name == "create_meet_invitation":
            result = create_meet_invitation(
                summary=args.get("summary"),
                start_rfc3339=args.get("start_rfc3339"),
                end_rfc3339=args.get("end_rfc3339"),
                calendar_id=args.get("calendar_id", "primary"),
                description=args.get("description"),
                location=args.get("location"),
                attendees=args.get("attendees"),
                timezone=args.get("timezone"),
                reminders=args.get("reminders"),
                send_updates=args.get("send_updates", "all"),
            )

            meet_link = None
            for entry in result.get("conferenceData", {}).get("entryPoints", []):
                if entry.get("entryPointType") == "video":
                    meet_link = entry.get("uri")
                    break

            return {
                "status": "success",
                "data": {
                    "id": result.get("id"),
                    "summary": result.get("summary"),
                    "start": result.get("start"),
                    "end": result.get("end"),
                    "htmlLink": result.get("htmlLink"),
                    "meet_link": meet_link,
                },
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
            
        if name == "send_email":
            to_value = args.get("to", [])
            subject = (args.get("subject") or "").strip()
            body = args.get("body") or ""
            cc_value = args.get("cc") or []
            bcc_value = args.get("bcc") or []
            as_html = bool(args.get("as_html", True))

            if not to_value:
                return {
                    "status": "error",
                    "message": "Falta el destinatario 'to'"
                }

            if not subject:
                return {
                    "status": "error",
                    "message": "Falta el asunto 'subject'"
                }

            if not str(body).strip():
                return {
                    "status": "error",
                    "message": "Falta el cuerpo del correo 'body'"
                }

            to_field = ", ".join(to_value) if isinstance(to_value, list) else str(to_value)
            cc_field = cc_value if isinstance(cc_value, list) else [cc_value]
            bcc_field = bcc_value if isinstance(bcc_value, list) else [bcc_value]

            email_obj = Email(
                id="",
                thread_id="",
                sender="me",
                to=to_field,
                subject=subject,
                date="",
                snippet="",
                body=body,
                cc=cc_field,
                bcc=bcc_field,
                message_id=None,
                references=None,
                in_reply_to=None,
            )

            result = send_email(email_obj, as_html=as_html)

            return {
                "status": "success",
                "data": {
                    "sent": True,
                    "mode": "new_email",
                    "email": {
                        "to": to_field,
                        "subject": subject,
                        "body": body,
                        "cc": cc_field,
                        "bcc": bcc_field,
                    },
                    "gmail_result": result,
                },
            }
            
        if name == "reply_email":
            message_id = args.get("message_id")
            body = args.get("body") or ""
            reply_all = bool(args.get("reply_all", False))
            as_html = bool(args.get("as_html", False))

            if not message_id:
                return {
                    "status": "error",
                    "message": "Falta 'message_id'"
                }

            if not str(body).strip():
                return {
                    "status": "error",
                    "message": "Falta el cuerpo de la respuesta 'body'"
                }

            original_email = read_email_by_id(message_id, clean_body=True)

            if not original_email:
                return {
                    "status": "error",
                    "message": "No se ha encontrado el correo original para responder"
                }

            original_subject = original_email.subject or ""
            reply_subject = original_subject if original_subject.lower().startswith("re:") else f"Re: {original_subject}"

            to_field = original_email.sender

            cc_field = []
            if reply_all and original_email.cc:
                cc_field = original_email.cc if isinstance(original_email.cc, list) else [original_email.cc]

            reply_email_obj = Email(
                id="",
                thread_id=original_email.thread_id or "",
                sender="me",
                to=to_field,
                subject=reply_subject,
                date="",
                snippet="",
                body=body,
                cc=cc_field,
                bcc=[],
                message_id=None,
                references=original_email.references,
                in_reply_to=original_email.message_id,
            )

            result = send_email(reply_email_obj, as_html=as_html)

            return {
                "status": "success",
                "data": {
                    "sent": True,
                    "mode": "reply_email",
                    "replied_to": {
                        "message_id": message_id,
                        "thread_id": original_email.thread_id,
                        "original_sender": original_email.sender,
                        "original_subject": original_email.subject,
                    },
                    "reply": {
                        "to": to_field,
                        "subject": reply_subject,
                        "body": body,
                        "reply_all": reply_all,
                    },
                    "gmail_result": result,
                },
            }
        return {"status": "warning", "message": f"Tool no encontrada: {name}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}