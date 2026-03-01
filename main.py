from contextlib import asynccontextmanager

from fastapi import FastAPI
from api.routers.gmail import router as gmail_router
from api.routers.auth import router as auth_router
from api.routers.drive import router as drive_router
from api.routers.tasks import router as tasks_router
from api.routers.calendar import router as calendar_router
from api.routers.chat import router as chat_router
from core.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    print("Base de datos inicializada")

    yield
    # Evento de cierre


app = FastAPI(
    title="Kai IA API",
    version="0.1.0",
    lifespan=lifespan
)

    
app.include_router(gmail_router)
app.include_router(auth_router)
app.include_router(drive_router)
app.include_router(tasks_router)
app.include_router(calendar_router)
app.include_router(chat_router)