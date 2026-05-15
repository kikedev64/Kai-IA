from googleapiclient.discovery import build
from core.auth import get_creds
from datetime import datetime, timezone
from fastapi import HTTPException, status

def _tasks_service() -> object:
    """Create an authenticated Google Tasks service client.

    Returns:
        object
    """
    res = get_creds()

    if isinstance(res, dict) and "creds" in res:
        return build("tasks", "v1", credentials=res["creds"])

    if isinstance(res, dict) and "auth_url" in res:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "message": "Google authentication required",
                "auth_url": res["auth_url"],
            },
        )

    if isinstance(res, dict) and "error" in res:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=res["error"])

    return build("tasks", "v1", credentials=res)

def now_utc_rfc3339(seconds: bool = True, zulu: bool = True) -> str:
    """Return the current UTC time in RFC3339 format.

    Args:
        seconds: Whether seconds should be included in the timestamp.
        zulu: Whether the timestamp should use the Z suffix.

    Returns:
        str
    """
    dt = datetime.now(timezone.utc)
    s = dt.isoformat(timespec="seconds" if seconds else "minutes")
    return s.replace("+00:00", "Z") if zulu else s

