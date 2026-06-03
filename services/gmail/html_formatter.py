import re
import html
from html.parser import HTMLParser


class _HTMLTextExtractor(HTMLParser):
    """HTML parser that extracts readable text from email bodies.

    Skips non-content tags and keeps simple block boundaries so HTML
    email content can be shown as plain text.
    """

    def __init__(self) -> None:
        """Store the values needed by this object.

        Returns:
            None
        """
        super().__init__()
        self.parts = []
        self._skip = False
        self._skip_tags = {"script", "style", "head", "title", "meta", "link"}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        """Handle an opening HTML tag while extracting text.

        Args:
            tag: HTML tag name handled by the parser.
            attrs: HTML attributes attached to the tag.

        Returns:
            object
        """
        if tag.lower() in self._skip_tags:
            self._skip = True
        if not self._skip and tag.lower() in {"br", "p", "div", "li", "tr", "table"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        """Handle a closing HTML tag while extracting text.

        Args:
            tag: HTML tag name handled by the parser.

        Returns:
            object
        """
        if tag.lower() in self._skip_tags:
            self._skip = False

        if not self._skip and tag.lower() in {"p", "div", "li", "tr"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        """Handle a text node while extracting text.

        Args:
            data: Source data processed by the function.

        Returns:
            object
        """
        if not self._skip and data.strip():
            self.parts.append(data)

    def get_text(self) -> str:
        """Return the accumulated text collected by the HTML parser.

        Returns:
            str
        """
        return "".join(self.parts)


def clean_email_body(raw_body: str) -> str:
    """Convert an email body into readable plain text.

    Args:
        raw_body: Raw email body before text cleanup.

    Returns:
        str
    """
    if not raw_body:
        return ""

    text = raw_body.strip()

    text = html.unescape(text)

    if "<" in text and ">" in text:
        parser = _HTMLTextExtractor()
        parser.feed(text)
        text = parser.get_text()

    invisible_chars = [
        "\u2007",
        "\u2009",
        "\u200a",
        "\u200b",
        "\u200c",
        "\u200d",
        "\u2060",
        "\ufeff",
        "\u00ad",
        "\xa0",
    ]

    for ch in invisible_chars:
        text = text.replace(ch, "")

    text = re.sub(r"[\u2000-\u200F\u202A-\u202F\u2060\uFEFF]", "", text)

    patterns_to_remove = [
        r"(?is)Este mensaje y sus archivos adjuntos.*",
        r"(?is)This message and any attachments.*",
        r"(?is)Aviso legal.*",
        r"(?is)Confidentiality notice.*",
        r"(?is)Powered by .*",
        r"(?is)View this email in your browser.*",
        r"(?is)Ver este correo en tu navegador.*",
    ]

    for pattern in patterns_to_remove:
        text = re.sub(pattern, "", text)

    text = re.sub(r"\r\n", "\n", text)
    text = re.sub(r"\r", "\n", text)

    text = re.sub(r"[ \t]+", " ", text)

    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)

    lines = [line.strip() for line in text.split("\n")]
    lines = [line for line in lines if line]
    text = "\n".join(lines)

    return text.strip()
