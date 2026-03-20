import os
import json
import secrets
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from core.config import (
    get_google_scopes,
    get_google_redirect_uri,
    get_google_credentials_file,
    get_google_token_file,
)


BASE_DIR = Path(__file__).resolve().parent.parent
GOOGLE_OAUTH_TEMP_FILE = BASE_DIR / "oauth_temp.json"


def _save_oauth_temp_data(state: str, code_verifier: str) -> None:
    data = {
        "state": state,
        "code_verifier": code_verifier,
    }
    with open(GOOGLE_OAUTH_TEMP_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f)


def _load_oauth_temp_data() -> dict | None:
    if not GOOGLE_OAUTH_TEMP_FILE.exists():
        return None

    with open(GOOGLE_OAUTH_TEMP_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _clear_oauth_temp_data() -> None:
    if GOOGLE_OAUTH_TEMP_FILE.exists():
        GOOGLE_OAUTH_TEMP_FILE.unlink()


def get_creds():
    if os.path.exists(str(get_google_token_file())):
        creds = Credentials.from_authorized_user_file(str(get_google_token_file()), get_google_scopes())

        if creds and creds.valid:
            return {"creds": creds}

        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(get_google_token_file(), "w", encoding="utf-8") as f:
                f.write(creds.to_json())
            return {"creds": creds}

    if not os.path.exists(str(get_google_credentials_file())):
        return {
            "error": f"{get_google_credentials_file()} not found. Download it from Google Cloud Console."
        }

    auth_url = get_google_auth_url()
    return {"auth_url": auth_url}


def get_google_auth_url() -> str:
    if not os.path.exists(str(get_google_credentials_file())):
        raise FileNotFoundError(f"Missing {get_google_credentials_file()}")

    # Generamos code_verifier explícitamente
    code_verifier = secrets.token_urlsafe(64)

    flow = Flow.from_client_secrets_file(
        str(get_google_credentials_file()),
        scopes=get_google_scopes(),
        redirect_uri=get_google_redirect_uri(),
        code_verifier=code_verifier,
    )

    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="false",
        prompt="consent",
    )

    _save_oauth_temp_data(state=state, code_verifier=code_verifier)

    return auth_url


def exchange_code_for_token(code: str, state: str) -> Credentials:
    if not os.path.exists(str(get_google_credentials_file())):
        raise FileNotFoundError(f"Missing {get_google_credentials_file()}")

    oauth_temp = _load_oauth_temp_data()
    if not oauth_temp:
        raise ValueError("OAuth temporary data not found")

    saved_state = oauth_temp.get("state")
    code_verifier = oauth_temp.get("code_verifier")

    if not saved_state or not code_verifier:
        raise ValueError("OAuth temporary data is incomplete")

    if state != saved_state:
        raise ValueError("Invalid OAuth state")

    flow = Flow.from_client_secrets_file(
        str(get_google_credentials_file()),
        scopes=get_google_scopes(),
        redirect_uri=get_google_redirect_uri(),
        state=state,
        code_verifier=code_verifier,
    )

    flow.fetch_token(code=code)

    creds: Credentials = flow.credentials

    with open(get_google_token_file(), "w", encoding="utf-8") as f:
        f.write(creds.to_json())

    _clear_oauth_temp_data()

    return creds

