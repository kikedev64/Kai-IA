import openai
from api.schemas.chat import AskRequest
from core.config import SYSTEM_PROMPT_DEFAULT, MODEL_NAME, TEMPERATURE
from tools.tools_definition import TOOLS

client = openai.OpenAI(
    base_url="http://localhost:1234/v1",
    api_key="lm-studio"
)

def call_lm_studio(messages: list):
    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=messages,
        tools=TOOLS,
        tool_choice="auto",
        temperature=TEMPERATURE,
        timeout=60,
    )
    return response.choices[0].message

from fastapi import HTTPException
from core.config import PROMPT_MAP

def ask_without_context(req: AskRequest):
    try:
        messages = []

        if req.system_prompt:
            selected_prompt = PROMPT_MAP.get(req.system_prompt)

            if selected_prompt is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Prompt por defecto no válido: {req.system_prompt}"
                )

            messages.append({
                "role": "system",
                "content": selected_prompt
            })

        messages.append({
            "role": "user",
            "content": req.prompt
        })

        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
            temperature=0.2,
        )

        content = response.choices[0].message.content or ""

        return {
            "reply": content.strip()
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR]: {str(e)}")
        raise