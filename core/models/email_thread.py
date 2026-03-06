from typing import List, Optional
from core.models.email import Email

class EmailThread:
    def __init__(self, thread_id: str, emails: List["Email"]):
        self.thread_id = thread_id
        self.emails = emails

    def last(self) -> Optional["Email"]:
        return self.emails[-1] if self.emails else None

    def participants(self) -> List[str]:
        parts = set()
        for m in self.emails:
            if m.sender:
                parts.add(m.sender)
            if m.to:
                parts.add(m.to)
        return sorted(parts)

    def to_llm_prompt(self, max_chars_per_email: int = 4000) -> str:
        blocks = [f"EMAIL THREAD {self.thread_id} (emails={len(self.emails)})"]
        for i, m in enumerate(self.emails, start=1):
            blocks.append(f"\n--- MESSAGE {i}/{len(self.emails)} ---\n{m.to_llm_prompt(max_chars=max_chars_per_email)}")
        return "\n".join(blocks)