from api.assistant.constants import GMAIL_CONTEXT_KEY
from api.assistant.messages import now_context_system_message
from api.assistant.model_text import is_legacy_tool_json
from core.config import get_system_prompt_default
from services.chat_store import (
    add_message,
    count_user_messages,
    ensure_session,
    get_chat_context,
    get_messages,
    get_system_prompt,
)


def build_chat_context(
    chat_id: str,
    user_input: str,
    limit_history: int,
) -> dict:
    """Build the initial context required by the assistant orchestrator.

    Args:
        chat_id: Identifier of the current chat session.
        user_input: Text sent by the user.
        limit_history: Maximum number of previous messages to include.

    Returns:
        dict: Context data containing:
            - messages: Prepared message list for the LLM.
            - user_message_count: Number of user messages in the chat.
            - is_first_user_message: Whether this is the first user message.
            - system_prompt: System prompt used for the chat.
    """
    system_prompt = get_system_prompt(chat_id) or get_system_prompt_default()
    ensure_session(chat_id, system_prompt)

    add_message(chat_id, "user", user_input)

    user_message_count = count_user_messages(chat_id)
    is_first_user_message = user_message_count == 1

    history = get_messages(chat_id, limit=limit_history)

    sanitized_messages: list[dict] = []
    for message in history:
        if message["role"] == "assistant" and is_legacy_tool_json(message["content"]):
            continue
        sanitized_messages.append(message)

    messages = [
        {"role": "system", "content": system_prompt},
        now_context_system_message(),
    ]

    gmail_memory_context = get_chat_context(chat_id, GMAIL_CONTEXT_KEY)
    if gmail_memory_context:
        messages.append(
            {
                "role": "system",
                "content": gmail_memory_context,
            }
        )

    messages += sanitized_messages

    return {
        "messages": messages,
        "user_message_count": user_message_count,
        "is_first_user_message": is_first_user_message,
        "system_prompt": system_prompt,
    }