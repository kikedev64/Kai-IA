from pathlib import Path
import json

from core.runtime_config import get_runtime_config_value

BASE_DIR = Path(__file__).resolve().parent.parent


def get_config_value(key: str, default=None):
    return get_runtime_config_value(key, default)


def get_config_int(key: str, default: int = 0) -> int:
    value = get_runtime_config_value(key, default)
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def get_config_float(key: str, default: float = 0.0) -> float:
    value = get_runtime_config_value(key, default)
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def get_config_json(key: str, default=None):
    raw = get_runtime_config_value(key, None)
    if raw is None:
        return default

    if isinstance(raw, (dict, list)):
        return raw

    try:
        return json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return default


def get_google_scopes():
    return get_config_json("google_scopes", [])


def get_google_redirect_uri():
    return get_config_value(
        "google_redirect_uri",
        "http://localhost:8000/auth/google/callback"
    )


def get_google_credentials_file() -> Path:
    return Path(
        get_config_value(
            "google_credentials_file",
            str(BASE_DIR / "credentials.json")
        )
    )


def get_google_token_file() -> Path:
    return Path(
        get_config_value(
            "google_token_file",
            str(BASE_DIR / "token.json")
        )
    )


def get_email_max_total_size_attachment() -> int:
    return get_config_int(
        "email_max_total_size_attachment",
        18 * 1024 * 1024
    )


def get_system_prompt_default() -> str:
    return get_config_value("system_prompt_default", "")


def get_model_name() -> str:
    return get_config_value("model_name", "openai/gpt-oss-20b")


def get_temperature() -> float:
    return get_config_float("temperature", 0.0)


class DEFAULT_PROMPTS:
    @staticmethod
    def resume_mail() -> str:
        return get_config_value(
            "default_prompts.resume_mail",
            (
                "Tu unica tarea es leer el correo y hacer un resumen completo, "
                "detallado y exhaustivo de el, indicando tambien quien lo envia. "
                "NO OLVIDES NINGUN DETALLE DE ESPACIO, LUGAR O TIEMPO."
            )
        )

    @staticmethod
    def basic_user_information() -> str:
        return get_config_value(
            "default_prompts.basic_user_information_json",
            (
                "Vas a recibir un texto con información personal del usuario.\n\n"
                "Tu tarea es extraer la información relevante y devolverla en formato JSON válido, "
                "estructurado para poder guardarse en una base de datos.\n\n"
                "Reglas:\n"
                "- Devuelve SOLO JSON válido (sin explicaciones, sin texto adicional).\n"
                "- Usa claves en inglés y valores en español cuando corresponda.\n"
                "- No inventes información.\n"
                "- Si un dato no aparece, no lo incluyas.\n"
                "- Usa nombres de claves claros y consistentes.\n\n"
                "Posibles campos (usa solo los que existan):\n"
                "- name\n"
                "- age\n"
                "- job\n"
                "- study\n"
                "- location\n"
                "- interests\n"
                "- goals\n\n"
                "Ejemplo:\n"
                "Input: Me llamo Marcos, tengo 24 años y estudio diseño gráfico.\n"
                "Output:\n"
                "{\"name\": \"Marcos\", \"age\": 24, \"study\": \"Diseño gráfico\"}\n"
            )
        )

    @staticmethod
    def chat_summary() -> str:
        return get_config_value(
            "default_prompts.chat_summary",
            (
                "Tu tarea es generar un título corto para un chat.\n\n"
                "Reglas obligatorias:\n"
                "- Devuelve SOLO texto plano.\n"
                "- No uses comillas.\n"
                "- No uses JSON.\n"
                "- Máximo 4 palabras.\n"
                "- Debe ser breve, claro y descriptivo.\n"
                "- En español.\n"
                "- No pongas puntuación final.\n"
                "- No pongas frases largas.\n\n"
                "Ejemplos válidos:\n"
                "Rutina gimnasio\n"
                "Correos universidad\n"
                "Ideas TFG IA\n"
                "Configuración Odoo"
            )
        )


def get_prompt_map() -> dict[str, str]:
    return {
        "basic_user_information": DEFAULT_PROMPTS.basic_user_information(),
        "resume_mail": DEFAULT_PROMPTS.resume_mail(),
        "chat_summary": DEFAULT_PROMPTS.chat_summary(),
    }