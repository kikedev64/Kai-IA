import os
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow,Flow
from core.config import GOOGLE_SCOPES as SCOPES, GOOGLE_REDIRECT_URI as REDIRECT_URI, GOOGLE_CREDENTIALS_FILE, GOOGLE_TOKEN_FILE

def get_creds():
    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", SCOPES)

        if creds and creds.valid:
            return {"creds": creds}

        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open("token.json", "w") as f:
                f.write(creds.to_json())
            return {"creds": creds}
    if not os.path.exists("credentials.json"):
        return {
            "error": "credentials.json not found. Download it from Google Cloud Console."
        }
    
    flow = Flow.from_client_secrets_file(
        "credentials.json",
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )

    auth_url, _ = flow.authorization_url(
        prompt="consent",
        access_type="offline",
        include_granted_scopes="false",

    )

    return {"auth_url": auth_url}

def exchange_code_for_token(code:str) -> Credentials:
    if not os.path.exists(GOOGLE_CREDENTIALS_FILE):
        raise FileNotFoundError(f"Missing {GOOGLE_CREDENTIALS_FILE}")

    flow = Flow.from_client_secrets_file(
        str(GOOGLE_CREDENTIALS_FILE),
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI
    )

    flow.fetch_token(code=code)

    creds: Credentials = flow.credentials

    with open(GOOGLE_TOKEN_FILE,"w",encoding="utf-8") as f:
        f.write(creds.to_json())

    return creds