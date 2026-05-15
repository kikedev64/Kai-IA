from services.task.tasks_service import ensure_tasklist


def _ensure_tasklist_id(tasklist_title: str = "Kai IA") -> str:
    """Ensure the tasklist id exists.

    Args:
        tasklist_title: Google Tasks list title.

    Returns:
        str
    """
    tl = ensure_tasklist(tasklist_title=tasklist_title)
    return tl["id"]


def _resolve_tasklist(tasklist_title: str | None) -> dict:
    """Resolve a Google Tasks list.

    Args:
        tasklist_title: Google Tasks list title.

    Returns:
        dict
    """
    return ensure_tasklist(tasklist_title=tasklist_title or "Kai IA")


def _compact_task(task: dict) -> dict:
    """Build a compact task dictionary.

    Args:
        task: Task returned by Google Tasks.

    Returns:
        dict
    """
    return {
        "id": task.get("id"),
        "title": task.get("title"),
        "status": task.get("status"),
        "due": task.get("due"),
        "notes": task.get("notes"),
        "updated": task.get("updated"),
    }
