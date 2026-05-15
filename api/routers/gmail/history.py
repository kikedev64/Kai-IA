from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from services.gmail.history_reader import (
    check_history_changes,
    get_history_ids,
    get_latest_history_id,
    read_history_since,
)

router = APIRouter(prefix="/history", tags=["History"])


class GmailHistoryCheckRequest(BaseModel):
    """Request payload used to check Gmail history changes.

    Carries the last known Gmail history id and the label that should
    be inspected for new messages.
    """

    start_history_id: str
    label_id: str = "INBOX"


class GmailHistoryReadRequest(BaseModel):
    """Request payload used to read Gmail history rows.

    Defines the starting history id and label used to fetch added
    message ids from Gmail.
    """

    start_history_id: str
    label_id: str = "INBOX"


@router.get("/latest-history-id")
def latest_history_id() -> dict[str, object]:
    """Return the latest Gmail history id.

    Returns:
        dict[str, object]
    """
    history_id = get_latest_history_id()

    return {
        "ok": True,
        "history_id": history_id,
    }


@router.post("/check")
def check_changes(req: GmailHistoryCheckRequest) -> dict:
    """Check the changes.

    Args:
        req: Request payload received by the endpoint.

    Returns:
        dict
    """

    try:
        result = check_history_changes(
            start_history_id=req.start_history_id,
            label_id=req.label_id,
        )
        return {
            "ok": True,
            **result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/read")
def read_history(req: GmailHistoryReadRequest) -> dict:
    """Read the history.

    Args:
        req: Request payload received by the endpoint.

    Returns:
        dict
    """

    try:
        result = read_history_since(
            start_history_id=req.start_history_id,
            label_id=req.label_id,
        )
        return {
            "ok": True,
            **result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
def list_history_ids(only_latest: bool = Query(default=False)) -> dict:
    """Return the history ids list.

    Args:
        only_latest: Whether only the latest history id should be returned.

    Returns:
        dict
    """
    rows = get_history_ids(only_latest=only_latest)

    return {
        "ok": True,
        "count": len(rows),
        "only_latest": only_latest,
        "items": rows,
    }
