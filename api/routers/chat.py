from __future__ import annotations

import json
from typing import Any

import lmstudio as lms
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from llm.session_store import get_or_create_session, delete_session

router = APIRouter(prefix="/chat", tags=["Chat"])

MODEL_NAME = "openai/gpt-oss-20b"

SYSTEM_PROMPT_DEFAULT = """
Eres Kai IA, una secretaria personal amable, eficiente y profesional.
Habla siempre de forma clara, cercana y educada. Sé directa y evita explicaciones innecesarias.
Recuerda el contexto de la conversación y mantén continuidad entre mensajes.
Tu función es ayudar al usuario en tareas diarias como gestión de correos, calendario, recordatorios, archivos y organización personal.
Cuando una acción pueda resolverse mediante herramientas del sistema, debes usarlas en lugar de responder de forma teórica.
Nunca menciones que eres una inteligencia artificial ni hables sobre tu funcionamiento interno.
""".strip()

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
            chat.append(role, content)  # type: ignore[misc]
            return

    # fallback muy básico
    if role == "user" and hasattr(chat, "add_user_message"):
        chat.add_user_message(content)  # type: ignore[attr-defined]
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


@router.post("/stream")
def stream_chat(req: ChatStreamRequest):
    system_prompt = req.system_prompt or SYSTEM_PROMPT_DEFAULT
    session = get_or_create_session(chat_id=req.chat_id, system_prompt=system_prompt)
    session.messages.append({"role": "user", "content": req.message})
    chat = _build_chat_from_session(session.system_prompt, session.messages)

    def sse_events():
        assistant_acc = []
        try:
            # OJO: on_message=chat.append actualiza el chat interno del SDK,
            # pero nosotros persistimos el texto final en session.messages.
            for frag in _MODEL.respond_stream(chat, on_message=chat.append):
                if frag and getattr(frag, "content", None):
                    delta = frag.content
                    assistant_acc.append(delta)
                    yield f"data: {json.dumps({'delta': delta})}\n\n"

            final_text = "".join(assistant_acc).strip()
            if final_text:
                session.messages.append({"role": "assistant", "content": final_text})

            yield "data: [DONE]\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(sse_events(), media_type="text/event-stream")


@router.post("/reset")
def reset_chat(req: ChatResetRequest):
    deleted = delete_session(req.chat_id)
    return {"reset": bool(deleted), "chat_id": req.chat_id}