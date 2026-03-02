from pydantic import BaseModel

class StartChatRequest(BaseModel):
    system_prompt: str | None = None

class StartChatResponse(BaseModel):
    chat_id: str

class ChatMessageRequest(BaseModel):
    chat_id: str
    message: str

class ChatMessageResponse(BaseModel):
    chat_id: str
    reply: str