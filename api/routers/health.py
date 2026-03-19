from typing import Any

from fastapi import APIRouter

from core.auth import get_creds
from services.calendar.calendar_service import list_calendar_events

router = APIRouter(prefix="/health", tags=["Health"])

@router.get("")
def health_check():
    return {
        "status": "ok",
        "message": "Backend conectado correctamente"
    }
    


def test_google_auth_connection() -> dict[str, Any]:
    creds_data = get_creds()

    if "error" in creds_data:
        return {
            "authenticated": False,
            "google_ok": False,
            "message": creds_data["error"],
        }

    creds = creds_data.get("creds")
    if creds is None:
        return {
            "authenticated": False,
            "google_ok": False,
            "message": "No hay credenciales disponibles",
        }

    try:
        events = list_calendar_events(
            calendar_id="primary",
            max_results=1,
        )

        return {
            "authenticated": True,
            "google_ok": True,
            "message": "Token válido y conexión con Google Calendar correcta",
            "items_found": len(events),
        }

    except Exception as e:
        return {
            "authenticated": False,
            "google_ok": False,
            "message": f"No se pudo validar la conexión con Google: {str(e)}",
        }