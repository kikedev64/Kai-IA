from __future__ import annotations

from typing import Any, Optional, Literal
from services.task.utils import _tasks_service


def ensure_tasklist(tasklist_title: str = "Kai IA") -> dict:
    """Ensure the tasklist exists.

    Args:
        tasklist_title: Google Tasks list title.

    Returns:
        dict
    """
    service = _tasks_service()

    lists = service.tasklists().list(maxResults=100).execute().get("items", []) or []
    for tl in lists:
        if tl.get("title") == tasklist_title:
            return tl

    created = service.tasklists().insert(body={"title": tasklist_title}).execute()
    return created


def get_reminder(tasklist_id: str, task_id: str) -> dict:
    """Return the reminder.

    Args:
        tasklist_id: Identifier of the task list.
        task_id: Identifier of the task.

    Returns:
        dict
    """
    service = _tasks_service()
    return service.tasks().get(tasklist=tasklist_id, task=task_id).execute()


def list_reminders(
    tasklist_id: str,
    max_results: int = 20,
    show_completed: bool = False,
    show_deleted: bool = False,
    show_hidden: bool = False,
) -> list[dict]:
    """Return the reminders list.

    Args:
        tasklist_id: Identifier of the task list.
        max_results: Maximum number of items to return.
        show_completed: Whether completed tasks should be included.
        show_deleted: Whether deleted tasks should be included.
        show_hidden: Whether hidden tasks should be included.

    Returns:
        list[dict]
    """

    service = _tasks_service()

    res = (
        service.tasks()
        .list(
            tasklist=tasklist_id,
            maxResults=max_results,
            showCompleted=show_completed,
            showDeleted=show_deleted,
            showHidden=show_hidden,
        )
        .execute()
    )

    return res.get("items", []) or []


def create_reminder(
    tasklist_id: str,
    title: str,
    due_rfc3339: Optional[str] = None,
    notes: Optional[str] = None,
    status: Literal["needsAction", "completed"] = "needsAction",
) -> dict:
    """Create the reminder.

    Args:
        tasklist_id: Identifier of the task list.
        title: Task or chat title processed by the function.
        due_rfc3339: Task due date in RFC3339 format.
        notes: Task notes processed by the function.
        status: Task status processed by the function.

    Returns:
        dict
    """

    service = _tasks_service()

    body: dict[str, Any] = {"title": title, "status": status}
    if due_rfc3339:
        body["due"] = due_rfc3339
    if notes:
        body["notes"] = notes

    created = service.tasks().insert(tasklist=tasklist_id, body=body).execute()
    return created


def update_reminder(
    tasklist_id: str,
    task_id: str,
    title: Optional[str] = None,
    due_rfc3339: Optional[str] = None,
    notes: Optional[str] = None,
    status: Optional[Literal["needsAction", "completed"]] = None,
) -> dict:
    """Update the reminder.

    Args:
        tasklist_id: Identifier of the task list.
        task_id: Identifier of the task.
        title: Task or chat title processed by the function.
        due_rfc3339: Task due date in RFC3339 format.
        notes: Task notes processed by the function.
        status: Task status processed by the function.

    Returns:
        dict
    """

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

    updated = (
        service.tasks().patch(tasklist=tasklist_id, task=task_id, body=patch).execute()
    )

    return updated


def delete_reminder(tasklist_id: str, task_id: str) -> None:
    """Delete the reminder.

    Args:
        tasklist_id: Identifier of the task list.
        task_id: Identifier of the task.

    Returns:
        None
    """
    service = _tasks_service()
    service.tasks().delete(tasklist=tasklist_id, task=task_id).execute()
