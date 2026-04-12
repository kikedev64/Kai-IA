import openai
from api.schemas.chat import AskRequest
from core.config import get_model_name, get_temperature, get_prompt_map
from fastapi import HTTPException
from tools.tools_definition import TOOLS
import os
from typing import Iterator

client = openai.OpenAI(
    base_url=os.getenv("BASE_URL_OPEN_AI"),
    api_key=os.getenv("API_KEY_OPEN_AI")
)

def call_lm_studio(messages: list, use_tools: bool = True):
    kwargs = {
        "model": get_model_name(),
        "messages": messages,
        "temperature": get_temperature(),
        "timeout": 60,
    }

    if use_tools:
        kwargs["tools"] = TOOLS
        kwargs["tool_choice"] = "auto"

    response = client.chat.completions.create(**kwargs)
    return response.choices[0].message

def call_lm_studio_stream(messages: list) -> Iterator[str]:
    """
    Stream SOLO de texto final.
    No usar tools aquí hasta implementar tool-calls en streaming de verdad.
    """
    stream = client.chat.completions.create(
        model=get_model_name(),
        messages=messages,
        temperature=get_temperature(),
        timeout=60,
        stream=True,
    )

    for chunk in stream:
        if not chunk.choices:
            continue

        choice = chunk.choices[0]
        delta = choice.delta

        if delta and getattr(delta, "content", None):
            yield delta.content

def ask_without_context(req: AskRequest):
    try:
        messages = []
        if req.system_prompt:
            selected_prompt = get_prompt_map().get(req.system_prompt)
            if selected_prompt is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Prompt por defecto no válido: {req.system_prompt}"
                )
            messages.append({"role": "system", "content": selected_prompt})

        messages.append({"role": "user", "content": req.prompt})

        response = client.chat.completions.create(
            model=get_model_name(),
            messages=messages,
            temperature=0.2,
        )

        content = response.choices[0].message.content or ""
        return {"reply": content.strip()}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR]: {str(e)}")
        raise

def check_llm_service() -> bool:
    try:
        models = client.models.list()
        return bool(models.data)
    except Exception:
        return False