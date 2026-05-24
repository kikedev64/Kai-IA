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
                    "start_rfc3339": {
                        "type": "string",
                        "description": "Datetime RFC3339. Ej: 2026-03-03T16:00:00+01:00",
                    },
                    "end_rfc3339": {
                        "type": "string",
                        "description": "Datetime RFC3339. Ej: 2026-03-03T17:00:00+01:00",
                    },
                    "calendar_id": {
                        "type": "string",
                        "description": "ID del calendario (default: primary)",
                    },
                    "description": {
                        "type": "string",
                        "description": "Descripción del evento",
                    },
                    "location": {
                        "type": "string",
                        "description": "Ubicación del evento",
                    },
                    "attendees": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Lista de emails de asistentes",
                    },
                    "timezone": {
                        "type": "string",
                        "description": "Zona horaria IANA (ej: Europe/Madrid). Si se envía, se aplica a start/end",
                    },
                    "reminders": {
                        "type": "object",
                        "description": "Config de recordatorios (useDefault/overrides)",
                    },
                },
                "required": ["summary", "start_rfc3339", "end_rfc3339"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_calendar_events",
            "description": "Lista eventos de un calendario. Si no se indica time_min, por defecto usa 'ahora' en UTC (según el servicio).",
            "parameters": {
                "type": "object",
                "properties": {
                    "calendar_id": {
                        "type": "string",
                        "description": "ID del calendario (default: primary)",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Máximo número de eventos (default: 20)",
                        "minimum": 1,
                        "maximum": 250,
                    },
                    "time_min": {
                        "type": "string",
                        "description": "RFC3339. Inicio (inclusive). Ej: 2026-03-03T00:00:00Z",
                    },
                    "time_max": {
                        "type": "string",
                        "description": "RFC3339. Fin (exclusive). Ej: 2026-03-10T00:00:00Z",
                    },
                    "q": {
                        "type": "string",
                        "description": "Texto de búsqueda (full-text) en eventos",
                    },
                    "single_events": {
                        "type": "boolean",
                        "description": "Expandir recurrencias en instancias (default: True)",
                    },
                    "order_by": {
                        "type": "string",
                        "description": "Orden: startTime o updated (default: startTime)",
                        "enum": ["startTime", "updated"],
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_calendar_event",
            "description": "Actualiza (patch) un evento. Solo se modifican los campos enviados (no-null).",
            "parameters": {
                "type": "object",
                "properties": {
                    "event_id": {
                        "type": "string",
                        "description": "ID del evento a actualizar",
                    },
                    "calendar_id": {
                        "type": "string",
                        "description": "ID del calendario (default: primary)",
                    },
                    "summary": {"type": "string", "description": "Nuevo título"},
                    "start_rfc3339": {
                        "type": "string",
                        "description": "Nuevo inicio RFC3339",
                    },
                    "end_rfc3339": {
                        "type": "string",
                        "description": "Nuevo fin RFC3339",
                    },
                    "description": {
                        "type": "string",
                        "description": "Nueva descripción",
                    },
                    "location": {"type": "string", "description": "Nueva ubicación"},
                    "attendees": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Nueva lista de asistentes (emails)",
                    },
                    "timezone": {
                        "type": "string",
                        "description": "Zona horaria IANA para start/end si se cambian",
                    },
                    "reminders": {
                        "type": "object",
                        "description": "Nueva config de recordatorios",
                    },
                },
                "required": ["event_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_calendar_event",
            "description": "Elimina un evento por event_id. Devuelve deleted True/False y datos básicos.",
            "parameters": {
                "type": "object",
                "properties": {
                    "event_id": {"type": "string", "description": "ID del evento"},
                    "calendar_id": {
                        "type": "string",
                        "description": "ID del calendario (default: primary)",
                    },
                },
                "required": ["event_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "freebusy_query",
            "description": "Consulta los huecos ocupados (busy) de uno o varios calendarios entre time_min y time_max.",
            "parameters": {
                "type": "object",
                "properties": {
                    "calendar_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Lista de calendar IDs a consultar",
                    },
                    "time_min": {
                        "type": "string",
                        "description": "RFC3339 inicio. Ej: 2026-03-03T00:00:00+01:00",
                    },
                    "time_max": {
                        "type": "string",
                        "description": "RFC3339 fin. Ej: 2026-03-03T23:59:59+01:00",
                    },
                    "time_zone": {
                        "type": "string",
                        "description": "Zona horaria (default: Europe/Madrid)",
                    },
                },
                "required": ["calendar_ids", "time_min", "time_max"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_calendar_event_by_query",
            "description": "Busca eventos por texto (título) en un rango de fechas y elimina si hay una única coincidencia. Si hay varias, devuelve candidatos para pedir confirmación.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Texto a buscar (ej: EJEMPLO)",
                    },
                    "calendar_id": {
                        "type": "string",
                        "description": "ID del calendario (default: primary)",
                    },
                    "time_min": {
                        "type": "string",
                        "description": "RFC3339 inicio de búsqueda (opcional)",
                    },
                    "time_max": {
                        "type": "string",
                        "description": "RFC3339 fin de búsqueda (opcional)",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Máximo de resultados (default: 20)",
                        "minimum": 1,
                        "maximum": 250,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_calendar_events",
            "description": "Busca eventos por condiciones (texto, lugar, nombre, descripción) en un rango de fechas. Si no se especifica rango, busca próximos 365 días.",
            "parameters": {
                "type": "object",
                "properties": {
                    "calendar_id": {"type": "string"},
                    "query": {
                        "type": "string",
                        "description": "Texto general (busca en summary/location/description)",
                    },
                    "location": {
                        "type": "string",
                        "description": "Filtra por lugar (location contiene texto)",
                    },
                    "summary": {
                        "type": "string",
                        "description": "Filtra por nombre/título (summary contiene texto)",
                    },
                    "description": {
                        "type": "string",
                        "description": "Filtra por descripción (description contiene texto)",
                    },
                    "time_min": {"type": "string", "description": "RFC3339 opcional"},
                    "time_max": {"type": "string", "description": "RFC3339 opcional"},
                    "max_results": {"type": "integer", "minimum": 1, "maximum": 250},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_calendar_events_by_conditions",
            "description": "Borra eventos por condiciones (nombre/lugar/texto/fechas). Si hay más de uno y delete_all=false, devuelve candidatos para pedir confirmación.",
            "parameters": {
                "type": "object",
                "properties": {
                    "calendar_id": {"type": "string"},
                    "query": {"type": "string"},
                    "location": {"type": "string"},
                    "summary": {"type": "string"},
                    "description": {"type": "string"},
                    "time_min": {"type": "string"},
                    "time_max": {"type": "string"},
                    "delete_all": {
                        "type": "boolean",
                        "description": "Si true, borra todos los encontrados",
                    },
                    "max_results": {"type": "integer", "minimum": 1, "maximum": 250},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_meet_invitation",
            "description": "Crea un evento de Google Calendar con enlace de Google Meet e invita por correo a los asistentes indicados.",
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {
                        "type": "string",
                        "description": "Título o nombre de la reunión.",
                    },
                    "start_rfc3339": {
                        "type": "string",
                        "description": "Fecha y hora de inicio en formato RFC3339, por ejemplo 2026-03-10T18:00:00+01:00.",
                    },
                    "end_rfc3339": {
                        "type": "string",
                        "description": "Fecha y hora de fin en formato RFC3339, por ejemplo 2026-03-10T19:00:00+01:00.",
                    },
                    "calendar_id": {
                        "type": "string",
                        "description": "ID del calendario donde crear el evento. Por defecto suele ser 'primary'.",
                    },
                    "description": {
                        "type": "string",
                        "description": "Descripción opcional de la reunión.",
                    },
                    "location": {
                        "type": "string",
                        "description": "Ubicación opcional del evento. Puede ser algo como 'Online'.",
                    },
                    "attendees": {
                        "type": "array",
                        "description": "Lista de correos electrónicos de los asistentes a invitar.",
                        "items": {"type": "string"},
                    },
                    "timezone": {
                        "type": "string",
                        "description": "Zona horaria del evento, por ejemplo 'Europe/Madrid'.",
                    },
                    "send_updates": {
                        "type": "string",
                        "description": "Controla el envío de invitaciones por correo a los asistentes.",
                        "enum": ["all", "externalOnly", "none"],
                    },
                    "reminders": {
                        "type": "object",
                        "description": "Configuración opcional de recordatorios del evento.",
                    },
                },
                "required": ["summary", "start_rfc3339", "end_rfc3339"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_last_emails_full",
            "description": "Lee los correos más recientes de Gmail. Úsala cuando el usuario pregunte por sus últimos correos, correos recientes o emails más nuevos.",
            "parameters": {
                "type": "object",
                "properties": {
                    "max_results": {
                        "type": "integer",
                        "description": "Número máximo de correos a devolver (default: 5)",
                        "minimum": 1,
                        "maximum": 20,
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_last_emails_from_sender",
            "description": "Busca correos enviados por un remitente. El parámetro sender puede ser tanto un email exacto como un nombre visible o parte del nombre del remitente, por ejemplo 'Maria Jose' o 'amazon.es'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sender": {
                        "type": "string",
                        "description": "Email o texto identificativo del remitente. Ej: amazon.es o ejemplo@gmail.com",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Número máximo de correos a devolver (default: 5)",
                        "minimum": 1,
                        "maximum": 20,
                    },
                },
                "required": ["sender"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_last_emails_by_subject",
            "description": "Lee los correos más recientes cuyo asunto contiene o coincide con un texto dado. Úsala cuando el usuario quiera buscar emails por asunto.",
            "parameters": {
                "type": "object",
                "properties": {
                    "subject_text": {
                        "type": "string",
                        "description": "Texto del asunto a buscar. Ej: factura, pedido, entrevista",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Número máximo de correos a devolver (default: 5)",
                        "minimum": 1,
                        "maximum": 20,
                    },
                },
                "required": ["subject_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_thread_from_message_id",
            "description": "Lee la conversación completa (thread) a partir del ID de un mensaje de Gmail. Úsala cuando el usuario quiera ver toda la cadena de respuestas de un correo concreto.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message_id": {
                        "type": "string",
                        "description": "ID del mensaje a partir del cual se recuperará el hilo completo",
                    }
                },
                "required": ["message_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_full_email",
            "description": "Lee un correo en su totalidad por message_id y genera un resumen. Usa read_thread_from_message_id si el usuario pide la conversacion completa o el hilo.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message_id": {
                        "type": "string",
                        "description": "ID del mensaje de Gmail a leer por completo",
                    }
                },
                "required": ["message_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reply_email",
            "description": "Responde a un correo existente manteniendo el hilo de la conversación. Úsala cuando el usuario quiera contestar un email ya recibido.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message_id": {
                        "type": "string",
                        "description": "ID del mensaje original al que se quiere responder",
                    },
                    "body": {
                        "type": "string",
                        "description": "Contenido de la respuesta en texto plano",
                    },
                    "reply_all": {
                        "type": "boolean",
                        "description": "Si es true, responde también a los destinatarios en copia además del remitente principal",
                    },
                    "as_html": {
                        "type": "boolean",
                        "description": "Si es true, el contenido se enviará como HTML",
                    },
                },
                "required": ["message_id", "body"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_email",
            "description": "Crea y envía un correo nuevo desde cero utilizando unicamente elementos propios de HTML. Úsala cuando el usuario quiera mandar un email nuevo a uno o varios destinatarios.",
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Lista de destinatarios principales",
                    },
                    "subject": {"type": "string", "description": "Asunto del correo"},
                    "body": {
                        "type": "string",
                        "description": "Contenido del correo en HTML",
                    },
                    "cc": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Lista de destinatarios en copia",
                    },
                    "bcc": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Lista de destinatarios en copia oculta",
                    },
                    "as_html": {
                        "type": "boolean",
                        "description": "Si es true, el contenido se enviará como HTML",
                    },
                },
                "required": ["to", "subject", "body"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_reminders_by_conditions",
            "description": "Busca recordatorios o tareas en Google Tasks por título, texto, notas, estado o rango de vencimiento. Sirve para localizar tareas antes de actualizarlas o eliminarlas.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tasklist_title": {
                        "type": "string",
                        "description": "Nombre de la lista de tareas. Si no se indica, se usa 'Kai IA'.",
                    },
                    "query": {
                        "type": "string",
                        "description": "Texto general a buscar en título o notas.",
                    },
                    "title": {
                        "type": "string",
                        "description": "Texto a buscar específicamente en el título.",
                    },
                    "notes": {
                        "type": "string",
                        "description": "Texto a buscar específicamente en las notas.",
                    },
                    "status": {
                        "type": "string",
                        "enum": ["needsAction", "completed"],
                        "description": "Estado de la tarea.",
                    },
                    "due_from": {
                        "type": "string",
                        "description": "Fecha mínima de vencimiento en formato RFC3339.",
                    },
                    "due_to": {
                        "type": "string",
                        "description": "Fecha máxima de vencimiento en formato RFC3339.",
                    },
                    "max_results": {"type": "integer", "minimum": 1, "maximum": 250},
                    "show_completed": {"type": "boolean"},
                    "show_deleted": {"type": "boolean"},
                    "show_hidden": {"type": "boolean"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_reminders",
            "description": "Lista los recordatorios o tareas de una lista de Google Tasks. Si no se indica lista, usa la lista por defecto de Kai IA.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tasklist_title": {
                        "type": "string",
                        "description": "Nombre de la lista de tareas. Si no se indica, se usa 'Kai IA'.",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Número máximo de recordatorios a devolver.",
                        "minimum": 1,
                        "maximum": 100,
                    },
                    "show_completed": {
                        "type": "boolean",
                        "description": "Si es true, incluye tareas completadas.",
                    },
                    "show_deleted": {
                        "type": "boolean",
                        "description": "Si es true, incluye tareas eliminadas.",
                    },
                    "show_hidden": {
                        "type": "boolean",
                        "description": "Si es true, incluye tareas ocultas.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_reminder",
            "description": "Crea un recordatorio o tarea en Google Tasks dentro de una lista. Si no se indica lista, usa la lista por defecto de Kai IA.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tasklist_title": {
                        "type": "string",
                        "description": "Nombre de la lista de tareas. Si no se indica, se usa 'Kai IA'.",
                    },
                    "title": {
                        "type": "string",
                        "description": "Título del recordatorio.",
                    },
                    "due_rfc3339": {
                        "type": "string",
                        "description": "Fecha y hora límite en formato RFC3339, por ejemplo 2026-03-10T18:00:00Z.",
                    },
                    "notes": {
                        "type": "string",
                        "description": "Notas opcionales del recordatorio.",
                    },
                    "status": {
                        "type": "string",
                        "description": "Estado de la tarea.",
                        "enum": ["needsAction", "completed"],
                    },
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_reminder",
            "description": "Actualiza un recordatorio existente en Google Tasks.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tasklist_title": {
                        "type": "string",
                        "description": "Nombre de la lista de tareas. Si no se indica, se usa 'Kai IA'.",
                    },
                    "task_id": {
                        "type": "string",
                        "description": "ID de la tarea a actualizar.",
                    },
                    "title": {
                        "type": "string",
                        "description": "Nuevo título del recordatorio.",
                    },
                    "due_rfc3339": {
                        "type": "string",
                        "description": "Nueva fecha y hora límite en formato RFC3339.",
                    },
                    "notes": {
                        "type": "string",
                        "description": "Nuevas notas del recordatorio.",
                    },
                    "status": {
                        "type": "string",
                        "description": "Nuevo estado de la tarea.",
                        "enum": ["needsAction", "completed"],
                    },
                },
                "required": ["task_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_reminder",
            "description": "Elimina un recordatorio o tarea de Google Tasks.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tasklist_title": {
                        "type": "string",
                        "description": "Nombre de la lista de tareas. Si no se indica, se usa 'Kai IA'.",
                    },
                    "task_id": {
                        "type": "string",
                        "description": "ID de la tarea a eliminar.",
                    },
                },
                "required": ["task_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_drive_files",
            "description": "Lista archivos del Google Drive del usuario. Útil para explorar documentos disponibles.",
            "parameters": {
                "type": "object",
                "properties": {
                    "max_results": {
                        "type": "integer",
                        "description": "Número máximo de archivos a devolver.",
                        "minimum": 1,
                        "maximum": 100,
                        "default": 20,
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_drive_files_by_name",
            "description": "Busca archivos en Google Drive por nombre.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name_query": {
                        "type": "string",
                        "description": "Texto que debe aparecer en el nombre del archivo.",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Número máximo de resultados.",
                        "minimum": 1,
                        "maximum": 100,
                        "default": 20,
                    },
                },
                "required": ["name_query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_public_download_link",
            "description": "Genera un enlace público de descarga o visualización para un archivo de Google Drive.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_id": {
                        "type": "string",
                        "description": "ID del archivo en Google Drive.",
                    },
                    "export_fmt": {
                        "type": "string",
                        "description": "Formato de exportación si el archivo es un documento de Google (pdf, xlsx, pptx, etc.).",
                    },
                },
                "required": ["file_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_shell_command",
            "description": (
                "Ejecuta un comando de shell en el sistema local y devuelve stdout, stderr "
                "y el código de retorno. Úsala directamente cuando el usuario pida información "
                "del sistema, listar ficheros, leer archivos, buscar texto, comprobar procesos "
                "o variables de entorno. No pidas confirmación previa; llama a la tool y el "
                "sistema gestionará la aprobación automáticamente."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": (
                            "Comando a ejecutar. En Windows usa sintaxis PowerShell "
                            "(ej: 'Get-ChildItem', 'Get-Content archivo.txt', "
                            "'Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber', "
                            "'[System.Environment]::OSVersion.VersionString'). "
                            "No uses comandos que abren ventanas o no imprimen salida, como 'winver'. "
                            "En Linux/macOS usa bash (ej: 'ls -la', 'cat archivo.txt')."
                        ),
                    },
                    "working_dir": {
                        "type": "string",
                        "description": "Directorio de trabajo opcional (ruta absoluta o relativa).",
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Segundos máximos de espera, entre 1 y 30. Por defecto 10.",
                    },
                },
                "required": ["command"],
            },
        },
    },
]
