def is_google_auth_expired_error(error: Exception | str) -> bool:
    text = str(error).lower()

    patterns = [
        "invalid_grant",
        "token has been expired or revoked",
        "expired or revoked",
    ]

    return any(pattern in text for pattern in patterns)