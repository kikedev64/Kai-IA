from typing import List, Optional
from core.models.email import Email


class EmailThread:
    """Domain model representing a Gmail conversation thread.

    Groups ordered Email objects and exposes helpers for thread
    participants and LLM-ready context rendering.
    """

    def __init__(self, thread_id: str, emails: List["Email"]) -> None:
        """Store the values needed by this object.

        Args:
            thread_id: Identifier of the email thread.
            emails: Emails contained in the thread.

        Returns:
            None
        """
        self.thread_id = thread_id
        self.emails = emails

    def last(self) -> Optional["Email"]:
        """Return the last email in the thread.

        Returns:
            Optional["Email"]
        """
        return self.emails[-1] if self.emails else None

    def participants(self) -> List[str]:
        """Return the participants found in the email thread.

        Returns:
            List[str]
        """
        parts = set()
        for m in self.emails:
            if m.sender:
                parts.add(m.sender)
            if m.to:
                parts.add(m.to)
        return sorted(parts)

    def to_llm_prompt(self, max_chars_per_email: int = 4000) -> str:
        """Render the email thread as context for the language model.

        Args:
            max_chars_per_email: Maximum body characters included for each email.

        Returns:
            str
        """
        blocks = [f"EMAIL THREAD {self.thread_id} (emails={len(self.emails)})"]
        for i, m in enumerate(self.emails, start=1):
            blocks.append(
                f"\n--- MESSAGE {i}/{len(self.emails)} ---\n{m.to_llm_prompt(max_chars=max_chars_per_email)}"
            )
        return "\n".join(blocks)
