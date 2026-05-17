"""Gmail context builders used by assistant tool workflows."""

from api.assistant.constants import GMAIL_CONTEXT_KEY, GMAIL_CONTEXT_TOOLS
from services.chat_store import set_chat_context
from tools.gmail.email_response_builders import build_emails_context_block


def build_gmail_context_message(tool_name: str, result: dict) -> dict | None:
    """Build the Gmail context message.

    Args:
        tool_name: Name of the tool that produced the result.
        result: Tool or service result processed by the function.

    Returns:
        dict | None
    """
    if tool_name not in GMAIL_CONTEXT_TOOLS:
        return None
    if not isinstance(result, dict):
        return None
    if result.get("status") != "success":
        return None

    data = result.get("data")
    if not isinstance(data, dict):
        return None

    try:
        block = build_emails_context_block(data)
    except Exception:
        return None

    if not block:
        return None

    return {
        "role": "system",
        "content": (
            "CONTEXTO DE CORREOS RECIBIDO DESDE HERRAMIENTA:\n"
            f"{block}\n"
            "Trata este bloque como un resumen fiable de correos obtenidos por herramienta.\n"
            "Si el usuario preguntÃ³ por correos, responde basÃ¡ndote en este bloque sin pedir pasos extra.\n"
        ),
    }


def build_gmail_memory_context(tool_name: str, result: dict) -> str | None:
    """Build the Gmail reference memory stored for future turns.

    Args:
        tool_name: Name of the tool that produced the result.
        result: Tool or service result processed by the function.

    Returns:
        str | None
    """
    if tool_name not in GMAIL_CONTEXT_TOOLS:
        return None
    if not isinstance(result, dict) or result.get("status") != "success":
        return None

    data = result.get("data")
    if not isinstance(data, dict):
        return None

    try:
        block = build_emails_context_block(data)
    except Exception:
        return None

    if not block:
        return None

    return (
        "REFERENCIAS_GMAIL_RECIENTES:\n"
        "Estas referencias son memoria operativa del chat, no texto visible del usuario.\n"
        "Usalas para resolver referencias a correos o hilos ya obtenidos en la conversacion.\n"
        "No inventes IDs: usa solo los id/message_id y thread_id presentes aqui.\n"
        f"Origen: {tool_name}\n"
        f"{block}"
    )


def persist_gmail_memory(chat_id: str, tool_name: str, result: dict) -> None:
    """Persist Gmail references returned by a tool.

    Args:
        chat_id: Identifier of the chat session.
        tool_name: Name of the executed tool.
        result: Tool result.

    Returns:
        None
    """
    context = build_gmail_memory_context(tool_name, result)
    if context:
        set_chat_context(chat_id, GMAIL_CONTEXT_KEY, context)
