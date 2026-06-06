from __future__ import annotations

from typing import Optional, Literal
from pydantic import BaseModel, Field


class TaskListOut(BaseModel):
    """Public representation of a Google Tasks list.

    Used by endpoints that expose task list identifiers and titles
    to the frontend.
    """

    id: str
    title: str


class TaskOut(BaseModel):
    """Public representation of a Google Task item.

    Includes the fields needed to render, filter and update tasks
    through Kai IA.
    """

    id: str
    title: str
    status: Literal["needsAction", "completed"] = "needsAction"
    due: Optional[str] = None
    notes: Optional[str] = None
    updated: Optional[str] = None


class TaskListResponse(BaseModel):
    """Response payload for task listing endpoints.

    Wraps the task collection returned by Google Tasks for a
    selected task list.
    """

    items: list[TaskOut] = Field(default_factory=list)


class EnsureTaskListRequest(BaseModel):
    """Request payload used to create or reuse a task list.

    The title identifies the Google Tasks list that should exist
    before task operations continue.
    """

    title: str = "Kai IA"


class EnsureTaskListResponse(BaseModel):
    """Response payload for an ensured task list.

    Returns the id and title of the Google Tasks list that will be
    used for reminders.
    """

    id: str
    title: str


class CreateTaskRequest(BaseModel):
    """Request payload used to create a reminder task.

    Carries the title, optional due date, notes and status sent to
    Google Tasks.
    """

    title: str
    due_rfc3339: Optional[str] = None
    notes: Optional[str] = None
    status: Literal["needsAction", "completed"] = "needsAction"


class UpdateTaskRequest(BaseModel):
    """Request payload used to update an existing reminder task.

    All fields are optional so the endpoint can patch only the task
    attributes supplied by the caller.
    """

    title: Optional[str] = None
    due_rfc3339: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[Literal["needsAction", "completed"]] = None
