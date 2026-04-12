import json
import time
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from services.chat_summary_service import generate_chat_summary_from_text
from services.user_profile_service import get_user_profile_as_dict

try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None  # fallback

from api.schemas.chat import AskRequest, ChatStream
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
DEBUG_TOOLS = True

GMAIL_CONTEXT_TOOLS = {
    "read_last_emails_full",
    "read_last_emails_from_sender",
    "read_last_emails_by_subject",
    "read_thread_from_message_id",
}


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


def post_tool_instruction_message(user_input: str) -> dict:
    return {
        "role": "system",
        "content": (
            "INSTRUCCIONES POST-TOOL (OBLIGATORIAS):\n"
            f"- Pregunta original del usuario: {user_input}\n"
            "- Usa el resultado de la herramienta para responder directamente a esa pregunta.\n"
            "- No digas que el usuario ha compartido datos; los datos vienen de la herramienta.\n"
            "- Si ya hay información suficiente, responde directamente.\n"
            "- No vuelvas a invocar la misma herramienta si ya tienes resultados suficientes.\n"
            "- No hagas preguntas genéricas como '¿en qué puedo ayudarte?' o '¿qué quieres hacer con esto?'.\n"
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
        generated_title = generate_chat_summary_from_text(user_input)
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

        user_profile_msg = user_profile_system_message()
        if user_profile_msg:
            messages.append(user_profile_msg)

        messages += sanitized

        if DEBUG_TOOLS:
            print(f"\n=== [{request_id}] CHAT START {start_ts} ===")
            print(f"[{request_id}] chat_id: {chat_id}")
            print(f"[{request_id}] USER: {user_input}")
            print(f"[{request_id}] user_message_count: {user_message_count}")
            print(f"[{request_id}] is_first_user_message: {is_first_user_message}")
            print(f"[{request_id}] user_profile_loaded: {user_profile_msg is not None}")

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
                content = (msg.content or "").strip()

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
                    add_message(chat_id, "tool", json.dumps(result, ensure_ascii=False))

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
                    messages.append({"role": "user", "content": user_input})

                    msg2 = call_lm_studio(messages)
                    final2 = (msg2.content or "").strip()

                    if final2:
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

                if content:
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

                add_message(chat_id, "tool", tool_msg["content"])
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
def assistant_chat_stream(
    prompt: str,
    chat_id: str = Query(..., min_length=1),
    limit_history: int = Query(50, ge=1, le=200),
):
    request_id = str(uuid.uuid4())[:8]

    def stream_text(text: str):
        for chunk in split_text_for_stream(text):
            payload = {"type": "token", "content": chunk}
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            time.sleep(0.02)

    def done_event():
        return f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"

    def error_event(message: str):
        return f"data: {json.dumps({'type': 'error', 'message': message}, ensure_ascii=False)}\n\n"

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
            return f"He intentado completar la acción, pero ha ocurrido un error: {last_result.get('message', 'Error desconocido')}"

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

        if last_tool_name == "get_full_email":
            data = last_result.get("data", {}) if isinstance(last_result, dict) else {}
            summary = data.get("summary")
            if summary:
                return str(summary)

        return "He completado la operación correctamente."

    def event_generator():
        try:
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
                sanitized.append(m)

            messages = [
                {"role": "system", "content": system_prompt},
                now_context_system_message(),
            ]

            user_profile_msg = user_profile_system_message()
            if user_profile_msg:
                messages.append(user_profile_msg)

            messages += sanitized

            if DEBUG_TOOLS:
                print(f"\n=== [{request_id}] STREAM CHAT START ===")
                print(f"[{request_id}] chat_id: {chat_id}")
                print(f"[{request_id}] USER: {prompt}")

            executed_tool_results: list[tuple[str, dict]] = []

            for step in range(MAX_TOOL_STEPS):
                msg = call_lm_studio(messages, use_tools=True)
                content = (msg.content or "").strip()
                tool_calls = getattr(msg, "tool_calls", None) or []

                if DEBUG_TOOLS:
                    print(f"\n[{request_id}] STEP {step} - MODEL MESSAGE")
                    print(f"[{request_id}] content: {repr(content)}")
                    print(f"[{request_id}] tool_calls: {len(tool_calls)}")

                # Caso 1: el modelo ya responde con texto final normal
                if not tool_calls and content and not is_garbage_text(content):
                    add_message(chat_id, "assistant", content)
                    _ensure_chat_title(
                        chat_id, prompt, is_first_user_message, request_id
                    )

                    yield from stream_text(content)
                    yield done_event()
                    return

                # Caso 2: no hay tool_calls pero el texto es basura / pseudo-tool / vacío
                # Forzamos una última respuesta solo cuando ya hay resultados de tools previos.
                if not tool_calls:
                    if executed_tool_results:
                        forced_final = call_lm_studio(messages, use_tools=False)
                        final_text = (forced_final.content or "").strip()

                        if DEBUG_TOOLS:
                            print(
                                f"\n[{request_id}] FORCED FINAL AFTER TOOL CHAIN: {repr(final_text)}"
                            )

                        if is_garbage_text(final_text) or not final_text:
                            final_text = fallback_text_from_tool_results(
                                executed_tool_results
                            )

                        add_message(chat_id, "assistant", final_text)
                        _ensure_chat_title(
                            chat_id, prompt, is_first_user_message, request_id
                        )

                        yield from stream_text(final_text)
                        yield done_event()
                        return

                    # Si ni hay tools ni contenido útil, devolvemos error controlado
                    message = "No he podido generar una respuesta válida."
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
                    result = handle_tool_call(tc)
                    executed_tool_results.append((tc.function.name, result))

                    if DEBUG_TOOLS:
                        print(f"\n[{request_id}] TOOL RESULT <- {tc.function.name}")
                        print(
                            f"[{request_id}] result: {json.dumps(result, ensure_ascii=False)[:1500]}"
                        )

                    if (
                        isinstance(result, dict)
                        and result.get("status") == "auth_expired"
                    ):
                        final_auth_reply = result.get("message") or (
                            "No puedo acceder a tus servicios de Google porque la sesión ha expirado."
                        )

                        add_message(chat_id, "assistant", final_auth_reply)

                        yield from stream_text(final_auth_reply)
                        yield done_event()
                        return

                    tool_msg = {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(result, ensure_ascii=False),
                    }

                    add_message(chat_id, "tool", tool_msg["content"])
                    messages.append(tool_msg)

                    gmail_context_msg = build_gmail_context_message(
                        tc.function.name, result
                    )
                    if gmail_context_msg:
                        messages.append(gmail_context_msg)

                # Muy importante:
                # añadimos la instrucción post-tool, pero NO forzamos final aquí.
                # Dejamos que el bucle continúe por si el modelo necesita otra tool.
                messages.append(post_tool_instruction_message(prompt))
                messages.append({"role": "user", "content": prompt})

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


def user_profile_system_message() -> dict | None:
    try:
        user_profile = get_user_profile_as_dict()
    except Exception:
        return None

    if not user_profile:
        return None

    return {
        "role": "system",
        "content": (
            "CONTEXTO PERSISTENTE DEL USUARIO (OBLIGATORIO):\n"
            "- Esta información describe al usuario y debe usarse como contexto en todas las respuestas.\n"
            "- No la menciones literalmente salvo que sea útil o el usuario pregunte por ella.\n"
            "- No digas que viene de una base de datos ni de un perfil interno.\n"
            "- Úsala para personalizar tono, continuidad, preferencias y contexto.\n\n"
            f"{json.dumps(user_profile, ensure_ascii=False, indent=2)}"
        ),
    }
