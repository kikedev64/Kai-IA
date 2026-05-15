from core.auth import get_google_auth_url


def is_google_token_expired_error(error: Exception | str) -> bool:
    """Check whether an error means the Google token expired.

    Args:
        error: Error to inspect.

    Returns:
        bool
    """
    text = str(error).lower()

    return (
        "invalid_grant" in text
        or "token has been expired" in text
        or "token has been expired or revoked" in text
        or "expired or revoked" in text
        or "google authentication required" in text
    )


def build_google_reauth_message() -> str:
    """Build the Google reauthentication message.

    Returns:
        str
    """
    try:
        auth_url = get_google_auth_url()
    except Exception:
        auth_url = "No se pudo generar la URL de autenticación"

    return (
        "No puedo acceder a tus servicios de Google porque la sesión ha expirado o ha sido revocada.\n\n"
        f"🔐 Reautentica aquí:\n{auth_url}\n\n"
        "Cuando lo hayas hecho, vuelve a pedírmelo y continuaré."
    )
