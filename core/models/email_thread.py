from typing import List, Optional
from core.models.email import Email

class EmailThread:
    def __init__(self, thread_id: str, messages: List["Email"]):
        self.thread_id = thread_id
        self.messages = messages

    def last(self) -> Optional["Email"]:
        return self.messages[-1] if self.messages else None

    def participants(self) -> List[str]:
        parts = set()
        for m in self.messages:
            if m.sender:
                parts.add(m.sender)
            if m.to:
                parts.add(m.to)
        return sorted(parts)

    def to_llm_prompt(self, max_chars_per_email: int = 4000) -> str:
        blocks = [f"EMAIL THREAD {self.thread_id} (messages={len(self.messages)})"]
        for i, m in enumerate(self.messages, start=1):
            blocks.append(f"\n--- MESSAGE {i}/{len(self.messages)} ---\n{m.to_llm_prompt(max_chars=max_chars_per_email)}")
        return "\n".join(blocks)