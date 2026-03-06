# api/routers/chat.py
import json
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Query

try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None  # fallback

from core.config import SYSTEM_PROMPT_DEFAULT
from llm.lmstudio_client import call_lm_studio
from tools.tools_handler import handle_tool_call
from tools.gmail.email_response_builders import build_emails_context_block
from services.chat_store import ensure_session, add_message, get_messages, get_system_prompt

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


@router.post("/start")
def start():
    chat_id = str(uuid.uuid4())
    ensure_session(chat_id, SYSTEM_PROMPT_DEFAULT)
    return {"chat_id": chat_id}


@router.post("/chat")
def chat_endpoint(
    user_input: str,
    chat_id: str = Query(..., min_length=1),
    limit_history: int = Query(50, ge=1, le=200),
):
    try:
        request_id = str(uuid.uuid4())[:8]
        start_ts = datetime.now().isoformat(timespec="seconds")

        system_prompt = get_system_prompt(chat_id) or SYSTEM_PROMPT_DEFAULT
        ensure_session(chat_id, system_prompt)

        add_message(chat_id, "user", user_input)

        history = get_messages(chat_id, limit=limit_history)

        sanitized: list[dict] = []
        for m in history:
            if m["role"] == "assistant" and is_legacy_tool_json(m["content"]):
                continue
            sanitized.append(m)

        messages = [
            {"role": "system", "content": system_prompt},
            now_context_system_message(),
        ] + sanitized

        if DEBUG_TOOLS:
            print(f"\n=== [{request_id}] CHAT START {start_ts} ===")
            print(f"[{request_id}] chat_id: {chat_id}")
            print(f"[{request_id}] USER: {user_input}")

        for step in range(MAX_TOOL_STEPS):
            msg = call_lm_studio(messages)
            tool_calls = getattr(msg, "tool_calls", None)

            if DEBUG_TOOLS:
                print(f"\n[{request_id}] STEP {step} - MODEL MESSAGE")
                print(f"[{request_id}] content: {repr(msg.content)}")
                print(f"[{request_id}] tool_calls: {len(tool_calls) if tool_calls else 0}")

            if not tool_calls:
                content = (msg.content or "").strip()

                legacy_tc = extract_legacy_tool_call(content)
                if legacy_tc:
                    if DEBUG_TOOLS:
                        print(f"\n[{request_id}] LEGACY TOOL JSON DETECTED (content)")
                        print(f"[{request_id}] legacy tool: {legacy_tc.get('name')}")
                        print(f"[{request_id}] legacy args: {json.dumps(legacy_tc.get('arguments'), ensure_ascii=False)}")

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

                    if DEBUG_TOOLS:
                        print(f"\n[{request_id}] FINAL (after legacy tool exec): {final2}")
                        print(f"=== [{request_id}] CHAT END ===\n")

                    return {"reply": final2, "chat_id": chat_id}

                if content:
                    add_message(chat_id, "assistant", content)

                if DEBUG_TOOLS:
                    print(f"\n[{request_id}] FINAL: {content}")
                    print(f"=== [{request_id}] CHAT END ===\n")

                return {"reply": content, "chat_id": chat_id}

            assistant_payload = {"role": "assistant", "content": msg.content, "tool_calls": []}

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
                    print(f"[{request_id}] result: {json.dumps(result, ensure_ascii=False, indent=2)}")

                tool_msg = {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, ensure_ascii=False),
                }

                add_message(chat_id, "tool", tool_msg["content"])
                messages.append(tool_msg)

                gmail_context_msg = build_gmail_context_message(tc.function.name, result)
                if gmail_context_msg:
                    messages.append(gmail_context_msg)

                messages.append(post_tool_instruction_message(user_input))
                messages.append({"role": "user", "content": user_input})

        raise HTTPException(
            status_code=500,
            detail="Demasiadas llamadas a herramientas seguidas (posible bucle).",
        )
    except Exception as e:
        if "No models loaded" in str(e):
            return {
                "reply": "Ahora mismo no tengo ningún modelo cargado para responder. Carga un modelo en LM Studio.",
                "chat_id": chat_id,
            }
        raise