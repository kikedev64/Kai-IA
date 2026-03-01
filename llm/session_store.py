from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict,List
import uuid
import time

@dataclass
class ChatSession:
    chat_id:str
    system_prompt:str
    messages: List[dict] = field(default_factory=list)
    updated_at: float = field(default_factory=lambda: time.time())


_SESSIONS: Dict[str, ChatSession] = {}

def create_session(system_prompt:str) -> ChatSession:
    chat_id = str(uuid.uuid4())
    s = ChatSession(chat_id=chat_id, system_prompt=system_prompt,messages=[])
    _SESSIONS[chat_id] = s
    return s

def get_session(chat_id: str) -> ChatSession | None:
    return _SESSIONS.get(chat_id)

def touch_session(chat_id:str) -> None:
    s = _SESSIONS.get(chat_id)
    if s:
        s.updated_at = time.time()

def delete_session(chat_id:str) -> bool:
    return _SESSIONS.pop(chat_id,None) is not None

