from __future__ import annotations

CALENDAR_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "calendar_list_events",
            "description": "Lista eventos de Google Calendar en un rango de tiempo. Útil para ver agenda y buscar reuniones.",
            "parameters": {
                "type": "object",
                "properties": {
                    "calendar_id": {"type": "string", "default": "primary"},
                    "max_results": {"type": "integer", "minimum": 1, "maximum": 250, "default": 20},
                    "time_min": {"type": ["string", "null"], "description": "RFC3339 (inclusive)"},
                    "time_max": {"type": ["string", "null"], "description": "RFC3339 (exclusive)"},
                    "q": {"type": ["string", "null"], "description": "Texto de búsqueda"},
                    "single_events": {"type": "boolean", "default": True},
                    "order_by": {"type": "string", "enum": ["startTime", "updated"], "default": "startTime"},
                },
                "required": [],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calendar_get_event",
            "description": "Obtiene un evento por id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "event_id": {"type": "string"},
                    "calendar_id": {"type": "string", "default": "primary"},
                },
                "required": ["event_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calendar_create_event",
            "description": "Crea un evento en Google Calendar.",
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string"},
                    "start_rfc3339": {"type": "string"},
                    "end_rfc3339": {"type": "string"},
                    "calendar_id": {"type": "string", "default": "primary"},
                    "description": {"type": ["string", "null"]},
                    "location": {"type": ["string", "null"]},
                    "attendees": {"type": "array", "items": {"type": "string"}},
                    "timezone": {"type": "string", "default": "Europe/Madrid"},
                    "reminders": {"type": ["object", "null"]},
                },
                "required": ["summary", "start_rfc3339", "end_rfc3339"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calendar_update_event",
            "description": "Actualiza campos de un evento existente.",
            "parameters": {
                "type": "object",
                "properties": {
                    "event_id": {"type": "string"},
                    "calendar_id": {"type": "string", "default": "primary"},
                    "summary": {"type": ["string", "null"]},
                    "start_rfc3339": {"type": ["string", "null"]},
                    "end_rfc3339": {"type": ["string", "null"]},
                    "description": {"type": ["string", "null"]},
                    "location": {"type": ["string", "null"]},
                    "attendees": {"type": ["array", "null"], "items": {"type": "string"}},
                    "timezone": {"type": "string", "default": "Europe/Madrid"},
                    "reminders": {"type": ["object", "null"]},
                },
                "required": ["event_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calendar_delete_event",
            "description": "Elimina un evento por id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "event_id": {"type": "string"},
                    "calendar_id": {"type": "string", "default": "primary"},
                },
                "required": ["event_id"],
                "additionalProperties": False,
            },
        },
    },
]