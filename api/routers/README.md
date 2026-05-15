# Router Reference

This directory contains the FastAPI routers registered by `main.py`. Routes are grouped by external service or application domain, and endpoint logic remains thin enough to delegate business behavior to `services`, `core`, `llm`, and `tools`.

## Route Groups

| Module | Prefix | Tags |
| --- | --- | --- |
| `app.py` | `/app` | `App` |
| `auth.py` | `/auth/google` | `Auth` |
| `calendar.py` | `/calendar` | `Calendar` |
| `chat.py` | `/assistant` | `Assistant` |
| `config.py` | `/config` | `config` |
| `drive.py` | `/drive` | `Drive` |
| `gmail/__init__.py` | `/gmail` | `Gmail` |
| `gmail/gmail.py` | `/gmail/email-request` | `Email Requests` |
| `gmail/history.py` | `/gmail/history` | `History` |
| `health.py` | `/health` | `Health` |
| `settings.py` | `/settings` | `Settings` |
| `tasks.py` | `/tasks` | `Tasks` |

## App

| Method | Path | Handler | Description |
| --- | --- | --- | --- |
| `GET` | `/app/bootstrap` | `bootstrap` | Returns startup checks used by the desktop shell. |

## Auth

| Method | Path | Handler | Description |
| --- | --- | --- | --- |
| `GET` | `/auth/google/callback` | `google_oauth_callback` | Handles the Google OAuth callback. |
| `GET` | `/auth/google/url` | `google_oauth_url` | Returns the Google OAuth authorization URL. |
| `GET` | `/auth/google/test` | `google_oauth_test` | Checks whether Google credentials are usable. |

## Assistant

| Method | Path | Handler | Description |
| --- | --- | --- | --- |
| `POST` | `/assistant/start` | `start` | Creates a new chat session. |
| `POST` | `/assistant/chat` | `chat_endpoint` | Runs a non-streaming assistant turn. |
| `POST` | `/assistant/ask` | `ask_llm` | Sends a direct prompt to the LLM with an optional system prompt. |
| `GET` | `/assistant/chats` | `get_chats` | Lists stored chat sessions. |
| `GET` | `/assistant/chats/{chat_id}` | `get_chat_by_id` | Returns one full chat session with messages. |
| `POST` | `/assistant/chat/stream` | `assistant_chat_stream` | Streams assistant output, debug events, tool calls, and terminal events. |

## Calendar

| Method | Path | Handler | Description |
| --- | --- | --- | --- |
| `GET` | `/calendar/events` | `api_list_events` | Lists calendar events. |
| `POST` | `/calendar/events` | `api_create_event` | Creates a calendar event. |
| `GET` | `/calendar/events/{event_id}` | `api_get_event` | Returns one calendar event. |
| `PATCH` | `/calendar/events/{event_id}` | `api_update_event` | Updates one calendar event. |
| `DELETE` | `/calendar/events/{event_id}` | `api_delete_event` | Deletes one calendar event. |
| `POST` | `/calendar/freebusy` | `api_freebusy` | Checks calendar availability. |
| `POST` | `/calendar/events/meet` | `api_create_meet_event` | Creates a Google Meet event invitation. |

## Config

| Method | Path | Handler | Description |
| --- | --- | --- | --- |
| `GET` | `/config` | `read_config` | Reads all configuration or one key. |
| `POST` | `/config` | `write_config` | Writes one configuration key. |

## Drive

| Method | Path | Handler | Description |
| --- | --- | --- | --- |
| `GET` | `/drive/files` | `api_list_files` | Lists Drive files. |
| `POST` | `/drive/files/{file_id}/public-link` | `api_make_public_and_get_link` | Makes a file public and returns a download link. |
| `DELETE` | `/drive/files/{file_id}` | `api_delete_file` | Deletes a Drive file. |
| `POST` | `/drive/upload` | `api_upload_file` | Uploads a file to Drive. |
| `GET` | `/drive/files/search` | `api_search_files` | Searches Drive files by name. |

## Gmail

The Gmail router is mounted under `/gmail`. It includes email request routes and history routes.

### Email Requests

| Method | Path | Handler | Description |
| --- | --- | --- | --- |
| `POST` | `/gmail/email-request/send` | `api_send_email` | Sends an email. |
| `POST` | `/gmail/email-request/send-with-attachment` | `send_email_with_attachment` | Sends an email with uploaded attachments. |
| `GET` | `/gmail/email-request/read/last` | `api_read_last_emails` | Reads the most recent emails. |
| `GET` | `/gmail/email-request/read/from` | `api_read_last_emails_from_sender` | Reads recent emails from a sender. |
| `GET` | `/gmail/email-request/read/subject` | `api_read_last_emails_by_subject` | Reads recent emails matching a subject. |
| `GET` | `/gmail/email-request/thread/from-message/{message_id}` | `api_read_thread_from_message_id` | Reads the thread for a Gmail message. |
| `GET` | `/gmail/email-request/email` | `get_email_by_id` | Reads a single Gmail message by id. |

### History

| Method | Path | Handler | Description |
| --- | --- | --- | --- |
| `GET` | `/gmail/history/latest-history-id` | `latest_history_id` | Returns the latest Gmail history id. |
| `POST` | `/gmail/history/check` | `check_changes` | Checks whether Gmail history changed. |
| `POST` | `/gmail/history/read` | `read_history` | Reads Gmail history since a known id. |
| `GET` | `/gmail/history/` | `list_history_ids` | Lists stored Gmail history ids. |

## Health

| Method | Path | Handler | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | `health_check` | Returns the backend health status. |

## Settings

| Method | Path | Handler | Description |
| --- | --- | --- | --- |
| `GET` | `/settings` | `get_settings` | Returns editable application settings. |
| `PUT` | `/settings` | `update_settings` | Updates editable application settings. |

## Tasks

| Method | Path | Handler | Description |
| --- | --- | --- | --- |
| `GET` | `/tasks/tasklists` | `api_list_tasklists` | Lists Google Tasks task lists. |
| `POST` | `/tasks/tasklists/ensure` | `api_ensure_tasklist` | Finds or creates a task list. |
| `GET` | `/tasks/tasklists/{tasklist_id}/tasks` | `api_list_tasks` | Lists tasks in a task list. |
| `POST` | `/tasks/tasklists/{tasklist_id}/tasks` | `api_create_task` | Creates a task. |
| `PATCH` | `/tasks/tasklists/{tasklist_id}/tasks/{task_id}` | `api_update_task` | Updates a task. |
| `DELETE` | `/tasks/tasklists/{tasklist_id}/tasks/{task_id}` | `api_delete_task` | Deletes a task. |
| `GET` | `/tasks/tasklists/{tasklist_id}/tasks/{task_id}` | `api_get_task` | Returns one task. |

## Streaming Contract

`POST /assistant/chat/stream` provides server-sent events for the main chat and Debug Lab. It can emit:

- `debug` events for backend receive, tokenization, context assembly, LM Studio calls, tool selection, tool results, and completion.
- `token` events for incremental assistant output.
- `done` when the request finishes successfully.
- `error` when the request fails.

The frontend publishes these events to the Debug Lab window through `BroadcastChannel`.
