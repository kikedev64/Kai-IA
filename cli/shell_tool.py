import locale
import platform
import re
import subprocess
from pathlib import Path

# Commands that are never allowed regardless of context.
_BLOCKED_PATTERNS = [
    r"rm\s+-[^\s]*r",       # rm -r, rm -rf, rm -fr …
    r"\bformat\s+[a-z]:",   # format C:
    r"\brd\s+/[sq]",        # rd /s /q
    r"\brmdir\s+/[sq]",     # rmdir /s /q
    r"\bdel\s+/[sf]",       # del /s /f
    r":()\{.*\|.*\&",       # fork bomb
    r"\bmkfs\b",
    r"\bshutdown\b",
    r"\breboot\b",
    r"dd\s+if=",
    r">\s*/dev/sd[a-z]",
]

_COMPILED = [re.compile(p, re.IGNORECASE) for p in _BLOCKED_PATTERNS]

SHELL_TOOL_DEFINITION = {
    "type": "function",
    "function": {
        "name": "run_shell_command",
        "description": (
            "Ejecuta un comando de shell en el sistema local y devuelve stdout, stderr "
            "y el codigo de retorno. Ideal para listar ficheros, buscar texto, leer "
            "archivos, comprobar procesos, ver variables de entorno, etc. "
            "No usar para operaciones destructivas ni para comandos graficos sin salida."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": (
                        "Comando a ejecutar. En Windows usa sintaxis PowerShell que "
                        "imprima salida por stdout (ej: 'Get-ChildItem', "
                        "'Get-Content archivo.txt', "
                        "'Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber'). "
                        "No uses comandos que abren ventanas o no imprimen salida, como 'winver'. "
                        "En Linux/macOS usa bash (ej: 'ls -la', 'cat archivo.txt')."
                    ),
                },
                "working_dir": {
                    "type": "string",
                    "description": "Directorio de trabajo (ruta absoluta o relativa). Opcional.",
                },
                "timeout": {
                    "type": "integer",
                    "description": "Segundos maximos de espera, entre 1 y 30. Por defecto 10.",
                },
            },
            "required": ["command"],
        },
    },
}


def _is_blocked(command: str) -> bool:
    return any(p.search(command) for p in _COMPILED)


def run_shell_command(
    command: str,
    working_dir: str | None = None,
    timeout: int = 10,
) -> dict:
    """Execute a shell command and return a structured result.

    Args:
        command: Shell command string to run.
        working_dir: Optional working directory path.
        timeout: Maximum seconds to wait (clamped 1–30).

    Returns:
        dict with keys status, stdout, stderr, returncode, (message on error).
    """
    if _is_blocked(command):
        return {
            "status": "blocked",
            "message": f"Comando bloqueado por razones de seguridad: '{command}'",
            "command": command,
            "working_dir": str(Path(working_dir).resolve()) if working_dir else None,
            "stdout": "",
            "stderr": "",
            "returncode": -1,
        }

    timeout = max(1, min(int(timeout or 10), 30))
    cwd = Path(working_dir).resolve() if working_dir else None

    def _decode(raw: bytes) -> str:
        """Decode bytes trying UTF-8 first, then the system encoding."""
        if not raw:
            return ""
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            enc = locale.getpreferredencoding(False) or "utf-8"
            return raw.decode(enc, errors="replace")

    try:
        if platform.system() == "Windows":
            args = ["powershell", "-NoProfile", "-NonInteractive", "-Command", command]
            proc = subprocess.run(
                args,
                capture_output=True,
                timeout=timeout,
                cwd=cwd,
            )
        else:
            proc = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                timeout=timeout,
                cwd=cwd,
            )
        stdout = _decode(proc.stdout)[:4096]
        stderr = _decode(proc.stderr)[:1024]
        if proc.returncode == 0 and not stdout.strip() and not stderr.strip():
            return {
                "status": "error",
                "message": (
                    "El comando terminó correctamente, pero no produjo salida. "
                    "No hay datos fiables para responder. Ejecuta otro comando "
                    "que imprima la información solicitada por stdout."
                ),
                "command": command,
                "working_dir": str(cwd) if cwd else None,
                "stdout": "",
                "stderr": "",
                "returncode": proc.returncode,
            }
        return {
            "status": "success" if proc.returncode == 0 else "error",
            "command": command,
            "working_dir": str(cwd) if cwd else None,
            "stdout": stdout,
            "stderr": stderr,
            "returncode": proc.returncode,
        }
    except subprocess.TimeoutExpired:
        return {
            "status": "timeout",
            "message": f"El comando superó el límite de {timeout}s.",
            "command": command,
            "working_dir": str(cwd) if cwd else None,
            "stdout": "",
            "stderr": "",
            "returncode": -1,
        }
    except Exception as exc:
        return {
            "status": "error",
            "message": str(exc),
            "command": command,
            "working_dir": str(cwd) if cwd else None,
            "stdout": "",
            "stderr": "",
            "returncode": -1,
        }


PLATFORM_HINT = platform.system()  # "Windows" | "Linux" | "Darwin"
