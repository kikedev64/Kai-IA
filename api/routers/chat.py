from __future__ import annotations

import json
from typing import Dict

import lmstudio as lms
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/chat", tags=["Chat"])

MODEL_NAME = "openai/gpt-oss-20b"
SYSTEM_PROMPT_DEFAULT = "Eres Kai IA, un asistente útil y directo."

_MODEL = lms.llm(MODEL_NAME)

_CHATS: Dict[str, lms.Chat] = {}


class ChatStreamRequest(BaseModel):
    chat_id: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    system_prompt: str | None = None


class ChatResetRequest(BaseModel):
    chat_id: str = Field(..., min_length=1)


def _get_or_create_chat(chat_id: str, system_prompt: str) -> lms.Chat:
    chat = _CHATS.get(chat_id)
    if chat is None:
        chat = lms.Chat(system_prompt)
        _CHATS[chat_id] = chat
    return chat


@router.post("/stream")
def stream_chat(req: ChatStreamRequest):
    system_prompt = req.system_prompt or SYSTEM_PROMPT_DEFAULT
    chat = _get_or_create_chat(req.chat_id, system_prompt)

    chat.add_user_message(req.message)

    def sse_events():
        try:
            for frag in _MODEL.respond_stream(chat, on_message=chat.append):
                if frag and frag.content:
                    yield f"data: {json.dumps({'delta': frag.content})}\n\n"

            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(sse_events(), media_type="text/event-stream")


@router.post("/reset")
def reset_chat(req: ChatResetRequest):
    if req.chat_id in _CHATS:
        del _CHATS[req.chat_id]
    return {"reset": True, "chat_id": req.chat_id}