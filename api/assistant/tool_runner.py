import json

from api.assistant.gmail_context import (
    build_gmail_context_message,
    persist_gmail_memory,
)
from api.assistant.messages import post_tool_instruction_message
from tools.tools_handler import handle_tool_call


def build_assistant_tool_payload(model_message) -> dict:
    """Build the assistant message payload that contains tool calls.

    Args:
        model_message: Message returned by the LLM.

    Returns:
        dict: Assistant payload compatible with OpenAI-style chat history.
    """
    tool_calls = getattr(model_message, "tool_calls", None) or []

    assistant_payload = {
        "role": "assistant",
        "content": model_message.content,
        "tool_calls": [],
    }

    for tool_call in tool_calls:
        assistant_payload["tool_calls"].append(
            {
                "id": tool_call.id,
                "type": "function",
                "function": {
                    "name": tool_call.function.name,
                    "arguments": tool_call.function.arguments,
                },
            }
        )

    return assistant_payload


def execute_tool_call(
    tool_call,
    chat_id: str,
    user_input: str,
    messages: list[dict],
) -> dict:
    """Execute one tool call and append its result to the message context.

    Args:
        tool_call: Tool call object returned by the model.
        chat_id: Identifier of the current chat session.
        user_input: Original user request.
        messages: Mutable list of messages sent to the LLM.

    Returns:
        dict: Result returned by the tool handler.
    """
    result = handle_tool_call(tool_call)

    persist_gmail_memory(chat_id, tool_call.function.name, result)

    messages.append(
        {
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": json.dumps(result, ensure_ascii=False),
        }
    )

    gmail_context_msg = build_gmail_context_message(tool_call.function.name, result)
    if gmail_context_msg:
        messages.append(gmail_context_msg)

    messages.append(post_tool_instruction_message(user_input))

    return result


def execute_legacy_tool_call(
    tool_call,
    chat_id: str,
    user_input: str,
    messages: list[dict],
) -> dict:
    """Execute a legacy tool call and append its result to the message context.

    Args:
        tool_call: Adapted legacy tool call object.
        chat_id: Identifier of the current chat session.
        user_input: Original user request.
        messages: Mutable list of messages sent to the LLM.

    Returns:
        dict: Result returned by the tool handler.
    """
    result = handle_tool_call(tool_call)

    persist_gmail_memory(chat_id, tool_call.function.name, result)

    messages.append({"role": "assistant", "content": None})
    messages.append(
        {
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": json.dumps(result, ensure_ascii=False),
        }
    )

    gmail_context_msg = build_gmail_context_message(tool_call.function.name, result)
    if gmail_context_msg:
        messages.append(gmail_context_msg)

    messages.append(post_tool_instruction_message(user_input))

    return result