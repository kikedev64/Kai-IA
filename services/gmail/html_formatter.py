import re
import html
from html.parser import HTMLParser

class _HTMLTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self._skip = False
        self._skip_tags = {"script", "style", "head", "title", "meta", "link"}

    def handle_starttag(self, tag, attrs):
        if tag.lower() in self._skip_tags:
            self._skip = True
        if not self._skip and tag.lower() in {"br", "p", "div", "li", "tr", "table"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag.lower() in self._skip_tags:
            self._skip = False

        if not self._skip and tag.lower() in {"p", "div", "li", "tr"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self._skip and data.strip():
            self.parts.append(data)

    def get_text(self) -> str:
        return "".join(self.parts)


def clean_email_body(raw_body: str) -> str:
    """
    Limpia un cuerpo de email HTML/plain text y deja solo texto útil.
    Elimina HTML, disclaimers y caracteres unicode invisibles típicos de correos.
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
        "\u2007",  # figure space
        "\u2009",  # thin space
        "\u200a",  # hair space
        "\u200b",  # zero width space
        "\u200c",  # zero width non-joiner
        "\u200d",  # zero width joiner
        "\u2060",  # word joiner
        "\ufeff",  # zero width no-break space
        "\u00ad",  # soft hyphen,
        "\xa0"
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