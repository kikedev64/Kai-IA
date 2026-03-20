from api.schemas.chat import AskRequest
from core.config import DEFAULT_PROMPTS
from llm.lmstudio_client import ask_without_context


def generate_chat_summary_from_text(user_text: str) -> str:
    req = AskRequest(
        prompt=user_text,
        system_prompt=DEFAULT_PROMPTS.chat_summary
    )

    response = ask_without_context(req)
    reply = (response.get("reply") or "").strip()

    if not reply:
        return "Nuevo Chat"

    summary = " ".join(reply.split())
    summary = summary[:60].strip()

    if not summary:
        return "Nuevo Chat"

    return summary