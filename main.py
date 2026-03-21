from dotenv import load_dotenv
import os

load_dotenv()

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routers.gmail import router as gmail_router
from api.routers.auth import router as auth_router
from api.routers.drive import router as drive_router
from api.routers.tasks import router as tasks_router
from api.routers.calendar import router as calendar_router
from api.routers.chat import router as chat_router
from api.routers.config import router as config_router
from core.database import init_db
from api.routers.health import router as health_router
from core.runtime_config import set_runtime_config
from services.config.config_loader import get_all_config_as_dict
from api.routers.app import router as app_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    config_data = get_all_config_as_dict()
    set_runtime_config(config_data)

    print("Base de datos inicializada")
    print("Configuración runtime cargada")

    yield

app = FastAPI(
    title="Kai IA API",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

    
app.include_router(gmail_router)
app.include_router(auth_router)
app.include_router(drive_router)
app.include_router(tasks_router)
app.include_router(calendar_router)
app.include_router(chat_router)
app.include_router(config_router)
app.include_router(health_router)
app.include_router(app_router)