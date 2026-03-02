import openai
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