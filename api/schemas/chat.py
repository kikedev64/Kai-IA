from pydantic import BaseModel, Field

class ChatStreamRequest(BaseModel):
    chat_id: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    system_prompt: str | None = None

class ChatResetRequest(BaseModel):
    chat_id: str = Field(..., min_length=1)
