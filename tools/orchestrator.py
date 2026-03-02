from fastapi import APIRouter
import openai
from core.config import MODEL_NAME
from tools.tools_definition import TOOLS

router = APIRouter(prefix="/testing",tags=["Testing"])
client = openai.OpenAI(base_url="http://localhost:1234/v1",api_key="lm-studio")

@router.post("/ask")
async def ask_agent(user_prompt:str):
    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[{"role": "user", "content": user_prompt}],
        tools=TOOLS,
        tool_choice="auto"
    )
    
    message = response.choices[0].message
    tool_calls = message.tool_calls
    
    if tool_calls:
        for tool_call in tool_calls:
            function_name = tool_call.function.name
            args = tool_call.function.arguments
            
            result = await execute_local_service(function_name, args)
            return {"status": "action_executed", "result": result}
        
    print({"status": "success", "response": message.content})
    return {"status": "success", "response": message.content}

async def execute_local_service(name, args):
    import json
    params = json.loads(args)
    
    if name == "create_calendar_event":
        return f"Evento '{params['summary']}' creado."
    
    if name == "send_gmail":
        return f"Email enviado a {params['to']}."