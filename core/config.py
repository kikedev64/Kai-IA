# Env config and global config

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:8000/auth/google/callback"
)

GOOGLE_CREDENTIALS_FILE = BASE_DIR / "credentials.json"
GOOGLE_TOKEN_FILE = BASE_DIR / "token.json"

EMAIL_MAX_TOTAL_SIZE_ATTACHMENT = 18 * 1024 * 1024      # Evitar problemas de tamaño al usar base64