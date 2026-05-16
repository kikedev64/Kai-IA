from googleapiclient.discovery import build
from fastapi import HTTPException, status
from core.auth import get_creds


def _calendar_service() -> object:
    """Create an authenticated Google Calendar service client.

    Returns:
        object
    """
    res = get_creds()

    if isinstance(res, dict) and "creds" in res:
        return build("calendar", "v3", credentials=res["creds"])

    if isinstance(res, dict) and "auth_url" in res:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "message": "Google authentication required",
                "auth_url": res["auth_url"],
            },
        )

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=res["error"])
