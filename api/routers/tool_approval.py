import threading

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/assistant/tool", tags=["Tool Approval"])

_pending: dict[str, threading.Event] = {}
_decisions: dict[str, bool] = {}


def register_approval(approval_id: str) -> threading.Event:
    """Create a pending slot and return its Event to block on.

    Args:
        approval_id: Unique identifier for this approval request.

    Returns:
        threading.Event
    """
    evt = threading.Event()
    _pending[approval_id] = evt
    _decisions[approval_id] = False
    return evt


def consume_approval(approval_id: str) -> bool:
    """Return the stored decision and remove the slot.

    Args:
        approval_id: Unique identifier for this approval request.

    Returns:
        bool
    """
    decision = _decisions.pop(approval_id, False)
    _pending.pop(approval_id, None)
    return decision


@router.post("/approve/{approval_id}")
def submit_approval(approval_id: str, approved: bool = True) -> dict:
    """Submit the user's decision for a pending shell command.

    Args:
        approval_id: Approval slot identifier emitted in the SSE event.
        approved: True to allow execution, False to cancel.

    Returns:
        dict
    """
    if approval_id not in _pending:
        raise HTTPException(
            status_code=404,
            detail="Solicitud no encontrada o ya expirada.",
        )
    _decisions[approval_id] = approved
    _pending[approval_id].set()
    return {"ok": True}
