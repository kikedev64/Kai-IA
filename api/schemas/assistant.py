from pydantic import BaseModel
from typing import Optional

class StartChatRequest(BaseModel):
    system_prompt: str = "You are a helpful assistant."

class StartChatResponse(BaseModel):
    chat_id: str

class ChatMessageRequest(BaseModel):
    chat_id: str
    message: str

class ChatMessageResponse(BaseModel):
    chat_id: str
    reply: str