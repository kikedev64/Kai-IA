import openai
from core.config import SYSTEM_PROMPT_DEFAULT, MODEL_NAME, TEMPERATURE
from tools.tools_definition import TOOLS

client = openai.OpenAI(
    base_url="http://localhost:1234/v1",
    api_key="lm-studio"
)

def call_lm_studio(user_prompt: str, history: list | None = None):
    messages = [{"role": "system", "content": SYSTEM_PROMPT_DEFAULT}]
    if history:
        messages.extend(history)

    messages.append({"role": "user", "content": user_prompt})

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=messages,
        tools=TOOLS,
        tool_choice="auto",
        temperature=TEMPERATURE,
        timeout=60
    )

    return response.choices[0].message