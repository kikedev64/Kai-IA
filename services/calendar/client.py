from core.auth import get_creds
from googleapiclient.discovery import build

def _calendar_service():
    creds = get_creds()
    return build("calendar", "v3", credentials=creds)
