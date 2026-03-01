from __future__ import annotations

from typing import Optional, Literal, Any
from pydantic import BaseModel, Field


class TaskListOut(BaseModel):
    id: str
    title: str


class TaskOut(BaseModel):
    id: str
    title: str
    status: Literal["needsAction", "completed"] = "needsAction"
    due: Optional[str] = None
    notes: Optional[str] = None
    updated: Optional[str] = None


class TaskListResponse(BaseModel):
    items: list[TaskOut] = Field(default_factory=list)


class EnsureTaskListRequest(BaseModel):
    title: str = "Kai IA"


class EnsureTaskListResponse(BaseModel):
    id: str
    title: str


class CreateTaskRequest(BaseModel):
    title: str
    due_rfc3339: Optional[str] = None
    notes: Optional[str] = None
    status: Literal["needsAction", "completed"] = "needsAction"


class UpdateTaskRequest(BaseModel):
    title: Optional[str] = None
    due_rfc3339: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[Literal["needsAction", "completed"]] = None