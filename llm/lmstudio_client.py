import lmstudio as lms

_MODEL = lms.llm("openai/gpt-oss-20b")

def respond_with_context(system_prompt: str, messages: list[dict]) -> str:
    chat = lms.Chat(system_prompt)

    for m in messages:
        if m["role"] == "user":
            chat.add_user_message(m["content"])

    resp = _MODEL.respond(chat)
    return resp.content