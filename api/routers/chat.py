import json
from fastapi import APIRouter, HTTPException
from datetime import datetime
from core.config import SYSTEM_PROMPT_DEFAULT
from llm.lmstudio_client import call_lm_studio
from tools.tools_handler import handle_tool_call
import uuid
router = APIRouter(prefix="/assistant", tags=["Assistant"])

MAX_TOOL_STEPS = 6  # suficiente para: listar -> filtrar -> get -> delete -> confirmar

DEBUG_TOOLS = True

@router.post("/chat")
def chat_endpoint(user_input: str):
    request_id = str(uuid.uuid4())[:8]
    start_ts = datetime.now().isoformat(timespec="seconds")

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT_DEFAULT},
        {"role": "user", "content": user_input},
    ]

    if DEBUG_TOOLS:
        print(f"\n=== [{request_id}] CHAT START {start_ts} ===")
        print(f"[{request_id}] USER: {user_input}")

    for step in range(MAX_TOOL_STEPS):
        msg = call_lm_studio(messages)
        tool_calls = getattr(msg, "tool_calls", None)

        if DEBUG_TOOLS:
            print(f"\n[{request_id}] STEP {step} - MODEL MESSAGE")
            print(f"[{request_id}] content: {repr(msg.content)}")
            if tool_calls:
                print(f"[{request_id}] tool_calls: {len(tool_calls)}")
            else:
                print(f"[{request_id}] tool_calls: 0")

        if not tool_calls:
            final = (msg.content or "").strip()
            if DEBUG_TOOLS:
                print(f"\n[{request_id}] FINAL: {final}")
                print(f"=== [{request_id}] CHAT END ===\n")
            return {"reply": final}

        assistant_payload = {"role": "assistant", "content": msg.content, "tool_calls": []}
        for tc in tool_calls:
            assistant_payload["tool_calls"].append({
                "id": tc.id,
                "type": "function",
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                },
            })

            if DEBUG_TOOLS:
                print(f"\n[{request_id}] TOOL CALL -> {tc.function.name}")
                print(f"[{request_id}] tool_call_id: {tc.id}")
                print(f"[{request_id}] raw arguments: {tc.function.arguments}")
                try:
                    parsed_args = json.loads(tc.function.arguments or "{}")
                except Exception:
                    parsed_args = {"__parse_error__": True}
                print(f"[{request_id}] parsed arguments: {json.dumps(parsed_args, ensure_ascii=False, indent=2)}")

        messages.append(assistant_payload)

        for tc in tool_calls:
            result = handle_tool_call(tc)

            if DEBUG_TOOLS:
                print(f"\n[{request_id}] TOOL RESULT <- {tc.function.name}")
                print(f"[{request_id}] tool_call_id: {tc.id}")
                print(f"[{request_id}] result: {json.dumps(result, ensure_ascii=False, indent=2)}")

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, ensure_ascii=False),
            })

    raise HTTPException(status_code=500, detail="Demasiadas llamadas a herramientas seguidas (posible bucle).")