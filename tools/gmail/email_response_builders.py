from markdown import markdown


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
            subject = email.get("subject", "Sin asunto")
            date = email.get("date", "Sin fecha")
            lines.append(f"{i}. {date} — {subject}")

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
