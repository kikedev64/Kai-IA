from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
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
    list_reminders,
    create_reminder,
    update_reminder,
    delete_reminder,
)
from services.task.utils import _tasks_service


router = APIRouter(prefix="/tasks", tags=["Tasks"])


def _tasklist_to_api(tl: dict) -> dict:
    return {
        "id": tl.get("id", ""),
        "title": tl.get("title", ""),
    }


def _task_to_api(t: dict) -> dict:
    return {
        "id": t.get("id", ""),
        "title": t.get("title", ""),
        "status": t.get("status", "needsAction"),
        "due": t.get("due"),
        "notes": t.get("notes"),
        "updated": t.get("updated"),
    }


@router.get("/tasklists", response_model=list[TaskListOut])
def api_list_tasklists(max_results: int = Query(100, ge=1, le=200)):
    try:
        service = _tasks_service()
        res = service.tasklists().list(maxResults=max_results).execute()
        items = res.get("items", []) or []
        return [_tasklist_to_api(x) for x in items]
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.post("/tasklists/ensure", response_model=EnsureTaskListResponse)
def api_ensure_tasklist(req: EnsureTaskListRequest):
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
):
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
def api_create_task(tasklist_id: str, req: CreateTaskRequest):
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
def api_update_task(tasklist_id: str, task_id: str, req: UpdateTaskRequest):
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
def api_delete_task(tasklist_id: str, task_id: str):
    try:
        delete_reminder(tasklist_id=tasklist_id, task_id=task_id)
        return {"deleted": True, "task_id": task_id}
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))