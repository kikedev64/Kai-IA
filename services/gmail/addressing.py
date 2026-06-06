from __future__ import annotations

import json
import re
from email.utils import formataddr, getaddresses
from typing import Any


EMAIL_RE = re.compile(r"^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$")


def _flatten_recipients(value: Any) -> list[str]:
    """Flatten common recipient payload shapes into strings.

    Args:
        value: Recipient value from a request, tool call or stored message.

    Returns:
        list[str]
    """
    if value is None:
        return []

    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []

        if text.startswith("[") and text.endswith("]"):
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                parsed = None

            if parsed is not None:
                return _flatten_recipients(parsed)

        return [text]

    if isinstance(value, dict):
        for key in ("email", "address", "mail", "value"):
            if value.get(key):
                return _flatten_recipients(value.get(key))
        return []

    if isinstance(value, (list, tuple, set)):
        recipients: list[str] = []
        for item in value:
            recipients.extend(_flatten_recipients(item))
        return recipients

    return [str(value).strip()]


def normalize_email_addresses(
    value: Any,
    field_name: str,
    required: bool = True,
) -> list[str]:
    """Normalize and validate email recipients for RFC 5322 headers.

    Args:
        value: Recipient value from a request, tool call or stored message.
        field_name: Human-readable field name used in validation errors.
        required: Whether at least one address is required.

    Returns:
        list[str]
    """
    raw_values = _flatten_recipients(value)
    parsed = getaddresses(raw.replace(";", ",") for raw in raw_values)
    normalized: list[str] = []

    for display_name, address in parsed:
        clean_address = (address or "").strip()
        if not clean_address:
            continue

        if not EMAIL_RE.match(clean_address):
            raise ValueError(
                f"El destinatario de '{field_name}' no es un email valido: {clean_address}"
            )

        normalized_address = formataddr((display_name.strip(), clean_address))
        if normalized_address not in normalized:
            normalized.append(normalized_address)

    if required and not normalized:
        raise ValueError(f"Falta un destinatario valido en '{field_name}'")

    return normalized


def format_address_header(
    value: Any,
    field_name: str,
    required: bool = True,
) -> str:
    """Build a comma-separated address header value.

    Args:
        value: Recipient value from a request, tool call or stored message.
        field_name: Human-readable field name used in validation errors.
        required: Whether at least one address is required.

    Returns:
        str
    """
    return ", ".join(
        normalize_email_addresses(
            value,
            field_name=field_name,
            required=required,
        )
    )
