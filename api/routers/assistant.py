from fastapi import APIRouter, HTTPException
from api.schemas.assistant import (
    StartChatRequest, StartChatResponse,
    ChatMessageRequest, ChatMessageResponse,
)
from llm.session_store import create_session, get_session, delete_session
from llm.lmstudio_client import respond_with_context

router = APIRouter(prefix="/assistant", tags=["Assistant"])


@router.post("/start", response_model=StartChatResponse)
def start_chat(req: StartChatRequest):
    s = create_session(system_prompt=req.system_prompt)
    return {"chat_id": s.chat_id}


""" @router.post("/message", response_model=ChatMessageResponse)
def send_message(req: ChatMessageRequest):
    s = get_session(req.chat_id)
    if not s:
        raise HTTPException(status_code=404, detail="chat_id not found")

    s.messages.append({"role": "user", "content": req.message})
    reply = respond_with_context(s.system_prompt, s.messages)
    s.messages.append({"role": "assistant", "content": reply})
    return {"chat_id": s.chat_id, "reply": reply} """


@router.delete("/{chat_id}")
def end_chat(chat_id: str):
    ok = delete_session(chat_id)
    if not ok:
        raise HTTPException(status_code=404, detail="chat_id not found")
    return {"deleted": True, "chat_id": chat_id}