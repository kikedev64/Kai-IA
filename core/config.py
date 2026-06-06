from pathlib import Path
import json
import platform
import sys

from core.runtime_config import get_runtime_config_value
import os

if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).resolve().parent.parent

_PLATFORM_HINT = platform.system()

_DEFAULT_SYSTEM_PROMPT = f"""\
Eres Kai, un asistente inteligente y directo.
Sistema operativo del host: {_PLATFORM_HINT}.

Capacidades:
- Responder preguntas generales con contexto multi-turno.
- Ejecutar comandos de shell con run_shell_command cuando necesites información del sistema o el usuario lo solicite.
- Gestionar correos con Gmail, eventos con Google Calendar, tareas con Google Tasks y archivos con Google Drive.
- Generar diagramas y visualizaciones con Mermaid: flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, pie, mindmap, timeline y más.

Reglas:
- Responde en español salvo que el usuario escriba en otro idioma.
- Usa run_shell_command para listar ficheros, leer archivos, buscar patrones, comprobar procesos, obtener variables de entorno, configuración de git, etc.
- En Windows usa comandos cmd/PowerShell ('dir', 'type archivo.txt', 'Get-ChildItem', 'git config', …).
- En Linux/macOS usa bash ('ls', 'cat', 'grep', 'git config', …).
- Nunca ejecutes comandos destructivos (rm -rf, format, del /s, shutdown, …).
- Sé conciso. Usa bloques markdown con el lenguaje correcto cuando muestres código.
- Si el usuario pide un diagrama, esquema, gráfico, mapa mental, flujo, arquitectura, imagen o cualquier visualización, genéralo INMEDIATAMENTE con un bloque ```mermaid. NUNCA pidas confirmación ni preguntes qué tipo quiere si puedes inferirlo. NUNCA digas que no puedes generar imágenes.
- El sistema renderiza ```mermaid automáticamente como SVG interactivo. Elige el tipo más adecuado: flowchart, sequenceDiagram, classDiagram, erDiagram, gantt, mindmap, pie, timeline.
- Usa sintaxis Mermaid estrictamente válida: sin caracteres especiales sin escapar en etiquetas, sin saltos de línea dentro de etiquetas de arista.
"""


def get_config_value(key: str, default=None) -> object:
    """Return the config value.

    Args:
        key: Configuration key to read or write.
        default: Fallback value returned when no configured value exists.

    Returns:
        object
    """
    return get_runtime_config_value(key, default)


def get_config_int(key: str, default: int = 0) -> int:
    """Return the config int.

    Args:
        key: Configuration key to read or write.
        default: Fallback value returned when no configured value exists.

    Returns:
        int
    """
    value = get_runtime_config_value(key, default)
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def get_config_float(key: str, default: float = 0.0) -> float:
    """Return the config float.

    Args:
        key: Configuration key to read or write.
        default: Fallback value returned when no configured value exists.

    Returns:
        float
    """
    value = get_runtime_config_value(key, default)
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def get_config_bool(key: str, default: bool = False) -> bool:
    """Return a boolean runtime configuration value.

    Args:
        key: Configuration key to read.
        default: Fallback value returned when no configured value exists.

    Returns:
        bool
    """
    value = get_runtime_config_value(key, default)

    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on", "enabled"}:
            return True
        if normalized in {"0", "false", "no", "off", "disabled"}:
            return False

    return bool(value)


def get_config_json(key: str, default=None) -> object:
    """Return the config json.

    Args:
        key: Configuration key to read or write.
        default: Fallback value returned when no configured value exists.

    Returns:
        object
    """
    raw = get_runtime_config_value(key, None)
    if raw is None:
        return default

    if isinstance(raw, (dict, list)):
        return raw

    try:
        return json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return default


def get_google_scopes() -> list[str]:
    """Return configured Google OAuth scopes.

    Returns:
        object
    """
    return get_config_json("google_scopes", [])


def get_google_redirect_uri() -> str | None:
    """Return the configured Google redirect URI.

    Returns:
        object
    """
    return os.getenv("GOOGLE_REDIRECT_URI")


def get_google_credentials_file() -> Path:
    """Return the Google credentials file path.

    Returns:
        Path
    """
    return Path(
        get_config_value("google_credentials_file", str(BASE_DIR / "credentials.json"))
    )


def get_google_token_file() -> Path:
    """Return the Google token file path.

    Returns:
        Path
    """
    return Path(get_config_value("google_token_file", str(BASE_DIR / "token.json")))


def get_email_max_total_size_attachment() -> int:
    """Return the maximum total attachment size.

    Returns:
        int
    """
    return get_config_int("email_max_total_size_attachment", 18 * 1024 * 1024)


def get_system_prompt_default() -> str:
    """Return the system prompt default.

    Returns:
        str
    """
    return get_config_value("system_prompt_default", _DEFAULT_SYSTEM_PROMPT)


def get_model_name() -> str:
    """Return the model name.

    Returns:
        str
    """
    return get_config_value("model_name", "openai/gpt-oss-20b")


def get_temperature() -> float:
    """Return the temperature.

    Returns:
        float
    """
    return get_config_float("temperature", 0.0)


def get_lmstudio_timeout() -> int:
    """Return the LM Studio API call timeout in seconds.

    Returns:
        int
    """
    return get_config_int("lmstudio_timeout", 600)


def get_tool_approval_timeout() -> int:
    """Return the seconds the backend waits for the user to approve a tool call.

    Returns:
        int
    """
    return get_config_int("tool_approval_timeout", 120)


def get_shell_command_timeout() -> int:
    """Return the default shell command execution timeout in seconds.

    Returns:
        int
    """
    return get_config_int("shell_command_timeout", 10)



def get_expose_service_endpoints() -> bool:
    """Return whether optional direct service routers should be exposed.

    Returns:
        bool
    """
    return get_config_bool("expose_service_endpoints", True)


class DEFAULT_PROMPTS:
    """Factory for default prompts stored in runtime configuration.

    Centralises fallback prompt text used for email summaries, user
    profile extraction and chat title generation.
    """

    @staticmethod
    def resume_mail() -> str:
        """Return the default prompt used to summarize email messages.

        Returns:
            str
        """
        return get_config_value(
            "default_prompts.resume_mail",
            (
                "Tu unica tarea es leer el correo y hacer un resumen completo, "
                "detallado y exhaustivo de el, indicando tambien quien lo envia. "
                "NO OLVIDES NINGUN DETALLE DE ESPACIO, LUGAR O TIEMPO."
            ),
        )

    @staticmethod
    def basic_user_information() -> str:
        """Return the default prompt used to extract user profile JSON.

        Returns:
            str
        """
        return get_config_value(
            "default_prompts.basic_user_information_json",
            (
                "Vas a recibir un texto con información personal del usuario.\n\n"
                "Tu tarea es extraer la información relevante y devolverla en formato JSON válido.\n\n"
                "Reglas:\n"
                "- Devuelve SOLO JSON válido (sin explicaciones).\n"
                "- Usa claves en inglés y valores en español.\n"
                "- No inventes información.\n"
                "- Si un dato no aparece, no lo incluyas.\n\n"
                "IMPORTANTE (desambiguación):\n"
                "- Si el usuario está estudiando algo → usa 'study'.\n"
                "- Solo usa 'job' si el usuario indica claramente que trabaja.\n"
                "- Si menciona curso/año (ej: 'cuarto año') → inclúyelo dentro de 'study'.\n\n"
                "Campos posibles:\n"
                "- name\n"
                "- age\n"
                "- job\n"
                "- study\n"
                "- location\n"
                "- interests\n"
                "- goals\n\n"
                "Ejemplo:\n"
                "Input: Me llamo Marcos, tengo 24 años y estudio diseño gráfico.\n"
                "Output:\n"
                '{"name": "Marcos", "age": 24, "study": "Diseño gráfico"}\n'
            ),
        )

    @staticmethod
    def chat_summary() -> str:
        """Return the default prompt used to generate chat titles.

        Returns:
            str
        """
        return get_config_value(
            "default_prompts.chat_summary",
            (
                "Tu tarea es generar un título corto para un chat.\n\n"
                "Reglas obligatorias:\n"
                "- Devuelve SOLO texto plano.\n"
                "- No uses comillas.\n"
                "- No uses JSON.\n"
                "- Máximo 4 palabras.\n"
                "- Debe ser breve, claro y descriptivo.\n"
                "- En español.\n"
                "- No pongas puntuación final.\n"
                "- No pongas frases largas.\n\n"
                "Ejemplos válidos:\n"
                "Rutina gimnasio\n"
                "Correos universidad\n"
                "Ideas TFG IA\n"
                "Configuración Odoo"
            ),
        )


def get_prompt_map() -> dict[str, str]:
    """Return default prompts by key.

    Returns:
        dict[str, str]
    """
    return {
        "basic_user_information": DEFAULT_PROMPTS.basic_user_information(),
        "resume_mail": DEFAULT_PROMPTS.resume_mail(),
        "chat_summary": DEFAULT_PROMPTS.chat_summary(),
    }
