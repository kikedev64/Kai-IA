import json
import time
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from services.chat_summary_service import generate_chat_summary_from_text
from core.config import get_model_name, get_temperature, get_tool_activation_keywords
from tools.tools_definition import TOOLS

try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None  # fallback

from api.schemas.chat import AskRequest
from core.config import get_system_prompt_default
from llm.lmstudio_client import ask_without_context, call_lm_studio
from tools.tools_handler import handle_tool_call
from tools.gmail.email_response_builders import build_emails_context_block
from services.chat_store import (
    ensure_session,
    add_message,
    get_full_chat_by_id,
    get_messages,
    get_system_prompt,
    get_chat_title,
    list_chat_sessions,
    update_chat_title,
    count_user_messages,
)

router = APIRouter(prefix="/assistant", tags=["Assistant"])

MAX_TOOL_STEPS = 6
class ChatStreamRequest(BaseModel):
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
}

def should_enable_tools(prompt: str) -> bool:
    text = (prompt or "").lower()
    keywords = get_tool_activation_keywords()

    if not keywords:
        return False

    return any(keyword in text for keyword in keywords)

def is_legacy_tool_json(text: str) -> bool:
    if not text:
        return False
    s = text.strip()
    try:
        obj = json.loads(s)
    except Exception:
        return False
    return isinstance(obj, dict) and "tool_call" in obj


def extract_legacy_tool_call(text: str) -> dict | None:
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
    if not text:
        return ""

    cleaned = text

    while "<think>" in cleaned and "</think>" in cleaned:
        start = cleaned.find("<think>")
        end = cleaned.find("</think>", start)

        if end == -1:
            break

        cleaned = cleaned[:start] + cleaned[end + len("</think>"):]

    if "<think>" in cleaned:
        cleaned = cleaned.split("<think>", 1)[0]

    return cleaned.strip()

def should_store_assistant_message(text: str) -> bool:
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

def post_tool_instruction_message(user_input: str) -> dict:
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
            "- Responde directamente o continúa con la siguiente acción necesaria.\n"
        ),
    }

def build_gmail_context_message(tool_name: str, result: dict) -> dict | None:
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


def _fallback_title_from_user_input(user_input: str) -> str:
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
    if not is_first_user_message:
        return

    current_title = get_chat_title(chat_id)
    if current_title:
        if DEBUG_TOOLS:
            print(f"[{request_id}] El chat ya tiene título: {current_title}")
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
            print(f"[{request_id}] Título generado por LLM: {generated_title}")
    except Exception as e:
        print(f"[{request_id}] Error generando título con LLM: {repr(e)}")

    if not generated_title:
        generated_title = _fallback_title_from_user_input(user_input)
        if DEBUG_TOOLS:
            print(f"[{request_id}] Usando título fallback: {generated_title}")

    update_chat_title(chat_id, generated_title)

    saved_title = get_chat_title(chat_id)
    if DEBUG_TOOLS:
        print(f"[{request_id}] Título guardado en BD: {saved_title}")


@router.post("/start")
def start():
    chat_id = str(uuid.uuid4())
    ensure_session(chat_id, get_system_prompt_default())
    return {"chat_id": chat_id}


@router.post("/chat")
def chat_endpoint(
    user_input: str,
    chat_id: str = Query(..., min_length=1),
    limit_history: int = Query(50, ge=1, le=200),
):
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
        messages += sanitized

        if DEBUG_TOOLS:
            print(f"\n=== [{request_id}] CHAT START {start_ts} ===")
            print(f"[{request_id}] chat_id: {chat_id}")
            print(f"[{request_id}] USER: {user_input}")
            print(f"[{request_id}] user_message_count: {user_message_count}")
            print(f"[{request_id}] is_first_user_message: {is_first_user_message}")

        for step in range(MAX_TOOL_STEPS):
            msg = call_lm_studio(messages)
            tool_calls = getattr(msg, "tool_calls", None)

            if DEBUG_TOOLS:
                print(f"\n[{request_id}] STEP {step} - MODEL MESSAGE")
                print(f"[{request_id}] content: {repr(msg.content)}")
                print(
                    f"[{request_id}] tool_calls: {len(tool_calls) if tool_calls else 0}"
                )

            if not tool_calls:
                content = clean_model_output(msg.content or "")

                legacy_tc = extract_legacy_tool_call(content)
                if legacy_tc:
                    if DEBUG_TOOLS:
                        print(f"\n[{request_id}] LEGACY TOOL JSON DETECTED (content)")
                        print(f"[{request_id}] legacy tool: {legacy_tc.get('name')}")
                        print(
                            f"[{request_id}] legacy args: {json.dumps(legacy_tc.get('arguments'), ensure_ascii=False)}"
                        )

                    name = legacy_tc["name"]
                    args = legacy_tc.get("arguments") or {}

                    class _Fn:
                        def __init__(self, n: str, a: dict):
                            self.name = n
                            self.arguments = json.dumps(a, ensure_ascii=False)

                    class _TC:
                        def __init__(self, n: str, a: dict):
                            self.id = "legacy"
                            self.function = _Fn(n, a)

                    fake_tc = _TC(name, args)
                    result = handle_tool_call(fake_tc)

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

                    msg2 = call_lm_studio(messages)
                    final2 = (msg2.content or "").strip()

                    if should_store_assistant_message(final2):
                        add_message(chat_id, "assistant", final2)
                        _ensure_chat_title(
                            chat_id, user_input, is_first_user_message, request_id
                        )

                    if DEBUG_TOOLS:
                        print(
                            f"\n[{request_id}] FINAL (after legacy tool exec): {final2}"
                        )
                        print(f"=== [{request_id}] CHAT END ===\n")

                    return {"reply": final2, "chat_id": chat_id}

                if should_store_assistant_message(content):
                    add_message(chat_id, "assistant", content)
                    _ensure_chat_title(
                        chat_id, user_input, is_first_user_message, request_id
                    )

                if DEBUG_TOOLS:
                    print(f"\n[{request_id}] FINAL: {content}")
                    print(f"=== [{request_id}] CHAT END ===\n")

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
                    print(f"\n[{request_id}] TOOL CALL -> {tc.function.name}")
                    print(f"[{request_id}] tool_call_id: {tc.id}")
                    print(f"[{request_id}] raw arguments: {tc.function.arguments}")

            messages.append(assistant_payload)

            for tc in tool_calls:
                result = handle_tool_call(tc)

                if DEBUG_TOOLS:
                    print(f"\n[{request_id}] TOOL RESULT <- {tc.function.name}")
                    print(f"[{request_id}] tool_call_id: {tc.id}")
                    print(
                        f"[{request_id}] result: {json.dumps(result, ensure_ascii=False, indent=2)}"
                    )

                if isinstance(result, dict) and result.get("status") == "auth_expired":
                    final_auth_reply = result.get("message") or (
                        "No puedo acceder a tus servicios de Google porque la sesión ha expirado."
                    )

                    add_message(chat_id, "assistant", final_auth_reply)

                    if DEBUG_TOOLS:
                        print(f"\n[{request_id}] AUTH EXPIRED DETECTED")
                        print(f"[{request_id}] message: {final_auth_reply}")
                        print(f"=== [{request_id}] CHAT END ===\n")

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
                messages.append({"role": "user", "content": user_input})

        raise HTTPException(
            status_code=500,
            detail="Demasiadas llamadas a herramientas seguidas (posible bucle).",
        )

    except Exception as e:
        print(f"[{request_id}] ERROR EN /chat: {repr(e)}")
        if "No models loaded" in str(e):
            return {
                "reply": "Ahora mismo no tengo ningún modelo cargado para responder. Carga un modelo en LM Studio.",
                "chat_id": chat_id,
            }
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ask")
def ask_llm(req: AskRequest):
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
def get_chats():
    try:
        chats = list_chat_sessions()
        return {"chats": chats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chats/{chat_id}")
def get_chat_by_id(chat_id: str):
    try:
        chat = get_full_chat_by_id(chat_id)

        if not chat:
            raise HTTPException(status_code=404, detail="Chat no encontrado")

        return chat
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def split_text_for_stream(text: str):
    # Puedes hacerlo por caracteres, por palabras o por bloques.
    # Por palabras queda bastante natural.
    words = text.split(" ")
    for i, word in enumerate(words):
        if i == 0:
            yield word
        else:
            yield " " + word


@router.post("/chat/stream")
def assistant_chat_stream(req: ChatStreamRequest):
    request_id = str(uuid.uuid4())[:8]

    prompt = req.prompt.strip()
    chat_id = req.chat_id
    limit_history = req.limit_history
    profile_context = (req.profile_context or "").strip() or None
    debug_enabled = req.debug
    stream_started_at = time.perf_counter()

    def stream_text(text: str):
        output_started_at = time.perf_counter()
        for token_index, chunk in enumerate(split_text_for_stream(text), start=1):
            payload = {
                "type": "token",
                "chat_id": chat_id,
                "request_id": request_id,
                "stage": "token",
                "content": chunk,
                "token_index": token_index,
                "output_elapsed_ms": round((time.perf_counter() - output_started_at) * 1000, 2),
                "elapsed_ms": round((time.perf_counter() - stream_started_at) * 1000, 2),
            }
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            time.sleep(0.02)

    def done_event():
        payload = {
            "type": "done",
            "chat_id": chat_id,
            "request_id": request_id,
            "stage": "done",
            "elapsed_ms": round((time.perf_counter() - stream_started_at) * 1000, 2),
        }
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    def error_event(message: str):
        payload = {
            "type": "error",
            "chat_id": chat_id,
            "request_id": request_id,
            "stage": "error",
            "message": message,
            "elapsed_ms": round((time.perf_counter() - stream_started_at) * 1000, 2),
        }
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    def safe_debug_value(value, max_chars: int = 12000):
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

    def parse_tool_arguments(arguments):
        if not isinstance(arguments, str):
            return arguments
        try:
            return json.loads(arguments or "{}")
        except Exception:
            return {
                "raw": arguments,
                "parse_error": True,
            }

    def debug_event(stage: str, message: str, **data):
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
                return f"Listo, he creado {summary} con Google Meet. Enlace: {meet_link}"
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

        if last_tool_name == "get_full_email":
            data = last_result.get("data", {}) if isinstance(last_result, dict) else {}
            summary = data.get("summary")
            if summary:
                return str(summary)

        return "He completado la operación correctamente."

    terminal_tool_names = {
        "send_email",
        "reply_email",
        "create_meet_invitation",
        "freebusy_query",
    }

    def event_generator():
        try:
            event = debug_event(
                "backend_receive",
                "FastAPI recibe el mensaje del renderer y empieza el flujo de chat.",
                chat_id=chat_id,
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
                available_tools=[tool.get("function", {}).get("name") for tool in TOOLS],
                messages=safe_debug_value(messages),
            )
            if event:
                yield event

            if DEBUG_TOOLS:
                print(f"\n=== [{request_id}] STREAM CHAT START ===")
                print(f"[{request_id}] chat_id: {chat_id}")
                print(f"[{request_id}] USER: {prompt}")
                print(f"[{request_id}] limit_history: {limit_history}")
                print(f"[{request_id}] profile_context: {bool(profile_context)}")
                print(f"[{request_id}] use_tools: {use_tools}")
                print(f"[{request_id}] messages_count: {len(messages)}")

            executed_tool_results: list[tuple[str, dict]] = []

            for step in range(MAX_TOOL_STEPS):
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
                            "tool_choice": "auto" if use_tools else None,
                        }
                    ),
                )
                if event:
                    yield event

                lmstudio_started_at = time.perf_counter()
                msg = call_lm_studio(messages, use_tools=use_tools)
                lmstudio_ms = round((time.perf_counter() - lmstudio_started_at) * 1000, 2)
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
                    print(f"\n[{request_id}] STEP {step} - MODEL MESSAGE")
                    print(f"[{request_id}] content: {repr(content)}")
                    print(f"[{request_id}] tool_calls: {len(tool_calls)}")

                # Caso 1: respuesta final normal.
                if not tool_calls and content and not is_garbage_text(content):
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

                # Caso 2: no hay tools y el texto es basura / vacío.
                if not tool_calls:
                    if executed_tool_results:
                        forced_final = call_lm_studio(messages, use_tools=False)
                        final_text = clean_model_output(forced_final.content or "")

                        if DEBUG_TOOLS:
                            print(
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
                        parsed_arguments=safe_debug_value(parse_tool_arguments(tc.function.arguments)),
                    )
                    if event:
                        yield event

                    tool_started_at = time.perf_counter()
                    result = handle_tool_call(tc)
                    tool_ms = round((time.perf_counter() - tool_started_at) * 1000, 2)
                    executed_tool_results.append((tc.function.name, result))
                    event = debug_event(
                        "tool_result",
                        f"La tool {tc.function.name} termina y su resultado vuelve al contexto.",
                        step=step + 1,
                        tool_name=tc.function.name,
                        status=result.get("status") if isinstance(result, dict) else None,
                        duration_ms=tool_ms,
                        result=safe_debug_value(result),
                    )
                    if event:
                        yield event

                    if DEBUG_TOOLS:
                        print(f"\n[{request_id}] TOOL RESULT <- {tc.function.name}")
                        print(
                            f"[{request_id}] result: {json.dumps(result, ensure_ascii=False)[:1500]}"
                        )

                    if isinstance(result, dict) and result.get("status") == "auth_expired":
                        final_auth_reply = result.get("message") or (
                            "No puedo acceder a tus servicios de Google porque la sesión ha expirado."
                        )

                        if should_store_assistant_message(final_auth_reply):
                            add_message(chat_id, "assistant", final_auth_reply)

                        yield from stream_text(final_auth_reply)
                        yield done_event()
                        return

                    if (
                        tc.function.name in terminal_tool_names
                        and isinstance(result, dict)
                        and result.get("status") == "success"
                    ):
                        final_reply = fallback_text_from_tool_results(
                            [(tc.function.name, result)]
                        )

                        if should_store_assistant_message(final_reply):
                            add_message(chat_id, "assistant", final_reply)

                        _ensure_chat_title(
                            chat_id,
                            prompt,
                            is_first_user_message,
                            request_id,
                        )

                        yield from stream_text(final_reply)
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

                # Después de usar una tool, mantenemos las tools activas por si necesita otra.
                use_tools = True

            yield error_event("Se alcanzó el máximo de tool steps")

        except Exception as e:
            print(f"[{request_id}] ERROR EN /chat/stream: {repr(e)}")
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
