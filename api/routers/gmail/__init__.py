from fastapi import APIRouter
from .gmail import router as gmail_router
from .history import router as history_router

router = APIRouter(prefix="/gmail", tags=["Gmail"])

router.include_router(gmail_router)
router.include_router(history_router)
