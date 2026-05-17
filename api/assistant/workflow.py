"""Tool workflow helpers used by assistant chat flows."""

import json
import logging

from api.assistant.model_text import clean_model_output, parse_json_object
from core.config import get_tool_activation_keywords
from llm.lmstudio_client import call_lm_studio

logger = logging.getLogger("uvicorn")


def should_enable_tools(prompt: str) -> bool:
    """Decide whether to enable tools.

    Args:
        prompt: Prompt text sent to the model.

    Returns:
        bool
    """
    text = (prompt or "").lower()
    keywords = get_tool_activation_keywords() or []

    return any(keyword in text for keyword in keywords)


def resolve_tool_choice(
    use_tools: bool,
    executed_tool_results: list[tuple[str, dict]],
    force_required: bool = False,
) -> str | None:
    """Resolve the tool-choice policy for the next model call.

    Args:
        use_tools: Whether tools are enabled for this turn.
        executed_tool_results: Tool results already collected in the current turn.
        force_required: Whether the next model call must produce a tool call.

    Returns:
        str | None
    """
    if not use_tools:
        return None
    if force_required:
        return "required"
    return "auto" if executed_tool_results else "required"


def compact_tool_results_for_gate(tool_results: list[tuple[str, dict]]) -> str:
    """Build a compact execution log for workflow completion checks.

    Args:
        tool_results: Tool results collected during the assistant flow.

    Returns:
        str
    """
    lines: list[str] = []

    for index, (tool_name, result) in enumerate(tool_results, start=1):
        status = result.get("status") if isinstance(result, dict) else None
        data = result.get("data") if isinstance(result, dict) else None
        message = result.get("message") if isinstance(result, dict) else None
        detail: dict[str, object] = {}

        if isinstance(data, dict):
            for key in (
                "count",
                "sender",
                "subject_text",
                "found",
                "sent",
                "mode",
                "query",
            ):
                if key in data:
                    detail[key] = data[key]

            if "emails" in data and isinstance(data["emails"], list):
                detail["emails"] = [
                    {
                        "id": email.get("message_id") or email.get("id"),
                        "thread_id": email.get("thread_id"),
                        "sender": email.get("sender"),
                        "subject": email.get("subject"),
                    }
                    for email in data["emails"][:5]
                    if isinstance(email, dict)
                ]

            if "files" in data and isinstance(data["files"], list):
                detail["files"] = [
                    {
                        "id": file.get("id"),
                        "name": file.get("name"),
                        "downloadUrl": file.get("downloadUrl"),
                        "webViewLink": file.get("webViewLink"),
                    }
                    for file in data["files"][:5]
                    if isinstance(file, dict)
                ]

            if "email" in data and isinstance(data["email"], dict):
                email = data["email"]
                detail["email"] = {
                    "to": email.get("to"),
                    "subject": email.get("subject"),
                    "body": str(email.get("body") or "")[:2500],
                }

            if "reply" in data and isinstance(data["reply"], dict):
                reply = data["reply"]
                detail["reply"] = {
                    "to": reply.get("to"),
                    "subject": reply.get("subject"),
                    "body": str(reply.get("body") or "")[:2500],
                }

            if "replied_to" in data and isinstance(data["replied_to"], dict):
                replied_to = data["replied_to"]
                detail["replied_to"] = {
                    "message_id": replied_to.get("message_id"),
                    "thread_id": replied_to.get("thread_id"),
                    "original_sender": replied_to.get("original_sender"),
                    "original_subject": replied_to.get("original_subject"),
                }

        lines.append(
            json.dumps(
                {
                    "step": index,
                    "tool": tool_name,
                    "status": status,
                    "message": message,
                    "detail": detail,
                },
                ensure_ascii=False,
            )
        )

    return "\n".join(lines)


def evaluate_workflow_completion(
    user_input: str,
    final_text: str,
    tool_results: list[tuple[str, dict]],
) -> tuple[bool, str]:
    """Check whether a proposed final answer completes the requested workflow.

    Args:
        user_input: Original user request.
        final_text: Proposed assistant response.
        tool_results: Tool results collected during the assistant flow.

    Returns:
        tuple[bool, str]
    """
    if not tool_results:
        return True, ""

    judge_messages = [
        {
            "role": "system",
            "content": (
                "Eres un verificador de workflows. Evalua si la respuesta final "
                "cumple todas las acciones pedidas por el usuario, usando el log de tools. "
                "No propongas pasos innecesarios: solo marca incompleto si falta una accion "
                "explicitamente requerida o condicionada por informacion ya descubierta. "
                "Responde solo JSON: {\"complete\": boolean, \"missing\": string}."
            ),
        },
        {
            "role": "user",
            "content": (
                "PETICION ORIGINAL:\n"
                f"{user_input}\n\n"
                "TOOLS EJECUTADAS:\n"
                f"{compact_tool_results_for_gate(tool_results)}\n\n"
                "RESPUESTA FINAL PROPUESTA:\n"
                f"{final_text}"
            ),
        },
    ]

    try:
        judge = call_lm_studio(judge_messages, use_tools=False)
    except Exception:
        logger.exception("[WORKFLOW_GATE] Error evaluando finalizacion")
        return True, ""

    parsed = parse_json_object(clean_model_output(judge.content or ""))
    if not parsed:
        return True, ""

    complete = bool(parsed.get("complete", True))
    missing = str(parsed.get("missing") or "").strip()
    return complete, missing


def fallback_text_from_tool_results(tool_results: list[tuple[str, dict]]) -> str:
    """Build a final fallback response from executed tool results.

    Args:
        tool_results: Tool results collected during the assistant flow.

    Returns:
        str
    """
    if not tool_results:
        return "No he podido generar una respuesta valida."

    lines = ["He ejecutado herramientas, pero el modelo no devolvio una respuesta final valida."]
    lines.append("")
    lines.append("Resumen de tools ejecutadas:")

    for tool_name, result in tool_results:
        status = result.get("status") if isinstance(result, dict) else None
        data = result.get("data") if isinstance(result, dict) else None
        detail = ""

        if isinstance(data, dict):
            if "count" in data:
                detail = f" con {data.get('count')} resultado(s)"
            elif "summary" in data:
                detail = f": {data.get('summary')}"
            elif "id" in data:
                detail = f": {data.get('id')}"

        lines.append(f"- {tool_name}: {status or 'sin estado'}{detail}.")

    lines.append("")
    lines.append(
        "No devuelvo una respuesta vacia para no dejar el flujo colgado. "
        "Revisa el Debug Lab o los logs para ver el detalle completo de cada resultado."
    )

    return "\n".join(lines)
