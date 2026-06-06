"""Chat title helpers used by assistant flows."""

import logging
import re

from api.assistant.constants import DEBUG_TOOLS
from api.assistant.model_text import clean_model_output
from services.chat_store import get_chat_title, update_chat_title
from services.chat_summary_service import generate_chat_summary_from_text

logger = logging.getLogger("uvicorn")


def _strip_code_blocks(text: str) -> str:
    """Remove fenced code blocks (including mermaid) from text before title generation.

    Args:
        text: Raw message content that may contain fenced code blocks.

    Returns:
        str
    """
    cleaned = re.sub(r"```[\s\S]*?```", "", text, flags=re.IGNORECASE)
    return " ".join(cleaned.split())


def fallback_title_from_user_input(user_input: str) -> str:
    """Create a short chat title from the first user message.

    Args:
        user_input: User message sent to the assistant.

    Returns:
        str
    """
    text = _strip_code_blocks(user_input)
    if not text:
        return "Nuevo chat"

    words = text.split()
    title = " ".join(words[:4]).strip()

    if len(title) > 60:
        title = title[:60].strip()

    return title or "Nuevo chat"


def ensure_chat_title(
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
            generate_chat_summary_from_text(_strip_code_blocks(user_input)) or ""
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
        generated_title = fallback_title_from_user_input(user_input)
        if DEBUG_TOOLS:
            logger.info(f"[{request_id}] Usando título fallback: {generated_title}")

    update_chat_title(chat_id, generated_title)

    saved_title = get_chat_title(chat_id)
    if DEBUG_TOOLS:
        logger.info(f"[{request_id}] Título guardado en BD: {saved_title}")
