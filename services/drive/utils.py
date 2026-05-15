from googleapiclient.discovery import build
from core.auth import get_creds
from fastapi import HTTPException, status

GOOGLE_EXPORT_MAP = {
    "application/vnd.google-apps.document": (
        "pdf",
        "https://docs.google.com/document/d/{id}/export?format={fmt}",
    ),
    "application/vnd.google-apps.spreadsheet": (
        "xlsx",
        "https://docs.google.com/spreadsheets/d/{id}/export?format={fmt}",
    ),
    "application/vnd.google-apps.presentation": (
        "pptx",
        "https://docs.google.com/presentation/d/{id}/export/{fmt}",
    ),
    "application/vnd.google-apps.drawing": (
        "png",
        "https://docs.google.com/drawings/d/{id}/export/{fmt}",
    ),
}


def _get_service() -> object:
    """Create an authenticated Google API service client.

    Returns:
        object
    """
    res = get_creds()

    if isinstance(res, dict) and "creds" in res:
        return build("drive", "v3", credentials=res["creds"])

    if isinstance(res, dict) and "auth_url" in res:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "message": "Google authentication required",
                "auth_url": res["auth_url"],
            },
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "error": (res.get("error") if isinstance(res, dict) else "Unknown error")
        },
    )
