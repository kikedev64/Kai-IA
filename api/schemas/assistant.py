from pydantic import BaseModel

class StartChatRequest(BaseModel):
    """Request payload used to start an assistant chat.

    Carries the optional system prompt selected for the new
    conversation session.
    """

    system_prompt: str | None = None

class StartChatResponse(BaseModel):
    """Response returned after creating an assistant chat.

    Contains the generated chat identifier used by later
    assistant requests.
    """

    chat_id: str

class ChatMessageRequest(BaseModel):
    """Request payload for sending a message to an existing chat.

    Includes the chat identifier and the user message that should
    be processed by the assistant.
    """

    chat_id: str
    message: str

class ChatMessageResponse(BaseModel):
    """Response payload returned by a chat message request.

    Carries the chat identifier and the assistant reply generated
    for the submitted message.
    """

    chat_id: str
    reply: str
