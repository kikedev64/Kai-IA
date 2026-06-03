"""System-message builders used by assistant chat flows."""

import platform
from datetime import datetime, timezone, timedelta

try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None

_OS = platform.system()


def tool_capabilities_system_message() -> dict:
    """Build the system message that tells the model what tools it can use and when.

    Injected on every request so the model always knows to call run_shell_command
    for local system queries, regardless of the per-chat system prompt.

    Returns:
        dict
    """
    if _OS == "Windows":
        shell_hint = (
            "En Windows usa comandos PowerShell que impriman salida por stdout: "
            "'Get-ChildItem', 'Get-Content archivo.txt', 'git config --list', "
            "'Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber'. "
            "No uses comandos gráficos o sin stdout como 'winver'."
        )
    else:
        shell_hint = "En Linux/macOS usa bash: 'ls', 'cat', 'grep', 'git config', 'which', ..."

    return {
        "role": "system",
        "content": (
            "HERRAMIENTAS DISPONIBLES (úsalas directamente, sin pedir permiso):\n"
            "- run_shell_command: ejecuta comandos de shell para obtener información del sistema, "
            "listar ficheros, leer archivos, comprobar configuración de git, variables de entorno, "
            "procesos en ejecución, etc.\n"
            f"  {shell_hint}\n"
            "  Si la tool devuelve stdout vacío, no inventes la respuesta: llama a otro comando que imprima datos.\n"
            "  Nunca ejecutes comandos destructivos (rm -rf, format, del /s, shutdown, ...).\n"
            "- Gmail, Google Calendar, Google Drive, Google Tasks: úsalas cuando el usuario "
            "pida gestionar correos, eventos, tareas o archivos de Drive.\n"
            "IMPORTANTE: cuando el usuario pida información de su equipo, LLAMA DIRECTAMENTE "
            "a run_shell_command con el comando adecuado. No pidas confirmación previa."
        ),
    }


def workflow_gate_message(user_input: str, missing: str) -> dict:
    """Build a system message that keeps a workflow running.

    Args:
        user_input: Original user request.
        missing: Missing work reported by the completion gate.

    Returns:
        dict
    """
    return {
        "role": "system",
        "content": (
            "WORKFLOW AUN NO COMPLETADO:\n"
            f"Peticion original: {user_input}\n"
            f"Falta: {missing or 'continuar con las acciones pendientes'}\n"
            "Continua ejecutando la siguiente herramienta necesaria. "
            "No des una respuesta final hasta completar las acciones pendientes."
        ),
    }


def now_context_system_message() -> dict:
    """Build the system message with the current Madrid time context.

    Returns:
        dict
    """
    if ZoneInfo is not None:
        try:
            tz = ZoneInfo("Europe/Madrid")
            now = datetime.now(tz)
            tz_name = "Europe/Madrid"
            now_iso = now.isoformat(timespec="seconds")
            return {
                "role": "system",
                "content": (
                    "CONTEXTO TEMPORAL (OBLIGATORIO):\n"
                    f"- Fecha y hora actual: {now_iso}\n"
                    f"- Zona horaria: {tz_name}\n"
                    "- Interpreta fechas relativas (hoy/maÃ±ana/pasado maÃ±ana/este viernes) respecto a esta fecha.\n"
                    "- Si necesitas fechas RFC3339 para tools, calcÃºlalas a partir de este contexto.\n"
                ),
            }
        except Exception:
            pass

    cet = timezone(timedelta(hours=1))
    now = datetime.now(cet)
    return {
        "role": "system",
        "content": (
            "CONTEXTO TEMPORAL (OBLIGATORIO):\n"
            f"- Fecha y hora actual: {now.isoformat(timespec='seconds')}\n"
            "- Zona horaria: UTC+01:00\n"
            "- Interpreta fechas relativas respecto a esta fecha.\n"
            "- Si necesitas fechas RFC3339 para tools, calcÃºlalas a partir de este contexto.\n"
        ),
    }


def post_tool_instruction_message(user_input: str) -> dict:
    """Build the instruction message used after a tool call.

    Args:
        user_input: User message sent to the assistant.

    Returns:
        dict
    """
    compact = " ".join((user_input or "").strip().split())
    if len(compact) > 220:
        compact = compact[:220].rstrip() + "..."

    return {
        "role": "system",
        "content": (
            "INSTRUCCIONES POST-TOOL:\n"
            f"- Tarea del usuario: {compact}\n"
            "- Usa el resultado de la herramienta para continuar.\n"
            "- No repitas la misma herramienta si ya tienes suficiente informaciÃ³n.\n"
            "- Si la tarea del usuario tiene varios puntos, no respondas hasta haberlos cubierto todos.\n"
            "- Responde directamente solo cuando ya no queden acciones necesarias.\n"
        ),
    }


def continue_after_empty_message(user_input: str) -> dict:
    """Build a generic continuation instruction after an empty model response.

    Args:
        user_input: Original user request.

    Returns:
        dict
    """
    compact = " ".join((user_input or "").strip().split())
    if len(compact) > 500:
        compact = compact[:500].rstrip() + "..."

    return {
        "role": "system",
        "content": (
            "La respuesta anterior del modelo vino vacia. Esto no es valido.\n"
            f"Peticion original del usuario: {compact}\n"
            "Si todavia quedan acciones por ejecutar, continua llamando a las tools "
            "necesarias segun la peticion original. Si ya terminaste todas las acciones, "
            "responde ahora con un informe final claro. No devuelvas contenido vacio."
        ),
    }


def final_after_tools_message(user_input: str) -> dict:
    """Build a generic final-response instruction after tool execution.

    Args:
        user_input: Original user request.

    Returns:
        dict
    """
    compact = " ".join((user_input or "").strip().split())
    if len(compact) > 500:
        compact = compact[:500].rstrip() + "..."

    return {
        "role": "system",
        "content": (
            "Genera la respuesta final para el usuario usando solo la peticion original "
            "y los resultados de tools ya presentes en el contexto.\n"
            f"Peticion original: {compact}\n"
            "No llames mas tools en esta respuesta. No devuelvas contenido vacio. "
            "Si alguna parte no pudo completarse, dilo brevemente y continua con lo demas."
        ),
    }
