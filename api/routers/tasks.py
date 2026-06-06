from __future__ import annotations
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from googleapiclient.errors import HttpError

from api.schemas.tasks import (
    EnsureTaskListRequest,
    EnsureTaskListResponse,
    TaskListOut,
    TaskOut,
    TaskListResponse,
    CreateTaskRequest,
    UpdateTaskRequest,
)
from services.task.tasks_service import (
    ensure_tasklist,
    get_reminder,
    list_reminders,
    create_reminder,
    update_reminder,
    delete_reminder,
)
from services.task.utils import _tasks_service
from api.routers.service_exposure import require_service_endpoints_exposed


router = APIRouter(
    prefix="/tasks",
    tags=["Tasks"],
    dependencies=[Depends(require_service_endpoints_exposed)],
)


def _tasklist_to_api(tl: dict) -> dict:
    """Map a task list into the public API response shape.

    Args:
        tl: Task list returned by Google Tasks.

    Returns:
        dict
    """
    return {
        "id": tl.get("id", ""),
        "title": tl.get("title", ""),
    }


def _task_to_api(t: dict) -> dict:
    """Map a task into the public API response shape.

    Args:
        t: Task returned by Google Tasks.

    Returns:
        dict
    """
    return {
        "id": t.get("id", ""),
        "title": t.get("title", ""),
        "status": t.get("status", "needsAction"),
        "due": t.get("due"),
        "notes": t.get("notes"),
        "updated": t.get("updated"),
    }


def _norm(s: Optional[str]) -> str:
    """Normalize optional text for case-insensitive comparisons.

    Args:
        s: Text to normalize.

    Returns:
        str
    """
    return (s or "").strip().lower()


def find_reminders_by_conditions(
    tasklist_id: str,
    query: Optional[str] = None,
    title: Optional[str] = None,
    notes: Optional[str] = None,
    status: Optional[Literal["needsAction", "completed"]] = None,
    due_from: Optional[str] = None,
    due_to: Optional[str] = None,
    max_results: int = 100,
    show_completed: bool = True,
    show_deleted: bool = False,
    show_hidden: bool = True,
) -> dict:
    """Find the reminders by conditions.

    Args:
        tasklist_id: Identifier of the task list.
        query: Search query processed by the function.
        title: Task or chat title processed by the function.
        notes: Task notes processed by the function.
        status: Task status processed by the function.
        due_from: Lower due-date bound used for filtering.
        due_to: Upper due-date bound used for filtering.
        max_results: Maximum number of items to return.
        show_completed: Whether completed tasks should be included.
        show_deleted: Whether deleted tasks should be included.
        show_hidden: Whether hidden tasks should be included.

    Returns:
        dict
    """

    tasks = list_reminders(
        tasklist_id=tasklist_id,
        max_results=max_results,
        show_completed=show_completed,
        show_deleted=show_deleted,
        show_hidden=show_hidden,
    )

    q = _norm(query)
    t = _norm(title)
    n = _norm(notes)

    out = []
    for task in tasks or []:
        task_title = _norm(task.get("title"))
        task_notes = _norm(task.get("notes"))
        task_status = task.get("status")
        task_due = task.get("due")

        if q and not (q in task_title or q in task_notes):
            continue
        if t and t not in task_title:
            continue
        if n and n not in task_notes:
            continue
        if status and task_status != status:
            continue
        if due_from and (not task_due or task_due < due_from):
            continue
        if due_to and (not task_due or task_due > due_to):
            continue

        out.append(
            {
                "id": task.get("id"),
                "title": task.get("title"),
                "status": task.get("status"),
                "due": task.get("due"),
                "notes": task.get("notes"),
                "updated": task.get("updated"),
            }
        )

    return {
        "tasklist_id": tasklist_id,
        "count": len(out),
        "tasks": out,
        "filters_used": {
            "query": query,
            "title": title,
            "notes": notes,
            "status": status,
            "due_from": due_from,
            "due_to": due_to,
        },
    }


@router.get("/tasklists", response_model=list[TaskListOut])
def api_list_tasklists(max_results: int = Query(100, ge=1, le=200)) -> list[dict]:
    """Serve the list tasklists endpoint.

    Args:
        max_results: Maximum number of items to return.

    Returns:
        dict
    """
    try:
        service = _tasks_service()
        res = service.tasklists().list(maxResults=max_results).execute()
        items = res.get("items", []) or []
        return [_tasklist_to_api(x) for x in items]
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.post("/tasklists/ensure", response_model=EnsureTaskListResponse)
def api_ensure_tasklist(req: EnsureTaskListRequest) -> dict:
    """Serve the ensure tasklist endpoint.

    Args:
        req: Request payload received by the endpoint.

    Returns:
        dict
    """
    try:
        tl = ensure_tasklist(tasklist_title=req.title)
        return _tasklist_to_api(tl)
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.get("/tasklists/{tasklist_id}/tasks", response_model=TaskListResponse)
def api_list_tasks(
    tasklist_id: str,
    max_results: int = Query(20, ge=1, le=100),
    show_completed: bool = False,
    show_deleted: bool = False,
    show_hidden: bool = False,
) -> dict:
    """Serve the list tasks endpoint.

    Args:
        tasklist_id: Identifier of the task list.
        max_results: Maximum number of items to return.
        show_completed: Whether completed tasks should be included.
        show_deleted: Whether deleted tasks should be included.
        show_hidden: Whether hidden tasks should be included.

    Returns:
        dict
    """
    try:
        items = list_reminders(
            tasklist_id=tasklist_id,
            max_results=max_results,
            show_completed=show_completed,
            show_deleted=show_deleted,
            show_hidden=show_hidden,
        )
        return {"items": [_task_to_api(x) for x in items]}
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.post("/tasklists/{tasklist_id}/tasks", response_model=TaskOut)
def api_create_task(tasklist_id: str, req: CreateTaskRequest) -> dict:
    """Serve the create task endpoint.

    Args:
        tasklist_id: Identifier of the task list.
        req: Request payload received by the endpoint.

    Returns:
        dict
    """
    try:
        t = create_reminder(
            tasklist_id=tasklist_id,
            title=req.title,
            due_rfc3339=req.due_rfc3339,
            notes=req.notes,
            status=req.status,
        )
        return _task_to_api(t)
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.patch("/tasklists/{tasklist_id}/tasks/{task_id}", response_model=TaskOut)
def api_update_task(tasklist_id: str, task_id: str, req: UpdateTaskRequest) -> dict:
    """Serve the update task endpoint.

    Args:
        tasklist_id: Identifier of the task list.
        task_id: Identifier of the task.
        req: Request payload received by the endpoint.

    Returns:
        dict
    """
    try:
        t = update_reminder(
            tasklist_id=tasklist_id,
            task_id=task_id,
            title=req.title,
            due_rfc3339=req.due_rfc3339,
            notes=req.notes,
            status=req.status,
        )
        return _task_to_api(t)
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.delete("/tasklists/{tasklist_id}/tasks/{task_id}")
def api_delete_task(tasklist_id: str, task_id: str) -> dict[str, object]:
    """Serve the delete task endpoint.

    Args:
        tasklist_id: Identifier of the task list.
        task_id: Identifier of the task.

    Returns:
        dict
    """
    try:
        delete_reminder(tasklist_id=tasklist_id, task_id=task_id)
        return {"deleted": True, "task_id": task_id}
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.get("/tasklists/{tasklist_id}/tasks/{task_id}", response_model=TaskOut)
def api_get_task(tasklist_id: str, task_id: str) -> dict:
    """Serve the get task endpoint.

    Args:
        tasklist_id: Identifier of the task list.
        task_id: Identifier of the task.

    Returns:
        dict
    """
    try:
        t = get_reminder(tasklist_id=tasklist_id, task_id=task_id)
        return _task_to_api(t)
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))
