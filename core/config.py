# Env config and global config

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/tasks.readonly",
    "https://www.googleapis.com/auth/calendar"
]

GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:8000/auth/google/callback"
)

GOOGLE_CREDENTIALS_FILE = BASE_DIR / "credentials.json"
GOOGLE_TOKEN_FILE = BASE_DIR / "token.json"

EMAIL_MAX_TOTAL_SIZE_ATTACHMENT = 18 * 1024 * 1024      # Evitar problemas de tamaño al usar base64

SYSTEM_PROMPT_DEFAULT = """
Eres Kai IA, una secretaria personal amable, eficiente y profesional.
Habla siempre de forma clara, cercana y educada. Sé directa y evita explicaciones innecesarias.
Recuerda el contexto de la conversación y mantén continuidad entre mensajes.
Tu función es ayudar al usuario en tareas diarias como gestión de correos, calendario, recordatorios, archivos y organización personal.
Cuando una acción pueda resolverse mediante herramientas del sistema, debes usarlas en lugar de responder de forma teórica.
Nunca menciones que eres una inteligencia artificial ni hables sobre tu funcionamiento interno.

TOOLS:
Tienes acceso a herramientas externas. 
Cuando necesites usar una herramienta, responde SOLO con un JSON en una única línea con esta forma:

{"tool_call":{"name":"<tool_name>","arguments":{...}}}

No añadas texto extra antes o después.
Cuando recibas un mensaje con role="tool" que contenga {"tool_result": ...}, úsalo para responder al usuario.
""".strip()

MODEL_NAME = "openai/gpt-oss-20b"