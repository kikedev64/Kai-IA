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
    get_model_name,
    get_system_prompt_default,
    get_temperature,
    get_llm_context_length,
    get_tool_activation_keywords,
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
    "temperature",
    "llm_context_length",
    "tool_activation_keywords",
    "default_prompts.resume_mail",
    "default_prompts.basic_user_information_json",
    "default_prompts.chat_summary",
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
        "temperature": str(get_temperature()),
        "default_prompts.resume_mail": DEFAULT_PROMPTS.resume_mail(),
        "default_prompts.basic_user_information_json": DEFAULT_PROMPTS.basic_user_information(),
        "default_prompts.chat_summary": DEFAULT_PROMPTS.chat_summary(),
        "llm_context_length": str(get_llm_context_length()),
        "tool_activation_keywords": json.dumps(
            get_tool_activation_keywords(),
            ensure_ascii=False,
            indent=2,
        ),
    }


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

        if key == "llm_context_length":
            try:
                context_length = int(value)
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=400,
                    detail="llm_context_length debe ser entero",
                )

            if context_length < 1024:
                raise HTTPException(
                    status_code=400,
                    detail="llm_context_length debe ser al menos 1024",
                )

            if context_length > 131072:
                raise HTTPException(
                    status_code=400,
                    detail="llm_context_length es demasiado alto",
                )

            normalized[key] = str(context_length)
            continue
        if key == "llm_context_length":
            try:
                context_length = int(value)
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=400,
                    detail="llm_context_length debe ser entero",
                )

            if context_length < 1024:
                raise HTTPException(
                    status_code=400,
                    detail="llm_context_length debe ser al menos 1024",
                )

            if context_length > 131072:
                raise HTTPException(
                    status_code=400,
                    detail="llm_context_length es demasiado alto",
                )

            normalized[key] = str(context_length)
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
