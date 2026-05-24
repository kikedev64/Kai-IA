import json
import os
from pathlib import Path

import openai
from dotenv import load_dotenv

from cli.shell_tool import PLATFORM_HINT, SHELL_TOOL_DEFINITION, run_shell_command

# Load .env from the project root (two levels up from this file).
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

CLI_TOOLS = [SHELL_TOOL_DEFINITION]

CLI_SYSTEM_PROMPT = f"""\
Eres Kai, un asistente de terminal inteligente y directo.
Sistema operativo del host: {PLATFORM_HINT}.

Capacidades:
- Responder preguntas generales con contexto multi-turno.
- Ejecutar comandos de shell con la herramienta run_shell_command cuando necesites \
información del sistema o el usuario lo solicite.

Reglas:
- Responde en español salvo que el usuario escriba en otro idioma.
- Usa run_shell_command para listar ficheros, leer archivos, buscar patrones, \
comprobar procesos, obtener variables de entorno, etc.
- En Windows usa comandos cmd/PowerShell ('dir', 'type archivo.txt', \
'Get-ChildItem', 'where', …).
- En Linux/macOS usa bash ('ls', 'cat', 'grep', 'ps', …).
- Nunca ejecutes comandos destructivos (rm -rf, format, del /s, shutdown, …).
- Sé conciso. Usa bloques markdown con el lenguaje correcto cuando muestres código.
"""

_client: openai.OpenAI | None = None


def _build_client() -> openai.OpenAI:
    base_url = os.getenv("BASE_URL_OPEN_AI", "http://localhost:1234/v1")
    api_key = os.getenv("API_KEY_OPEN_AI", "lm-studio")
    return openai.OpenAI(base_url=base_url, api_key=api_key)


def get_client() -> openai.OpenAI:
    """Return a singleton OpenAI-compatible client for LM Studio."""
    global _client
    if _client is None:
        _client = _build_client()
    return _client


def get_cli_model() -> str:
    """Return the model name to use for CLI inference.

    Priority: CLI_MODEL_NAME env var → MODEL_NAME env var → hardcoded default.
    A 20 B - 35 B quantised model is recommended (e.g. Qwen2.5-32B-Instruct-Q4).
    """
    return (
        os.getenv("CLI_MODEL_NAME")
        or os.getenv("MODEL_NAME")
        or "openai/gpt-oss-20b"
    )


def check_service() -> bool:
    """Return True if LM Studio is reachable and has at least one model loaded."""
    try:
        models = get_client().models.list()
        return bool(models.data)
    except Exception:
        return False


def _serialize_tool_calls(tool_calls) -> list[dict]:
    return [
        {
            "id": tc.id,
            "type": tc.type,
            "function": {
                "name": tc.function.name,
                "arguments": tc.function.arguments,
            },
        }
        for tc in tool_calls
    ]


def run_cli_turn(
    messages: list[dict],
    on_tool_call=None,
    on_tool_result=None,
) -> tuple[str, list[dict]]:
    """Run one conversational turn, resolving any tool calls.

    Args:
        messages: Full conversation history (mutated in place and returned).
        on_tool_call: Optional callback(tool_name, args) called before execution.
        on_tool_result: Optional callback(result) called after execution.

    Returns:
        Tuple of (final_text_reply, updated_messages).
    """
    client = get_client()
    model = get_cli_model()
    max_steps = 6

    for _ in range(max_steps):
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=CLI_TOOLS,
            tool_choice="auto",
            temperature=0.0,
            timeout=600,
        )

        msg = response.choices[0].message

        assistant_entry: dict = {"role": "assistant", "content": msg.content}
        if msg.tool_calls:
            assistant_entry["tool_calls"] = _serialize_tool_calls(msg.tool_calls)
        messages.append(assistant_entry)

        if not msg.tool_calls:
            return msg.content or "", messages

        for tc in msg.tool_calls:
            if tc.function.name != "run_shell_command":
                continue

            args: dict = json.loads(tc.function.arguments)

            if on_tool_call:
                on_tool_call(tc.function.name, args)

            result = run_shell_command(**args)

            if on_tool_result:
                on_tool_result(result)

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, ensure_ascii=False),
                }
            )

    return "[máximo de pasos de herramienta alcanzado]", messages
