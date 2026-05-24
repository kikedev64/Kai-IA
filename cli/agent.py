"""Kai CLI agent entry point.

Run from the project root:
    python -m cli
    python -m cli.agent
"""

import sys
from pathlib import Path

# Ensure the project root is importable when the file is executed directly.
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from dotenv import load_dotenv

load_dotenv(_ROOT / ".env")

from rich.prompt import Confirm, Prompt  # noqa: E402 (after path setup)

from cli.llm_client import (  # noqa: E402
    CLI_SYSTEM_PROMPT,
    check_service,
    get_cli_model,
    run_cli_turn,
)
from cli.renderer import (  # noqa: E402
    console,
    print_assistant_message,
    print_banner,
    print_error,
    print_help,
    print_rule,
    print_tool_call,
    print_tool_result,
)


def _initial_messages() -> list[dict]:
    return [{"role": "system", "content": CLI_SYSTEM_PROMPT}]


def _run_turn(messages: list[dict]) -> tuple[str, list[dict]]:
    """Run one LLM turn with live tool-call display.

    The spinner is shown during each network call; tool output is printed
    between calls so the display stays clean.
    """
    client_messages = messages

    # We drive the loop here so we can interleave status spinners with
    # tool-call panels without nesting them inside a live context.
    from cli.llm_client import CLI_TOOLS, _serialize_tool_calls, get_client, get_cli_model
    import json
    from cli.shell_tool import run_shell_command

    client = get_client()
    model = get_cli_model()
    max_steps = 6

    for step in range(max_steps):
        label = "Pensando…" if step == 0 else "Procesando resultado…"
        with console.status(f"[dim]{label}[/dim]"):
            response = client.chat.completions.create(
                model=model,
                messages=client_messages,
                tools=CLI_TOOLS,
                tool_choice="auto",
                temperature=0.0,
                timeout=60,
            )

        msg = response.choices[0].message

        assistant_entry: dict = {"role": "assistant", "content": msg.content}
        if msg.tool_calls:
            assistant_entry["tool_calls"] = _serialize_tool_calls(msg.tool_calls)
        client_messages.append(assistant_entry)

        if not msg.tool_calls:
            return msg.content or "", client_messages

        for tc in msg.tool_calls:
            if tc.function.name != "run_shell_command":
                continue

            args: dict = json.loads(tc.function.arguments)

            # Show what the model wants to run and ask for confirmation.
            print_tool_call(tc.function.name, args)
            confirmed = Confirm.ask(
                "[bold yellow]¿Ejecutar este comando?[/bold yellow]",
                default=False,
            )

            if confirmed:
                result = run_shell_command(**args)
                print_tool_result(result)
                client_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )
            else:
                console.print("[dim]Comando rechazado — flujo de herramientas cancelado.[/dim]\n")
                return "Entendido, he cancelado la operación.", client_messages

    return "[máximo de pasos de herramienta alcanzado]", client_messages


def main() -> None:
    print_banner()

    with console.status("[dim]Conectando con LM Studio…[/dim]"):
        alive = check_service()

    if alive:
        console.print(
            f"[green]✓[/green] Conectado  ·  modelo: [cyan]{get_cli_model()}[/cyan]\n"
        )
    else:
        console.print(
            "[yellow]⚠[/yellow]  LM Studio no responde. "
            "Comprueba que el servidor está activo y que [cyan]BASE_URL_OPEN_AI[/cyan] "
            "en [dim].env[/dim] es correcta.\n"
        )

    messages = _initial_messages()

    while True:
        try:
            raw = Prompt.ask("[bold cyan]Tú[/bold cyan]")
        except (KeyboardInterrupt, EOFError):
            console.print("\n[dim]Hasta luego.[/dim]")
            break

        user_input = raw.strip()
        if not user_input:
            continue

        # ── Built-in slash commands ────────────────────────────────────────
        if user_input == "/exit":
            console.print("[dim]Hasta luego.[/dim]")
            break

        if user_input == "/help":
            print_help()
            continue

        if user_input == "/clear":
            messages = _initial_messages()
            console.clear()
            print_banner()
            console.print("[dim]Historial de sesión borrado.[/dim]\n")
            continue

        if user_input == "/model":
            console.print(f"[cyan]Modelo activo:[/cyan] {get_cli_model()}\n")
            continue

        # ── LLM turn ──────────────────────────────────────────────────────
        messages.append({"role": "user", "content": user_input})

        try:
            reply, messages = _run_turn(messages)
        except Exception as exc:
            print_error(str(exc))
            messages.pop()  # remove the failed user message
            continue

        print_assistant_message(reply)
        print_rule()


if __name__ == "__main__":
    main()
