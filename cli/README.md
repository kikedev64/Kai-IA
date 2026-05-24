# Kai CLI Agent

A standalone terminal agent that connects directly to LM Studio and lets you
chat with a local LLM from the command line. It includes a `run_shell_command`
tool so the model can list files, read content, search text, inspect processes,
and more — all without leaving the terminal.

No backend server required. The agent reads `.env` from the project root and
connects to LM Studio through its OpenAI-compatible endpoint.

## Quick Start

```powershell
# From the project root, with the virtual environment active:
python -m cli
```

Or equivalently:

```powershell
python -m cli.agent
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `BASE_URL_OPEN_AI` | `http://localhost:1234/v1` | LM Studio server URL. |
| `API_KEY_OPEN_AI` | `lm-studio` | API key sent to LM Studio (any string works). |
| `CLI_MODEL_NAME` | *(falls back to `MODEL_NAME`)* | Model to use for the CLI agent specifically. |
| `MODEL_NAME` | `openai/gpt-oss-20b` | Fallback model name if `CLI_MODEL_NAME` is not set. |

To use a dedicated model for the CLI agent, add this line to `.env`:

```env
CLI_MODEL_NAME=lmstudio-community/Qwen2.5-32B-Instruct-Q4_K_M
```

> **Recommended model range:** 20 B – 35 B quantised models (Q4/Q5).
> Models larger than ~35 B may be slow or exceed VRAM on consumer hardware.
> Tested with Qwen2.5-32B-Instruct-Q4_K_M and Mistral-Small-22B-Instruct.

## Session Commands

| Command | Description |
| --- | --- |
| `/help` | Show available commands and capabilities. |
| `/clear` | Clear the current session history. |
| `/model` | Display the active LLM model name. |
| `/exit` | Exit the agent. |

`Ctrl+C` also exits cleanly.

## The `run_shell_command` Tool

The LLM can invoke this tool autonomously when the user asks something that
requires reading the local system (or when it decides it needs context).

| Parameter | Required | Description |
| --- | --- | --- |
| `command` | Yes | Shell command string. |
| `working_dir` | No | Absolute or relative working directory. Defaults to the current directory. |
| `timeout` | No | Max seconds to wait (1–30). Defaults to 10. |

**On Windows** the command runs via `cmd.exe /c`. Use cmd or PowerShell syntax:

```
dir, type archivo.txt, Get-ChildItem, where python, …
```

**On Linux / macOS** the command runs via the system shell:

```
ls -la, cat README.md, grep -r "pattern" src/, ps aux, …
```

### Safety blocklist

The following patterns are always rejected, regardless of model instruction:

- `rm -r*` / `rm -rf`
- `format <drive>:`
- `rd /s` / `rmdir /s`
- `del /s` / `del /f`
- Fork bomb pattern `:(){ :|:& };:`
- `mkfs`, `shutdown`, `reboot`
- `dd if=`, `> /dev/sdX`

Output is capped at 4 096 characters for stdout and 1 024 for stderr to keep
the LLM context manageable.

## Module Layout

| File | Purpose |
| --- | --- |
| `agent.py` | Main REPL loop — reads input, manages history, drives turns. |
| `llm_client.py` | Standalone LM Studio client, tool list, system prompt. |
| `shell_tool.py` | `run_shell_command` OpenAI tool schema + execution handler. |
| `renderer.py` | Rich-based terminal display (banner, panels, markdown). |
| `__main__.py` | Package entry point (`python -m cli`). |

## Architecture

```
User input
    │
    ▼
agent.py (_run_turn)
    │
    ├─► LM Studio (via llm_client.py)
    │       └─► response with tool_calls?
    │               │
    │               ▼
    │           shell_tool.py (run_shell_command)
    │               └─► subprocess result
    │               │
    │               ▼
    │           inject tool result into messages
    │               │
    │               └─► repeat until no tool calls
    │
    └─► renderer.py (Rich panels / Markdown)
```

Each tool call is displayed in a yellow panel with the arguments, followed by
a panel with the command output and return code. The final LLM reply is
rendered as Markdown in a green panel.
