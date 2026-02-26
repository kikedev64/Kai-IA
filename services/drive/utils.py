from googleapiclient.discovery import build
from core.auth import get_creds

GOOGLE_EXPORT_MAP = {
    "application/vnd.google-apps.document": ("pdf", "https://docs.google.com/document/d/{id}/export?format={fmt}"),
    "application/vnd.google-apps.spreadsheet": ("xlsx", "https://docs.google.com/spreadsheets/d/{id}/export?format={fmt}"),
    "application/vnd.google-apps.presentation": ("pptx", "https://docs.google.com/presentation/d/{id}/export/{fmt}"),
    "application/vnd.google-apps.drawing": ("png", "https://docs.google.com/drawings/d/{id}/export/{fmt}"),
}

def _get_service():
    creds = get_creds()
    return build("drive", "v3", credentials=creds)

