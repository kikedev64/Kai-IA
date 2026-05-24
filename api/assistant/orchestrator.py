import json
import logging
import uuid
from datetime import datetime

from api.assistant.constants import (
    DEBUG_TOOLS,
    MAX_COMPLETION_GATE_RETRIES,
    MAX_EMPTY_MODEL_RETRIES,
    MAX_TOOL_STEPS,
)
from api.assistant.context_builder import build_chat_context
from api.assistant.legacy_tools import LegacyToolCall
from api.assistant.messages import (
    continue_after_empty_message,
    final_after_tools_message,
    workflow_gate_message,
)
from api.assistant.model_text import (
    clean_model_output,
    extract_legacy_tool_call,
    is_garbage_text,
    should_store_assistant_message,
)
from api.assistant.titles import ensure_chat_title
from api.assistant.tool_runner import (
    build_assistant_tool_payload,
    execute_legacy_tool_call,
    execute_tool_call,
)
from api.assistant.workflow import (
    evaluate_workflow_completion,
    fallback_text_from_tool_results,
    resolve_tool_choice,
    should_enable_tools,
)
from llm.lmstudio_client import call_lm_studio
from services.chat_store import add_message

logger = logging.getLogger("uvicorn")


def run_chat_orchestrator(
    user_input: str,
    chat_id: str,
    limit_history: int,
) -> dict[str, str]:
    """Run the non-streaming assistant workflow.

    Args:
        user_input: User message sent to the assistant.
        chat_id: Identifier of the current chat session.
        limit_history: Maximum number of previous messages to include.

    Returns:
        dict[str, str]: Response payload containing the assistant reply and chat id.

    Raises:
        RuntimeError: If the tool loop reaches the maximum number of steps without
            producing a valid final response.
    """
    request_id = str(uuid.uuid4())[:8]
    start_ts = datetime.now().isoformat(timespec="seconds")

    context = build_chat_context(
        chat_id=chat_id,
        user_input=user_input,
        limit_history=limit_history,
    )

    messages = context["messages"]
    user_message_count = context["user_message_count"]
    is_first_user_message = context["is_first_user_message"]

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

        model_message = call_lm_studio(
            messages,
            use_tools=use_tools,
            tool_choice=tool_choice,
        )

        tool_calls = getattr(model_message, "tool_calls", None)

        if DEBUG_TOOLS:
            logger.info(f"\n[{request_id}] STEP {step} - MODEL MESSAGE")
            logger.info(f"[{request_id}] content: {repr(model_message.content)}")
            logger.info(
                f"[{request_id}] tool_calls: {len(tool_calls) if tool_calls else 0}"
            )

        if not tool_calls:
            final_response = _handle_model_text_response(
                model_message=model_message,
                messages=messages,
                user_input=user_input,
                chat_id=chat_id,
                request_id=request_id,
                is_first_user_message=is_first_user_message,
                executed_tool_results=executed_tool_results,
                empty_model_retries=empty_model_retries,
                completion_gate_retries=completion_gate_retries,
                use_tools=use_tools,
            )

            if final_response["action"] == "continue_empty":
                empty_model_retries += 1
                continue

            if final_response["action"] == "continue_gate":
                completion_gate_retries += 1
                force_next_tool = True
                continue

            if final_response["action"] == "return":
                return {
                    "reply": final_response["content"],
                    "chat_id": chat_id,
                }

        assistant_payload = build_assistant_tool_payload(model_message)
        messages.append(assistant_payload)
        empty_model_retries = 0

        for tool_call in tool_calls:
            if DEBUG_TOOLS:
                logger.info(f"\n[{request_id}] TOOL CALL -> {tool_call.function.name}")
                logger.info(f"[{request_id}] tool_call_id: {tool_call.id}")
                logger.info(
                    f"[{request_id}] raw arguments: {tool_call.function.arguments}"
                )

            result = execute_tool_call(
                tool_call=tool_call,
                chat_id=chat_id,
                user_input=user_input,
                messages=messages,
            )
            executed_tool_results.append((tool_call.function.name, result))

            if DEBUG_TOOLS:
                logger.info(f"\n[{request_id}] TOOL RESULT <- {tool_call.function.name}")
                logger.info(f"[{request_id}] tool_call_id: {tool_call.id}")
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

                return {
                    "reply": final_auth_reply,
                    "chat_id": chat_id,
                }

    if executed_tool_results:
        fallback_reply = fallback_text_from_tool_results(executed_tool_results)
        add_message(chat_id, "assistant", fallback_reply)
        ensure_chat_title(chat_id, user_input, is_first_user_message, request_id)

        return {
            "reply": fallback_reply,
            "chat_id": chat_id,
        }

    raise RuntimeError("Demasiadas llamadas a herramientas seguidas (posible bucle).")


def _handle_model_text_response(
    model_message,
    messages: list[dict],
    user_input: str,
    chat_id: str,
    request_id: str,
    is_first_user_message: bool,
    executed_tool_results: list[tuple[str, dict]],
    empty_model_retries: int,
    completion_gate_retries: int,
    use_tools: bool,
) -> dict:
    """Handle an LLM response that does not contain native tool calls.

    Args:
        model_message: Message returned by the LLM.
        messages: Mutable list of messages sent to the LLM.
        user_input: Original user request.
        chat_id: Identifier of the current chat session.
        request_id: Short identifier used for logs.
        is_first_user_message: Whether this is the first user message in the chat.
        executed_tool_results: Tool results already collected in the workflow.
        empty_model_retries: Number of empty-response retries already used.
        completion_gate_retries: Number of completion-gate retries already used.
        use_tools: Whether tools are enabled for this request.

    Returns:
        dict: Control payload with:
            - action: return, continue_empty or continue_gate.
            - content: Final assistant response when action is return.
    """
    content = clean_model_output(model_message.content or "")

    legacy_tool_call = extract_legacy_tool_call(content)
    if legacy_tool_call:
        return _handle_legacy_tool_response(
            legacy_tool_call=legacy_tool_call,
            messages=messages,
            user_input=user_input,
            chat_id=chat_id,
            request_id=request_id,
            is_first_user_message=is_first_user_message,
        )

    if not content or is_garbage_text(content):
        if executed_tool_results and empty_model_retries < MAX_EMPTY_MODEL_RETRIES:
            messages.append(continue_after_empty_message(user_input))
            return {"action": "continue_empty", "content": ""}

        if executed_tool_results:
            messages.append(final_after_tools_message(user_input))
            forced_final = call_lm_studio(messages, use_tools=False)
            content = clean_model_output(forced_final.content or "")

        if not content or is_garbage_text(content):
            content = fallback_text_from_tool_results(executed_tool_results)

    if (
        executed_tool_results
        and use_tools
        and completion_gate_retries < MAX_COMPLETION_GATE_RETRIES
    ):
        complete, missing = evaluate_workflow_completion(
            user_input,
            content,
            executed_tool_results,
        )

        if not complete:
            messages.append(workflow_gate_message(user_input, missing))
            return {"action": "continue_gate", "content": ""}

    if should_store_assistant_message(content):
        add_message(chat_id, "assistant", content)
        ensure_chat_title(chat_id, user_input, is_first_user_message, request_id)

    if DEBUG_TOOLS:
        logger.info(f"\n[{request_id}] FINAL: {content}")
        logger.info(f"=== [{request_id}] CHAT END ===\n")

    return {
        "action": "return",
        "content": content,
    }


def _handle_legacy_tool_response(
    legacy_tool_call: dict,
    messages: list[dict],
    user_input: str,
    chat_id: str,
    request_id: str,
    is_first_user_message: bool,
) -> dict:
    """Handle a legacy tool call returned as plain model text.

    Args:
        legacy_tool_call: Parsed legacy tool-call dictionary.
        messages: Mutable list of messages sent to the LLM.
        user_input: Original user request.
        chat_id: Identifier of the current chat session.
        request_id: Short identifier used for logs.
        is_first_user_message: Whether this is the first user message in the chat.

    Returns:
        dict: Final assistant response wrapped in a control payload.
    """
    tool_name = legacy_tool_call["name"]
    tool_arguments = legacy_tool_call.get("arguments") or {}

    if DEBUG_TOOLS:
        logger.info(f"\n[{request_id}] LEGACY TOOL JSON DETECTED (content)")
        logger.info(f"[{request_id}] legacy tool: {tool_name}")
        logger.info(
            f"[{request_id}] legacy args: {json.dumps(tool_arguments, ensure_ascii=False)}"
        )

    legacy_tool = LegacyToolCall(tool_name, tool_arguments)

    execute_legacy_tool_call(
        tool_call=legacy_tool,
        chat_id=chat_id,
        user_input=user_input,
        messages=messages,
    )

    second_message = call_lm_studio(messages, use_tools=True, tool_choice="auto")
    final_text = clean_model_output(second_message.content or "")

    if should_store_assistant_message(final_text):
        add_message(chat_id, "assistant", final_text)
        ensure_chat_title(chat_id, user_input, is_first_user_message, request_id)

    if DEBUG_TOOLS:
        logger.info(f"\n[{request_id}] FINAL (after legacy tool exec): {final_text}")
        logger.info(f"=== [{request_id}] CHAT END ===\n")

    return {
        "action": "return",
        "content": final_text,
    }