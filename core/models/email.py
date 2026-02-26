class Email:

    def __init__(
        self,
        id: str,
        thread_id: str,
        sender: str,
        to: str,
        subject: str,
        date: str,
        snippet: str,
        body_text: str = None,
        body_html: str = None,
    ):
        self.id = id
        self.thread_id = thread_id
        self.sender = sender
        self.to = to
        self.subject = subject
        self.date = date
        self.snippet = snippet
        self.body_text = body_text
        self.body_html = body_html

    def short_summary(self):
        return f"{self.sender} | {self.subject} | {self.date}"
    
    def to_llm_prompt(self, max_chars: int = 8000) -> str:
        """
        Devuelve el correo formateado para pasarlo a un LLM.
        Prioriza texto plano, luego snippet.
        Recorta para evitar contextos gigantes.
        """

        body = self.body_text or self.snippet or ""

        if len(body) > max_chars:
            body = body[:max_chars] + "\n...[TRUNCATED]..."

        return (
            f"EMAIL\n"
            f"From: {self.sender}\n"
            f"To: {self.to}\n"
            f"Subject: {self.subject}\n"
            f"Date: {self.date}\n\n"
            f"Body:\n{body}"
        )