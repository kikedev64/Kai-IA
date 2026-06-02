import json
import logging
import time
import uuid
from datetime import datetime
from typing import Iterator

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from api.assistant.constants import (
    DEBUG_TOOLS,
    GMAIL_CONTEXT_KEY,
    MAX_COMPLETION_GATE_RETRIES,
    MAX_EMPTY_MODEL_RETRIES,
    MAX_TOOL_STEPS,
)
from api.assistant.gmail_context import (
    build_gmail_context_message,
    persist_gmail_memory,
)
from api.assistant.messages import (
    continue_after_empty_message,
    final_after_tools_message,
    now_context_system_message,
    post_tool_instruction_message,
    tool_capabilities_system_message,
    workflow_gate_message,
)
from api.assistant.model_text import (
    clean_model_output,
    extract_legacy_tool_call,
    is_garbage_text,
    is_legacy_tool_json,
    should_store_assistant_message,
)
from api.assistant.orchestrator import run_chat_orchestrator
from api.assistant.titles import ensure_chat_title as _ensure_chat_title
from api.assistant.workflow import (
    evaluate_workflow_completion,
    fallback_text_from_tool_results,
    resolve_tool_choice,
    should_enable_tools,
)
from core.config import get_model_name, get_temperature, get_tool_approval_timeout
from tools.tools_definition import TOOLS

from api.schemas.chat import AskRequest, ChatStreamRequest
from core.config import get_system_prompt_default
from llm.lmstudio_client import ask_without_context, call_lm_studio
from tools.tools_handler import handle_tool_call
from services.chat_store import (
    ensure_session,
    add_message,
    delete_chat,
    get_chat_context,
    get_full_chat_by_id,
    get_messages,
    get_system_prompt,
    list_chat_sessions,
    count_user_messages,
)

router = APIRouter(prefix="/assistant", tags=["Assistant"])
logger = logging.getLogger("uvicorn")


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
    try:
        return run_chat_orchestrator(
            user_input=user_input,
            chat_id=chat_id,
            limit_history=limit_history,
        )
    except Exception as e:
        logger.exception("ERROR EN /chat")

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
                status_code=503, detail="No hay ningúnmodelo cargado en LM Studio."
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


@router.delete("/chats/{chat_id}")
def delete_chat_endpoint(chat_id: str) -> dict[str, str]:
    """Delete a chat session and all its messages.

    Args:
        chat_id: Identifier of the chat session to delete.

    Returns:
        dict[str, str]
    """
    try:
        found = delete_chat(chat_id)

        if not found:
            raise HTTPException(status_code=404, detail="Chat no encontrado")

        return {"status": "deleted", "chat_id": chat_id}
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
    inc_system_prompt = req.include_system_prompt
    inc_datetime = req.include_datetime
    inc_history = req.include_history
    inc_profile = req.include_profile
    inc_tools = req.include_tools
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
            return "He completado la operación"

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

            messages = []

            if inc_system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            if inc_datetime:
                messages.append(now_context_system_message())
            if inc_tools:
                messages.append(tool_capabilities_system_message())

            if inc_profile and profile_context:
                messages.append({"role": "system", "content": profile_context})

            gmail_memory_context = get_chat_context(chat_id, GMAIL_CONTEXT_KEY)
            if gmail_memory_context:
                messages.append({"role": "system", "content": gmail_memory_context})

            if inc_history:
                messages += sanitized
            else:
                messages.append({"role": "user", "content": prompt})

            use_tools = inc_tools and should_enable_tools(prompt)
            event = debug_event(
                "context",
                "Kai prepara el contexto: system prompt, hora actual, perfil y memoria reciente.",
                messages_count=len(messages),
                history_messages=len(sanitized) if inc_history else 0,
                context_flags={
                    "system_prompt": inc_system_prompt,
                    "datetime": inc_datetime,
                    "history": inc_history,
                    "profile": inc_profile,
                    "tools": inc_tools,
                },
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
                    if (
                        executed_tool_results
                        and use_tools
                        and completion_gate_retries < MAX_COMPLETION_GATE_RETRIES
                    ):
                        complete, missing = evaluate_workflow_completion(
                            prompt,
                            content,
                            executed_tool_results,
                        )

                        if not complete:
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

                    if tc.function.name == "run_shell_command":
                        from api.routers.tool_approval import (
                            consume_approval,
                            register_approval,
                        )
                        approval_id = str(uuid.uuid4())[:16]
                        parsed_args = parse_tool_arguments(tc.function.arguments)

                        if isinstance(parsed_args, dict) and parsed_args.get("parse_error"):
                            result = {
                                "status": "error",
                                "message": (
                                    "Los argumentos del tool call contienen JSON malformado. "
                                    "Reformula el comando usando JSON válido, "
                                    "evitando comillas anidadas sin escapar."
                                ),
                            }
                            tool_msg = {
                                "role": "tool",
                                "tool_call_id": tc.id,
                                "content": json.dumps(result, ensure_ascii=False),
                            }
                            messages.append(tool_msg)
                            executed_tool_results.append((tc.function.name, result))
                            continue

                        approval_payload = {
                            "type": "tool_approval_request",
                            "approval_id": approval_id,
                            "tool_name": tc.function.name,
                            "command": parsed_args.get("command", "")
                            if isinstance(parsed_args, dict)
                            else "",
                            "args": parsed_args,
                            "chat_id": chat_id,
                            "request_id": request_id,
                            "elapsed_ms": round(
                                (time.perf_counter() - stream_started_at) * 1000, 2
                            ),
                        }
                        yield f"data: {json.dumps(approval_payload, ensure_ascii=False)}\n\n"

                        evt = register_approval(approval_id)
                        evt_set = evt.wait(timeout=float(get_tool_approval_timeout()))
                        approved_by_user = consume_approval(approval_id)

                        if evt_set and approved_by_user:
                            result = handle_tool_call(tc)
                        else:
                            final_text = (
                                "Entendido, he cancelado la operación."
                                if evt_set
                                else "No recibí respuesta a tiempo. He cancelado la operación."
                            )
                            if should_store_assistant_message(final_text):
                                add_message(chat_id, "assistant", final_text)
                            _ensure_chat_title(
                                chat_id, prompt, is_first_user_message, request_id
                            )
                            yield from stream_text(final_text)
                            yield done_event()
                            return
                    else:
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
                        arguments=tc.function.arguments,
                        parsed_arguments=safe_debug_value(
                            parse_tool_arguments(tc.function.arguments)
                        ),
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
