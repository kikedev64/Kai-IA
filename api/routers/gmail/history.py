from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from services.gmail.history_reader import check_history_changes, get_history_ids, get_latest_history_id, read_history_since

router = APIRouter(prefix="/history",tags=["History"])


class GmailHistoryCheckRequest(BaseModel):
    start_history_id: str
    label_id: str = "INBOX"


class GmailHistoryReadRequest(BaseModel):
    start_history_id: str
    label_id: str = "INBOX"


@router.get("/latest-history-id")
def latest_history_id():
    history_id = get_latest_history_id()

    return {
        "ok": True,
        "history_id": history_id,
    }


@router.post("/check")
def check_changes(req: GmailHistoryCheckRequest):

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
def read_history(req: GmailHistoryReadRequest):

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
def list_history_ids(
    only_latest: bool = Query(default=False)
):
    rows = get_history_ids(only_latest=only_latest)

    return {
        "ok": True,
        "count": len(rows),
        "only_latest": only_latest,
        "items": rows,
    }