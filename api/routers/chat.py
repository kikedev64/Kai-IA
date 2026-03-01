from __future__ import annotations
import json
import uuid
from typing import Any
import lmstudio as lms
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from core.config import SYSTEM_PROMPT_DEFAULT

from services.chat_store import (
    ensure_session,
    add_message,
    get_messages,
    get_system_prompt,
    delete_session as delete_session_db,
)


router = APIRouter(prefix="/chat", tags=["Chat"])

MODEL_NAME = "openai/gpt-oss-20b"

_MODEL = lms.llm(MODEL_NAME)


class ChatStreamRequest(BaseModel):
    chat_id: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    system_prompt: str | None = None


class ChatResetRequest(BaseModel):
    chat_id: str = Field(..., min_length=1)


def _append_chat_message(chat: lms.Chat, role: str, content: str) -> None:
    if hasattr(chat, "append"):
        try:
            chat.append({"role": role, "content": content})
            return
        except TypeError:
            chat.append(role, content)
            return
    if role == "user" and hasattr(chat, "add_user_message"):
        chat.add_user_message(content)
        return

    raise RuntimeError("Tu versión de lmstudio.Chat no soporta append() de forma compatible.")


def _build_chat_from_session(system_prompt: str, messages: list[dict[str, Any]]) -> lms.Chat:
    chat = lms.Chat(system_prompt)
    for m in messages:
        role = m.get("role")
        content = m.get("content", "")
        if role in ("user", "assistant") and content:
            _append_chat_message(chat, role, content)
    return chat

@router.post("/start")
def start_chat():
    chat_id = str(uuid.uuid4())
    ensure_session(chat_id, SYSTEM_PROMPT_DEFAULT)
    return {"chat_id": chat_id}

@router.post("/stream")
def stream_chat(req: ChatStreamRequest):
    ensure_session(req.chat_id, SYSTEM_PROMPT_DEFAULT)
    add_message(req.chat_id, "user", req.message)
    history = get_messages(req.chat_id, limit=50)
    chat = _build_chat_from_session(SYSTEM_PROMPT_DEFAULT, history)

    def sse_events():
        assistant_acc = []
        try:
            for frag in _MODEL.respond_stream(chat, on_message=chat.append):
                if frag and getattr(frag, "content", None):
                    delta = frag.content
                    assistant_acc.append(delta)
                    yield f"data: {json.dumps({'delta': delta})}\n\n"

            final_text = "".join(assistant_acc).strip()
            if final_text:
                add_message(req.chat_id, "assistant", final_text)

            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(sse_events(), media_type="text/event-stream")

@router.post("/reset")
def reset_chat(req: ChatResetRequest):
    deleted = delete_session_db(req.chat_id)
    return {"reset": bool(deleted), "chat_id": req.chat_id}

@router.get("/history/{chat_id}")
def get_history(chat_id: str, limit: int = Query(50, ge=1, le=200)):
    return {"chat_id": chat_id, "items": get_messages(chat_id, limit=limit)}