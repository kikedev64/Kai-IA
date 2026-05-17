import json
import logging
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Iterator

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from services.chat_summary_service import generate_chat_summary_from_text
from core.config import get_model_name, get_temperature, get_tool_activation_keywords
from tools.tools_definition import TOOLS

try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None

from api.schemas.chat import AskRequest
from core.config import get_system_prompt_default
from llm.lmstudio_client import ask_without_context, call_lm_studio
from tools.tools_handler import handle_tool_call
from tools.gmail.email_response_builders import build_emails_context_block
from services.chat_store import (
    ensure_session,
    add_message,
    get_chat_context,
    get_full_chat_by_id,
    get_messages,
    get_system_prompt,
    get_chat_title,
    list_chat_sessions,
    set_chat_context,
    update_chat_title,
    count_user_messages,
)

router = APIRouter(prefix="/assistant", tags=["Assistant"])
logger = logging.getLogger("uvicorn")

MAX_TOOL_STEPS = 12
MAX_EMPTY_MODEL_RETRIES = 2
MAX_COMPLETION_GATE_RETRIES = 3
GMAIL_CONTEXT_KEY = "gmail_recent_refs"


class ChatStreamRequest(BaseModel):
    """Request payload used by the streaming assistant endpoint.

    Includes the active chat id, prompt, history window and optional
    debug flags used by the Debug Lab view.
    """

    chat_id: str = Field(..., min_length=1)
    prompt: str = Field(..., min_length=1)
    limit_history: int = Field(default=6, ge=1, le=20)
    profile_context: str | None = None
    debug: bool = False


DEBUG_TOOLS = True

GMAIL_CONTEXT_TOOLS = {
    "read_last_emails_full",
    "read_last_emails_from_sender",
    "read_last_emails_by_subject",
    "read_thread_from_message_id",
    "get_full_email",
}


def should_enable_tools(prompt: str) -> bool:
    """Decide whether to enable tools.

    Args:
        prompt: Prompt text sent to the model.

    Returns:
        bool
    """
    text = (prompt or "").lower()
    keywords = get_tool_activation_keywords() or []

    return any(keyword in text for keyword in keywords)


def resolve_tool_choice(
    use_tools: bool,
    executed_tool_results: list[tuple[str, dict]],
    force_required: bool = False,
) -> str | None:
    """Resolve the tool-choice policy for the next model call.

    Args:
        use_tools: Whether tools are enabled for this turn.
        executed_tool_results: Tool results already collected in the current turn.
        force_required: Whether the next model call must produce a tool call.

    Returns:
        str | None
    """
    if not use_tools:
        return None
    if force_required:
        return "required"
    return "auto" if executed_tool_results else "required"


def compact_tool_results_for_gate(tool_results: list[tuple[str, dict]]) -> str:
    """Build a compact execution log for workflow completion checks.

    Args:
        tool_results: Tool results collected during the assistant flow.

    Returns:
        str
    """
    lines: list[str] = []

    for index, (tool_name, result) in enumerate(tool_results, start=1):
        status = result.get("status") if isinstance(result, dict) else None
        data = result.get("data") if isinstance(result, dict) else None
        message = result.get("message") if isinstance(result, dict) else None
        detail: dict[str, object] = {}

        if isinstance(data, dict):
            for key in (
                "count",
                "sender",
                "subject_text",
                "found",
                "sent",
                "mode",
                "query",
            ):
                if key in data:
                    detail[key] = data[key]

            if "emails" in data and isinstance(data["emails"], list):
                detail["emails"] = [
                    {
                        "id": email.get("message_id") or email.get("id"),
                        "thread_id": email.get("thread_id"),
                        "sender": email.get("sender"),
                        "subject": email.get("subject"),
                    }
                    for email in data["emails"][:5]
                    if isinstance(email, dict)
                ]

            if "files" in data and isinstance(data["files"], list):
                detail["files"] = [
                    {
                        "id": file.get("id"),
                        "name": file.get("name"),
                        "downloadUrl": file.get("downloadUrl"),
                        "webViewLink": file.get("webViewLink"),
                    }
                    for file in data["files"][:5]
                    if isinstance(file, dict)
                ]

            if "email" in data and isinstance(data["email"], dict):
                email = data["email"]
                detail["email"] = {
                    "to": email.get("to"),
                    "subject": email.get("subject"),
                    "body": str(email.get("body") or "")[:2500],
                }

            if "reply" in data and isinstance(data["reply"], dict):
                reply = data["reply"]
                detail["reply"] = {
                    "to": reply.get("to"),
                    "subject": reply.get("subject"),
                    "body": str(reply.get("body") or "")[:2500],
                }

            if "replied_to" in data and isinstance(data["replied_to"], dict):
                replied_to = data["replied_to"]
                detail["replied_to"] = {
                    "message_id": replied_to.get("message_id"),
                    "thread_id": replied_to.get("thread_id"),
                    "original_sender": replied_to.get("original_sender"),
                    "original_subject": replied_to.get("original_subject"),
                }

        lines.append(
            json.dumps(
                {
                    "step": index,
                    "tool": tool_name,
                    "status": status,
                    "message": message,
                    "detail": detail,
                },
                ensure_ascii=False,
            )
        )

    return "\n".join(lines)


def parse_json_object(text: str) -> dict | None:
    """Parse the first JSON object found in model text.

    Args:
        text: Model text.

    Returns:
        dict | None
    """
    if not text:
        return None

    stripped = text.strip()
    candidates = [stripped]

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidates.append(stripped[start : end + 1])

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue

        if isinstance(parsed, dict):
            return parsed

    return None


def evaluate_workflow_completion(
    user_input: str,
    final_text: str,
    tool_results: list[tuple[str, dict]],
) -> tuple[bool, str]:
    """Check whether a proposed final answer completes the requested workflow.

    Args:
        user_input: Original user request.
        final_text: Proposed assistant response.
        tool_results: Tool results collected during the assistant flow.

    Returns:
        tuple[bool, str]
    """
    if not tool_results:
        return True, ""

    judge_messages = [
        {
            "role": "system",
            "content": (
                "Eres un verificador de workflows. Evalua si la respuesta final "
                "cumple todas las acciones pedidas por el usuario, usando el log de tools. "
                "No propongas pasos innecesarios: solo marca incompleto si falta una accion "
                "explicitamente requerida o condicionada por informacion ya descubierta. "
                "Responde solo JSON: {\"complete\": boolean, \"missing\": string}."
            ),
        },
        {
            "role": "user",
            "content": (
                "PETICION ORIGINAL:\n"
                f"{user_input}\n\n"
                "TOOLS EJECUTADAS:\n"
                f"{compact_tool_results_for_gate(tool_results)}\n\n"
                "RESPUESTA FINAL PROPUESTA:\n"
                f"{final_text}"
            ),
        },
    ]

    try:
        judge = call_lm_studio(judge_messages, use_tools=False)
    except Exception:
        logger.exception("[WORKFLOW_GATE] Error evaluando finalizacion")
        return True, ""

    parsed = parse_json_object(clean_model_output(judge.content or ""))
    if not parsed:
        return True, ""

    complete = bool(parsed.get("complete", True))
    missing = str(parsed.get("missing") or "").strip()
    return complete, missing


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


def is_legacy_tool_json(text: str) -> bool:
    """Check whether the value is legacy tool json.

    Args:
        text: Text to inspect or transform.

    Returns:
        bool
    """
    if not text:
        return False
    s = text.strip()
    try:
        obj = json.loads(s)
    except Exception:
        return False
    return isinstance(obj, dict) and "tool_call" in obj


def extract_legacy_tool_call(text: str) -> dict | None:
    """Extract the legacy tool call.

    Args:
        text: Text to inspect or transform.

    Returns:
        dict | None
    """
    if not text:
        return None
    s = text.strip()
    try:
        obj = json.loads(s)
    except Exception:
        return None
    if not (isinstance(obj, dict) and "tool_call" in obj):
        return None
    tc = obj.get("tool_call")
    if not isinstance(tc, dict):
        return None
    if "name" not in tc or "arguments" not in tc:
        return None
    return tc


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
                    "- Interpreta fechas relativas (hoy/mañana/pasado mañana/este viernes) respecto a esta fecha.\n"
                    "- Si necesitas fechas RFC3339 para tools, calcúlalas a partir de este contexto.\n"
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
            "- Si necesitas fechas RFC3339 para tools, calcúlalas a partir de este contexto.\n"
        ),
    }


def clean_model_output(text: str) -> str:
    """Clean the model output.

    Args:
        text: Text to inspect or transform.

    Returns:
        str
    """
    if not text:
        return ""

    cleaned = text

    while "<think>" in cleaned and "</think>" in cleaned:
        start = cleaned.find("<think>")
        end = cleaned.find("</think>", start)

        if end == -1:
            break

        cleaned = cleaned[:start] + cleaned[end + len("</think>") :]

    if "<think>" in cleaned:
        cleaned = cleaned.split("<think>", 1)[0]

    return cleaned.strip()


def should_store_assistant_message(text: str) -> bool:
    """Decide whether to store assistant message.

    Args:
        text: Text to inspect or transform.

    Returns:
        bool
    """
    if not text:
        return False

    stripped = text.strip()
    if not stripped:
        return False

    if stripped.startswith("<|start|>assistant<|channel|>commentary"):
        return False

    if set(stripped) == {"?"}:
        return False

    return True


def is_garbage_text(text: str) -> bool:
    """Check whether model text is unusable as a user-facing answer.

    Args:
        text: Model output text.

    Returns:
        bool
    """
    if not text:
        return False

    stripped = text.strip()
    if not stripped:
        return False

    if set(stripped) == {"?"}:
        return True

    if stripped.startswith("<|start|>assistant<|channel|>commentary"):
        return True

    return False


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
            "- No repitas la misma herramienta si ya tienes suficiente información.\n"
            "- Si la tarea del usuario tiene varios puntos, no respondas hasta haberlos cubierto todos.\n"
            "- Responde directamente solo cuando ya no queden acciones necesarias.\n"
        ),
    }


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
            "Si el usuario preguntó por correos, responde basándote en este bloque sin pedir pasos extra.\n"
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


def fallback_text_from_tool_results(tool_results: list[tuple[str, dict]]) -> str:
    """Build a final fallback response from executed tool results.

    Args:
        tool_results: Tool results collected during the assistant flow.

    Returns:
        str
    """
    if not tool_results:
        return "No he podido generar una respuesta valida."

    lines = ["He ejecutado herramientas, pero el modelo no devolvio una respuesta final valida."]
    lines.append("")
    lines.append("Resumen de tools ejecutadas:")

    for tool_name, result in tool_results:
        status = result.get("status") if isinstance(result, dict) else None
        data = result.get("data") if isinstance(result, dict) else None
        detail = ""

        if isinstance(data, dict):
            if "count" in data:
                detail = f" con {data.get('count')} resultado(s)"
            elif "summary" in data:
                detail = f": {data.get('summary')}"
            elif "id" in data:
                detail = f": {data.get('id')}"

        lines.append(f"- {tool_name}: {status or 'sin estado'}{detail}.")

    lines.append("")
    lines.append(
        "No devuelvo una respuesta vacia para no dejar el flujo colgado. "
        "Revisa el Debug Lab o los logs para ver el detalle completo de cada resultado."
    )

    return "\n".join(lines)


def _fallback_title_from_user_input(user_input: str) -> str:
    """Create a short chat title from the first user message.

    Args:
        user_input: User message sent to the assistant.

    Returns:
        str
    """
    text = " ".join(user_input.strip().split())
    if not text:
        return "Nuevo chat"

    words = text.split()
    title = " ".join(words[:4]).strip()

    if len(title) > 60:
        title = title[:60].strip()

    return title or "Nuevo chat"


def _ensure_chat_title(
    chat_id: str, user_input: str, is_first_user_message: bool, request_id: str
) -> None:
    """Ensure the chat title exists.

    Args:
        chat_id: Identifier of the chat session.
        user_input: User message sent to the assistant.
        is_first_user_message: Whether this message is the first user message in the chat.
        request_id: Identifier of the request.

    Returns:
        None
    """
    if not is_first_user_message:
        return

    current_title = get_chat_title(chat_id)
    if current_title:
        if DEBUG_TOOLS:
            logger.info(f"[{request_id}] El chat ya tiene título: {current_title}")
        return

    generated_title = None

    try:
        generated_title = clean_model_output(
            generate_chat_summary_from_text(user_input) or ""
        )
        if generated_title:
            generated_title = " ".join(generated_title.split())
            if len(generated_title) > 60:
                generated_title = generated_title[:60].strip()
        if DEBUG_TOOLS:
            logger.info(f"[{request_id}] Título generado por LLM: {generated_title}")
    except Exception:
        logger.exception("[%s] Error generando título con LLM", request_id)

    if not generated_title:
        generated_title = _fallback_title_from_user_input(user_input)
        if DEBUG_TOOLS:
            logger.info(f"[{request_id}] Usando título fallback: {generated_title}")

    update_chat_title(chat_id, generated_title)

    saved_title = get_chat_title(chat_id)
    if DEBUG_TOOLS:
        logger.info(f"[{request_id}] Título guardado en BD: {saved_title}")


@router.post("/start")
def start() -> dict[str, str]:
    """Create a new assistant chat session.

    Returns:
        dict[str, str]
    """
    chat_id = str(uuid.uuid4())
    ensure_session(chat_id, get_system_prompt_default())
    return {"chat_id": chat_id}


@router.post("/chat")
def chat_endpoint(
    user_input: str,
    chat_id: str = Query(..., min_length=1),
    limit_history: int = Query(50, ge=1, le=200),
) -> dict[str, str]:
    """Handle a non-streaming assistant chat request.

    Args:
        user_input: User message sent to the assistant.
        chat_id: Identifier of the chat session.
        limit_history: Maximum number of previous chat messages to include.

    Returns:
        dict[str, str]
    """
    request_id = str(uuid.uuid4())[:8]

    try:
        start_ts = datetime.now().isoformat(timespec="seconds")

        system_prompt = get_system_prompt(chat_id) or get_system_prompt_default()
        ensure_session(chat_id, system_prompt)

        add_message(chat_id, "user", user_input)

        user_message_count = count_user_messages(chat_id)
        is_first_user_message = user_message_count == 1

        history = get_messages(chat_id, limit=limit_history)

        sanitized: list[dict] = []
        for m in history:
            if m["role"] == "assistant" and is_legacy_tool_json(m["content"]):
                continue
            sanitized.append(m)

        messages = [
            {"role": "system", "content": system_prompt},
            now_context_system_message(),
        ]

        gmail_memory_context = get_chat_context(chat_id, GMAIL_CONTEXT_KEY)
        if gmail_memory_context:
            messages.append({"role": "system", "content": gmail_memory_context})

        messages += sanitized

        if DEBUG_TOOLS:
            logger.info(f"\n=== [{request_id}] CHAT START {start_ts} ===")
            logger.info(f"[{request_id}] chat_id: {chat_id}")
            logger.info(f"[{request_id}] USER: {user_input}")
            logger.info(f"[{request_id}] user_message_count: {user_message_count}")
            logger.info(f"[{request_id}] is_first_user_message: {is_first_user_message}")

        executed_tool_results: list[tuple[str, dict]] = []
        empty_model_retries = 0
        completion_gate_retries = 0
        force_next_tool = False
        use_tools = should_enable_tools(user_input)

        for step in range(MAX_TOOL_STEPS):
            tool_choice = resolve_tool_choice(
                use_tools,
                executed_tool_results,
                force_required=force_next_tool,
            )
            force_next_tool = False
            msg = call_lm_studio(
                messages,
                use_tools=use_tools,
                tool_choice=tool_choice,
            )
            tool_calls = getattr(msg, "tool_calls", None)

            if DEBUG_TOOLS:
                logger.info(f"\n[{request_id}] STEP {step} - MODEL MESSAGE")
                logger.info(f"[{request_id}] content: {repr(msg.content)}")
                logger.info(
                    f"[{request_id}] tool_calls: {len(tool_calls) if tool_calls else 0}"
                )

            if not tool_calls:
                content = clean_model_output(msg.content or "")

                legacy_tc = extract_legacy_tool_call(content)
                if legacy_tc:
                    if DEBUG_TOOLS:
                        logger.info(f"\n[{request_id}] LEGACY TOOL JSON DETECTED (content)")
                        logger.info(f"[{request_id}] legacy tool: {legacy_tc.get('name')}")
                        logger.info(
                            f"[{request_id}] legacy args: {json.dumps(legacy_tc.get('arguments'), ensure_ascii=False)}"
                        )

                    name = legacy_tc["name"]
                    args = legacy_tc.get("arguments") or {}

                    class _Fn:
                        """Small adapter for legacy tool-call function data.

                        Converts an old JSON tool payload into the shape
                        expected by the shared tool handler.
                        """

                        def __init__(self, n: str, a: dict) -> None:
                            """Store a legacy tool-call function payload.

                            Args:
                                n: Tool name used by the test double.
                                a: Tool arguments used by the test double.

                            Returns:
                                None
                            """
                            self.name = n
                            self.arguments = json.dumps(a, ensure_ascii=False)

                    class _TC:
                        """Small adapter for a legacy tool-call wrapper.

                        Provides the id and function attributes consumed by
                        the current tool execution path.
                        """

                        def __init__(self, n: str, a: dict) -> None:
                            """Store a legacy tool-call wrapper payload.

                            Args:
                                n: Tool name used by the test double.
                                a: Tool arguments used by the test double.

                            Returns:
                                None
                            """
                            self.id = "legacy"
                            self.function = _Fn(n, a)

                    fake_tc = _TC(name, args)
                    result = handle_tool_call(fake_tc)
                    persist_gmail_memory(chat_id, name, result)
                    gmail_memory_context = get_chat_context(chat_id, GMAIL_CONTEXT_KEY)

                    messages.append({"role": "assistant", "content": None})
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": "legacy",
                            "content": json.dumps(result, ensure_ascii=False),
                        }
                    )

                    gmail_context_msg = build_gmail_context_message(name, result)
                    if gmail_context_msg:
                        messages.append(gmail_context_msg)

                    messages.append(post_tool_instruction_message(user_input))

                    msg2 = call_lm_studio(messages, use_tools=True, tool_choice="auto")
                    final2 = (msg2.content or "").strip()

                    if should_store_assistant_message(final2):
                        add_message(chat_id, "assistant", final2)
                        _ensure_chat_title(
                            chat_id, user_input, is_first_user_message, request_id
                        )

                    if DEBUG_TOOLS:
                        logger.info(
                            f"\n[{request_id}] FINAL (after legacy tool exec): {final2}"
                        )
                        logger.info(f"=== [{request_id}] CHAT END ===\n")

                    return {"reply": final2, "chat_id": chat_id}

                if not content or is_garbage_text(content):
                    if executed_tool_results and empty_model_retries < MAX_EMPTY_MODEL_RETRIES:
                        empty_model_retries += 1
                        messages.append(continue_after_empty_message(user_input))
                        continue

                    if executed_tool_results:
                        messages.append(final_after_tools_message(user_input))
                        forced_final = call_lm_studio(messages, use_tools=False)
                        content = clean_model_output(forced_final.content or "")

                    if not content or is_garbage_text(content):
                        content = fallback_text_from_tool_results(executed_tool_results)

                if executed_tool_results and use_tools:
                    complete, missing = evaluate_workflow_completion(
                        user_input,
                        content,
                        executed_tool_results,
                    )

                    if not complete and completion_gate_retries < MAX_COMPLETION_GATE_RETRIES:
                        completion_gate_retries += 1
                        messages.append(workflow_gate_message(user_input, missing))
                        force_next_tool = True
                        continue

                if should_store_assistant_message(content):
                    add_message(chat_id, "assistant", content)
                    _ensure_chat_title(
                        chat_id, user_input, is_first_user_message, request_id
                    )

                if DEBUG_TOOLS:
                    logger.info(f"\n[{request_id}] FINAL: {content}")
                    logger.info(f"=== [{request_id}] CHAT END ===\n")

                return {"reply": content, "chat_id": chat_id}

            assistant_payload = {
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [],
            }

            for tc in tool_calls:
                assistant_payload["tool_calls"].append(
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                )

                if DEBUG_TOOLS:
                    logger.info(f"\n[{request_id}] TOOL CALL -> {tc.function.name}")
                    logger.info(f"[{request_id}] tool_call_id: {tc.id}")
                    logger.info(f"[{request_id}] raw arguments: {tc.function.arguments}")

            messages.append(assistant_payload)

            empty_model_retries = 0

            for tc in tool_calls:
                result = handle_tool_call(tc)
                executed_tool_results.append((tc.function.name, result))
                persist_gmail_memory(chat_id, tc.function.name, result)
                gmail_memory_context = get_chat_context(chat_id, GMAIL_CONTEXT_KEY)

                if DEBUG_TOOLS:
                    logger.info(f"\n[{request_id}] TOOL RESULT <- {tc.function.name}")
                    logger.info(f"[{request_id}] tool_call_id: {tc.id}")
                    logger.info(
                        f"[{request_id}] result: {json.dumps(result, ensure_ascii=False, indent=2)}"
                    )

                if isinstance(result, dict) and result.get("status") == "auth_expired":
                    final_auth_reply = result.get("message") or (
                        "No puedo acceder a tus servicios de Google porque la sesión ha expirado."
                    )

                    add_message(chat_id, "assistant", final_auth_reply)

                    if DEBUG_TOOLS:
                        logger.info(f"\n[{request_id}] AUTH EXPIRED DETECTED")
                        logger.info(f"[{request_id}] message: {final_auth_reply}")
                        logger.info(f"=== [{request_id}] CHAT END ===\n")

                    return {"reply": final_auth_reply, "chat_id": chat_id}

                tool_msg = {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, ensure_ascii=False),
                }

                messages.append(tool_msg)

                gmail_context_msg = build_gmail_context_message(
                    tc.function.name, result
                )
                if gmail_context_msg:
                    messages.append(gmail_context_msg)

                messages.append(post_tool_instruction_message(user_input))

        if executed_tool_results:
            fallback_reply = fallback_text_from_tool_results(executed_tool_results)
            add_message(chat_id, "assistant", fallback_reply)
            _ensure_chat_title(chat_id, user_input, is_first_user_message, request_id)
            return {"reply": fallback_reply, "chat_id": chat_id}

        raise HTTPException(
            status_code=500,
            detail="Demasiadas llamadas a herramientas seguidas (posible bucle).",
        )

    except Exception as e:
        logger.exception("[%s] ERROR EN /chat", request_id)
        if "No models loaded" in str(e):
            return {
                "reply": "Ahora mismo no tengo ningún modelo cargado para responder. Carga un modelo en LM Studio.",
                "chat_id": chat_id,
            }
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ask")
def ask_llm(req: AskRequest) -> dict[str, str]:
    """Send a prompt to the LLM.

    Args:
        req: Request payload received by the endpoint.

    Returns:
        dict[str, str]
    """
    try:
        response = ask_without_context(req)
        return response

    except HTTPException:
        raise
    except Exception as e:
        if "No models loaded" in str(e):
            raise HTTPException(
                status_code=503, detail="No hay ningún modelo cargado en LM Studio."
            )
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chats")
def get_chats() -> dict[str, list[dict]]:
    """Return the chats.

    Returns:
        dict[str, list[dict]]
    """
    try:
        chats = list_chat_sessions()
        return {"chats": chats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chats/{chat_id}")
def get_chat_by_id(chat_id: str) -> dict:
    """Return the chat by id.

    Args:
        chat_id: Identifier of the chat session.

    Returns:
        dict
    """
    try:
        chat = get_full_chat_by_id(chat_id)

        if not chat:
            raise HTTPException(status_code=404, detail="Chat no encontrado")

        return chat
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def split_text_for_stream(text: str) -> Iterator[str]:
    """Yield text chunks suitable for streaming.

    Args:
        text: Text to inspect or transform.

    Returns:
        Iterator[str]
    """

    words = text.split(" ")
    for i, word in enumerate(words):
        if i == 0:
            yield word
        else:
            yield " " + word


@router.post("/chat/stream")
def assistant_chat_stream(req: ChatStreamRequest) -> StreamingResponse:
    """Handle a streaming assistant chat request with debug events.

    Args:
        req: Request payload received by the endpoint.

    Returns:
        StreamingResponse
    """
    request_id = str(uuid.uuid4())[:8]

    prompt = req.prompt.strip()
    chat_id = req.chat_id
    limit_history = req.limit_history
    profile_context = (req.profile_context or "").strip() or None
    debug_enabled = req.debug
    stream_started_at = time.perf_counter()

    def stream_text(text: str) -> Iterator[str]:
        """Yield one text response as server-sent events.

        Args:
            text: Text to inspect or transform.

        Returns:
            Iterator[str]
        """
        output_started_at = time.perf_counter()
        for token_index, chunk in enumerate(split_text_for_stream(text), start=1):
            payload = {
                "type": "token",
                "chat_id": chat_id,
                "request_id": request_id,
                "stage": "token",
                "content": chunk,
                "token_index": token_index,
                "output_elapsed_ms": round(
                    (time.perf_counter() - output_started_at) * 1000, 2
                ),
                "elapsed_ms": round(
                    (time.perf_counter() - stream_started_at) * 1000, 2
                ),
            }
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            time.sleep(0.02)

    def done_event() -> str:
        """Build the terminal server-sent event.

        Returns:
            str
        """
        payload = {
            "type": "done",
            "chat_id": chat_id,
            "request_id": request_id,
            "stage": "done",
            "elapsed_ms": round((time.perf_counter() - stream_started_at) * 1000, 2),
        }
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    def error_event(message: str) -> str:
        """Build an error server-sent event.

        Args:
            message: Message object handled by the function.

        Returns:
            str
        """
        payload = {
            "type": "error",
            "chat_id": chat_id,
            "request_id": request_id,
            "stage": "error",
            "message": message,
            "elapsed_ms": round((time.perf_counter() - stream_started_at) * 1000, 2),
        }
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    def safe_debug_value(value: object, max_chars: int = 12000) -> object:
        """Normalize a debug value before sending it to the frontend.

        Args:
            value: Value being processed.
            max_chars: Maximum number of characters kept in the output.

        Returns:
            object
        """
        try:
            json.dumps(value, ensure_ascii=False)
            serializable = value
        except Exception:
            serializable = str(value)

        text = json.dumps(serializable, ensure_ascii=False)
        if len(text) <= max_chars:
            return serializable

        return {
            "truncated": True,
            "chars": len(text),
            "preview": text[:max_chars],
        }

    def parse_tool_arguments(arguments: object) -> object:
        """Parse the tool arguments.

        Args:
            arguments: Raw tool arguments returned by the model.

        Returns:
            object
        """
        if not isinstance(arguments, str):
            return arguments
        try:
            return json.loads(arguments or "{}")
        except Exception:
            return {
                "raw": arguments,
                "parse_error": True,
            }

    def debug_event(stage: str, message: str, **data: object) -> str | None:
        """Build one debug server-sent event.

        Args:
            stage: Debug stage attached to the event.
            message: Message object handled by the function.
            data: Source data processed by the function.

        Returns:
            str | None
        """
        if not debug_enabled:
            return None

        payload = {
            "type": "debug",
            "chat_id": chat_id,
            "request_id": request_id,
            "stage": stage,
            "message": message,
            "elapsed_ms": round((time.perf_counter() - stream_started_at) * 1000, 2),
            **data,
        }
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    def is_garbage_text(text: str) -> bool:
        """Check whether the value is garbage text.

        Args:
            text: Text to inspect or transform.

        Returns:
            bool
        """
        if not text:
            return False

        stripped = text.strip()
        if not stripped:
            return False

        if set(stripped) == {"?"}:
            return True

        if stripped.startswith("<|start|>assistant<|channel|>commentary"):
            return True

        return False

    def fallback_text_from_tool_results(tool_results: list[tuple[str, dict]]) -> str:
        """Build fallback text from tool results.

        Args:
            tool_results: Tool results collected during the assistant flow.

        Returns:
            str
        """
        if not tool_results:
            return "He completado la operación."

        last_tool_name, last_result = tool_results[-1]

        if isinstance(last_result, dict) and last_result.get("status") == "error":
            return (
                "He intentado completar la acción, pero ha ocurrido un error: "
                f"{last_result.get('message', 'Error desconocido')}"
            )

        if last_tool_name == "freebusy_query":
            data = last_result.get("data", {}) if isinstance(last_result, dict) else {}
            calendars = data.get("calendars", {})
            primary = calendars.get("primary", {})
            busy = primary.get("busy", [])
            if not busy:
                return "Sí, esa fecha y hora aparecen libres en tu calendario."
            return "No, en ese intervalo tienes ocupaciones en el calendario."

        if last_tool_name == "create_meet_invitation":
            data = last_result.get("data", {}) if isinstance(last_result, dict) else {}
            meet_link = data.get("meet_link")
            summary = data.get("summary", "la reunión")
            if meet_link:
                return (
                    f"Listo, he creado {summary} con Google Meet. Enlace: {meet_link}"
                )
            return f"Listo, he creado {summary} en el calendario."

        if last_tool_name == "send_email":
            data = last_result.get("data", {}) if isinstance(last_result, dict) else {}
            email_data = data.get("email", {})
            to_value = email_data.get("to", "")
            subject = email_data.get("subject", "")
            if to_value and subject:
                return f"Listo, he enviado el correo a {to_value} con el asunto: {subject}."
            return "Listo, he enviado el correo."

        if last_tool_name == "reply_email":
            data = last_result.get("data", {}) if isinstance(last_result, dict) else {}
            reply_data = data.get("reply", {})
            to_value = reply_data.get("to", "")
            subject = reply_data.get("subject", "")
            if to_value and subject:
                return (
                    "Listo, he respondido el correo "
                    f"a {to_value} con el asunto: {subject}. Gracias."
                )
            return "Listo, he respondido el correo. Gracias."

        if last_tool_name == "read_thread_from_message_id":
            data = last_result.get("data", {}) if isinstance(last_result, dict) else {}
            thread = data.get("thread", {}) if isinstance(data, dict) else {}
            emails = thread.get("emails", []) if isinstance(thread, dict) else []
            if isinstance(emails, list) and emails:
                lines = [f"He leido el hilo completo ({len(emails)} mensajes).", ""]
                for index, email in enumerate(emails[:6], start=1):
                    if not isinstance(email, dict):
                        continue
                    subject = email.get("subject") or "Sin asunto"
                    sender = email.get("sender") or "Sin remitente"
                    date = email.get("date") or "Sin fecha"
                    body = " ".join(
                        str(email.get("body") or email.get("snippet") or "").split()
                    )
                    if len(body) > 700:
                        body = body[:700].rstrip() + "..."
                    lines.append(f"{index}. **{subject}**")
                    lines.append(f"   - De: {sender}")
                    lines.append(f"   - Fecha: {date}")
                    if body:
                        lines.append(f"   - Contenido: {body}")
                return "\n".join(lines)

        if last_tool_name == "get_full_email":
            data = last_result.get("data", {}) if isinstance(last_result, dict) else {}
            summary = data.get("summary")
            if summary:
                return str(summary)

        return "He completado la operación correctamente."

    def event_generator() -> Iterator[str]:
        """Generate the streaming response events.

        Returns:
            Iterator[str]
        """
        try:
            event = debug_event(
                "backend_receive",
                "FastAPI recibe el mensaje del renderer y empieza el flujo de chat.",
                chat_id=chat_id,
                prompt=prompt,
                prompt_preview=prompt[:500],
                prompt_chars=len(prompt),
                limit_history=limit_history,
                profile_context_chars=len(profile_context or ""),
            )
            if event:
                yield event

            tokenize_started_at = time.perf_counter()
            approximate_prompt_tokens = len(prompt.split())
            tokenize_ms = round((time.perf_counter() - tokenize_started_at) * 1000, 4)
            event = debug_event(
                "tokenize",
                "La entrada se divide en unidades aproximadas antes de enviarse al modelo.",
                duration_ms=tokenize_ms,
                prompt_chars=len(prompt),
                prompt_tokens_estimate=approximate_prompt_tokens,
                token_preview=prompt.split()[:24],
            )
            if event:
                yield event

            system_prompt = get_system_prompt(chat_id) or get_system_prompt_default()
            ensure_session(chat_id, system_prompt)

            add_message(chat_id, "user", prompt)

            user_message_count = count_user_messages(chat_id)
            is_first_user_message = user_message_count == 1

            history = get_messages(chat_id, limit=limit_history)

            sanitized: list[dict] = []
            for m in history:
                if m["role"] == "assistant" and is_legacy_tool_json(m["content"]):
                    continue

                if m["role"] == "user" and "<<KAI_PROFILE_CONTEXT>>" in m["content"]:
                    content = m["content"]
                    marker = "<<KAI_USER_MESSAGE>>"
                    if marker in content:
                        content = content.split(marker, 1)[1].strip()

                    sanitized.append(
                        {
                            **m,
                            "content": content,
                        }
                    )
                    continue

                sanitized.append(m)

            messages = [
                {"role": "system", "content": system_prompt},
                now_context_system_message(),
            ]

            if profile_context:
                messages.append(
                    {
                        "role": "system",
                        "content": profile_context,
                    }
                )

            gmail_memory_context = get_chat_context(chat_id, GMAIL_CONTEXT_KEY)
            if gmail_memory_context:
                messages.append({"role": "system", "content": gmail_memory_context})

            messages += sanitized

            use_tools = should_enable_tools(prompt)
            event = debug_event(
                "context",
                "Kai prepara el contexto: system prompt, hora actual, perfil y memoria reciente.",
                messages_count=len(messages),
                history_messages=len(sanitized),
                tools_enabled=use_tools,
                limit_history=limit_history,
                profile_context=bool(profile_context),
                model=get_model_name(),
                temperature=get_temperature(),
                available_tools=[
                    tool.get("function", {}).get("name") for tool in TOOLS
                ],
                messages=safe_debug_value(messages),
            )
            if event:
                yield event

            if DEBUG_TOOLS:
                logger.info(f"\n=== [{request_id}] STREAM CHAT START ===")
                logger.info(f"[{request_id}] chat_id: {chat_id}")
                logger.info(f"[{request_id}] USER: {prompt}")
                logger.info(f"[{request_id}] limit_history: {limit_history}")
                logger.info(f"[{request_id}] profile_context: {bool(profile_context)}")
                logger.info(f"[{request_id}] use_tools: {use_tools}")
                logger.info(f"[{request_id}] messages_count: {len(messages)}")

            executed_tool_results: list[tuple[str, dict]] = []
            empty_model_retries = 0
            completion_gate_retries = 0
            force_next_tool = False

            for step in range(MAX_TOOL_STEPS):
                tool_choice = resolve_tool_choice(
                    use_tools,
                    executed_tool_results,
                    force_required=force_next_tool,
                )
                event = debug_event(
                    "lmstudio_request",
                    "Se envía una petición a LM Studio con el contexto y las tools disponibles.",
                    step=step + 1,
                    tools_enabled=use_tools,
                    messages_count=len(messages),
                    model=get_model_name(),
                    temperature=get_temperature(),
                    payload=safe_debug_value(
                        {
                            "model": get_model_name(),
                            "temperature": get_temperature(),
                            "messages": messages,
                            "tools": TOOLS if use_tools else [],
                            "tool_choice": tool_choice,
                        }
                    ),
                )
                if event:
                    yield event

                lmstudio_started_at = time.perf_counter()
                force_next_tool = False
                msg = call_lm_studio(
                    messages,
                    use_tools=use_tools,
                    tool_choice=tool_choice,
                )
                lmstudio_ms = round(
                    (time.perf_counter() - lmstudio_started_at) * 1000, 2
                )
                content = clean_model_output(msg.content or "")
                tool_calls = getattr(msg, "tool_calls", None) or []
                event = debug_event(
                    "lmstudio_response",
                    "LM Studio devuelve texto directo o una propuesta de tool call.",
                    step=step + 1,
                    duration_ms=lmstudio_ms,
                    content_chars=len(content),
                    content=content,
                    raw_message=safe_debug_value(
                        {
                            "content": msg.content,
                            "tool_calls": [
                                {
                                    "id": tc.id,
                                    "name": tc.function.name,
                                    "arguments": tc.function.arguments,
                                }
                                for tc in tool_calls
                            ],
                        }
                    ),
                    tool_calls=[
                        {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        }
                        for tc in tool_calls
                    ],
                )
                if event:
                    yield event

                if DEBUG_TOOLS:
                    logger.info(f"\n[{request_id}] STEP {step} - MODEL MESSAGE")
                    logger.info(f"[{request_id}] content: {repr(content)}")
                    logger.info(f"[{request_id}] tool_calls: {len(tool_calls)}")

                if not tool_calls and content and not is_garbage_text(content):
                    if executed_tool_results and use_tools:
                        complete, missing = evaluate_workflow_completion(
                            prompt,
                            content,
                            executed_tool_results,
                        )

                        if (
                            not complete
                            and completion_gate_retries < MAX_COMPLETION_GATE_RETRIES
                        ):
                            completion_gate_retries += 1
                            messages.append(workflow_gate_message(prompt, missing))
                            force_next_tool = True
                            continue

                    if should_store_assistant_message(content):
                        add_message(chat_id, "assistant", content)

                    _ensure_chat_title(
                        chat_id,
                        prompt,
                        is_first_user_message,
                        request_id,
                    )

                    yield from stream_text(content)
                    yield done_event()
                    return

                if not tool_calls:
                    if executed_tool_results:
                        if empty_model_retries < MAX_EMPTY_MODEL_RETRIES:
                            empty_model_retries += 1
                            messages.append(continue_after_empty_message(prompt))
                            use_tools = True
                            continue

                        messages.append(final_after_tools_message(prompt))
                        forced_final = call_lm_studio(messages, use_tools=False)
                        final_text = clean_model_output(forced_final.content or "")

                        if DEBUG_TOOLS:
                            logger.info(
                                f"\n[{request_id}] FORCED FINAL AFTER TOOL CHAIN: {repr(final_text)}"
                            )

                        if is_garbage_text(final_text) or not final_text:
                            final_text = fallback_text_from_tool_results(
                                executed_tool_results
                            )

                        if should_store_assistant_message(final_text):
                            add_message(chat_id, "assistant", final_text)

                        _ensure_chat_title(
                            chat_id,
                            prompt,
                            is_first_user_message,
                            request_id,
                        )

                        yield from stream_text(final_text)
                        yield done_event()
                        return

                    message = "No he podido generar una respuesta válida."

                    if should_store_assistant_message(message):
                        add_message(chat_id, "assistant", message)

                    yield from stream_text(message)
                    yield done_event()
                    return

                assistant_payload = {
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": [],
                }

                for tc in tool_calls:
                    assistant_payload["tool_calls"].append(
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                    )

                messages.append(assistant_payload)

                for tc in tool_calls:
                    event = debug_event(
                        "tool_selected",
                        f"El modelo selecciona la tool {tc.function.name}.",
                        step=step + 1,
                        tool_name=tc.function.name,
                        arguments=tc.function.arguments,
                        parsed_arguments=safe_debug_value(
                            parse_tool_arguments(tc.function.arguments)
                        ),
                    )
                    if event:
                        yield event

                    empty_model_retries = 0
                    tool_started_at = time.perf_counter()
                    result = handle_tool_call(tc)
                    tool_ms = round((time.perf_counter() - tool_started_at) * 1000, 2)
                    executed_tool_results.append((tc.function.name, result))
                    persist_gmail_memory(chat_id, tc.function.name, result)
                    gmail_memory_context = get_chat_context(chat_id, GMAIL_CONTEXT_KEY)
                    event = debug_event(
                        "tool_result",
                        f"La tool {tc.function.name} termina y su resultado vuelve al contexto.",
                        step=step + 1,
                        tool_name=tc.function.name,
                        status=result.get("status")
                        if isinstance(result, dict)
                        else None,
                        duration_ms=tool_ms,
                        result=safe_debug_value(result),
                    )
                    if event:
                        yield event

                    if DEBUG_TOOLS:
                        logger.info(f"\n[{request_id}] TOOL RESULT <- {tc.function.name}")
                        logger.info(
                            f"[{request_id}] result: {json.dumps(result, ensure_ascii=False)[:1500]}"
                        )

                    if (
                        isinstance(result, dict)
                        and result.get("status") == "auth_expired"
                    ):
                        final_auth_reply = result.get("message") or (
                            "No puedo acceder a tus servicios de Google porque la sesión ha expirado."
                        )

                        if should_store_assistant_message(final_auth_reply):
                            add_message(chat_id, "assistant", final_auth_reply)

                        yield from stream_text(final_auth_reply)
                        yield done_event()
                        return

                    tool_msg = {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(result, ensure_ascii=False),
                    }

                    messages.append(tool_msg)

                    gmail_context_msg = build_gmail_context_message(
                        tc.function.name,
                        result,
                    )
                    if gmail_context_msg:
                        messages.append(gmail_context_msg)

                messages.append(post_tool_instruction_message(prompt))

                use_tools = True
            if executed_tool_results:
                final_text = fallback_text_from_tool_results(executed_tool_results)
                if should_store_assistant_message(final_text):
                    add_message(chat_id, "assistant", final_text)
                _ensure_chat_title(
                    chat_id,
                    prompt,
                    is_first_user_message,
                    request_id,
                )
                yield from stream_text(final_text)
                yield done_event()
                return

            yield error_event("Se alcanzo el maximo de tool steps")
        except Exception as e:
            logger.exception("[%s] ERROR EN /chat/stream", request_id)
            yield error_event(str(e))

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
