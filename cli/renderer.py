import json
import re

from rich import box
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.rule import Rule
from rich.syntax import Syntax

console = Console(highlight=False)

_THINKING_TAG_RE = re.compile(
    r"<(think|thinking|reasoning|reflection)>.*?</(think|thinking|reasoning|reflection)>",
    re.DOTALL | re.IGNORECASE,
)


def _strip_thinking_tags(text: str) -> str:
    cleaned = _THINKING_TAG_RE.sub("", text)
    cleaned = re.sub(
        r"<(think|thinking|reasoning|reflection)>.*$",
        "",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    return cleaned.strip()

_BANNER = """\
 ██╗  ██╗ █████╗ ██╗    ██╗  █████╗
 ██║ ██╔╝██╔══██╗██║    ██║ ██╔══██╗
 █████╔╝ ███████║██║    ██║ ███████║
 ██╔═██╗ ██╔══██║██║    ██║ ██╔══██║
 ██║  ██╗██║  ██║██║    ██║ ██║  ██║
 ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝    ╚═╝ ╚═╝  ╚═╝\
"""


def print_banner() -> None:
    """Print the Kai CLI startup banner and command hints.

    Returns:
        None
    """
    console.print()
    console.print(f"[bold blue]{_BANNER}[/bold blue]")
    console.print(
        Panel(
            "[cyan bold]Agente IA de Terminal[/cyan bold]  ·  [dim]LM Studio[/dim]\n"
            "[dim]/help  /clear  /model  /exit[/dim]",
            box=box.ROUNDED,
            border_style="blue",
            expand=False,
            padding=(0, 2),
        )
    )
    console.print()


def print_help() -> None:
    """Print the CLI session help panel listing commands and capabilities.

    Returns:
        None
    """
    console.print(
        Panel(
            "[bold]Comandos de sesión:[/bold]\n"
            "  [cyan]/help[/cyan]      Muestra esta ayuda\n"
            "  [cyan]/clear[/cyan]     Limpia el historial de la sesión\n"
            "  [cyan]/model[/cyan]     Muestra el modelo LLM activo\n"
            "  [cyan]/exit[/cyan]      Sale del agente\n\n"
            "[bold]Capacidades:[/bold]\n"
            "  · Conversación general con contexto multi-turno\n"
            "  · [yellow]run_shell_command[/yellow] — ejecuta comandos de shell\n"
            "    (listar ficheros, leer archivos, buscar texto, etc.)\n\n"
            "[dim]Modelos recomendados: 20 B – 35 B (Qwen2.5-32B, Mistral-22B…)[/dim]",
            title="[bold blue]Ayuda · Kai CLI[/bold blue]",
            box=box.ROUNDED,
            border_style="blue",
            padding=(0, 2),
        )
    )
    console.print()


def print_assistant_message(content: str) -> None:
    """Print the assistant's reply as a Markdown panel.

    Args:
        content: Raw assistant message text, possibly containing thinking tags.

    Returns:
        None
    """
    content = _strip_thinking_tags(content)
    console.print()
    console.print(
        Panel(
            Markdown(content),
            title="[bold green]Kai[/bold green]",
            border_style="green",
            box=box.ROUNDED,
            padding=(0, 2),
        )
    )
    console.print()


def print_tool_call(tool_name: str, args: dict) -> None:
    """Print a panel showing the tool name and its call arguments as JSON.

    Args:
        tool_name: Name of the tool being invoked.
        args: Arguments passed to the tool call.

    Returns:
        None
    """
    body = json.dumps(args, indent=2, ensure_ascii=False)
    console.print(
        Panel(
            Syntax(body, "json", theme="monokai", word_wrap=True),
            title=f"[bold yellow]⚙  {tool_name}[/bold yellow]",
            border_style="yellow",
            box=box.SIMPLE_HEAD,
            padding=(0, 1),
        )
    )


def print_tool_result(result: dict) -> None:
    """Print a panel summarising a tool execution result.

    Args:
        result: Tool result containing stdout, stderr, message and returncode.

    Returns:
        None
    """
    stdout = result.get("stdout", "").strip()
    stderr = result.get("stderr", "").strip()
    message = result.get("message", "")
    rc = result.get("returncode", 0)

    lines: list[str] = []
    if stdout:
        lines.append(stdout[:2000] + ("…" if len(stdout) > 2000 else ""))
    if stderr:
        lines.append(f"[dim]stderr:[/dim] {stderr[:500]}")
    if message:
        lines.append(f"[dim]{message}[/dim]")
    if not lines:
        lines.append("[dim](sin salida)[/dim]")

    status_color = "green" if rc == 0 else "red"
    console.print(
        Panel(
            "\n".join(lines),
            title=f"[{status_color}]Resultado  rc={rc}[/{status_color}]",
            border_style="dim",
            box=box.SIMPLE_HEAD,
            padding=(0, 1),
        )
    )


def print_error(message: str) -> None:
    """Print an error message in red.

    Args:
        message: Error text to display.

    Returns:
        None
    """
    console.print(f"\n[bold red]Error:[/bold red] {message}\n")


def print_rule() -> None:
    """Print a horizontal divider rule.

    Returns:
        None
    """
    console.print(Rule(style="dim"))
