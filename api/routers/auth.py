from fastapi import APIRouter, HTTPException, status
from fastapi.responses import RedirectResponse

from core.auth import (
    exchange_code_for_token,
    get_google_auth_url,
)

router = APIRouter(prefix="/auth/google", tags=["Auth"])

@router.get("/callback")
def google_oauth_callback(code: str | None = None, error: str | None = None):
    if error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": error}
        )

    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Missing 'code' in callback"}
        )

    try:
        exchange_code_for_token(code=code)
        return {"status": "authenticated"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": str(e)}
        )
    
@router.get("/url")
def google_oauth_url():
    try:
        auth_url = get_google_auth_url()
        return {"auth_url": auth_url}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": str(e)}
        )