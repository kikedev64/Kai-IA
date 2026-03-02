import json
from fastapi import APIRouter
from llm.lmstudio_client import client, call_lm_studio
from core.config import SYSTEM_PROMPT_DEFAULT, MODEL_NAME, TEMPERATURE
from tools.tools_definition import TOOLS
from tools.tools_handler import handle_tool_call

router = APIRouter(prefix="/assistant", tags=["Assistant"])

@router.post("/chat")
def chat_endpoint(user_input: str):
    first_msg = call_lm_studio(user_input)
    tool_calls = getattr(first_msg, "tool_calls", None)

    if tool_calls:
        tool_call = tool_calls[0]
        tool_result = handle_tool_call(tool_call)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT_DEFAULT},
            {"role": "user", "content": user_input},

            {
                "role": "assistant",
                "content": first_msg.content,
                "tool_calls": [
                    {
                        "id": tool_call.id,
                        "type": "function",
                        "function": {
                            "name": tool_call.function.name,
                            "arguments": tool_call.function.arguments,
                        }
                    }
                ],
            },
            {
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(tool_result),
            }
        ]

        response2 = client.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
            temperature=TEMPERATURE,
            timeout=60
        )

        final_text = response2.choices[0].message.content or ""
        return {"reply": final_text}

    return {"reply": (first_msg.content or "").strip()}