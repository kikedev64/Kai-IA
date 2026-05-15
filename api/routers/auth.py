from fastapi import APIRouter, HTTPException, status
from fastapi.responses import HTMLResponse

from api.routers.health import test_google_auth_connection
from core.auth import (
    exchange_code_for_token,
    get_google_auth_url,
)

router = APIRouter(prefix="/auth/google", tags=["Auth"])

@router.get("/callback", response_class=HTMLResponse)
def google_oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None
):
    """Execute the google oauth callback behavior.

    Args:
        code: OAuth authorization code returned by Google.
        state: OAuth state value used for callback validation.
        error: Error value passed to the function.

    Returns:
        HTMLResponse
    """
    if error:
        return HTMLResponse(f"""
        <html>
            <body>
                <script>
                    window.opener?.postMessage({{ status: "error", error: "{error}" }}, "*");
                    window.close();
                </script>
                <p>Error en autenticación...</p>
            </body>
        </html>
        """)

    if not code or not state:
        return HTMLResponse("""
        <html>
            <body>
                <script>
                    window.opener?.postMessage({ status: "error" }, "*");
                    window.close();
                </script>
            </body>
        </html>
        """)

    try:
        exchange_code_for_token(code=code, state=state)

        return HTMLResponse("""
        <html>
            <body>
                <script>
                    window.opener?.postMessage({ status: "success" }, "*");
                    window.close();
                </script>
                <p>Autenticado correctamente. Puedes cerrar esta ventana.</p>
            </body>
        </html>
        """)
    except Exception as e:
        return HTMLResponse(f"""
        <html>
            <body>
                <script>
                    window.opener?.postMessage({{ status: "error", error: "{str(e)}" }}, "*");
                    window.close();
                </script>
            </body>
        </html>
        """)

@router.get("/url")
def google_oauth_url():
    """Execute the google oauth url behavior.

    Args:
        None.

    Returns:
        dict[str, str]
    """
    try:
        auth_url = get_google_auth_url()
        return {"auth_url": auth_url}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": str(e)}
        )

@router.get("/test")
def google_oauth_test():
    """Execute the google oauth test behavior.

    Args:
        None.

    Returns:
        dict
    """
    return test_google_auth_connection()