from fastapi import APIRouter, HTTPException, status
from core.auth import exchange_code_for_token

router = APIRouter(prefix="/auth/google", tags=["Auth"])

@router.get("/callback")
def google_oauth_callback(code:str | None = None, error:str | None = None):
    if error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error":error}
        )

    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error":"Missing 'code' in callback"}
        )

    try:
        exchange_code_for_token(code=code)
        return {"status":"authenticated"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error":str(e)}
        )