TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_calendar_event",
            "description": "Crea un nuevo evento en Google Calendar",
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string", "description": "Título del evento"},
                    "start_rfc3339": {"type": "string", "description": "Datetime RFC3339. Ej: 2026-03-03T16:00:00+01:00"},
                    "end_rfc3339": {"type": "string", "description": "Datetime RFC3339. Ej: 2026-03-03T17:00:00+01:00"},
                    "calendar_id": {"type": "string", "description": "ID del calendario (default: primary)"},
                    "description": {"type": "string"},
                    "location": {"type": "string"},
                    "attendees": {"type": "array", "items": {"type": "string"}},
                    "timezone": {"type": "string"},
                    "reminders": {"type": "object"},
                },
                "required": ["summary", "start_rfc3339", "end_rfc3339"]
            }
        }
    }
]