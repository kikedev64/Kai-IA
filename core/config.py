from pathlib import Path

from services.config.config_loader import get_config_float, get_config_int, get_config_json, get_config_value

BASE_DIR = Path(__file__).resolve().parent.parent

GOOGLE_SCOPES = get_config_json("google_scopes", [])
GOOGLE_REDIRECT_URI = get_config_value(
    "google_redirect_uri",
    "http://localhost:8000/auth/google/callback"
)

GOOGLE_CREDENTIALS_FILE = Path(
    get_config_value(
        "google_credentials_file",
        str(BASE_DIR / "credentials.json")
    )
)

GOOGLE_TOKEN_FILE = Path(
    get_config_value(
        "google_token_file",
        str(BASE_DIR / "token.json")
    )
)

EMAIL_MAX_TOTAL_SIZE_ATTACHMENT = get_config_int(
    "email_max_total_size_attachment",
    18 * 1024 * 1024
)

SYSTEM_PROMPT_DEFAULT = get_config_value("system_prompt_default", "")

MODEL_NAME = get_config_value("model_name", "openai/gpt-oss-20b")
TEMPERATURE = get_config_float("temperature", 0.0)

class DEFAULT_PROMPTS:
    RESUME_MAIL = get_config_value(
        "default_prompts.resume_mail",
        (
            "Tu unica tarea es leer el correo y hacer un resumen completo, "
            "detallado y exhaustivo de el, indicando tambien quien lo envia. "
            "NO OLVIDES NINGUN DETALLE DE ESPACIO, LUGAR O TIEMPO."
        )
    )
    
    BASIC_USER_INFORMATION = get_config_value(
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
    
PROMPT_MAP = {
        "basic_user_information": DEFAULT_PROMPTS.BASIC_USER_INFORMATION,
}
