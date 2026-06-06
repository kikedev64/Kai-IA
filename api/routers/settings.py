import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.config import (
    DEFAULT_PROMPTS,
    get_email_max_total_size_attachment,
    get_google_credentials_file,
    get_google_redirect_uri,
    get_google_scopes,
    get_google_token_file,
    get_lmstudio_timeout,
    get_model_name,
    get_expose_service_endpoints,
    get_shell_command_timeout,
    get_system_prompt_default,
    get_temperature,
    get_tool_approval_timeout,
)
from core.runtime_config import set_runtime_config_values

router = APIRouter(prefix="/settings", tags=["Settings"])

ALLOWED_KEYS = {
    "google_redirect_uri",
    "google_scopes",
    "google_credentials_file",
    "google_token_file",
    "email_max_total_size_attachment",
    "system_prompt_default",
    "model_name",
    "expose_service_endpoints",
    "temperature",
    "default_prompts.resume_mail",
    "default_prompts.basic_user_information_json",
    "default_prompts.chat_summary",
    "lmstudio_timeout",
    "tool_approval_timeout",
    "shell_command_timeout",
}


class SettingsUpdatePayload(BaseModel):
    """Request payload used to update runtime settings.

    The values dictionary contains the allowed configuration keys
    submitted from the settings screen.
    """

    values: dict[str, Any]


def _build_settings_response() -> dict[str, str]:
    """Build the settings response.

    Returns:
        dict[str, str]
    """
    return {
        "google_redirect_uri": get_google_redirect_uri() or "",
        "google_scopes": json.dumps(get_google_scopes(), ensure_ascii=False, indent=2),
        "google_credentials_file": str(get_google_credentials_file()),
        "google_token_file": str(get_google_token_file()),
        "email_max_total_size_attachment": str(get_email_max_total_size_attachment()),
        "system_prompt_default": get_system_prompt_default(),
        "model_name": get_model_name(),
        "expose_service_endpoints": "true"
        if get_expose_service_endpoints()
        else "false",
        "temperature": str(get_temperature()),
        "default_prompts.resume_mail": DEFAULT_PROMPTS.resume_mail(),
        "default_prompts.basic_user_information_json": DEFAULT_PROMPTS.basic_user_information(),
        "default_prompts.chat_summary": DEFAULT_PROMPTS.chat_summary(),
        "lmstudio_timeout": str(get_lmstudio_timeout()),
        "tool_approval_timeout": str(get_tool_approval_timeout()),
        "shell_command_timeout": str(get_shell_command_timeout()),
    }


def _normalize_bool(value: Any) -> str:
    """Normalize a setting value into a lowercase boolean string.

    Args:
        value: Raw value submitted by the settings screen.

    Returns:
        str
    """
    if isinstance(value, bool):
        return "true" if value else "false"

    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "on", "enabled"}:
        return "true"
    if normalized in {"0", "false", "no", "off", "disabled"}:
        return "false"

    raise HTTPException(
        status_code=400,
        detail="expose_service_endpoints debe ser booleano",
    )


def _normalize_and_validate(values: dict[str, Any]) -> dict[str, str]:
    """Normalize and validate settings values.

    Args:
        values: Values to read, validate, or transform.

    Returns:
        dict[str, str]
    """
    unknown_keys = sorted(set(values.keys()) - ALLOWED_KEYS)
    if unknown_keys:
        raise HTTPException(
            status_code=400,
            detail=f"Claves de configuración no permitidas: {', '.join(unknown_keys)}",
        )

    normalized: dict[str, str] = {}

    for key, value in values.items():
        if key == "google_scopes":
            parsed = value
            if isinstance(value, str):
                try:
                    parsed = json.loads(value)
                except json.JSONDecodeError:
                    raise HTTPException(
                        status_code=400,
                        detail="google_scopes debe ser un JSON válido",
                    )

            if not isinstance(parsed, list):
                raise HTTPException(
                    status_code=400,
                    detail="google_scopes debe ser una lista JSON",
                )

            normalized[key] = json.dumps(parsed, ensure_ascii=False)
            continue

        if key == "temperature":
            try:
                float(value)
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=400,
                    detail="temperature debe ser numérico",
                )
            normalized[key] = str(value)
            continue

        if key == "expose_service_endpoints":
            normalized[key] = _normalize_bool(value)
            continue

        if key == "email_max_total_size_attachment":
            try:
                int(value)
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=400,
                    detail="email_max_total_size_attachment debe ser entero",
                )
            normalized[key] = str(value)
            continue

        if key == "lmstudio_timeout":
            try:
                v = int(value)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="lmstudio_timeout debe ser entero")
            if v < 30 or v > 3600:
                raise HTTPException(
                    status_code=400, detail="lmstudio_timeout debe estar entre 30 y 3600"
                )
            normalized[key] = str(v)
            continue

        if key == "tool_approval_timeout":
            try:
                v = int(value)
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=400, detail="tool_approval_timeout debe ser entero"
                )
            if v < 10 or v > 600:
                raise HTTPException(
                    status_code=400, detail="tool_approval_timeout debe estar entre 10 y 600"
                )
            normalized[key] = str(v)
            continue

        if key == "shell_command_timeout":
            try:
                v = int(value)
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=400, detail="shell_command_timeout debe ser entero"
                )
            if v < 1 or v > 300:
                raise HTTPException(
                    status_code=400, detail="shell_command_timeout debe estar entre 1 y 300"
                )
            normalized[key] = str(v)
            continue

        normalized[key] = "" if value is None else str(value)

    return normalized


@router.get("")
def get_settings() -> dict[str, dict[str, str]]:
    """Return the settings.

    Returns:
        dict
    """
    return {"settings": _build_settings_response()}


@router.put("")
def update_settings(payload: SettingsUpdatePayload) -> dict[str, dict[str, str]]:
    """Update the settings.

    Args:
        payload: Payload received by the function.

    Returns:
        dict
    """
    normalized = _normalize_and_validate(payload.values)
    set_runtime_config_values(normalized)
    return {"settings": _build_settings_response()}
