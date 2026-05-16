# Kai IA Backend

<p align="center">
  <img src="../assets/logo.png" alt="Kai IA logo" width="120" />
</p>

<p align="center">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-API-009688?logo=fastapi&logoColor=white" />
  <img alt="Python" src="https://img.shields.io/badge/Python-3.11-3776ab?logo=python&logoColor=white" />
  <img alt="Google APIs" src="https://img.shields.io/badge/Google%20Workspace-integrated-4285f4?logo=google&logoColor=white" />
  <img alt="LLM" src="https://img.shields.io/badge/LLM-LM%20Studio-111827" />
</p>

The backend is the orchestration layer for Kai IA. It exposes the FastAPI
application, manages Google OAuth and service calls, stores chat data, executes
tools, streams assistant responses and emits Debug Lab events for observability.

> The project logo was generated with AI and is referenced from
> `../assets/logo.png`.

## Preview

| API Docs | Debug Stream | Tool Reports |
| --- | --- | --- |
| ![API docs](../assets/screenshots/api-docs.png) | ![Debug stream](../assets/screenshots/debug-stream.png) | ![Tool report](../assets/screenshots/tool-report.png) |

## Responsibilities

- Serve the HTTP API used by the Electron frontend.
- Authenticate Google Workspace access through OAuth.
- Read and mutate Gmail, Calendar, Drive and Tasks data.
- Build chat context and call LM Studio through an OpenAI-compatible client.
- Execute tool calls selected by the model.
- Stream tokens and debug events to the frontend.
- Generate data required by Debug Lab and report exports.

## Backend Layout

| Path | Description |
| --- | --- |
| `../main.py` | FastAPI application setup and router registration. |
| `schemas/` | Pydantic request and response models. |
| `routers/` | FastAPI route groups by domain. |
| `../core/` | Database, auth, config and shared domain models. |
| `../services/` | Google Workspace and app service layer. |
| `../tools/` | Tool definitions, handlers and compact result builders. |
| `../llm/` | LM Studio client and health checks. |

## Runtime Flow

```text
Frontend request
      |
      v
FastAPI router
      |
      v
Service or assistant orchestration
      |
      +--> Google Workspace APIs
      +--> LM Studio
      +--> Tool handlers
      |
      v
JSON response or Server-Sent Events stream
```

## Installation

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

## Configuration

Create a local `.env` file in the repository root. Typical values are:

```env
BASE_URL_OPEN_AI=http://127.0.0.1:1234/v1
API_KEY_OPEN_AI=lm-studio
GOOGLE_REDIRECT_URI=http://127.0.0.1:8000/auth/google/callback
```

Google OAuth credentials are expected through the local credential flow used by
the application. Keep `credentials.json` and `token.json` private.

Editable runtime settings are available from the desktop Settings screen. The
`expose_service_endpoints` setting controls whether optional direct service
routers are exposed over HTTP. Turning it off hides Calendar, Drive, Tasks and
non-essential Gmail operation endpoints without disabling assistant tools or
frontend-required routes.

## Running

```powershell
uvicorn main:app --reload --port 8000
```

Useful URLs:

| URL | Purpose |
| --- | --- |
| `http://127.0.0.1:8000/docs` | Interactive OpenAPI documentation. |
| `http://127.0.0.1:8000/health` | Health check endpoint. |
| `http://127.0.0.1:8000/assistant/chat/stream` | Streaming assistant endpoint. |

## Main Domains

| Domain | Router Prefix | Description |
| --- | --- | --- |
| Assistant | `/assistant` | Chat, streaming, title generation and debug events. |
| Gmail | `/gmail` | Email reading, sending, threads and history. |
| Calendar | `/calendar` | Event management and availability checks. |
| Drive | `/drive` | File listing, search, upload, delete and public links. |
| Tasks | `/tasks` | Google Tasks list and task operations. |
| Auth | `/auth/google` | Google OAuth URL, callback and credential checks. |
| Config | `/config` | Runtime configuration API. |
| Settings | `/settings` | User-editable application settings. |

For a full route table, see [Router Reference](routers/README.md).

## Debug Lab Events

The assistant stream emits structured events for:

- backend receive
- tokenization
- context construction
- LM Studio request and response
- tool selection
- tool result
- output tokens
- done or error states

The frontend consumes these events to draw the Debug Lab flow and generate PDF
and CSV reports.

## Quality Checks

Recommended checks before delivery:

```powershell
python -m compileall api core services tools llm
uvicorn main:app --reload --port 8000
```

Run these checks from the active virtual environment when using a project-local
Python installation.

## Copyright and License

Copyright (c) 2026 Enrique Padilla Padilla.

Licensed under the Apache License, Version 2.0. See [LICENSE](../LICENSE) for
the full license text.

The Kai IA logo was generated with AI.
