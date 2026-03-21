from fastapi import APIRouter
from services.app.app_service import get_bootstrap_status

router = APIRouter(prefix="/app", tags=["App"])


@router.get("/bootstrap")
def bootstrap():
    return get_bootstrap_status()