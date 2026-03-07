from __future__ import annotations

from typing import Any, Optional, Literal
from services.task.utils import _tasks_service, now_utc_rfc3339


def ensure_tasklist(tasklist_title: str = "Kai IA") -> dict[str, Any]:
    service = _tasks_service()

    lists = service.tasklists().list(maxResults=100).execute().get("items", []) or []
    for tl in lists:
        if tl.get("title") == tasklist_title:
            return tl

    created = service.tasklists().insert(body={"title": tasklist_title}).execute()
    return created

def get_reminder(tasklist_id: str, task_id: str) -> dict[str, Any]:
    service = _tasks_service()
    return service.tasks().get(tasklist=tasklist_id, task=task_id).execute()

def list_reminders(
    tasklist_id: str,
    max_results: int = 20,
    show_completed: bool = False,
    show_deleted: bool = False,
    show_hidden: bool = False,
) -> list[dict[str, Any]]:

    service = _tasks_service()

    res = service.tasks().list(
        tasklist=tasklist_id,
        maxResults=max_results,
        showCompleted=show_completed,
        showDeleted=show_deleted,
        showHidden=show_hidden,
    ).execute()

    return res.get("items", []) or []


def create_reminder( tasklist_id: str, title: str, due_rfc3339: Optional[str] = None, notes: Optional[str] = None, status: Literal["needsAction", "completed"] = "needsAction", ) -> dict[str, Any]:

    service = _tasks_service()

    body: dict[str, Any] = {"title": title, "status": status}
    if due_rfc3339:
        body["due"] = due_rfc3339
    if notes:
        body["notes"] = notes

    created = service.tasks().insert(tasklist=tasklist_id, body=body).execute()
    return created


def update_reminder( tasklist_id: str, task_id: str, title: Optional[str] = None, due_rfc3339: Optional[str] = None, notes: Optional[str] = None, status: Optional[Literal["needsAction", "completed"]] = None,) -> dict[str, Any]:

    service = _tasks_service()

    patch: dict[str, Any] = {}
    if title is not None:
        patch["title"] = title
    if due_rfc3339 is not None:
        patch["due"] = due_rfc3339
    if notes is not None:
        patch["notes"] = notes
    if status is not None:
        patch["status"] = status

    updated = service.tasks().patch(
        tasklist=tasklist_id,
        task=task_id,
        body=patch
    ).execute()

    return updated


def delete_reminder(tasklist_id: str, task_id: str) -> None:
    service = _tasks_service()
    service.tasks().delete(tasklist=tasklist_id, task=task_id).execute()

