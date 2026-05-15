import re

from api.schemas.chat import AskRequest
from llm.lmstudio_client import ask_without_context


def clean_summary_title(text: str) -> str:
    """Clean the summary title.

    Args:
        text: Text to inspect or transform.

    Returns:
        str
    """
    if not text:
        return ""

    text = re.sub(
        r"<think>.*?</think>",
        "",
        text,
        flags=re.DOTALL | re.IGNORECASE
    )

    text = re.sub(
        r"<think>.*",
        "",
        text,
        flags=re.DOTALL | re.IGNORECASE
    )

    text = text.strip().strip('"').strip("'")
    text = " ".join(text.split())

    return text[:60].strip()


def generate_chat_summary_from_text(user_text: str) -> str:
    """Generate a chat summary from text.

    Args:
        user_text: User text used as model input.

    Returns:
        str
    """
    req = AskRequest(
        prompt=user_text,
        system_prompt="chat_summary"
    )

    response = ask_without_context(req)

    raw_reply = response.get("reply") or ""
    summary = clean_summary_title(raw_reply)

    if not summary:
        return "Nuevo Chat"

    return summary