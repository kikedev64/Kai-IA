from googleapiclient.discovery import build
from core.auth import get_creds
from datetime import datetime, timezone

def _tasks_service():
    creds = get_creds()
    return build("tasks", "v1", credentials=creds)

def now_utc_rfc3339(seconds: bool = True, zulu: bool = True) -> str:
    dt = datetime.now(timezone.utc)
    s = dt.isoformat(timespec="seconds" if seconds else "minutes")
    return s.replace("+00:00", "Z") if zulu else s

