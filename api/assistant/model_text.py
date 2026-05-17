"""Model text parsing and validation helpers for assistant flows."""

import json


def parse_json_object(text: str) -> dict | None:
    """Parse the first JSON object found in model text.

    Args:
        text: Model text.

    Returns:
        dict | None
    """
    if not text:
        return None

    stripped = text.strip()
    candidates = [stripped]

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidates.append(stripped[start : end + 1])

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue

        if isinstance(parsed, dict):
            return parsed

    return None


def is_legacy_tool_json(text: str) -> bool:
    """Check whether the value is legacy tool json.

    Args:
        text: Text to inspect or transform.

    Returns:
        bool
    """
    if not text:
        return False
    s = text.strip()
    try:
        obj = json.loads(s)
    except Exception:
        return False
    return isinstance(obj, dict) and "tool_call" in obj


def extract_legacy_tool_call(text: str) -> dict | None:
    """Extract the legacy tool call.

    Args:
        text: Text to inspect or transform.

    Returns:
        dict | None
    """
    if not text:
        return None
    s = text.strip()
    try:
        obj = json.loads(s)
    except Exception:
        return None
    if not (isinstance(obj, dict) and "tool_call" in obj):
        return None
    tc = obj.get("tool_call")
    if not isinstance(tc, dict):
        return None
    if "name" not in tc or "arguments" not in tc:
        return None
    return tc


def clean_model_output(text: str) -> str:
    """Clean the model output.

    Args:
        text: Text to inspect or transform.

    Returns:
        str
    """
    if not text:
        return ""

    cleaned = text

    while "<think>" in cleaned and "</think>" in cleaned:
        start = cleaned.find("<think>")
        end = cleaned.find("</think>", start)

        if end == -1:
            break

        cleaned = cleaned[:start] + cleaned[end + len("</think>") :]

    if "<think>" in cleaned:
        cleaned = cleaned.split("<think>", 1)[0]

    return cleaned.strip()


def should_store_assistant_message(text: str) -> bool:
    """Decide whether to store assistant message.

    Args:
        text: Text to inspect or transform.

    Returns:
        bool
    """
    if not text:
        return False

    stripped = text.strip()
    if not stripped:
        return False

    if stripped.startswith("<|start|>assistant<|channel|>commentary"):
        return False

    if set(stripped) == {"?"}:
        return False

    return True


def is_garbage_text(text: str) -> bool:
    """Check whether model text is unusable as a user-facing answer.

    Args:
        text: Model output text.

    Returns:
        bool
    """
    if not text:
        return False

    stripped = text.strip()
    if not stripped:
        return False

    if set(stripped) == {"?"}:
        return True

    if stripped.startswith("<|start|>assistant<|channel|>commentary"):
        return True

    return False
