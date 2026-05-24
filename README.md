# Kai IA

<p align="center">
  <img src="assets/logo.png" alt="Kai IA logo" width="140" />
</p>

<p align="center">
  <img alt="Project status" src="https://img.shields.io/badge/status-TFG%20prototype-2563eb" />
  <img alt="Backend" src="https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white" />
  <img alt="Frontend" src="https://img.shields.io/badge/frontend-Electron%20%2B%20React-47848f?logo=electron&logoColor=white" />
  <img alt="LLM" src="https://img.shields.io/badge/LLM-LM%20Studio-111827" />
  <img alt="License" src="https://img.shields.io/badge/license-CC%20BY--NC--SA%204.0-blue" />
</p>

Kai IA is a desktop assistant built as a Final Degree Project (TFG). It combines
a FastAPI backend, an Electron/React desktop client, Google Workspace
integrations and a local LLM runtime through LM Studio.

The project is designed around a practical assistant workflow: chat with a local
model, use tools for Gmail, Calendar, Drive and Tasks, inspect execution traces
with Debug Lab, and export benchmark reports with PDF and CSV data.

## Project Status

Kai IA is an academic prototype focused on end-to-end integration and
observability. The current implementation includes:

- Desktop chat interface with persisted conversations.
- FastAPI backend with routers grouped by domain.
- Google OAuth flow for Gmail, Calendar, Drive and Tasks.
- Local LLM calls through an OpenAI-compatible LM Studio endpoint.
- Tool calling pipeline with structured debug events.
- Debug Lab for execution visualization and report generation.
- ZIP report export with PDF summary and CSV chart data.

> In this context, end-to-end integration means that the project connects the
> complete assistant workflow: desktop interface, backend orchestration, local
> LLM runtime, Google Workspace services, tool execution, persistence and debug
> reporting.

## Repository Layout

| Path | Description |
| --- | --- |
| `main.py` | FastAPI application entrypoint. |
| `api/` | API schemas and route modules. |
| `api/routers/` | FastAPI router layer by domain. |
| `core/` | Database, configuration, auth and shared models. |
| `services/` | Google Workspace and application service logic. |
| `tools/` | LLM tool definitions and execution handlers. |
| `llm/` | LM Studio client integration. |
| `cli/` | Standalone terminal agent with shell tool support. |
| `kai-ia-front/` | Electron, React and TypeScript desktop app. |
| `assets/` | Shared project images and branding assets. |

## Architecture

<p align="center">
  <img src="assets/main_architecture_trans.png" alt="Kai IA main architecture" />
</p>

The desktop app owns the user experience. The backend owns orchestration,
Google API access, tool execution, persistence and debug stream generation.

## Requirements

| Area | Requirement |
| --- | --- |
| Operating system | Windows 11 Profesional 25H2. |
| Python | Python 3.11.9 or compatible environment. |
| Node.js | Node.js v22.18.0 and npm for the Electron frontend. |
| Electron | Electron ^39.2.6. |
| LLM runtime | LM Studio 0.4.13 with an OpenAI-compatible local server. |
| Google APIs | OAuth credentials for Gmail, Calendar, Drive and Tasks. |

> These requirements describe the environment used to create and test this
> project. Kai IA may be compatible with other operating systems or software
> versions, but those combinations have not been tested.

## Quick Start

### 1. Backend

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Expected backend base URL:

```text
http://127.0.0.1:8000
```

### 2. Frontend

```powershell
cd kai-ia-front
npm install
npm run dev
```

### 3. LM Studio

Start the LM Studio local server and configure the backend to use its
OpenAI-compatible base URL and API key.

Common environment keys:

```env
BASE_URL_OPEN_AI=http://127.0.0.1:1234/v1
API_KEY_OPEN_AI=lm-studio
GOOGLE_REDIRECT_URI=http://127.0.0.1:8000/auth/google/callback
```

## Documentation

- [Backend README](api/README.md)
- [Router Reference](api/routers/README.md)
- [Frontend README](kai-ia-front/README.md)
- [CLI Agent README](cli/README.md)

## Core Capabilities

| Capability | Description |
| --- | --- |
| Chat | Conversational interface backed by a local model. |
| Gmail | Read, search, summarize and send email. |
| Calendar | List events, create meetings and check availability. |
| Drive | Search, upload, list, delete and publish files. |
| Tasks | Create, update, list and delete Google Tasks. |
| Debug Lab | Visualize backend execution stages and tool calls. |
| Reports | Export PDF and CSV data for later analysis. |
| CLI Agent | Standalone terminal agent with `run_shell_command` tool support. |

## Development Commands

| Command | Location | Purpose |
| --- | --- | --- |
| `uvicorn main:app --reload --port 8000` | repository root | Run the backend API. |
| `python -m cli` | repository root | Run the terminal CLI agent. |
| `npm run dev` | `kai-ia-front/` | Run the Electron app in development. |
| `npm run typecheck` | `kai-ia-front/` | Validate TypeScript projects. |
| `npm run build` | `kai-ia-front/` | Build the frontend output. |
| `npm run build:win` | `kai-ia-front/` | Create a Windows desktop build. |

## CLI Agent

Kai includes a standalone terminal agent that runs without the backend server.
It connects directly to LM Studio and exposes a `run_shell_command` tool so
the model can list files, read content, search patterns and inspect the local
environment on demand.

### Launch

```powershell
# From the repository root with the virtual environment active:
python -m cli
```

### Shell tool

The LLM can call `run_shell_command` autonomously to answer questions that
require local context. Commands run in an isolated `subprocess` call with a
configurable timeout (default 10 s, max 30 s). A blocklist prevents destructive
operations such as `rm -rf`, `format`, `shutdown`, and similar patterns.

### Recommended model size

A quantised model in the **20 B – 35 B** range provides the best balance of
reasoning quality and inference speed on consumer hardware. Set the model in
`.env`:

```env
CLI_MODEL_NAME=lmstudio-community/Qwen2.5-32B-Instruct-Q4_K_M
```

See [CLI Agent README](cli/README.md) for full configuration details.

## Security Notes

This repository may use local OAuth files such as `credentials.json`,
`token.json` and runtime configuration. Treat them as private secrets and avoid
committing real credentials in public repositories.

Kai IA also includes a settings toggle for direct service endpoint exposure.
When disabled, optional HTTP routes for Calendar, Drive, Tasks and operational
Gmail actions are hidden, while the chat workflow, settings, authentication and
frontend email watcher remain available.

## Copyright and License

Copyright (c) 2026 Enrique Padilla Padilla.

Licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0
International License (CC BY-NC-SA 4.0). See [LICENSE](LICENSE) for the full
license text.

The logo in `assets/logo.png` was generated with AI.
