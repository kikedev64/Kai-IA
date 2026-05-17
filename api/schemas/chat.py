from pydantic import BaseModel, Field


class ChatStreamRequest(BaseModel):
    """Request payload used by the streaming assistant endpoint.

    Includes the active chat id, prompt, history window and optional
    debug flags used by the Debug Lab view.
    """

    chat_id: str = Field(..., min_length=1)
    prompt: str = Field(..., min_length=1)
    limit_history: int = Field(default=6, ge=1, le=20)
    profile_context: str | None = None
    debug: bool = False


class ChatResetRequest(BaseModel):
    """Request payload used to reset a chat session.

    Carries the chat identifier that should be cleared or
    reinitialised by the backend.
    """

    chat_id: str = Field(..., min_length=1)


class AskRequest(BaseModel):
    """Request payload for a one-off LLM prompt.

    Used when the caller needs a direct model response without
    loading the full chat history.
    """

    prompt: str
    system_prompt: str | None = None


class ChatStream(BaseModel):
    """Lightweight chat stream payload.

    Groups the chat identifier and prompt text used by streaming
    assistant flows.
    """

    chat_id: str
    prompt: str
