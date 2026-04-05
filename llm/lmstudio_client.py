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

def call_lm_studio(messages: list):
    response = client.chat.completions.create(
        model=get_model_name(),
        messages=messages,
        tools=TOOLS,
        tool_choice="auto",
        temperature=get_temperature(),
        timeout=60,
    )
    return response.choices[0].message

def call_lm_studio_stream(messages: list) -> Iterator[str]:
    """Igual que call_lm_studio pero devuelve tokens uno a uno via generator."""
    stream = client.chat.completions.create(
        model=get_model_name(),
        messages=messages,
        tools=TOOLS,
        tool_choice="auto",
        temperature=get_temperature(),
        timeout=60,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
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
        if not models.data:
            return False
        return True
    except Exception:
        return False