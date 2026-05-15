from pydantic import BaseModel, Field

class ChatStreamRequest(BaseModel):
    """Request payload used by the streaming chat endpoint.

    Contains the chat id, the user message and an optional system
    prompt override for the active conversation.
    """

    chat_id: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    system_prompt: str | None = None

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
