from core.auth import get_creds
from googleapiclient.discovery import build

def _calendar_service():
    """Crea el cliente de Google Calendar."""
    creds = get_creds()
    return build("calendar", "v3", credentials=creds)
