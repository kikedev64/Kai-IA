from markdown import markdown


def _trim(value: object, max_chars: int = 2200) -> str:
    """Return a compact string representation for email context blocks.

    Args:
        value: Source value.
        max_chars: Maximum number of characters kept.

    Returns:
        str
    """
    text = str(value or "").strip()
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "\n..."


def build_emails_context_block(data: dict) -> str:
    """Build the emails context block.

    Args:
        data: Source data processed by the function.

    Returns:
        str
    """
    emails = data.get("emails", [])
    count = data.get("count", 0)

    lines = [
        "[CORREOS]",
        f"total: {count}",
    ]

    if data.get("subject_text"):
        lines.append("tipo_busqueda: asunto")
        lines.append(f"criterio: {data['subject_text']}")

    if data.get("sender"):
        lines.append("tipo_busqueda: remitente")
        lines.append(f"criterio: {data['sender']}")

    top_senders = []
    for email in emails[:5]:
        sender = email.get("sender")
        if sender and sender not in top_senders:
            top_senders.append(sender)

    if top_senders:
        lines.append("top_remitentes: " + " | ".join(top_senders[:3]))

    if emails:
        lines.append("top_correos:")
        for i, email in enumerate(emails[:5], start=1):
            message_id = email.get("message_id") or email.get("id") or ""
            thread_id = email.get("thread_id") or ""
            sender = email.get("sender", "Sin remitente")
            subject = email.get("subject", "Sin asunto")
            date = email.get("date", "Sin fecha")
            snippet = email.get("snippet", "")
            lines.append(f"{i}. id={message_id} thread_id={thread_id}")
            lines.append(f"   fecha: {date}")
            lines.append(f"   remitente: {sender}")
            lines.append(f"   asunto: {subject}")
            if snippet:
                lines.append(f"   snippet: {_trim(snippet, 500)}")

    email = data.get("email")
    if isinstance(email, dict):
        message_id = email.get("message_id") or email.get("id") or ""
        lines.append("correo_completo:")
        lines.append(f"id: {message_id}")
        lines.append(f"thread_id: {email.get('thread_id', '')}")
        lines.append(f"fecha: {email.get('date', '')}")
        lines.append(f"remitente: {email.get('sender', '')}")
        lines.append(f"asunto: {email.get('subject', '')}")
        if email.get("snippet"):
            lines.append(f"snippet: {_trim(email.get('snippet'), 500)}")
        if email.get("body"):
            lines.append("body:")
            lines.append(_trim(email.get("body"), 6000))

    summary = data.get("summary")
    if summary:
        lines.append("resumen:")
        lines.append(_trim(summary, 4000))

    thread = data.get("thread")
    if isinstance(thread, dict):
        thread_emails = thread.get("emails", [])
        lines.append("[HILO]")
        lines.append(f"thread_id: {thread.get('thread_id', '')}")
        lines.append(
            f"mensajes: {len(thread_emails) if isinstance(thread_emails, list) else 0}"
        )

        if isinstance(thread_emails, list):
            for i, email in enumerate(thread_emails[:10], start=1):
                if not isinstance(email, dict):
                    continue
                message_id = email.get("message_id") or email.get("id") or ""
                lines.append(f"mensaje {i}:")
                lines.append(f"  id: {message_id}")
                lines.append(f"  thread_id: {email.get('thread_id', '')}")
                lines.append(f"  fecha: {email.get('date', '')}")
                lines.append(f"  remitente: {email.get('sender', '')}")
                lines.append(f"  asunto: {email.get('subject', '')}")
                if email.get("body"):
                    lines.append("  body:")
                    lines.append(_trim(email.get("body"), 5000))
                elif email.get("snippet"):
                    lines.append(f"  snippet: {_trim(email.get('snippet'), 700)}")

        lines.append("[/HILO]")

    lines.append("[/CORREOS]")
    return "\n".join(lines)


def markdown_to_html(md_text: str) -> str:
    """Convert a small markdown subset into email-safe HTML.

    Args:
        md_text: Markdown text converted to HTML.

    Returns:
        str
    """
    if not md_text:
        return ""

    html = markdown(
        md_text,
        extensions=[
            "extra",
            "sane_lists",
            "nl2br",
        ],
    )

    return html
